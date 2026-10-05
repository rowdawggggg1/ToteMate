/**
 * Availability engine: the single place that decides whether a requested
 * delivery/pickup date is bookable. The public booking flow, customer
 * rescheduling, and the admin all call into these functions rather than
 * re-implementing lead-time/blocked-date/capacity/inventory checks
 * separately -- per the spec's requirement that this logic be centralized
 * and server-authoritative.
 *
 * Checks implemented here (Sections 12, 16, 17):
 *  - minimum lead time
 *  - owner-blocked dates
 *  - daily capacity (delivery / pickup / combined), only when enabled
 *  - aggregate physical tote inventory, respecting the post-pickup
 *    readiness buffer and the overbooking setting
 *  - the cancellation-refund window (Section 23), which depends on the
 *    admin-configurable cutoff reference (start/end of delivery day) and
 *    window length
 */

import { and, eq, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blockedDates, businessSettings, orders, totes } from "@/lib/db/schema";

export type BusinessSettingsRow = typeof businessSettings.$inferSelect;

/** Fetches the single-row business settings. Shared by the booking/pricing
 * pipeline (lib/orders.ts) as well as the functions in this file. */
export async function getBusinessSettings(): Promise<BusinessSettingsRow> {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const settings = rows[0];
  if (!settings) {
    throw new Error("Business settings have not been configured yet (run /setup first).");
  }
  return settings;
}

/** Order statuses that no longer hold a capacity/inventory slot. Every
 * other status (including "completed") still occupied its window
 * historically, which only matters for dates in the past. */
const RELEASED_ORDER_STATUSES = ["draft", "payment_failed", "cancelled", "refunded"]

// --- Date helpers (plain YYYY-MM-DD strings, UTC-anchored so day math
// never drifts across a DST boundary) --------------------------------

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addWeeksToDateString(dateStr: string, weeks: number): string {
  return addDaysToDateString(dateStr, weeks * 7);
}

/** "Today" as a YYYY-MM-DD string in the business's configured timezone. */
export function businessTodayDateString(timezone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the wall-clock date we
  // want in the given timezone.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

// --- Lead time ---------------------------------------------------------

export function meetsMinimumLeadTime(
  requestedDateStr: string,
  minLeadTimeDays: number,
  timezone: string
): boolean {
  const todayStr = businessTodayDateString(timezone);
  const earliestAllowed = addDaysToDateString(todayStr, minLeadTimeDays);
  return requestedDateStr >= earliestAllowed;
}

// --- Blocked dates -------------------------------------------------------

export async function isDateBlocked(dateStr: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: blockedDates.id })
    .from(blockedDates)
    .where(eq(blockedDates.date, dateStr))
    .limit(1);
  return rows.length > 0;
}

// --- Daily capacity -------------------------------------------------------

export type DailyCapacityResult = {
  withinCapacity: boolean;
  deliveryCount: number;
  pickupCount: number;
  combinedCount: number;
};

/**
 * Checks whether adding one more job on `dateStr` would stay within the
 * business's configured daily capacity. When dailyCapacityEnabled is
 * false, always returns withinCapacity: true (no limit configured).
 */
export async function checkDailyCapacity(
  dateStr: string,
  options?: { excludeOrderId?: string }
): Promise<DailyCapacityResult> {
  const settings = await getBusinessSettings();

  if (!settings.dailyCapacityEnabled) {
    return { withinCapacity: true, deliveryCount: 0, pickupCount: 0, combinedCount: 0 };
  }

  const db = getDb();
  const releasedFilter = notInArray(orders.status, RELEASED_ORDER_STATUSES);

  const [deliveryRows, pickupRows] = await Promise.all([
    db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.confirmedDeliveryDate, dateStr), releasedFilter)),
    db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.confirmedPickupDate, dateStr), releasedFilter)),
  ]);

  const deliveryIds = deliveryRows.map((r) => r.id).filter((id) => id !== options?.excludeOrderId);
  const pickupIds = pickupRows.map((r) => r.id).filter((id) => id !== options?.excludeOrderId);

  const deliveryCount = deliveryIds.length;
  const pickupCount = pickupIds.length;
  const combinedCount = new Set([...deliveryIds, ...pickupIds]).size;

  const withinCapacity =
    (settings.maxDeliveriesPerDay === null || deliveryCount < settings.maxDeliveriesPerDay) &&
    (settings.maxPickupsPerDay === null || pickupCount < settings.maxPickupsPerDay) &&
    (settings.maxCombinedJobsPerDay === null || combinedCount < settings.maxCombinedJobsPerDay);

  return { withinCapacity, deliveryCount, pickupCount, combinedCount };
}

// --- Tote inventory -------------------------------------------------------

export type ToteAvailabilityResult = {
  fleetSize: number;
  /** Conservative worst-case concurrent tote need: this booking's totes
   * plus every other active order whose occupied window overlaps at all. */
  maxConcurrentNeeded: number;
  available: boolean;
  overbookingEnabled: boolean;
};

/**
 * Checks whether `toteQuantityNeeded` totes can be committed to a rental
 * running from `deliveryDateStr` through `pickupDateStr` (inclusive),
 * accounting for the post-pickup readiness buffer and every other active
 * order whose window overlaps. When the business has overbooking enabled,
 * this still reports the real numbers but always returns available: true,
 * so the caller can choose to warn the admin rather than block the
 * booking.
 *
 * This deliberately sums ALL overlapping orders' tote quantities rather
 * than doing a precise day-by-day sweep -- a conservative worst case that
 * is simple and correct for a small fleet, and avoids over-engineering a
 * scheduling algorithm this business doesn't need yet.
 */
export async function checkToteAvailability(
  deliveryDateStr: string,
  pickupDateStr: string,
  toteQuantityNeeded: number,
  options?: { excludeOrderId?: string }
): Promise<ToteAvailabilityResult> {
  const db = getDb();
  const settings = await getBusinessSettings();

  const fleetRows = await db
    .select({ count: sql<string>`count(*)` })
    .from(totes)
    .where(notInArray(totes.status, ["retired", "lost"]));
  const fleetSize = Number(fleetRows[0]?.count ?? 0);

  const candidateOrders = await db
    .select({
      id: orders.id,
      packageToteQuantity: orders.packageToteQuantity,
      confirmedDeliveryDate: orders.confirmedDeliveryDate,
      confirmedPickupDate: orders.confirmedPickupDate,
    })
    .from(orders)
    .where(notInArray(orders.status, RELEASED_ORDER_STATUSES));

  const requestedStart = new Date(deliveryDateStr + "T00:00:00Z").getTime();
  const requestedEnd = new Date(pickupDateStr + "T00:00:00Z").getTime();
  const bufferMs = settings.readinessBufferDays * 24 * 60 * 60 * 1000;

  let maxConcurrentNeeded = toteQuantityNeeded;
  for (const order of candidateOrders) {
    if (options?.excludeOrderId && order.id === options.excludeOrderId) continue;
    const occStart = new Date(order.confirmedDeliveryDate + "T00:00:00Z").getTime();
    const occEnd = new Date(order.confirmedPickupDate + "T00:00:00Z").getTime() + bufferMs;
    const overlaps = occStart < requestedEnd && occEnd > requestedStart;
    if (overlaps) {
      maxConcurrentNeeded += order.packageToteQuantity;
    }
  }

  const available = settings.overbookingEnabled || maxConcurrentNeeded <= fleetSize;

  return {
    fleetSize,
    maxConcurrentNeeded,
    available,
    overbookingEnabled: settings.overbookingEnabled,
  };
}

// --- Cancellation window (Section 23) -------------------------------------

/**
 * The exact moment the cancellation-window countdown is measured against,
 * derived from the admin-configurable `cancellationCutoffReference`
 * ("start_of_day" = midnight at the start of the delivery date,
 * "end_of_day" = 11:59:59 PM on the delivery date). The stored delivery
 * date has no time component, so it's treated as a wall-clock date and
 * anchored in UTC for the comparison -- adequate for a day-based cutoff
 * and avoids pulling in a timezone-conversion library this app doesn't
 * otherwise need.
 */
export function computeCancellationCutoff(
  confirmedDeliveryDateStr: string,
  cancellationCutoffReference: string
): Date {
  const timeOfDay = cancellationCutoffReference === "end_of_day" ? "T23:59:59" : "T00:00:00";
  return new Date(confirmedDeliveryDateStr + timeOfDay + "Z");
}

/**
 * True when cancelling right now would fall INSIDE the no-refund window
 * (i.e. too close to the cutoff to qualify for the configured refund
 * rule) -- per Section 23, cancelling within `cancellationWindowHours` of
 * the cutoff means no refund regardless of the fee settings.
 */
export function isWithinCancellationWindow(
  confirmedDeliveryDateStr: string,
  cancellationCutoffReference: string,
  cancellationWindowHours: number,
  now: Date = new Date()
): boolean {
  const cutoff = computeCancellationCutoff(confirmedDeliveryDateStr, cancellationCutoffReference);
  const windowStart = new Date(cutoff.getTime() - cancellationWindowHours * 60 * 60 * 1000);
  return now.getTime() >= windowStart.getTime();
}

// --- Composite check for a new booking's requested delivery date ---------

export type DateAvailabilityResult = {
  ok: boolean;
  reason?: string;
};

/**
 * Convenience composite for the booking flow: checks lead time, blocked
 * dates, and daily capacity for a single requested delivery date in one
 * call. Tote inventory is checked separately (checkToteAvailability)
 * since it needs the full delivery-to-pickup window, not just one date.
 */
export async function checkDeliveryDateAvailability(
  requestedDateStr: string,
  settings: Pick<BusinessSettingsRow, "minLeadTimeDays" | "timezone">
): Promise<DateAvailabilityResult> {
  if (!meetsMinimumLeadTime(requestedDateStr, settings.minLeadTimeDays, settings.timezone)) {
    return { ok: false, reason: "That date is too soon -- please choose a later date." };
  }
  if (await isDateBlocked(requestedDateStr)) {
    return { ok: false, reason: "That date is unavailable. Please choose another date." };
  }
  const capacity = await checkDailyCapacity(requestedDateStr);
  if (!capacity.withinCapacity) {
    return { ok: false, reason: "That date is fully booked. Please choose another date." };
  }
  return { ok: true };
}
