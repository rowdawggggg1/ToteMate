"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createBlockedDateAction, type BlockedDateActionState } from "./actions";

const initialState: BlockedDateActionState = {};

export function AddBlockedDateForm() {
  const [state, formAction] = useActionState(createBlockedDateAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-end"
    >
      <div className="sm:w-48">
        <Field label="Date" htmlFor="date" error={state.fieldErrors?.date}>
          <input id="date" name="date" type="date" className={inputClass} required />
        </Field>
      </div>
      <div className="flex-1">
        <Field label="Reason (optional)" htmlFor="reason">
          <input
            id="reason"
            name="reason"
            placeholder="e.g. Statutory holiday, owner out of town"
            className={inputClass}
          />
        </Field>
      </div>
      <div>
        <SubmitButton pendingText="Adding…">Block date</SubmitButton>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)] sm:ml-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
