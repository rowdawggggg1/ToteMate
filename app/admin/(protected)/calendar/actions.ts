"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { rescheduleOrderDeliveryDate } from "@/lib/reschedule";
import { sendRescheduleEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

export type CalendarActionState = { ok: boolean; error?: string };

/**
 * Drag-and-drop reschedule from the admin calendar. Reuses the exact same
 * availability-checked core as the customer's own Manage My Booking
 * reschedule (lib/reschedule.ts) -- an admin moving a job to a different
 * day is never allowed to create a double-booking or skip a blocked date
 * just because they're staff.
 */
export async function adminRescheduleOrderAction(
  orderId: string,
  newDeliveryDate: string
): Promise<CalendarActionState> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return { ok: false, error: "Order not found." };

  const result = await rescheduleOrderDeliveryDate(order, newDeliveryDate);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_RESCHEDULED_BY_ADMIN",
    entityType: "order",
    entityId: order.id,
    notes: `New delivery date: ${newDeliveryDate}`,
  });

  try {
    await sendRescheduleEmail({
      ...order,
      confirmedDeliveryDate: newDeliveryDate,
      confirmedPickupDate: result.newPickupDate,
    });
  } catch {
    // Best-effort -- the reschedule itself already succeeded.
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true };
}
