"use client";

import { useActionState, useState, useTransition } from "react";
import { addLateFeeAction, chargeLateFeeAction, type OrderActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { centsToDollarsString } from "@/lib/money";

export type LateFeeView = {
  id: string;
  amountCents: number;
  reason: string | null;
  status: string;
  chargeFailureMessage: string | null;
  createdAt: string;
};

const initialAddState: OrderActionState = { ok: true };

const STATUS_LABELS: Record<string, string> = {
  recorded: "Recorded -- not yet charged",
  charged: "Charged",
  charge_failed: "Charge failed -- still owed",
};

export function LateFeesSection({
  orderId,
  fees,
  hasCardOnFile,
}: {
  orderId: string;
  fees: LateFeeView[];
  hasCardOnFile: boolean;
}) {
  const boundAdd = addLateFeeAction.bind(null, orderId);
  const [addState, addFormAction] = useActionState(boundAdd, initialAddState);
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function charge(lateFeeId: string) {
    setChargeError(null);
    setChargingId(lateFeeId);
    startTransition(async () => {
      const result = await chargeLateFeeAction(lateFeeId);
      setChargingId(null);
      if (!result.ok) {
        setChargeError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {fees.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No late fees on this order.</p>
      ) : (
        <ul className="space-y-2">
          {fees.map((fee) => (
            <li
              key={fee.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">
                  ${centsToDollarsString(fee.amountCents)}
                  {fee.reason ? ` -- ${fee.reason}` : ""}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {STATUS_LABELS[fee.status] ?? fee.status}
                  {fee.status === "charge_failed" && fee.chargeFailureMessage
                    ? `: ${fee.chargeFailureMessage}`
                    : ""}
                </p>
              </div>
              {fee.status !== "charged" && (
                <button
                  type="button"
                  disabled={!hasCardOnFile || (isPending && chargingId === fee.id)}
                  onClick={() => charge(fee.id)}
                  title={hasCardOnFile ? undefined : "No card on file for this order."}
                  className="shrink-0 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {isPending && chargingId === fee.id
                    ? "Charging…"
                    : fee.status === "charge_failed"
                      ? "Retry Charge"
                      : "Charge Card on File"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {chargeError && <p className="text-sm text-[var(--color-error)]">{chargeError}</p>}

      {!hasCardOnFile && (
        <p className="text-xs text-[var(--color-muted)]">
          No card is on file for this order (e.g. it was booked before this feature existed), so
          any late fee here can only be recorded, not charged through the app.
        </p>
      )}

      <form
        key={fees.length}
        action={addFormAction}
        className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-4"
      >
        <div className="w-32">
          <Field label="Amount ($)" htmlFor="amount">
            <input id="amount" name="amount" type="number" step="0.01" min="0" className={inputClass} />
          </Field>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Field label="Reason (optional)" htmlFor="reason">
            <input id="reason" name="reason" className={inputClass} />
          </Field>
        </div>
        <SubmitButton>Add Late Fee</SubmitButton>
      </form>
      {addState.error && <p className="text-sm text-[var(--color-error)]">{addState.error}</p>}
    </div>
  );
}
