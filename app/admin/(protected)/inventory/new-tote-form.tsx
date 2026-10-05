"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createToteAction, type ToteActionState } from "./actions";

const initialState: ToteActionState = {};

export function NewToteForm() {
  const [state, formAction] = useActionState(createToteAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-6">
      <Field
        label="Tote number"
        htmlFor="number"
        error={state.fieldErrors?.number}
        hint="The number customers and staff will see (e.g. 12). New totes always start as Ready."
      >
        <input id="number" name="number" className={inputClass} />
      </Field>

      <Field label="Notes (optional)" htmlFor="notes">
        <textarea id="notes" name="notes" rows={3} className={inputClass} />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton>Add tote</SubmitButton>
    </form>
  );
}
