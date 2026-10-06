/**
 * Shared "move this order's delivery date" logic, used by both the
 * customer-facing Manage My Booking page (app/manage/[id]/actions.ts) and
 * the admin calendar's drag-to-reschedule (app/admin/(protected)/calendar
 * /actions.ts). Both shift the whole order (delivery + pickup) together by
 * the same number of days, re-running the same availability checks as a
 * brand-new booking would -- this is a date change, not a duration change,
 * so the price never changes.
 *
 * Only re-runs the checks and writes the DB row; the caller is
 * responsible for its own audit-log entry (different actor: "system" for
 * the customer flow, "admin" for the calendar) and for sending the
 * reschedule email, since only the caller knows which one applies.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  checkDeliveryDateAvailability,
  checkDailyCapacity,
  checkToteAvailability,
  addWeeksToDateString,
  getBusinessSettings,
} from "@/lib/availability";

export type OrderRow = typeof orders.$inferSelect;

/** Only a not-yet-delivered order can have its dates shifted this way --
 * once a tote is actually out with the customer, moving "the delivery
 * date" no longer makes sense; that's a different operation (an
 * extension) this function deliberately doesn't attempt. */
const RESCHEDULABLE_STATUSES = ["scheduled"];

export type RescheduleResult =
  | { ok: true; newPickupDate: string }
  | { ok: false; error: string };

export async function rescheduleOrderDeliveryDate(
  order: OrderRow,
  newDeliveryDate: string
): Promise<RescheduleResult> {
  if (!RESCHEDULABLE_STATUSES.includes(order.status)) {
    return { ok: false, error: "This order can no longer be rescheduled this way." };
  }

  if (newDeliveryDate === order.confirmedDeliveryDate) {
    return { ok: false, error: "That's already this order's delivery date." };
  }

  const settings = await getBusinessSettings();

  const dateCheck = await checkDeliveryDateAvailability(newDeliveryDate, {
    minLeadTimeDays: settings.minLeadTimeDays,
    timezone: settings.timezone,
  });
  if (!dateCheck.ok) {
    return { ok: false, error: dateCheck.reason ?? "That date isn't available." };
  }

  const newPickupDate = addWeeksToDateString(
    newDeliveryDate,
    order.rentalDurationWeeks + order.extensionWeeks
  );

  const pickupCapacity = await checkDailyCapacity(newPickupDate, { excludeOrderId: order.id });
  if (!pickupCapacity.withinCapacity) {
    return { ok: false, error: "That pickup date is fully booked. Please choose another date." };
  }

  const toteAvailability = await checkToteAvailability(
    newDeliveryDate,
    newPickupDate,
    order.packageToteQuantity,
    { excludeOrderId: order.id }
  );
  if (!toteAvailability.available) {
    return { ok: false, error: "We don't have enough totes available for those dates." };
  }

  const db = getDb();
  await db
    .update(orders)
    .set({
      requestedDeliveryDate: newDeliveryDate,
      confirmedDeliveryDate: newDeliveryDate,
      requestedPickupDate: newPickupDate,
      confirmedPickupDate: newPickupDate,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  return { ok: true, newPickupDate };
}
