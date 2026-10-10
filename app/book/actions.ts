"use server";

import {
  cancelPendingBooking,
  createBookingOrderAndPaymentIntent,
  isOrderReady,
  type CreateBookingInput,
  type CreateBookingResult,
} from "@/lib/orders";

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
 * Called when the customer clicks "Back" from the payment step (e.g. to
 * fix an address). Deletes the staged booking and cancels its
 * PaymentIntent, so it never lingers as a payment attempt and never
 * becomes an order -- the wizard then returns to an earlier step so they
 * can submit a fresh booking when ready.
 */
export async function cancelPendingBookingAction(stripePaymentIntentId: string): Promise<void> {
  await cancelPendingBooking(stripePaymentIntentId);
}

/**
 * Polled by the confirmation screen right after Stripe confirms payment
 * client-side, to ride out the brief race window before the webhook
 * promotes the staged booking into a real order (the webhook is what
 * actually sends the confirmation email and makes the order visible in
 * Admin -- see app/api/stripe/webhook/route.ts).
 */
export async function isOrderReadyAction(orderId: string): Promise<boolean> {
  return isOrderReady(orderId);
}
