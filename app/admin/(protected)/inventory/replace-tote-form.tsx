"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { replaceToteAction, type ToteActionState } from "./actions";

const initialState: ToteActionState = {};

export function ReplaceToteForm({ toteId, number }: { toteId: string; number: string }) {
  const boundAction = replaceToteAction.bind(null, toteId);
  const [state, formAction] = useActionState(boundAction, initialState);

  return (
    <form
      action={formAction}
      className="max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="font-medium text-[var(--color-text)]">Replace this tote</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Creates a brand-new physical tote that takes over number {number}, and retires this
          one. Use this when a tote is damaged beyond use or lost for good -- its rental history
          stays attached to it rather than being lost.
        </p>
      </div>

      <Field label="Reason (optional)" htmlFor="reason">
        <input id="reason" name="reason" className={inputClass} placeholder="e.g. Torn beyond repair" />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <ConfirmSubmitButton
        confirmMessage={`Retire tote ${number} and create a replacement?`}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--color-error)] px-4 py-2.5 text-sm font-medium text-[var(--color-error)]"
      >
        Replace tote
      </ConfirmSubmitButton>
    </form>
  );
}
