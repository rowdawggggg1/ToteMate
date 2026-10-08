"use client";

import { useActionState } from "react";
import { realtorLoginAction, type RealtorLoginActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: RealtorLoginActionState = {};

export function RealtorLoginForm() {
  const [state, formAction] = useActionState(realtorLoginAction, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">ToteMate Realtor</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Sign in to see today's jobs.</p>
      </div>

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={inputClass}
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Signing in…">Sign In</SubmitButton>
    </form>
  );
}
