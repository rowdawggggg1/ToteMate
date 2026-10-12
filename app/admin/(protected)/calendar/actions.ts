"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRescheduleOrderDate } from "@/lib/reschedule";
import { sendRescheduleEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

export type CalendarActionState = { ok: boolean; error?: string };

/**
 * Drag-and-drop reschedule from the admin calendar. `kind` says which chip
 * was dragged -- "delivery" or "pickup" -- and only THAT date moves; the
 * other stays put. This is deliberately different from the customer's own
 * Manage My Booking reschedule (lib/reschedule.ts's
 * rescheduleOrderDeliveryDate, which always shifts both together to
 * preserve the paid rental duration) -- an admin dragging a job around the
 * calendar is making an operational call (deliver a day early, let them
 * keep it until the original day; push pickup back a day; etc.), not
 * changing what the customer is renting. Blocked dates, daily capacity,
 * and tote inventory are still fully enforced either way -- an admin can
 * never create a double-booking just because they're staff.
 */
export async function adminRescheduleOrderAction(
  orderId: string,
  kind: "delivery" | "pickup",
  newDate: string
): Promise<CalendarActionState> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return { ok: false, error: "Order not found." };

  const result = await adminRescheduleOrderDate(order, kind, newDate);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_RESCHEDULED_BY_ADMIN",
    entityType: "order",
    entityId: order.id,
    notes: `New ${kind} date: ${newDate}`,
  });

  try {
    await sendRescheduleEmail({
      ...order,
      confirmedDeliveryDate: result.newDeliveryDate,
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
