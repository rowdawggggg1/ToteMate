import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, stripeWebhookEvents } from "@/lib/db/schema";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";

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
  }

  return NextResponse.json({ received: true });
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
