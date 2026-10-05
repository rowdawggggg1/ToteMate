"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateToteAction, TOTE_STATUSES, type ToteActionState } from "./actions";

const STATUS_LABELS: Record<(typeof TOTE_STATUSES)[number], string> = {
  ready: "Ready",
  with_customer: "Delivered -- with customer",
  needs_cleaning: "Needs cleaning",
  damaged: "Damaged",
  lost: "Lost",
  retired: "Retired",
};

export type ToteFormValues = {
  status: (typeof TOTE_STATUSES)[number];
  notes: string;
};

const initialState: ToteActionState = {};

export function EditToteForm({
  toteId,
  initialValues,
}: {
  toteId: string;
  initialValues: ToteFormValues;
}) {
  const boundAction = updateToteAction.bind(null, toteId);
  const [state, formAction] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-6">
      <Field label="Status" htmlFor="status" error={state.fieldErrors?.status}>
        <select
          id="status"
          name="status"
          defaultValue={initialValues.status}
          className={inputClass}
        >
          {TOTE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initialValues.notes}
          className={inputClass}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
