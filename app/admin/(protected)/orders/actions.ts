"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { orderLateFees, orders, orderToteAssignments, totes } from "@/lib/db/schema";
import { requireAdmin, requireStaff } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import { getStripe } from "@/lib/stripe";
import { sendLateFeeChargedEmail } from "@/lib/email";

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

// --- Phase 4: late fees -----------------------------------------------
//
// Per the spec, late fees are never auto-charged. Applying one here only
// ever records it against the order -- always, immediately, regardless of
// whether a card is on file. Actually charging it is a separate, explicit
// action (chargeLateFeeAction) the admin triggers on their own schedule,
// using the card captured at booking time (lib/orders.ts's
// setup_future_usage: "off_session"). If there's no card on file, or the
// charge fails, the fee stays recorded as owed -- collecting it outside
// the app is always a safety net, never an error state.

const addLateFeeSchema = z.object({
  amount: z.string().trim().min(1, "An amount is required."),
  reason: z.string().trim().optional().default(""),
});

export async function addLateFeeAction(
  orderId: string,
  _prevState: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const parsed = addLateFeeSchema.safeParse({
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid late fee." };
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
      amountCents,
      reason: parsed.data.reason || null,
      createdByAdminId: admin.id,
    })
    .returning({ id: orderLateFees.id });
  const newId = inserted[0]?.id;
  if (!newId) {
    return { ok: false, error: "We couldn't record this late fee. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "LATE_FEE_RECORDED",
    entityType: "order",
    entityId: orderId,
    notes: `$${parsed.data.amount}${parsed.data.reason ? ` -- ${parsed.data.reason}` : ""}`,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

export async function chargeLateFeeAction(lateFeeId: string): Promise<OrderActionState> {
  const admin = await requireAdmin();
  const db = getDb();

  const feeRows = await db
    .select()
    .from(orderLateFees)
    .where(eq(orderLateFees.id, lateFeeId))
    .limit(1);
  const fee = feeRows[0];
  if (!fee) return { ok: false, error: "This late fee no longer exists." };
  if (fee.status === "charged") return { ok: false, error: "This late fee has already been charged." };

  const order = await getOrderOr404(fee.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!order.stripeCustomerId || !order.stripePaymentMethodId) {
    return {
      ok: false,
      error: "No card on file for this order -- collect this fee another way.",
    };
  }

  const stripe = getStripe();
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: fee.amountCents,
      currency: order.currency.toLowerCase(),
      customer: order.stripeCustomerId,
      payment_method: order.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `Late fee -- order ${order.orderNumber}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, lateFeeId: fee.id },
    });

    if (paymentIntent.status !== "succeeded") {
      await db
        .update(orderLateFees)
        .set({
          status: "charge_failed",
          chargeFailureMessage: `Unexpected status: ${paymentIntent.status}`,
          updatedAt: new Date(),
        })
        .where(eq(orderLateFees.id, lateFeeId));
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
      .where(eq(orderLateFees.id, lateFeeId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "LATE_FEE_CHARGED",
      entityType: "order",
      entityId: order.id,
      notes: `$${(fee.amountCents / 100).toFixed(2)}`,
    });

    try {
      await sendLateFeeChargedEmail(order, fee.amountCents, fee.reason);
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
      .where(eq(orderLateFees.id, lateFeeId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "LATE_FEE_CHARGE_FAILED",
      entityType: "order",
      entityId: order.id,
      notes: message,
    });

    revalidatePath(`/admin/orders/${order.id}`);
    return { ok: false, error: `Charge failed: ${message}` };
  }
}
