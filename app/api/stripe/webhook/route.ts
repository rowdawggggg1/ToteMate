import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { giftCards, orders, stripeWebhookEvents } from "@/lib/db/schema";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { sendGiftCardPurchaseEmail } from "@/lib/email";
import { applyGiftCardToOrder, createGiftCard } from "@/lib/giftcards";
import { recordReferralRedemption } from "@/lib/referrals";
import {
  handleRealtorSubscriptionInvoicePaid,
  handleRealtorSubscriptionStatusChange,
} from "@/lib/realtor-subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint. Idempotent: every event id is recorded in
 * stripe_webhook_events before being acted on, so a redelivered event (the
 * same payment_intent.succeeded firing twice) is only ever acted on once --
 * this is the server's single source of truth for "did we already mark
 * this order paid," independent of whatever the booking page's own
 * Stripe.js confirmation call saw.
 *
 * This is also the SECOND, independent re-validation point referenced in
 * lib/orders.ts: by the time this fires, money has already moved, so
 * "re-validating" here means confirming the PaymentIntent's amount still
 * matches what the order says it charged (protects against a tampered or
 * reused client secret) -- not re-running availability checks, since
 * declining a successful payment isn't a sane response to an availability
 * conflict discovered after the fact. A genuine overbooking conflict at
 * this stage is a manual, admin-handled resolution (contact the customer,
 * refund if needed), not something this endpoint silently undoes.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getDb();

  // Idempotency guard: insert the event id first; if it already exists,
  // we've handled it before and can return immediately.
  try {
    await db.insert(stripeWebhookEvents).values({ id: event.id, type: event.type });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as {
      id: string;
      amount_received: number;
      customer: string | null;
      payment_method: string | null;
    };
    await handlePaymentSucceeded(paymentIntent);
  } else if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as { id: string };
    await handlePaymentFailed(paymentIntent);
  } else if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
  } else if (event.type === "invoice.payment_succeeded") {
    await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await handleRealtorSubscriptionStatusChange(event.data.object as Stripe.Subscription);
  }

  return NextResponse.json({ received: true });
}

/**
 * Phase 5: a Checkout Session is only ever used here for a one-time gift
 * card purchase (bookings use PaymentIntents directly -- see lib/orders.ts
 * -- and a realtor subscription's ongoing state is driven entirely by
 * invoice.payment_succeeded / customer.subscription.* below, not this
 * event). A subscription-mode session completing also fires this event,
 * so anything that isn't our gift-card purpose is deliberately ignored
 * here.
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.purpose !== "gift_card_purchase") return;
  if (session.payment_status !== "paid") return;

  const amountCents = Number(session.metadata.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return;

  const giftCard = await createGiftCard({
    amountCents,
    sourceType: "purchased",
    purchasedByName: session.metadata.purchasedByName || null,
    purchasedByEmail: session.metadata.purchasedByEmail || null,
    recipientName: session.metadata.recipientName || null,
    recipientEmail: session.metadata.recipientEmail || null,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
  });

  await writeAudit({
    actor: { type: "system" },
    action: "GIFT_CARD_PURCHASED",
    entityType: "gift_card",
    entityId: giftCard.id,
    notes: `Purchased via Stripe Checkout session ${session.id}`,
  });

  await sendGiftCardPurchaseEmail(giftCard).catch(() => {});
}

/**
 * invoice.payment_succeeded: only subscription invoices matter here -- see
 * lib/realtor-subscriptions.ts. Read defensively: Stripe has reshaped
 * where an invoice's subscription reference lives across API versions
 * (a top-level `subscription` field in older versions, nested under
 * `parent.subscription_details.subscription` in newer ones), and this app
 * can't run a type-check against the installed stripe package version in
 * this environment to confirm which shape applies.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const raw = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
  };
  const candidate = raw.subscription ?? raw.parent?.subscription_details?.subscription ?? null;
  const subscriptionId = typeof candidate === "string" ? candidate : candidate?.id;
  if (!subscriptionId) return; // A one-off invoice, not a subscription cycle.
  await handleRealtorSubscriptionInvoicePaid(subscriptionId);
}

async function handlePaymentSucceeded(paymentIntent: {
  id: string;
  amount_received: number;
  customer: string | null;
  payment_method: string | null;
}): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
    .limit(1);
  const order = rows[0];
  if (!order) return; // Nothing for this app to do (unexpected PaymentIntent).
  if (order.paymentStatus === "paid") return; // Already handled.

  if (paymentIntent.amount_received !== order.finalAmountCents) {
    await writeAudit({
      actor: { type: "system" },
      action: "ORDER_PAYMENT_AMOUNT_MISMATCH",
      entityType: "order",
      entityId: order.id,
      notes: `Stripe amount_received ${paymentIntent.amount_received} != order finalAmountCents ${order.finalAmountCents}`,
    });
    return; // Don't mark as paid -- needs manual admin attention.
  }

  await db
    .update(orders)
    .set({
      status: "scheduled",
      paymentStatus: "paid",
      paidAt: new Date(),
      // Saved here (not at order creation) because this is the moment
      // Stripe confirms the card was actually usable off-session -- see
      // lib/orders.ts's setup_future_usage: "off_session" on the original
      // PaymentIntent. Used later for on-demand late-fee charges.
      stripeCustomerId: paymentIntent.customer ?? null,
      stripePaymentMethodId: paymentIntent.payment_method ?? null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  await writeAudit({
    actor: { type: "system" },
    action: "ORDER_PAID",
    entityType: "order",
    entityId: order.id,
  });

  // Phase 5: the referral code / gift card this order used were already
  // validated and their amounts frozen onto the order row at booking time
  // (lib/orders.ts), but the actual money-moving side effects -- deducting
  // the gift card's balance and recording what's owed to a referrer --
  // only happen now, once payment has genuinely succeeded. This mirrors
  // why stripeCustomerId/stripePaymentMethodId are captured here and not
  // at creation: an order that never gets paid (abandoned checkout, a
  // declined card) must never deduct a gift card or owe anyone a referral
  // reward. This block only runs once per order, since the whole function
  // already returned above for an order that's already marked paid.
  if (order.giftCardId) {
    const giftCardRows = await db.select().from(giftCards).where(eq(giftCards.id, order.giftCardId)).limit(1);
    const giftCard = giftCardRows[0];
    if (giftCard) {
      await applyGiftCardToOrder({
        giftCard,
        orderId: order.id,
        orderTotalBeforeGiftCardCents: order.giftCardAmountAppliedCents,
      });
    }
  }
  if (order.referralCodeId) {
    await recordReferralRedemption({
      referralCodeId: order.referralCodeId,
      orderId: order.id,
      refereeDiscountCents: order.referralDiscountCents,
      referrerRewardCents: order.referralRewardOwedCents,
    });
  }

  // The confirmation email itself is sent from the booking page right
  // after Stripe confirms payment client-side (app/book/actions.ts),
  // since that's the only place the raw "Manage My Booking" token still
  // exists -- only its hash is stored here. This webhook update is what
  // actually marks the order paid, independent of whether that email
  // succeeds.
}

async function handlePaymentFailed(paymentIntent: { id: string }): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
    .limit(1);
  const order = rows[0];
  if (!order) return;
  if (order.paymentStatus === "paid") return; // A later success shouldn't be clobbered.

  await db
    .update(orders)
    .set({ status: "payment_failed", paymentStatus: "failed", updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await writeAudit({
    actor: { type: "system" },
    action: "ORDER_PAYMENT_FAILED",
    entityType: "order",
    entityId: order.id,
  });
}
