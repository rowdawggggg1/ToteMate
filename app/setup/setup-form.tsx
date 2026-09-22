"use client";

import { useActionState } from "react";
import { completeSetupAction, type SetupActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: SetupActionState = {};

export function SetupForm() {
  const [state, formAction] = useActionState(completeSetupAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          Welcome to ToteMate
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Let&apos;s set up your business system.
        </p>
      </div>

      <Field label="Your name" htmlFor="name" error={errors.name}>
        <input id="name" name="name" autoComplete="name" className={inputClass} />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={errors.password}
        hint="At least 8 characters."
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        error={errors.confirmPassword}
      >
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Setting up…">Create ToteMate Admin</SubmitButton>
    </form>
  );
}
