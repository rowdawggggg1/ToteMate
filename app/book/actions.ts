"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  createBookingOrderAndPaymentIntent,
  type CreateBookingInput,
  type CreateBookingResult,
} from "@/lib/orders";
import { hashManageToken } from "@/lib/manage-token";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationEmail } from "@/lib/email";

/**
 * Thin Server Action boundary so the client wizard can call the booking
 * pipeline directly (not through a <form>) while keeping lib/orders.ts a
 * plain server-only module. All real validation/pricing logic lives there.
 */
export async function submitBookingAction(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  return createBookingOrderAndPaymentIntent(input);
}

/**
 * Called by the booking wizard right after Stripe confirms payment
 * client-side. The webhook (app/api/stripe/webhook/route.ts) is still the
 * authoritative record of payment success -- this is a best-effort,
 * faster path to send the confirmation email without waiting on webhook
 * delivery, since the raw manage token only ever exists in the browser's
 * memory at this point (only its hash is stored server-side). Re-verifies
 * the token and checks with Stripe directly before sending, so this can't
 * be used to spam arbitrary orders.
 */
export async function sendBookingConfirmationEmailAction(
  orderId: string,
  manageToken: string
): Promise<void> {
  try {
    const db = getDb();
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = rows[0];
    if (!order) return;
    if (hashManageToken(manageToken) !== order.manageTokenHash) return;
    if (!order.stripePaymentIntentId) return;

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    if (paymentIntent.status !== "succeeded") return;

    await sendBookingConfirmationEmail(order, manageToken);
  } catch {
    // Best-effort: never block the confirmation screen on email delivery.
  }
}
