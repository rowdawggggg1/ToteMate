"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { DriverActionState } from "./actions";

export type DriverFormValues = {
  name: string;
  email: string;
  isActive: boolean;
};

const emptyValues: DriverFormValues = { name: "", email: "", isActive: true };
const initialState: DriverActionState = {};

export function DriverForm({
  initialValues,
  action,
  submitLabel,
  isEdit,
}: {
  initialValues?: DriverFormValues;
  action: (state: DriverActionState, formData: FormData) => Promise<DriverActionState>;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-md space-y-6">
      <Field label="Name" htmlFor="name" error={errors.name}>
        <input id="name" name="name" defaultValue={values.name} className={inputClass} />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={values.email}
          className={inputClass}
        />
      </Field>

      {isEdit ? (
        <>
          <label htmlFor="isActive" className="flex items-start gap-3">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              defaultChecked={values.isActive}
              className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]/30"
            />
            <span className="text-sm font-medium text-[var(--color-text)]">
              Active (can log in to the driver portal)
            </span>
          </label>

          <Field
            label="Reset password"
            htmlFor="newPassword"
            hint="Leave blank to keep their current password."
            error={errors.newPassword}
          >
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </>
      ) : (
        <Field label="Password" htmlFor="password" error={errors.password}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
