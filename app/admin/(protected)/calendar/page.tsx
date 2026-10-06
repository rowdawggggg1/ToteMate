import { and, gte, lte, or, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blockedDates, businessSettings, orders } from "@/lib/db/schema";
import { businessTodayDateString, addDaysToDateString } from "@/lib/availability";
import { CalendarView, type CalendarJob, type CalendarBlockedDate } from "./calendar-view";

export const dynamic = "force-dynamic";

function monthBounds(monthParam: string | undefined, timezone: string) {
  const today = businessTodayDateString(timezone);
  const base = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : today;
  const [yearStr, monthStr] = base.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastOfMonth = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // Pad out to full calendar weeks (Sun-Sat) so the grid has no gaps.
  const firstWeekday = new Date(firstOfMonth + "T00:00:00Z").getUTCDay();
  const lastWeekday = new Date(lastOfMonth + "T00:00:00Z").getUTCDay();
  const rangeStart = addDaysToDateString(firstOfMonth, -firstWeekday);
  const rangeEnd = addDaysToDateString(lastOfMonth, 6 - lastWeekday);

  const prevMonthDate = addDaysToDateString(firstOfMonth, -1);
  const nextMonthDate = addDaysToDateString(lastOfMonth, 1);

  return {
    year,
    month,
    firstOfMonth,
    lastOfMonth,
    rangeStart,
    rangeEnd,
    today,
    prevMonth: prevMonthDate.slice(0, 7),
    nextMonth: nextMonthDate.slice(0, 7),
    label: new Date(firstOfMonth + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const db = getDb();

  const settingsRows = await db.select().from(businessSettings).where(eq(businessSettings.id, 1)).limit(1);
  const timezone = settingsRows[0]?.timezone ?? "America/Edmonton";

  const bounds = monthBounds(month, timezone);

  const deliveryRows = await db
    .select()
    .from(orders)
    .where(
      and(
        gte(orders.confirmedDeliveryDate, bounds.rangeStart),
        lte(orders.confirmedDeliveryDate, bounds.rangeEnd),
        or(eq(orders.status, "scheduled"), eq(orders.status, "delivered"), eq(orders.status, "picked_up"), eq(orders.status, "completed"))
      )
    );

  const pickupRows = await db
    .select()
    .from(orders)
    .where(
      and(
        gte(orders.confirmedPickupDate, bounds.rangeStart),
        lte(orders.confirmedPickupDate, bounds.rangeEnd),
        or(eq(orders.status, "scheduled"), eq(orders.status, "delivered"), eq(orders.status, "picked_up"), eq(orders.status, "completed"))
      )
    );

  const blockedRows = await db
    .select()
    .from(blockedDates)
    .where(and(gte(blockedDates.date, bounds.rangeStart), lte(blockedDates.date, bounds.rangeEnd)));

  const jobs: CalendarJob[] = [
    ...deliveryRows.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      date: o.confirmedDeliveryDate,
      kind: "delivery" as const,
      draggable: o.status === "scheduled",
    })),
    ...pickupRows.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      date: o.confirmedPickupDate,
      kind: "pickup" as const,
      // Pickup-only dates can't be dragged independently -- rescheduling
      // shifts delivery + pickup together (see lib/reschedule.ts); an
      // already-delivered order's pickup date is a different kind of
      // change (an extension) that this calendar doesn't handle.
      draggable: false,
    })),
  ];

  const blocked: CalendarBlockedDate[] = blockedRows.map((b) => ({
    date: b.date,
    reason: b.reason,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Calendar</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Drag a delivery onto a new day to reschedule it (delivery + pickup move together). Pickups
        and blocked dates are shown for reference and aren't draggable here.
      </p>
      <CalendarView
        label={bounds.label}
        rangeStart={bounds.rangeStart}
        today={bounds.today}
        prevMonth={bounds.prevMonth}
        nextMonth={bounds.nextMonth}
        jobs={jobs}
        blockedDates={blocked}
      />
    </div>
  );
}
