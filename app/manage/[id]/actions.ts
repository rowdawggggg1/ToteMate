"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { hashManageToken } from "@/lib/manage-token";
import { isWithinCancellationWindow, getBusinessSettings } from "@/lib/availability";
import { rescheduleOrderDeliveryDate } from "@/lib/reschedule";
import { calculateCancellationFeeCents } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { sendCancellationEmail, sendRescheduleEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

export type ManageActionState = { ok: boolean; error?: string };

/** Statuses from which a customer can still manage their own booking --
 * once it's delivered, picked up, or otherwise concluded, changes have to
 * go through the business directly. */
const MANAGEABLE_STATUSES = ["scheduled"];

async function loadAuthorizedOrder(orderId: string, token: string) {
  const db = getDb();
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return { error: "Booking not found." } as const;
  if (!order.manageTokenHash || hashManageToken(token) !== order.manageTokenHash) {
    return { error: "This link is invalid." } as const;
  }
  return { order } as const;
}

export async function cancelBookingAction(
  orderId: string,
  token: string,
  reason: string
): Promise<ManageActionState> {
  const result = await loadAuthorizedOrder(orderId, token);
  if ("error" in result) return { ok: false, error: result.error };
  const { order } = result;

  if (!MANAGEABLE_STATUSES.includes(order.status)) {
    return { ok: false, error: "This booking can no longer be cancelled here." };
  }

  const settings = await getBusinessSettings();
  const tooLateForRefund = isWithinCancellationWindow(
    order.confirmedDeliveryDate,
    settings.cancellationCutoffReference,
    settings.cancellationWindowHours
  );

  const cancellationFeeCents = tooLateForRefund
    ? order.finalAmountCents
    : calculateCancellationFeeCents(
        order.finalAmountCents,
        settings.cancellationFeeType as "fixed" | "percentage",
        settings.cancellationFeeAmountCents,
        Number(settings.cancellationFeePercentage)
      );
  const refundCents = Math.max(0, order.finalAmountCents - cancellationFeeCents);

  const db = getDb();

  if (refundCents > 0 && order.stripePaymentIntentId) {
    const stripe = getStripe();
    await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: refundCents,
    });
  }

  const nextPaymentStatus =
    refundCents >= order.finalAmountCents
      ? "refunded"
      : refundCents > 0
        ? "partially_refunded"
        : order.paymentStatus;

  await db
    .update(orders)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason || null,
      cancellationFeeCents,
      refundedAmountCents: order.refundedAmountCents + refundCents,
      paymentStatus: nextPaymentStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  await writeAudit({
    actor: { type: "system" },
    action: "ORDER_CANCELLED_BY_CUSTOMER",
    entityType: "order",
    entityId: order.id,
    notes: reason || undefined,
  });

  try {
    await sendCancellationEmail({
      ...order,
      cancellationFeeCents,
      refundedAmountCents: order.refundedAmountCents + refundCents,
    });
  } catch {
    // Best-effort -- the cancellation itself already succeeded.
  }

  revalidatePath(`/manage/${order.id}`);
  return { ok: true };
}

export async function rescheduleBookingAction(
  orderId: string,
  token: string,
  newDeliveryDate: string
): Promise<ManageActionState> {
  const result = await loadAuthorizedOrder(orderId, token);
  if ("error" in result) return { ok: false, error: result.error };
  const { order } = result;

  if (!MANAGEABLE_STATUSES.includes(order.status)) {
    return { ok: false, error: "This booking can no longer be rescheduled here." };
  }

  const rescheduleResult = await rescheduleOrderDeliveryDate(order, newDeliveryDate);
  if (!rescheduleResult.ok) {
    return { ok: false, error: rescheduleResult.error };
  }
  const newPickupDate = rescheduleResult.newPickupDate;

  await writeAudit({
    actor: { type: "system" },
    action: "ORDER_RESCHEDULED_BY_CUSTOMER",
    entityType: "order",
    entityId: order.id,
    notes: `New delivery date: ${newDeliveryDate}`,
  });

  try {
    await sendRescheduleEmail({
      ...order,
      confirmedDeliveryDate: newDeliveryDate,
      confirmedPickupDate: newPickupDate,
    });
  } catch {
    // Best-effort -- the reschedule itself already succeeded.
  }

  revalidatePath(`/manage/${order.id}`);
  return { ok: true };
}
