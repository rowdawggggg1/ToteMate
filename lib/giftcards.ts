/**
 * Gift card business logic (Phase 5). A gift card is a running balance
 * identified by a redeemable code. Three ways one comes into existence
 * (`sourceType`):
 *  - "admin_issued": created directly by the owner in Admin -> Gift Cards,
 *    free.
 *  - "purchased": bought at full price by anyone (a customer or a
 *    realtor buying ad-hoc) through Stripe Checkout.
 *  - "realtor_subscription": issued automatically each billing cycle to a
 *    subscribed realtor, at a discounted price -- see the Stripe webhook.
 *
 * The one rule that depends on sourceType: a "realtor_subscription" card
 * cannot be combined with a referral code at checkout (the owner's
 * locked decision -- that would stack two discounts on one order).
 * "admin_issued" and "purchased" cards can be combined with a referral
 * code freely.
 */

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { giftCardDenominations, giftCardRedemptions, giftCards } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { getBusinessSettings } from "@/lib/availability";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCodeString(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  // Grouped for readability when read aloud/typed in, e.g. GFT-XXXXX-XXXXX.
  return `GFT-${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

export type GiftCardSourceType = "admin_issued" | "purchased" | "realtor_subscription";

export async function createGiftCard(params: {
  amountCents: number;
  sourceType: GiftCardSourceType;
  purchasedByName?: string | null;
  purchasedByEmail?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  issuedToRealtorId?: string | null;
  realtorSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  createdByAdminId?: string | null;
  notes?: string | null;
}): Promise<typeof giftCards.$inferSelect> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCodeString();
    try {
      const inserted = await db
        .insert(giftCards)
        .values({
          code,
          initialValueCents: params.amountCents,
          balanceCents: params.amountCents,
          sourceType: params.sourceType,
          purchasedByName: params.purchasedByName ?? null,
          purchasedByEmail: params.purchasedByEmail ?? null,
          recipientName: params.recipientName ?? null,
          recipientEmail: params.recipientEmail ?? null,
          issuedToRealtorId: params.issuedToRealtorId ?? null,
          realtorSubscriptionId: params.realtorSubscriptionId ?? null,
          stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
          stripePaymentIntentId: params.stripePaymentIntentId ?? null,
          createdByAdminId: params.createdByAdminId ?? null,
          notes: params.notes ?? null,
        })
        .returning();
      if (inserted[0]) return inserted[0];
    } catch {
      // Unique collision on `code` -- try again.
    }
  }
  throw new Error("Could not generate a unique gift card code. Please try again.");
}

export type GiftCardLookup =
  | { ok: true; giftCard: typeof giftCards.$inferSelect }
  | { ok: false; error: string };

/** Looks up a usable (active, positive-balance) gift card by its code, for use at checkout. */
export async function findUsableGiftCard(rawCode: string): Promise<GiftCardLookup> {
  const db = getDb();
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a gift card code." };
  const rows = await db.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
  const giftCard = rows[0];
  if (!giftCard || giftCard.status === "disabled") {
    return { ok: false, error: "That gift card code isn't valid." };
  }
  if (giftCard.balanceCents <= 0) {
    return { ok: false, error: "That gift card has no remaining balance." };
  }
  return { ok: true, giftCard };
}

/** A realtor-subscription-sourced card can't be stacked with a referral code -- the locked stacking rule. */
export function giftCardBlocksReferralCode(giftCard: typeof giftCards.$inferSelect): boolean {
  return giftCard.sourceType === "realtor_subscription";
}

/**
 * Applies a gift card to an order's total and records the redemption +
 * updated balance. `orderTotalBeforeGiftCardCents` is the order's total
 * after any referral discount but before the gift card is subtracted.
 * Never applies more than the card's balance or the order's remaining
 * total -- a gift card can't take an order below $0, and any unused
 * balance simply stays on the card for a future order.
 */
export async function applyGiftCardToOrder(params: {
  giftCard: typeof giftCards.$inferSelect;
  orderId: string;
  orderTotalBeforeGiftCardCents: number;
}): Promise<{ amountAppliedCents: number; remainingBalanceCents: number }> {
  const db = getDb();
  const amountAppliedCents = Math.min(params.giftCard.balanceCents, params.orderTotalBeforeGiftCardCents);
  const remainingBalanceCents = params.giftCard.balanceCents - amountAppliedCents;

  await db
    .update(giftCards)
    .set({
      balanceCents: remainingBalanceCents,
      status: remainingBalanceCents <= 0 ? "depleted" : "active",
      updatedAt: new Date(),
    })
    .where(eq(giftCards.id, params.giftCard.id));

  await db.insert(giftCardRedemptions).values({
    giftCardId: params.giftCard.id,
    orderId: params.orderId,
    amountAppliedCents,
  });

  return { amountAppliedCents, remainingBalanceCents };
}

/**
 * Starts a one-time Stripe Checkout for a gift card purchase (full
 * price -- "purchased" sourceType). Used by both the public gift-card
 * page and a realtor's ad-hoc purchase in their portal. The gift card
 * itself is only created once Stripe confirms payment (checkout.session.
 * completed in the webhook), carrying these details forward as session
 * metadata rather than trusting anything from the browser at creation
 * time.
 */
export async function createGiftCardPurchaseCheckoutUrl(params: {
  amountCents: number;
  purchasedByName: string;
  purchasedByEmail: string;
  recipientName?: string;
  recipientEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const settings = await getBusinessSettings();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.purchasedByEmail,
    line_items: [
      {
        price_data: {
          currency: settings.currency.toLowerCase(),
          unit_amount: params.amountCents,
          product_data: {
            name: `${settings.businessName} Gift Card`,
            description: `$${(params.amountCents / 100).toFixed(2)} gift card`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      purpose: "gift_card_purchase",
      amountCents: String(params.amountCents),
      purchasedByName: params.purchasedByName,
      purchasedByEmail: params.purchasedByEmail,
      recipientName: params.recipientName ?? "",
      recipientEmail: params.recipientEmail ?? "",
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout URL. Please try again.");
  return session.url;
}

export async function listActiveDenominations(): Promise<Array<typeof giftCardDenominations.$inferSelect>> {
  const db = getDb();
  return db
    .select()
    .from(giftCardDenominations)
    .where(eq(giftCardDenominations.isActive, true))
    .orderBy(giftCardDenominations.displayOrder);
}
