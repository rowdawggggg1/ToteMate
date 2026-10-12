"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { addOrderFeeAction, chargeOrderFeeAction, type OrderActionState } from "./actions";
import { FEE_TYPES } from "@/lib/order-fees";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { centsToDollarsString } from "@/lib/money";

export type OrderFeeView = {
  id: string;
  amountCents: number;
  reason: string | null;
  status: string;
  feeType: string;
  chargeFailureMessage: string | null;
  createdAt: string;
};

/** Settings-driven default amounts (in cents) to prefill the Amount field
 * once the admin picks a fee type -- purely a convenience, never enforced;
 * the admin can always type a different amount. Types with no configured
 * default (e.g. "other") leave the field blank. */
export type FeeDefaults = Partial<Record<(typeof FEE_TYPES)[number]["value"], number>>;

const initialAddState: OrderActionState = { ok: true };

const STATUS_LABELS: Record<string, string> = {
  recorded: "Recorded -- not yet charged",
  charged: "Charged",
  charge_failed: "Charge failed -- still owed",
};

function feeLabel(feeType: string): string {
  return FEE_TYPES.find((t) => t.value === feeType)?.label ?? feeType;
}

export function OrderFeesSection({
  orderId,
  fees,
  hasCardOnFile,
  feeDefaults,
}: {
  orderId: string;
  fees: OrderFeeView[];
  hasCardOnFile: boolean;
  feeDefaults: FeeDefaults;
}) {
  const boundAdd = addOrderFeeAction.bind(null, orderId);
  const [addState, addFormAction] = useActionState(boundAdd, initialAddState);
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedType, setSelectedType] = useState<string>(FEE_TYPES[0].value);

  const defaultAmount = useMemo(() => {
    const cents = feeDefaults[selectedType as keyof FeeDefaults];
    return cents ? centsToDollarsString(cents) : "";
  }, [feeDefaults, selectedType]);

  function charge(feeId: string) {
    setChargeError(null);
    setChargingId(feeId);
    startTransition(async () => {
      const result = await chargeOrderFeeAction(feeId);
      setChargingId(null);
      if (!result.ok) {
        setChargeError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {fees.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No fees on this order.</p>
      ) : (
        <ul className="space-y-2">
          {fees.map((fee) => (
            <li
              key={fee.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">
                  {feeLabel(fee.feeType)} -- ${centsToDollarsString(fee.amountCents)}
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
          any fee here can only be recorded, not charged through the app.
        </p>
      )}

      <form
        key={fees.length}
        action={addFormAction}
        className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-4"
      >
        <div className="w-44">
          <Field label="Fee type" htmlFor="feeType">
            <select
              id="feeType"
              name="feeType"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className={inputClass}
            >
              {FEE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-32">
          <Field label="Amount ($)" htmlFor="amount">
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultAmount}
              key={selectedType}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Field label="Reason (optional)" htmlFor="reason">
            <input id="reason" name="reason" className={inputClass} />
          </Field>
        </div>
        <SubmitButton>Add Fee</SubmitButton>
      </form>
      {addState.error && <p className="text-sm text-[var(--color-error)]">{addState.error}</p>}
    </div>
  );
}
