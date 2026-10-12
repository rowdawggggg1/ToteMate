"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { orderExtensions, orderLateFees, orders, orderToteAssignments, totes } from "@/lib/db/schema";
import { requireAdmin, requireStaff } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents, centsToDollarsString } from "@/lib/money";
import { getStripe } from "@/lib/stripe";
import {
  sendCancellationEmail,
  sendLateFeeChargedEmail,
  sendRescheduleEmail,
  sendReviewRequestEmail,
} from "@/lib/email";
import { addOrderExtension } from "@/lib/reschedule";
import { isWithinCancellationWindow, getBusinessSettings } from "@/lib/availability";
import { calculateCancellationFeeCents } from "@/lib/pricing";
import { canRequestReview, createReviewRequest } from "@/lib/reviews";
import { FEE_TYPES } from "@/lib/order-fees";

export type OrderActionState = { ok: boolean; error?: string };

async function getOrderOr404(orderId: string) {
  const db = getDb();
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows[0] ?? null;
}

export async function updateOrderNotesAction(
  orderId: string,
  formData: FormData
): Promise<void> {
  const admin = await requireAdmin();
  const notes = String(formData.get("internalNotes") ?? "");
  const db = getDb();

  await db
    .update(orders)
    .set({ internalNotes: notes || null, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_NOTES_UPDATED",
    entityType: "order",
    entityId: orderId,
  });

  revalidatePath(`/admin/orders/${orderId}`);
}

/**
 * Shared by the full admin panel AND the driver portal (requireStaff
 * accepts either role) -- marking a delivery/pickup done is exactly the
 * job a driver needs to do, so this one action serves both rather than
 * duplicating it under /driver.
 */
export async function markDeliveredAction(orderId: string): Promise<OrderActionState> {
  const admin = await requireStaff();
  const db = getDb();
  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "scheduled") {
    return { ok: false, error: "Only a scheduled order can be marked delivered." };
  }

  await db
    .update(orders)
    .set({ status: "delivered", actualDeliveredAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_MARKED_DELIVERED",
    entityType: "order",
    entityId: orderId,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function markPickedUpAction(orderId: string): Promise<OrderActionState> {
  const admin = await requireStaff();
  const db = getDb();
  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "delivered") {
    return { ok: false, error: "Only a delivered order can be marked picked up." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "picked_up", actualPickedUpAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const assignments = await tx
      .select()
      .from(orderToteAssignments)
      .where(and(eq(orderToteAssignments.orderId, orderId), isNull(orderToteAssignments.releasedAt)));

    for (const assignment of assignments) {
      await tx
        .update(totes)
        .set({ status: "needs_cleaning", updatedAt: new Date() })
        .where(eq(totes.id, assignment.toteId));
    }
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_MARKED_PICKED_UP",
    entityType: "order",
    entityId: orderId,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function markCompletedAction(orderId: string): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const db = getDb();
  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "picked_up") {
    return { ok: false, error: "Only a picked-up order can be marked completed." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const assignments = await tx
      .select()
      .from(orderToteAssignments)
      .where(and(eq(orderToteAssignments.orderId, orderId), isNull(orderToteAssignments.releasedAt)));

    for (const assignment of assignments) {
      await tx
        .update(orderToteAssignments)
        .set({ releasedAt: new Date() })
        .where(eq(orderToteAssignments.id, assignment.id));

      const toteRows = await tx.select().from(totes).where(eq(totes.id, assignment.toteId)).limit(1);
      const tote = toteRows[0];
      if (tote) {
        await tx
          .update(totes)
          .set({ completedRentalCount: tote.completedRentalCount + 1, updatedAt: new Date() })
          .where(eq(totes.id, tote.id));
      }
    }
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_MARKED_COMPLETED",
    entityType: "order",
    entityId: orderId,
  });

  // Patch 4: auto-send a review request on completion, unless the owner
  // has turned that off in Settings -- best-effort, same as every other
  // transactional email here, and never blocks marking the order
  // completed if it fails.
  try {
    const settings = await getBusinessSettings();
    if (settings.reviewAutoRequestEnabled) {
      const completedOrder = await getOrderOr404(orderId);
      if (completedOrder && canRequestReview(completedOrder)) {
        const requestResult = await createReviewRequest(completedOrder);
        if (requestResult.ok) {
          await sendReviewRequestEmail(completedOrder, requestResult.reviewToken);
        }
      }
    }
  } catch {
    // Best-effort -- marking the order completed already succeeded.
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function assignToteAction(
  orderId: string,
  toteId: string
): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const db = getDb();
  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!["scheduled", "delivered"].includes(order.status)) {
    return { ok: false, error: "Totes can only be assigned to a scheduled or delivered order." };
  }

  const currentAssignments = await db
    .select()
    .from(orderToteAssignments)
    .where(and(eq(orderToteAssignments.orderId, orderId), isNull(orderToteAssignments.releasedAt)));

  if (currentAssignments.length >= order.packageToteQuantity) {
    return { ok: false, error: "This order already has all its totes assigned." };
  }

  const toteRows = await db.select().from(totes).where(eq(totes.id, toteId)).limit(1);
  const tote = toteRows[0];
  if (!tote || tote.status !== "ready") {
    return { ok: false, error: "That tote isn't ready to assign." };
  }

  await db.transaction(async (tx) => {
    await tx.insert(orderToteAssignments).values({ orderId, toteId });
    await tx
      .update(totes)
      .set({ status: "with_customer", updatedAt: new Date() })
      .where(eq(totes.id, toteId));
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "TOTE_ASSIGNED",
    entityType: "order",
    entityId: orderId,
    notes: `Tote ${tote.number}`,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function unassignToteAction(assignmentId: string): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db
    .select()
    .from(orderToteAssignments)
    .where(eq(orderToteAssignments.id, assignmentId))
    .limit(1);
  const assignment = rows[0];
  if (!assignment || assignment.releasedAt) {
    return { ok: false, error: "That assignment no longer exists." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(orderToteAssignments).where(eq(orderToteAssignments.id, assignmentId));
    await tx
      .update(totes)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(totes.id, assignment.toteId));
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "TOTE_UNASSIGNED",
    entityType: "order",
    entityId: assignment.orderId,
  });

  revalidatePath(`/admin/orders/${assignment.orderId}`);
  revalidatePath("/admin/inventory");
  return { ok: true };
}

const overrideSchema = z.object({
  priceOverride: z.string().trim(),
  priceOverrideReason: z.string().trim().optional().default(""),
});

export async function setPriceOverrideAction(
  orderId: string,
  _prevState: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const parsed = overrideSchema.safeParse({
    priceOverride: formData.get("priceOverride"),
    priceOverrideReason: formData.get("priceOverrideReason"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid override amount." };

  const db = getDb();
  const priceOverrideCents =
    parsed.data.priceOverride === "" ? null : dollarsToCents(parsed.data.priceOverride);

  await db
    .update(orders)
    .set({
      priceOverrideCents,
      priceOverrideReason: parsed.data.priceOverrideReason || null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_PRICE_OVERRIDE_SET",
    entityType: "order",
    entityId: orderId,
    notes: parsed.data.priceOverrideReason || undefined,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

// --- Phase 4 / Patch 4: order fees (late / damaged / lost / other) -----
//
// Per the spec, fees are never auto-charged. Applying one here only ever
// records it against the order -- always, immediately, regardless of
// whether a card is on file. Actually charging it is a separate, explicit
// action (chargeOrderFeeAction) the admin triggers on their own schedule,
// using the card captured at booking time (lib/orders.ts's
// setup_future_usage: "off_session"). If there's no card on file, or the
// charge fails, the fee stays recorded as owed -- collecting it outside
// the app is always a safety net, never an error state. Patch 4
// generalized this from "late fees only" to any fee type (damaged/lost
// tote, damaged/lost dolly, etc.) -- the underlying table is still named
// orderLateFees (unchanged, to avoid a destructive rename) with a new
// `feeType` column. FEE_TYPES itself now lives in lib/order-fees.ts -- a
// "use server" file can only export async functions, and this plain const
// broke the build when it was exported from here directly.

const addOrderFeeSchema = z.object({
  feeType: z.enum(["late", "damaged_tote", "lost_tote", "damaged_dolly", "lost_dolly", "other"]),
  amount: z.string().trim().min(1, "An amount is required."),
  reason: z.string().trim().optional().default(""),
});

export async function addOrderFeeAction(
  orderId: string,
  _prevState: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const parsed = addOrderFeeSchema.safeParse({
    feeType: formData.get("feeType"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid fee." };
  }

  const amountCents = dollarsToCents(parsed.data.amount);
  if (amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const db = getDb();
  const inserted = await db
    .insert(orderLateFees)
    .values({
      orderId,
      feeType: parsed.data.feeType,
      amountCents,
      reason: parsed.data.reason || null,
      createdByAdminId: admin.id,
    })
    .returning({ id: orderLateFees.id });
  const newId = inserted[0]?.id;
  if (!newId) {
    return { ok: false, error: "We couldn't record this fee. Please try again." };
  }

  const feeLabel = FEE_TYPES.find((t) => t.value === parsed.data.feeType)?.label ?? parsed.data.feeType;
  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_FEE_RECORDED",
    entityType: "order",
    entityId: orderId,
    notes: `${feeLabel}: $${parsed.data.amount}${parsed.data.reason ? ` -- ${parsed.data.reason}` : ""}`,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

export async function chargeOrderFeeAction(feeId: string): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const db = getDb();

  const feeRows = await db
    .select()
    .from(orderLateFees)
    .where(eq(orderLateFees.id, feeId))
    .limit(1);
  const fee = feeRows[0];
  if (!fee) return { ok: false, error: "This fee no longer exists." };
  if (fee.status === "charged") return { ok: false, error: "This fee has already been charged." };

  const order = await getOrderOr404(fee.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!order.stripeCustomerId || !order.stripePaymentMethodId) {
    return {
      ok: false,
      error: "No card on file for this order -- collect this fee another way.",
    };
  }

  const feeLabel = FEE_TYPES.find((t) => t.value === fee.feeType)?.label ?? fee.feeType;
  const stripe = getStripe();
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: fee.amountCents,
      currency: order.currency.toLowerCase(),
      customer: order.stripeCustomerId,
      payment_method: order.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `${feeLabel} -- order ${order.orderNumber}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, feeId: fee.id },
    });

    if (paymentIntent.status !== "succeeded") {
      await db
        .update(orderLateFees)
        .set({
          status: "charge_failed",
          chargeFailureMessage: `Unexpected status: ${paymentIntent.status}`,
          updatedAt: new Date(),
        })
        .where(eq(orderLateFees.id, feeId));
      return { ok: false, error: "The charge didn't complete. The fee is still recorded as owed." };
    }

    await db
      .update(orderLateFees)
      .set({
        status: "charged",
        stripePaymentIntentId: paymentIntent.id,
        chargedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orderLateFees.id, feeId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "ORDER_FEE_CHARGED",
      entityType: "order",
      entityId: order.id,
      notes: `${feeLabel}: $${(fee.amountCents / 100).toFixed(2)}`,
    });

    try {
      await sendLateFeeChargedEmail(order, fee.amountCents, fee.reason ? `${feeLabel} -- ${fee.reason}` : feeLabel);
    } catch {
      // Best-effort -- the charge itself already succeeded.
    }

    revalidatePath(`/admin/orders/${order.id}`);
    return { ok: true };
  } catch (err) {
    // A decline, an expired/detached payment method, requires_action from
    // the card issuer, etc. -- never let this throw up to the UI as a
    // crash. The fee simply stays owed; the admin can retry later or
    // collect it outside the app.
    const message = err instanceof Error ? err.message : "The card on file couldn't be charged.";
    await db
      .update(orderLateFees)
      .set({ status: "charge_failed", chargeFailureMessage: message, updatedAt: new Date() })
      .where(eq(orderLateFees.id, feeId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "ORDER_FEE_CHARGE_FAILED",
      entityType: "order",
      entityId: order.id,
      notes: message,
    });

    revalidatePath(`/admin/orders/${order.id}`);
    return { ok: false, error: `Charge failed: ${message}` };
  }
}

// --- Patch 4: rental extensions (after booking, optionally after delivery) --

const addExtensionSchema = z.object({
  weeks: z.coerce.number().int().min(1, "Enter at least 1 week."),
});

export async function addOrderExtensionAction(
  orderId: string,
  _prevState: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const parsed = addExtensionSchema.safeParse({ weeks: formData.get("weeks") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid number of weeks." };
  }

  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const result = await addOrderExtension(order, parsed.data.weeks, admin.id);
  if (!result.ok) return { ok: false, error: result.error };

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_EXTENDED",
    entityType: "order",
    entityId: orderId,
    notes: `+${parsed.data.weeks} week(s), $${centsToDollarsString(result.amountCents)}, new pickup ${result.newPickupDate}`,
  });

  try {
    await sendRescheduleEmail({ ...order, confirmedPickupDate: result.newPickupDate });
  } catch {
    // Best-effort -- the extension itself already succeeded.
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/calendar");
  return { ok: true };
}

export async function chargeOrderExtensionAction(extensionId: string): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const db = getDb();

  const extensionRows = await db
    .select()
    .from(orderExtensions)
    .where(eq(orderExtensions.id, extensionId))
    .limit(1);
  const extension = extensionRows[0];
  if (!extension) return { ok: false, error: "This extension no longer exists." };
  if (extension.status === "charged") return { ok: false, error: "This extension has already been charged." };

  const order = await getOrderOr404(extension.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!order.stripeCustomerId || !order.stripePaymentMethodId) {
    return { ok: false, error: "No card on file for this order -- collect this another way." };
  }

  const stripe = getStripe();
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: extension.amountCents,
      currency: order.currency.toLowerCase(),
      customer: order.stripeCustomerId,
      payment_method: order.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `${extension.weeks}-week extension -- order ${order.orderNumber}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, extensionId: extension.id },
    });

    if (paymentIntent.status !== "succeeded") {
      await db
        .update(orderExtensions)
        .set({
          status: "charge_failed",
          chargeFailureMessage: `Unexpected status: ${paymentIntent.status}`,
          updatedAt: new Date(),
        })
        .where(eq(orderExtensions.id, extensionId));
      return { ok: false, error: "The charge didn't complete. The extension is still recorded as owed." };
    }

    await db
      .update(orderExtensions)
      .set({ status: "charged", stripePaymentIntentId: paymentIntent.id, chargedAt: new Date(), updatedAt: new Date() })
      .where(eq(orderExtensions.id, extensionId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "ORDER_EXTENSION_CHARGED",
      entityType: "order",
      entityId: order.id,
      notes: `${extension.weeks} week(s), $${centsToDollarsString(extension.amountCents)}`,
    });

    revalidatePath(`/admin/orders/${order.id}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The card on file couldn't be charged.";
    await db
      .update(orderExtensions)
      .set({ status: "charge_failed", chargeFailureMessage: message, updatedAt: new Date() })
      .where(eq(orderExtensions.id, extensionId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "ORDER_EXTENSION_CHARGE_FAILED",
      entityType: "order",
      entityId: order.id,
      notes: message,
    });

    revalidatePath(`/admin/orders/${order.id}`);
    return { ok: false, error: `Charge failed: ${message}` };
  }
}

// --- Patch 4: admin-initiated cancellation -----------------------------
//
// Separate from the customer's own self-service cancel
// (app/manage/[id]/actions.ts's cancelBookingAction, limited to
// status "scheduled" and the configured refund-window rule). This one is
// for the owner: works from any status that isn't already a dead end, and
// lets the admin override the refund amount outright rather than always
// deferring to the automatic fee calculation -- useful both for genuine
// customer-service judgment calls and for clearing out old unpaid/test
// orders that have nothing to refund at all. Cancelling NEVER deletes the
// row -- per the decision to keep full history -- it's just how an order
// stops showing up in the default Orders list (see the orders page's
// status filter).
const ADMIN_CANCELLABLE_STATUSES = [
  "draft",
  "payment_pending",
  "payment_failed",
  "scheduled",
  "delivered",
];

const adminCancelSchema = z.object({
  reason: z.string().trim().optional().default(""),
  refundOverride: z.string().trim().optional().default(""),
});

export async function adminCancelOrderAction(
  orderId: string,
  _prevState: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const parsed = adminCancelSchema.safeParse({
    reason: formData.get("reason"),
    refundOverride: formData.get("refundOverride"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!ADMIN_CANCELLABLE_STATUSES.includes(order.status)) {
    return { ok: false, error: "This order can't be cancelled from its current status." };
  }

  const db = getDb();
  let refundCents = 0;

  if (order.paymentStatus === "paid") {
    if (parsed.data.refundOverride !== "") {
      refundCents = Math.max(
        0,
        Math.min(order.finalAmountCents, dollarsToCents(parsed.data.refundOverride))
      );
    } else {
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
      refundCents = Math.max(0, order.finalAmountCents - cancellationFeeCents);
    }

    if (refundCents > 0 && order.stripePaymentIntentId) {
      const stripe = getStripe();
      await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId, amount: refundCents });
    }
  }

  const cancellationFeeCents = order.paymentStatus === "paid" ? order.finalAmountCents - refundCents : 0;
  const nextPaymentStatus =
    order.paymentStatus === "paid"
      ? refundCents >= order.finalAmountCents
        ? "refunded"
        : refundCents > 0
          ? "partially_refunded"
          : order.paymentStatus
      : order.paymentStatus;

  await db
    .update(orders)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: parsed.data.reason || null,
      cancellationFeeCents,
      refundedAmountCents: order.refundedAmountCents + refundCents,
      paymentStatus: nextPaymentStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_CANCELLED_BY_ADMIN",
    entityType: "order",
    entityId: orderId,
    notes: parsed.data.reason || undefined,
  });

  if (order.paymentStatus === "paid") {
    try {
      await sendCancellationEmail({
        ...order,
        cancellationFeeCents,
        refundedAmountCents: order.refundedAmountCents + refundCents,
      });
    } catch {
      // Best-effort -- the cancellation itself already succeeded.
    }
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/calendar");
  return { ok: true };
}

// --- Patch 4: manual review request (send or resend) --------------------
//
// Independent of the Settings auto-send toggle -- this works whether or
// not automatic requests are on, since the owner may want to request a
// review from a specific customer even with the toggle off, or resend a
// link a customer lost.

export async function requestReviewAction(orderId: string): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const order = await getOrderOr404(orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const result = await createReviewRequest(order);
  if (!result.ok) return { ok: false, error: result.error };

  try {
    await sendReviewRequestEmail(order, result.reviewToken);
  } catch (err) {
    return {
      ok: false,
      error: `The request was created, but the email couldn't be sent: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: order.reviewRequestedAt ? "REVIEW_REQUEST_RESENT" : "REVIEW_REQUEST_SENT",
    entityType: "order",
    entityId: orderId,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
