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
import { orderExtensions, orders } from "@/lib/db/schema";
import {
  checkDeliveryDateAvailability,
  checkDailyCapacity,
  checkToteAvailability,
  addWeeksToDateString,
  getBusinessSettings,
  isDateBlocked,
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

export type AdminRescheduleResult =
  | { ok: true; newDeliveryDate: string; newPickupDate: string }
  | { ok: false; error: string };

/**
 * Admin-only: move JUST the delivery date OR JUST the pickup date,
 * independently of each other -- unlike rescheduleOrderDeliveryDate above
 * (which always shifts both together to preserve the customer's paid
 * rental duration), this is for the owner's own operational convenience,
 * e.g. delivering a day early but letting the customer keep the totes
 * until the originally-promised pickup day, or pushing pickup back a day.
 * Since this can change the order's actual rental length, it deliberately
 * does NOT touch pricing/rentalDurationWeeks -- those stay the frozen
 * snapshot from booking time, per the historical-snapshot rule; this is
 * purely a scheduling adjustment.
 *
 * Unlike the customer-facing reschedule, this does NOT enforce the normal
 * minimum-lead-time rule -- an owner moving a job for logistics reasons
 * may legitimately want to do that on short notice. Blocked dates, daily
 * capacity, and tote inventory are still enforced, since those protect
 * against a genuine double-booking regardless of who makes the change.
 */
export async function adminRescheduleOrderDate(
  order: OrderRow,
  kind: "delivery" | "pickup",
  newDate: string
): Promise<AdminRescheduleResult> {
  if (!RESCHEDULABLE_STATUSES.includes(order.status)) {
    return { ok: false, error: "This order can no longer be rescheduled this way." };
  }

  const currentDate = kind === "delivery" ? order.confirmedDeliveryDate : order.confirmedPickupDate;
  if (newDate === currentDate) {
    return { ok: false, error: `That's already this order's ${kind} date.` };
  }

  const newDeliveryDate = kind === "delivery" ? newDate : order.confirmedDeliveryDate;
  const newPickupDate = kind === "pickup" ? newDate : order.confirmedPickupDate;

  if (newDeliveryDate > newPickupDate) {
    return {
      ok: false,
      error:
        kind === "delivery"
          ? "Delivery can't be moved to after the pickup date -- move pickup first, or choose an earlier day."
          : "Pickup can't be moved to before the delivery date -- move delivery first, or choose a later day.",
    };
  }

  if (await isDateBlocked(newDate)) {
    return { ok: false, error: "That date is unavailable. Please choose another date." };
  }

  const capacity = await checkDailyCapacity(newDate, { excludeOrderId: order.id });
  if (!capacity.withinCapacity) {
    return { ok: false, error: "That date is fully booked. Please choose another date." };
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

  return { ok: true, newDeliveryDate, newPickupDate };
}

/** An order can be extended any time before it's picked up -- including
 * after it's already been delivered, which is the whole point (the
 * customer decides mid-rental they need it longer). */
const EXTENDABLE_STATUSES = ["scheduled", "delivered"];

export type AddExtensionResult =
  | { ok: true; extensionId: string; amountCents: number; newPickupDate: string }
  | { ok: false; error: string };

/**
 * Adds N extra weeks onto an order that's ALREADY been booked (optionally
 * already delivered) -- different from choosing extra weeks during
 * checkout. Always priced at that order's own locked weekly rate
 * (weeklyExtensionPriceCents), frozen at booking time, so an order whose
 * package never offered a weekly extension can't be extended this way.
 *
 * This immediately pushes confirmedPickupDate out by N weeks -- but only
 * after confirming the fleet can actually support the longer rental
 * (blocked dates / daily capacity / tote inventory, exactly like any other
 * date change). If there isn't enough inventory for the new, longer
 * window, this returns a clear error and changes nothing -- it never
 * silently overbooks the fleet just because a customer asked to extend.
 * The resulting fee is always just RECORDED here (orderExtensions,
 * status "recorded"); charging the saved card for it is a separate,
 * explicit admin action (chargeOrderExtensionAction in
 * app/admin/(protected)/orders/actions.ts), exactly like late fees.
 */
export async function addOrderExtension(
  order: OrderRow,
  weeks: number,
  createdByAdminId: string
): Promise<AddExtensionResult> {
  if (!EXTENDABLE_STATUSES.includes(order.status)) {
    return { ok: false, error: "This order can no longer be extended." };
  }
  if (!Number.isInteger(weeks) || weeks <= 0) {
    return { ok: false, error: "Enter a whole number of weeks greater than zero." };
  }
  if (!order.weeklyExtensionPriceCents) {
    return { ok: false, error: "This order's package doesn't offer a weekly extension." };
  }

  const previousPickupDate = order.confirmedPickupDate;
  const newPickupDate = addWeeksToDateString(previousPickupDate, weeks);

  if (await isDateBlocked(newPickupDate)) {
    return { ok: false, error: "That new pickup date is unavailable. Please pick fewer/more weeks." };
  }

  const capacity = await checkDailyCapacity(newPickupDate, { excludeOrderId: order.id });
  if (!capacity.withinCapacity) {
    return { ok: false, error: "That new pickup date is fully booked -- we can't support that long a rental right now." };
  }

  const toteAvailability = await checkToteAvailability(
    order.confirmedDeliveryDate,
    newPickupDate,
    order.packageToteQuantity,
    { excludeOrderId: order.id }
  );
  if (!toteAvailability.available) {
    return {
      ok: false,
      error:
        "We don't have enough totes available to extend through that date -- other bookings need the fleet in that window.",
    };
  }

  const amountCents = weeks * order.weeklyExtensionPriceCents;

  const db = getDb();
  const inserted = await db
    .insert(orderExtensions)
    .values({
      orderId: order.id,
      weeks,
      amountCents,
      previousPickupDate,
      newPickupDate,
      createdByAdminId,
    })
    .returning({ id: orderExtensions.id });
  const extensionId = inserted[0]?.id;
  if (!extensionId) {
    return { ok: false, error: "We couldn't record this extension. Please try again." };
  }

  await db
    .update(orders)
    .set({
      requestedPickupDate: newPickupDate,
      confirmedPickupDate: newPickupDate,
      extensionWeeks: order.extensionWeeks + weeks,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  return { ok: true, extensionId, amountCents, newPickupDate };
}
