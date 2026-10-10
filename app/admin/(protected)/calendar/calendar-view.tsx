"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminRescheduleOrderAction } from "./actions";

export type CalendarJob = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  date: string;
  kind: "delivery" | "pickup";
  draggable: boolean;
};

export type CalendarBlockedDate = {
  date: string;
  reason: string | null;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CalendarView({
  label,
  rangeStart,
  today,
  prevMonth,
  nextMonth,
  jobs,
  blockedDates,
}: {
  label: string;
  rangeStart: string;
  today: string;
  prevMonth: string;
  nextMonth: string;
  jobs: CalendarJob[];
  blockedDates: CalendarBlockedDate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentMonthFromRangeStart = rangeStart.slice(0, 7);
  const days: string[] = Array.from({ length: 42 }, (_, i) => addDays(rangeStart, i));

  const blockedByDate = new Map(blockedDates.map((b) => [b.date, b]));
  const jobsByDate = new Map<string, CalendarJob[]>();
  for (const job of jobs) {
    const list = jobsByDate.get(job.date) ?? [];
    list.push(job);
    jobsByDate.set(job.date, list);
  }

  function handleDrop(e: React.DragEvent, date: string) {
    e.preventDefault();
    setDragOverDate(null);
    const orderId = e.dataTransfer.getData("text/plain");
    if (!orderId) return;
    setError(null);
    startTransition(async () => {
      const result = await adminRescheduleOrderAction(orderId, date);
      if (!result.ok) {
        setError(result.error ?? "Couldn't reschedule that order.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/calendar?month=${prevMonth}`}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)]"
        >
          ← Prev
        </Link>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{label}</h2>
        <Link
          href={`/admin/calendar?month=${nextMonth}`}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)]"
        >
          Next →
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}
      {isPending && <p className="mt-3 text-sm text-[var(--color-muted)]">Rescheduling…</p>}

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-[var(--color-surface)] px-2 py-1.5 text-center font-semibold text-[var(--color-text)]"
          >
            {d}
          </div>
        ))}

        {days.map((date) => {
          const inCurrentMonth = date.slice(0, 7) === currentMonthFromRangeStart;
          const dayJobs = jobsByDate.get(date) ?? [];
          const blocked = blockedByDate.get(date);
          const isToday = date === today;
          const isDragOver = dragOverDate === date;

          return (
            <div
              key={date}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDate(date);
              }}
              onDragLeave={() => setDragOverDate((d) => (d === date ? null : d))}
              onDrop={(e) => handleDrop(e, date)}
              className={`min-h-[6rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 ${
                inCurrentMonth ? "" : "bg-[var(--color-background)] opacity-60"
              } ${isDragOver ? "ring-2 ring-inset ring-[var(--color-primary)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    isToday
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-semibold text-white"
                      : "text-sm font-medium text-[var(--color-text)]"
                  }
                >
                  {Number(date.slice(8, 10))}
                </span>
              </div>

              {blocked && (
                <div
                  title={blocked.reason ?? "Blocked"}
                  className="mt-1 truncate rounded border border-[var(--color-error)] bg-[var(--color-error)] px-1 py-0.5 text-[11px] font-semibold text-white"
                >
                  Blocked{blocked.reason ? `: ${blocked.reason}` : ""}
                </div>
              )}

              <div className="mt-1 space-y-1">
                {dayJobs.map((job) => (
                  <Link
                    key={`${job.kind}-${job.orderId}`}
                    href={`/admin/orders/${job.orderId}`}
                    draggable={job.draggable}
                    onDragStart={(e) => {
                      if (!job.draggable) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("text/plain", job.orderId);
                    }}
                    title={`${job.customerName} -- ${job.orderNumber}`}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] font-semibold text-white shadow-sm ${
                      job.kind === "delivery" ? "bg-[var(--color-primary)]" : "bg-[var(--color-accent)]"
                    } ${job.draggable ? "cursor-grab" : "cursor-pointer"}`}
                  >
                    {job.kind === "delivery" ? "Deliver" : "Pick up"}: {job.customerName}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-primary)]" /> Delivery
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-accent)]" /> Pickup
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-error)]" /> Blocked
        </span>
      </div>
    </div>
  );
}
