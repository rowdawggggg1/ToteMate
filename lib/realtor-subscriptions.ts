/**
 * Realtor subscription business logic (Phase 5). Each
 * realtorSubscriptionTiers row owns its own Stripe Product + recurring
 * Price, created/updated through the Stripe API whenever an admin saves
 * the tier (see syncStripeTierProduct) -- so nothing about price or
 * cadence is hardcoded anywhere in this app.
 *
 * A realtor subscribes via a Stripe Checkout Session (mode: "subscription"),
 * the simplest correct way to collect a card for recurring billing without
 * building custom Elements UI for it. From then on:
 *  - invoice.payment_succeeded (one per billing cycle, including the very
 *    first one) is this file's single source of truth for "a cycle was
 *    paid" -- it upserts the realtorSubscriptions row AND issues that
 *    cycle's gift card, in one place, so there's no risk of double-issuing
 *    a card if events arrive out of order.
 *  - customer.subscription.updated/deleted keeps status/cancellation in
 *    sync for everything that isn't "a cycle was paid" (e.g. a card
 *    declining into past_due, or an end-of-period cancellation).
 */

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { admins, realtorSubscriptionTiers, realtorSubscriptions } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { getBusinessSettings } from "@/lib/availability";
import { createGiftCard } from "@/lib/giftcards";
import { writeAudit } from "@/lib/audit";

/**
 * Creates (or updates) the Stripe Product + Price for a tier. Stripe
 * Prices are immutable, so a changed price/cadence always creates a new
 * Price object and archives the old one; the Product itself is reused
 * and just has its name/description updated. Pass `createNewPrice: false`
 * for a save that didn't touch price/cadence (e.g. just the name or
 * active flag), so this doesn't mint a throwaway Price object every time
 * an admin saves the tier.
 */
export async function syncStripeTierProduct(
  tier: {
    id: string;
    name: string;
    description: string | null;
    cadenceInterval: string;
    priceCents: number;
    stripeProductId: string | null;
    stripePriceId: string | null;
  },
  createNewPrice = true
): Promise<{ stripeProductId: string; stripePriceId: string }> {
  const stripe = getStripe();
  const settings = await getBusinessSettings();

  let productId = tier.stripeProductId;
  if (productId) {
    await stripe.products.update(productId, {
      name: tier.name,
      description: tier.description ?? undefined,
    });
  } else {
    const product = await stripe.products.create({
      name: tier.name,
      description: tier.description ?? undefined,
      metadata: { realtorSubscriptionTierId: tier.id },
    });
    productId = product.id;
  }

  if (!createNewPrice && tier.stripePriceId) {
    return { stripeProductId: productId, stripePriceId: tier.stripePriceId };
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: settings.currency.toLowerCase(),
    unit_amount: tier.priceCents,
    recurring: { interval: tier.cadenceInterval === "year" ? "year" : "month" },
    metadata: { realtorSubscriptionTierId: tier.id },
  });

  if (tier.stripePriceId && tier.stripePriceId !== price.id) {
    await stripe.prices.update(tier.stripePriceId, { active: false }).catch(() => {});
  }

  return { stripeProductId: productId, stripePriceId: price.id };
}

/**
 * Starts (or restarts) a realtor's subscription to a tier via Stripe
 * Checkout. Returns the Checkout Session URL to redirect the realtor to.
 */
export async function createRealtorSubscriptionCheckoutUrl(params: {
  realtorId: string;
  realtorEmail: string;
  tier: typeof realtorSubscriptionTiers.$inferSelect;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  if (!params.tier.stripePriceId) {
    throw new Error("This subscription tier isn't fully set up yet. Please contact us.");
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: params.realtorEmail,
    line_items: [{ price: params.tier.stripePriceId, quantity: 1 }],
    subscription_data: {
      metadata: { realtorId: params.realtorId, tierId: params.tier.id },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout URL. Please try again.");
  return session.url;
}

/**
 * invoice.payment_succeeded handler (called from the Stripe webhook route
 * for subscription invoices only). Upserts the realtorSubscriptions row
 * from the Stripe subscription (metadata carries realtorId/tierId, set at
 * checkout time) and issues this cycle's gift card.
 */
export async function handleRealtorSubscriptionInvoicePaid(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const realtorId = subscription.metadata?.realtorId;
  const tierId = subscription.metadata?.tierId;
  if (!realtorId || !tierId) return; // Not one of our subscriptions.

  const db = getDb();
  const tierRows = await db
    .select()
    .from(realtorSubscriptionTiers)
    .where(eq(realtorSubscriptionTiers.id, tierId))
    .limit(1);
  const tier = tierRows[0];
  if (!tier) return;

  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);

  const existingRows = await db
    .select()
    .from(realtorSubscriptions)
    .where(eq(realtorSubscriptions.realtorId, realtorId))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    await db
      .update(realtorSubscriptions)
      .set({
        tierId,
        status: "active",
        stripeCustomerId: String(subscription.customer),
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(realtorSubscriptions.id, existing.id));
  } else {
    await db.insert(realtorSubscriptions).values({
      realtorId,
      tierId,
      status: "active",
      stripeCustomerId: String(subscription.customer),
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  const giftCard = await createGiftCard({
    amountCents: tier.giftCardValueCents,
    sourceType: "realtor_subscription",
    issuedToRealtorId: realtorId,
  });

  await writeAudit({
    actor: { type: "system" },
    action: "REALTOR_SUBSCRIPTION_GIFT_CARD_ISSUED",
    entityType: "gift_card",
    entityId: giftCard.id,
    notes: `Issued to realtor ${realtorId} for subscription ${subscription.id}`,
  });
}

/** customer.subscription.updated/deleted -- keeps status in sync for everything else. */
export async function handleRealtorSubscriptionStatusChange(subscription: Stripe.Subscription): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(realtorSubscriptions)
    .where(eq(realtorSubscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);
  const existing = rows[0];
  if (!existing) return;

  const status: "active" | "past_due" | "canceled" =
    subscription.status === "active" || subscription.status === "trialing"
      ? "active"
      : subscription.status === "canceled" || subscription.status === "unpaid"
        ? "canceled"
        : "past_due";

  await db
    .update(realtorSubscriptions)
    .set({
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscriptionCurrentPeriodEnd(subscription),
      updatedAt: new Date(),
    })
    .where(eq(realtorSubscriptions.id, existing.id));
}

/**
 * Stripe moved `current_period_end` from the Subscription object onto
 * each subscription item in recent API versions; read defensively from
 * either shape rather than betting on one, since this is read from two
 * different webhook events and this app can't run a type-check against
 * the installed stripe package version in this environment to confirm
 * which shape applies.
 */
function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const raw = subscription as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const periodEnd = raw.items?.data?.[0]?.current_period_end ?? raw.current_period_end ?? null;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

/** Cancels a realtor's subscription at the end of the current billing period. */
export async function cancelRealtorSubscriptionAtPeriodEnd(realtorId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(realtorSubscriptions)
    .where(eq(realtorSubscriptions.realtorId, realtorId))
    .limit(1);
  const existing = rows[0];
  if (!existing) return;

  const stripe = getStripe();
  await stripe.subscriptions.update(existing.stripeSubscriptionId, { cancel_at_period_end: true });
  await db
    .update(realtorSubscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(realtorSubscriptions.id, existing.id));
}

export async function getRealtorName(realtorId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ name: admins.name }).from(admins).where(eq(admins.id, realtorId)).limit(1);
  return rows[0]?.name ?? null;
}
