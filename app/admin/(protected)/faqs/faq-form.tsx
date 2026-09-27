"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FaqActionState } from "./actions";

export type FaqFormValues = {
  question: string;
  answer: string;
  displayOrder: number | string;
  isActive: boolean;
};

const emptyValues: FaqFormValues = {
  question: "",
  answer: "",
  displayOrder: 0,
  isActive: true,
};

const initialState: FaqActionState = {};

export function FaqForm({
  initialValues,
  action,
  submitLabel,
}: {
  initialValues?: FaqFormValues;
  action: (state: FaqActionState, formData: FormData) => Promise<FaqActionState>;
  submitLabel: string;
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <Field label="Question" htmlFor="question" error={errors.question}>
        <input
          id="question"
          name="question"
          defaultValue={values.question}
          className={inputClass}
        />
      </Field>

      <Field label="Answer" htmlFor="answer" error={errors.answer}>
        <textarea
          id="answer"
          name="answer"
          rows={4}
          defaultValue={values.answer}
          className={inputClass}
        />
      </Field>

      <Field label="Display order" htmlFor="displayOrder">
        <input
          id="displayOrder"
          name="displayOrder"
          type="number"
          min={0}
          defaultValue={values.displayOrder}
          className={inputClass}
        />
      </Field>

      <label htmlFor="isActive" className="flex items-start gap-3">
        <input
          id="isActive"
          name="isActive"
          type="checkbox"
          defaultChecked={values.isActive}
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]/30"
        />
        <span className="text-sm font-medium text-[var(--color-text)]">
          Active (visible on the public FAQ section)
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
