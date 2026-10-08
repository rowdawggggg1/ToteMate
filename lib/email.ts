/**
 * Transactional email via Gmail SMTP (nodemailer), per the spec's "simple,
 * reliable Gmail-compatible sending approach" -- no third-party email
 * service to configure for a small business just getting started.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { giftCards, orders } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";

type OrderRow = typeof orders.$inferSelect;

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error(
        "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to your environment configuration (see .env.example)."
      );
    }
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return transporter;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
}

function manageLink(orderId: string, manageToken: string): string {
  return `${baseUrl()}/manage/${orderId}?token=${manageToken}`;
}

async function send(to: string, subject: string, text: string): Promise<void> {
  const from = process.env.GMAIL_USER;
  await getTransporter().sendMail({ from, to, subject, text });
}

export async function sendBookingConfirmationEmail(
  order: OrderRow,
  manageToken: string
): Promise<void> {
  const subject = `Booking confirmed -- order ${order.orderNumber}`;
  const text = [
    `Hi ${order.customerName},`,
    "",
    `Your booking is confirmed. Here's a summary:`,
    "",
    `Order: ${order.orderNumber}`,
    `Package: ${order.packageName}`,
    `Delivery date: ${order.confirmedDeliveryDate}`,
    `Pickup date: ${order.confirmedPickupDate}`,
    `Total paid: $${centsToDollarsString(order.finalAmountCents)} ${order.currency}`,
    "",
    `You can view, reschedule, or cancel your booking here:`,
    manageLink(order.id, manageToken),
    "",
    "Thanks for booking with us!",
  ].join("\n");

  await send(order.customerEmail, subject, text);
}

export async function sendCancellationEmail(order: OrderRow): Promise<void> {
  const subject = `Booking cancelled -- order ${order.orderNumber}`;
  const feeLine =
    order.cancellationFeeCents && order.cancellationFeeCents > 0
      ? `A cancellation fee of $${centsToDollarsString(order.cancellationFeeCents)} applies. `
      : "";
  const refundedLine =
    order.refundedAmountCents > 0
      ? `$${centsToDollarsString(order.refundedAmountCents)} has been refunded to your original payment method.`
      : "No refund was issued for this cancellation.";

  const text = [
    `Hi ${order.customerName},`,
    "",
    `Your booking (order ${order.orderNumber}) has been cancelled.`,
    "",
    `${feeLine}${refundedLine}`,
    "",
    "If you have any questions, just reply to this email.",
  ].join("\n");

  await send(order.customerEmail, subject, text);
}

export async function sendLateFeeChargedEmail(
  order: OrderRow,
  amountCents: number,
  reason: string | null
): Promise<void> {
  const subject = `Late fee charged -- order ${order.orderNumber}`;
  const text = [
    `Hi ${order.customerName},`,
    "",
    `A late fee of $${centsToDollarsString(amountCents)} was charged to the card on file for order ${order.orderNumber}.`,
    reason ? `Reason: ${reason}` : "",
    "",
    "If you have any questions, just reply to this email.",
  ]
    .filter(Boolean)
    .join("\n");

  await send(order.customerEmail, subject, text);
}

/**
 * Phase 5: sent once a purchased gift card's Checkout Session completes
 * (see app/api/stripe/webhook/route.ts's handleCheckoutSessionCompleted).
 * The code goes to the recipient when one was given (so it reads as a
 * gift, not a receipt); either way it also goes to the purchaser, since
 * that's the account Stripe actually charged and who may need the code
 * again later.
 */
export async function sendGiftCardPurchaseEmail(
  giftCard: typeof giftCards.$inferSelect
): Promise<void> {
  const amount = `$${centsToDollarsString(giftCard.initialValueCents)}`;

  if (giftCard.recipientEmail) {
    const recipientText = [
      giftCard.recipientName ? `Hi ${giftCard.recipientName},` : "Hi,",
      "",
      giftCard.purchasedByName
        ? `${giftCard.purchasedByName} sent you a ${amount} gift card!`
        : `You've received a ${amount} gift card!`,
      "",
      `Your gift card code: ${giftCard.code}`,
      "",
      "Use this code at checkout when you book. It never expires.",
    ].join("\n");
    await send(giftCard.recipientEmail, `You've received a ${amount} gift card!`, recipientText);
  }

  if (giftCard.purchasedByEmail) {
    const purchaserText = [
      `Hi ${giftCard.purchasedByName ?? ""}`.trim() + ",",
      "",
      giftCard.recipientEmail
        ? `Your ${amount} gift card has been sent to ${giftCard.recipientEmail}.`
        : `Your ${amount} gift card is ready to use.`,
      "",
      `Gift card code: ${giftCard.code}`,
      "",
      "Thanks for your purchase!",
    ].join("\n");
    await send(giftCard.purchasedByEmail, `Your ${amount} gift card -- receipt`, purchaserText);
  }
}

export async function sendRescheduleEmail(order: OrderRow): Promise<void> {
  const subject = `Booking updated -- order ${order.orderNumber}`;
  const text = [
    `Hi ${order.customerName},`,
    "",
    `Your booking (order ${order.orderNumber}) has been rescheduled:`,
    "",
    `New delivery date: ${order.confirmedDeliveryDate}`,
    `New pickup date: ${order.confirmedPickupDate}`,
    "",
    "If this doesn't look right, just reply to this email.",
  ].join("\n");

  await send(order.customerEmail, subject, text);
}
