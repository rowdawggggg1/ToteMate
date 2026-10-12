"use client";

import { useActionState, useState, useTransition } from "react";
import { addOrderExtensionAction, chargeOrderExtensionAction, type OrderActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { centsToDollarsString } from "@/lib/money";

export type ExtensionView = {
  id: string;
  weeks: number;
  amountCents: number;
  previousPickupDate: string;
  newPickupDate: string;
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

export function OrderExtensionsSection({
  orderId,
  extensions,
  hasCardOnFile,
  canExtend,
  weeklyExtensionPriceCents,
}: {
  orderId: string;
  extensions: ExtensionView[];
  hasCardOnFile: boolean;
  canExtend: boolean;
  weeklyExtensionPriceCents: number | null;
}) {
  const boundAdd = addOrderExtensionAction.bind(null, orderId);
  const [addState, addFormAction] = useActionState(boundAdd, initialAddState);
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function charge(extensionId: string) {
    setChargeError(null);
    setChargingId(extensionId);
    startTransition(async () => {
      const result = await chargeOrderExtensionAction(extensionId);
      setChargingId(null);
      if (!result.ok) {
        setChargeError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {extensions.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No extensions on this order.</p>
      ) : (
        <ul className="space-y-2">
          {extensions.map((ext) => (
            <li
              key={ext.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">
                  +{ext.weeks} week{ext.weeks === 1 ? "" : "s"} -- ${centsToDollarsString(ext.amountCents)}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  Pickup moved {ext.previousPickupDate} → {ext.newPickupDate}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {STATUS_LABELS[ext.status] ?? ext.status}
                  {ext.status === "charge_failed" && ext.chargeFailureMessage
                    ? `: ${ext.chargeFailureMessage}`
                    : ""}
                </p>
              </div>
              {ext.status !== "charged" && (
                <button
                  type="button"
                  disabled={!hasCardOnFile || (isPending && chargingId === ext.id)}
                  onClick={() => charge(ext.id)}
                  title={hasCardOnFile ? undefined : "No card on file for this order."}
                  className="shrink-0 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {isPending && chargingId === ext.id
                    ? "Charging…"
                    : ext.status === "charge_failed"
                      ? "Retry Charge"
                      : "Charge Card on File"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {chargeError && <p className="text-sm text-[var(--color-error)]">{chargeError}</p>}

      {!canExtend && (
        <p className="text-sm text-[var(--color-muted)]">
          This order can no longer be extended from its current status.
        </p>
      )}

      {canExtend && !weeklyExtensionPriceCents && (
        <p className="text-sm text-[var(--color-muted)]">
          This order&apos;s package doesn&apos;t offer a weekly extension, so it can&apos;t be extended this way.
        </p>
      )}

      {canExtend && weeklyExtensionPriceCents !== null && (
        <>
          {!hasCardOnFile && (
            <p className="text-xs text-[var(--color-muted)]">
              No card is on file for this order, so an extension here can only be recorded, not charged
              through the app.
            </p>
          )}
          <form
            key={extensions.length}
            action={addFormAction}
            className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-4"
          >
            <div className="w-32">
              <Field label="Extra weeks" htmlFor="weeks">
                <input id="weeks" name="weeks" type="number" step="1" min="1" className={inputClass} />
              </Field>
            </div>
            <p className="pb-2 text-xs text-[var(--color-muted)]">
              At ${centsToDollarsString(weeklyExtensionPriceCents)}/week, locked at booking.
            </p>
            <SubmitButton>Add Extension</SubmitButton>
          </form>
        </>
      )}
      {addState.error && <p className="text-sm text-[var(--color-error)]">{addState.error}</p>}
    </div>
  );
}
