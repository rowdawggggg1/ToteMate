"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  assignToteAction,
  markCompletedAction,
  markDeliveredAction,
  markPickedUpAction,
  unassignToteAction,
} from "./actions";

export type AssignmentView = { id: string; toteId: string; toteNumber: string };

export function OrderDetailClient({
  orderId,
  status,
  packageToteQuantity,
  assignments,
  readyTotes,
}: {
  orderId: string;
  status: string;
  packageToteQuantity: number;
  assignments: AssignmentView[];
  readyTotes: { id: string; number: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToteId, setSelectedToteId] = useState(readyTotes[0]?.id ?? "");

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {status === "scheduled" && (
          <ActionButton pending={pending} onClick={() => run(() => markDeliveredAction(orderId))}>
            Mark Delivered
          </ActionButton>
        )}
        {status === "delivered" && (
          <ActionButton pending={pending} onClick={() => run(() => markPickedUpAction(orderId))}>
            Mark Picked Up
          </ActionButton>
        )}
        {status === "picked_up" && (
          <ActionButton pending={pending} onClick={() => run(() => markCompletedAction(orderId))}>
            Mark Completed
          </ActionButton>
        )}
      </div>

      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

      <div>
        <h3 className="font-medium text-[var(--color-text)]">
          Assigned totes ({assignments.length}/{packageToteQuantity})
        </h3>
        {assignments.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">No totes assigned yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span>Tote {a.toteNumber}</span>
                {(status === "scheduled" || status === "delivered") && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => unassignToteAction(a.id))}
                    className="text-xs font-medium text-[var(--color-error)] hover:underline"
                  >
                    Unassign
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {(status === "scheduled" || status === "delivered") &&
          assignments.length < packageToteQuantity && (
            <div className="mt-3 flex items-center gap-2">
              {readyTotes.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">No ready totes available.</p>
              ) : (
                <>
                  <select
                    value={selectedToteId}
                    onChange={(e) => setSelectedToteId(e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  >
                    {readyTotes.map((t) => (
                      <option key={t.id} value={t.id}>
                        Tote {t.number}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending || !selectedToteId}
                    onClick={() => run(() => assignToteAction(orderId, selectedToteId))}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Assign
                  </button>
                </>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  pending,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {children}
    </button>
  );
}
