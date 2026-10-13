"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { resetTestingDataAction, type ResetTestingDataState } from "./actions";
import { inputClass } from "@/components/ui/field";

const initialState: ResetTestingDataState = { ok: true };
const CONFIRMATION_PHRASE = "DELETE ALL ORDERS";

function ConfirmResetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-[var(--color-error)] px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
    >
      {pending ? "Resetting…" : "Permanently Delete All Orders & Reset"}
    </button>
  );
}

export function ResetTestingDataSection({ nextOrderNumber }: { nextOrderNumber: number }) {
  const [state, formAction] = useActionState(resetTestingDataAction, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-10 rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Reset Testing Data</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Once you&apos;re done test-booking and ready to go live, use this to permanently delete
        every order (and everything tied to it -- fees, extensions, reviews, referral/gift-card
        redemptions) and reset order numbering back to 1. Totes currently marked &quot;with
        customer&quot; or &quot;needs cleaning&quot; are set back to &quot;ready&quot;.
        Gift card balances and referral usage are not rolled back automatically, so double-check
        those pages too if you used test codes/cards. Next order right now would be{" "}
        <strong>TM-{nextOrderNumber}</strong>.
      </p>
      <p className="mt-2 text-sm font-medium text-[var(--color-error)]">
        This cannot be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)]"
        >
          Reset Testing Data…
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <label htmlFor="confirmation" className="block text-sm text-[var(--color-text)]">
            Type <strong>{CONFIRMATION_PHRASE}</strong> to confirm
          </label>
          <input
            id="confirmation"
            name="confirmation"
            autoComplete="off"
            className={inputClass}
            placeholder={CONFIRMATION_PHRASE}
          />
          <div className="flex items-center gap-3">
            <ConfirmResetButton />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-[var(--color-muted)] hover:underline"
            >
              Never mind
            </button>
          </div>
          {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}
          {state !== initialState && state.ok && !state.error && (
            <p className="text-sm text-[var(--color-success)]">
              Done -- all test orders deleted and numbering reset.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
