import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { giftCards, orders, pendingBookings, stripeWebhookEvents } from "@/lib/db/schema";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { sendBookingConfirmationEmail, sendGiftCardPurchaseEmail } from "@/lib/email";
import { applyGiftCardToOrder, createGiftCard } from "@/lib/giftcards";
import { recordReferralRedemption } from "@/lib/referrals";
import { hashManageToken } from "@/lib/manage-token";
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
 * matches what the staged booking says it charged (protects against a
 * tampered or reused client secret) -- not re-running availability checks,
 * since declining a successful payment isn't a sane response to an
 * availability conflict discovered after the fact. A genuine overbooking
 * conflict at this stage is a manual, admin-handled resolution (contact the
 * customer, refund if needed), not something this endpoint silently undoes.
 *
 * Deferred order creation: a booking that required payment was NOT written
 * to `orders` when checkout started -- it was staged in `pendingBookings`
 * (see lib/orders.ts). This is the ONE place that staged booking becomes a
 * real order: on payment_intent.succeeded, handlePaymentSucceeded looks up
 * the pendingBookings row by PaymentIntent id and promotes its frozen
 * payload into `orders` (reusing the staged row's own id), then deletes
 * the staging row. This is also why the confirmation email is sent from
 * here rather than from the booking page: this is the only place that
 * still has the raw Manage-My-Booking token (pendingBookings.manageToken)
 * once the staging row is gone, and it's the authoritative "payment
 * actually succeeded" moment regardless of what the customer's browser saw.
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

  // Already promoted? (a redelivered event, or some other edge case where
  // this fires more than once for the same PaymentIntent). The
  // stripe_webhook_events idempotency guard normally prevents this, but
  // this check is cheap insurance against ever double-promoting.
  const existingOrderRows = await db
    .select({ id: orders.id, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
    .limit(1);
  if (existingOrderRows[0]) return; // Already a real, paid order -- nothing to do.

  const pendingRows = await db
    .select()
    .from(pendingBookings)
    .where(eq(pendingBookings.stripePaymentIntentId, paymentIntent.id))
    .limit(1);
  const pending = pendingRows[0];
  if (!pending) return; // Nothing staged for this app to promote (unexpected PaymentIntent, or it already expired/was cancelled).

  // Cast to `any` rather than a precise type: this is a JSONB round-trip of
  // the snapshot lib/orders.ts built, and spreading it straight into
  // db.insert(orders).values() below needs to merge against the full
  // orders insert shape without TypeScript fighting the generic
  // Record<string, unknown> shape of a jsonb column.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = pending.payload as any;
  const finalAmountCents = Number(payload.finalAmountCents);

  if (paymentIntent.amount_received !== finalAmountCents) {
    await writeAudit({
      actor: { type: "system" },
      action: "ORDER_PAYMENT_AMOUNT_MISMATCH",
      entityType: "order",
      entityId: pending.id,
      notes: `Stripe amount_received ${paymentIntent.amount_received} != staged booking finalAmountCents ${finalAmountCents} (order ${pending.orderNumber})`,
    });
    return; // Don't promote -- needs manual admin attention.
  }

  // Promote the staged payload into a real order, reusing the staged
  // row's own id. Timestamp-ish fields are set/reconstructed explicitly
  // here rather than trusted from `payload` as-is: JSONB round-trips a
  // Date into a plain ISO string, which Drizzle's timestamp columns can't
  // accept directly.
  let orderId: string;
  try {
    const inserted = await db
      .insert(orders)
      .values({
        ...payload,
        id: pending.id,
        orderNumber: pending.orderNumber,
        status: "scheduled",
        paymentStatus: "paid",
        paidAt: new Date(),
        agreementSignedAt:
          typeof payload.agreementSignedAt === "string" || payload.agreementSignedAt instanceof Date
            ? new Date(payload.agreementSignedAt as string | Date)
            : new Date(),
        stripePaymentIntentId: paymentIntent.id,
        // Saved here (not at staging time) because this is the moment
        // Stripe confirms the card was actually usable off-session -- see
        // lib/orders.ts's setup_future_usage: "off_session" on the
        // original PaymentIntent. Used later for on-demand late-fee
        // charges.
        stripeCustomerId: paymentIntent.customer ?? null,
        stripePaymentMethodId: paymentIntent.payment_method ?? null,
        manageTokenHash: hashManageToken(pending.manageToken),
      })
      .returning({ id: orders.id });
    orderId = inserted[0]!.id;
  } catch (err) {
    await writeAudit({
      actor: { type: "system" },
      action: "ORDER_PROMOTION_FAILED",
      entityType: "order",
      entityId: pending.id,
      notes: `Failed to promote staged booking ${pending.orderNumber} (PaymentIntent ${paymentIntent.id}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return; // Leave the staged row in place -- don't lose the payment record. Needs manual admin attention.
  }

  const manageToken = pending.manageToken;
  await db.delete(pendingBookings).where(eq(pendingBookings.id, pending.id)).catch(() => {});

  await writeAudit({
    actor: { type: "system" },
    action: "ORDER_PAID",
    entityType: "order",
    entityId: orderId,
  });

  // Phase 5: the referral code / gift card this order used were already
  // validated and their amounts frozen onto the staged payload at booking
  // time (lib/orders.ts), but the actual money-moving side effects --
  // deducting the gift card's balance and recording what's owed to a
  // referrer -- only happen now, once payment has genuinely succeeded. An
  // order that never gets paid (abandoned checkout, a declined card) never
  // reaches this point at all, so it never deducts a gift card or owes
  // anyone a referral reward.
  const giftCardId = payload.giftCardId as string | null;
  const giftCardAmountAppliedCents = Number(payload.giftCardAmountAppliedCents ?? 0);
  if (giftCardId) {
    const giftCardRows = await db.select().from(giftCards).where(eq(giftCards.id, giftCardId)).limit(1);
    const giftCard = giftCardRows[0];
    if (giftCard) {
      await applyGiftCardToOrder({
        giftCard,
        orderId,
        orderTotalBeforeGiftCardCents: giftCardAmountAppliedCents,
      });
    }
  }
  const referralCodeId = payload.referralCodeId as string | null;
  if (referralCodeId) {
    await recordReferralRedemption({
      referralCodeId,
      orderId,
      refereeDiscountCents: Number(payload.referralDiscountCents ?? 0),
      referrerRewardCents: Number(payload.referralRewardOwedCents ?? 0),
    });
  }

  // This is the only place the raw Manage My Booking token still exists
  // once the staging row is gone (only its hash is stored on `orders`), so
  // the confirmation email is sent from here -- the authoritative moment
  // payment actually succeeded -- rather than from the booking page.
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (orderRows[0]) {
    await sendBookingConfirmationEmail(orderRows[0], manageToken).catch(() => {});
  }
}

async function handlePaymentFailed(paymentIntent: { id: string }): Promise<void> {
  const db = getDb();
  // A failed attempt on a staged booking's PaymentIntent doesn't delete
  // the staged row -- Stripe lets the customer retry a different payment
  // method on the same PaymentIntent, and the booking wizard's own Back
  // button / the TTL cleanup in lib/orders.ts are what actually remove an
  // abandoned staged booking. This is just a record of the failed attempt.
  const pendingRows = await db
    .select({ id: pendingBookings.id, orderNumber: pendingBookings.orderNumber })
    .from(pendingBookings)
    .where(eq(pendingBookings.stripePaymentIntentId, paymentIntent.id))
    .limit(1);
  const pending = pendingRows[0];

  await writeAudit({
    actor: { type: "system" },
    action: "ORDER_PAYMENT_FAILED",
    entityType: "order",
    entityId: pending?.id,
    notes: pending ? `Staged booking ${pending.orderNumber}` : `PaymentIntent ${paymentIntent.id}`,
  });
}
