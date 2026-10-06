"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markDeliveredAction, markPickedUpAction } from "@/app/admin/(protected)/orders/actions";

export type DriverJob = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  date: string;
  window: string | null;
  address: string;
  instructions: string | null;
  packageSummary: string;
};

export function DriverJobsClient({
  deliveries,
  pickups,
}: {
  deliveries: DriverJob[];
  pickups: DriverJob[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function complete(orderId: string, kind: "delivered" | "picked_up") {
    setPendingId(orderId);
    setError(null);
    const result =
      kind === "delivered" ? await markDeliveredAction(orderId) : await markPickedUpAction(orderId);
    setPendingId(null);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

      <JobSection
        title="Deliveries"
        emptyText="No deliveries scheduled."
        jobs={deliveries}
        actionLabel="Mark Delivered"
        onComplete={(id) => complete(id, "delivered")}
        pendingId={pendingId}
      />

      <JobSection
        title="Pickups"
        emptyText="No pickups due."
        jobs={pickups}
        actionLabel="Mark Picked Up"
        onComplete={(id) => complete(id, "picked_up")}
        pendingId={pendingId}
      />
    </div>
  );
}

function JobSection({
  title,
  emptyText,
  jobs,
  actionLabel,
  onComplete,
  pendingId,
}: {
  title: string;
  emptyText: string;
  jobs: DriverJob[];
  actionLabel: string;
  onComplete: (orderId: string) => void;
  pendingId: string | null;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {jobs.map((job) => (
            <li
              key={job.orderId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--color-text)]">
                    {job.date}
                    {job.window ? ` -- ${job.window}` : ""}
                  </p>
                  <p className="text-sm text-[var(--color-text)]">{job.customerName}</p>
                  <a
                    href={`sms:${job.customerPhone}`}
                    className="text-sm text-[var(--color-primary)] hover:underline"
                  >
                    {job.customerPhone}
                  </a>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{job.address}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{job.packageSummary}</p>
                  {job.instructions && (
                    <p className="mt-1 text-sm italic text-[var(--color-muted)]">
                      {job.instructions}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--color-muted)]">Order {job.orderNumber}</p>
                </div>
                <button
                  type="button"
                  disabled={pendingId === job.orderId}
                  onClick={() => onComplete(job.orderId)}
                  className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pendingId === job.orderId ? "Saving…" : actionLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
