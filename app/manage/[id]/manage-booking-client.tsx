"use client";

import { useState } from "react";
import { centsToDollarsString } from "@/lib/money";
import { cancelBookingAction, rescheduleBookingAction } from "./actions";

export type ManageOrderView = {
  id: string;
  orderNumber: string;
  status: string;
  packageName: string;
  confirmedDeliveryDate: string;
  confirmedPickupDate: string;
  finalAmountCents: number;
  currency: string;
  paymentStatus: string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  payment_pending: "Payment pending",
  payment_failed: "Payment failed",
  paid: "Paid",
  scheduled: "Scheduled",
  delivered: "Delivered",
  active_rental: "Rental in progress",
  picked_up: "Picked up",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function ManageBookingClient({
  order,
  token,
  canManage,
  minLeadTimeDays,
}: {
  order: ManageOrderView;
  token: string;
  canManage: boolean;
  minLeadTimeDays: number;
}) {
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState(order.confirmedDeliveryDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleCancel() {
    setPending(true);
    setError(null);
    const result = await cancelBookingAction(order.id, token, reason);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "We couldn't cancel this booking.");
      return;
    }
    setDone("Your booking has been cancelled.");
    setMode("view");
  }

  async function handleReschedule() {
    setPending(true);
    setError(null);
    const result = await rescheduleBookingAction(order.id, token, newDate);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "We couldn't reschedule this booking.");
      return;
    }
    setDone("Your booking has been rescheduled.");
    setMode("view");
  }

  function minDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + minLeadTimeDays);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">
        Order {order.orderNumber}
      </h1>

      {done && (
        <p role="status" className="mt-3 text-sm text-[var(--color-success)]">
          {done}
        </p>
      )}

      <dl className="mt-6 space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <Row label="Status" value={STATUS_LABELS[order.status] ?? order.status} />
        <Row label="Package" value={order.packageName} />
        <Row label="Delivery date" value={order.confirmedDeliveryDate} />
        <Row label="Pickup date" value={order.confirmedPickupDate} />
        <Row
          label="Total"
          value={`$${centsToDollarsString(order.finalAmountCents)} ${order.currency}`}
        />
        <Row label="Payment" value={STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus} />
      </dl>

      {!canManage && order.status !== "cancelled" && (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          This booking can no longer be changed here -- please contact us directly if you need
          something adjusted.
        </p>
      )}

      {canManage && mode === "view" && (
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setMode("reschedule")}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)]"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={() => setMode("cancel")}
            className="rounded-lg border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)]"
          >
            Cancel booking
          </button>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="mt-6 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="font-medium text-[var(--color-text)]">Choose a new delivery date</h2>
          <input
            type="date"
            min={minDate()}
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReschedule}
              disabled={pending}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Confirm new date"}
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="text-sm font-medium text-[var(--color-muted)] hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-6 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="font-medium text-[var(--color-text)]">Cancel this booking</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Depending on how close this is to your delivery date, a cancellation fee may apply
            per our cancellation policy.
          </p>
          <textarea
            rows={2}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="rounded-lg bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Cancelling…" : "Confirm cancellation"}
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="text-sm font-medium text-[var(--color-muted)] hover:underline"
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
