"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AgreementActionState } from "./actions";

export type AgreementFormValues = {
  versionLabel: string;
  content: string;
};

const emptyValues: AgreementFormValues = { versionLabel: "", content: "" };
const initialState: AgreementActionState = {};

export function AgreementForm({
  initialValues,
  action,
  submitLabel,
}: {
  initialValues?: AgreementFormValues;
  action: (state: AgreementActionState, formData: FormData) => Promise<AgreementActionState>;
  submitLabel: string;
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <Field
        label="Version label"
        htmlFor="versionLabel"
        error={state.fieldErrors?.versionLabel}
        hint="A short internal name, e.g. “2026 v1”."
      >
        <input
          id="versionLabel"
          name="versionLabel"
          defaultValue={values.versionLabel}
          className={inputClass}
        />
      </Field>

      <Field
        label="Agreement content"
        htmlFor="content"
        error={state.fieldErrors?.content}
        hint="Shown to the customer at checkout and signed with a drawn signature. Plain text or simple Markdown-style line breaks -- not legal advice; have a lawyer review before relying on it."
      >
        <textarea
          id="content"
          name="content"
          rows={18}
          defaultValue={values.content}
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
