"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { TierActionState } from "./actions";

export type TierFormValues = {
  name: string;
  description: string;
  cadenceInterval: "month" | "year";
  giftCardValue: string;
  price: string;
  isActive: boolean;
};

const emptyValues: TierFormValues = {
  name: "",
  description: "",
  cadenceInterval: "month",
  giftCardValue: "",
  price: "",
  isActive: false,
};
const initialState: TierActionState = {};

export function TierForm({
  initialValues,
  action,
  submitLabel,
}: {
  initialValues?: TierFormValues;
  action: (state: TierActionState, formData: FormData) => Promise<TierActionState>;
  submitLabel: string;
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-md space-y-6">
      <Field label="Tier name" htmlFor="name" error={errors.name}>
        <input id="name" name="name" defaultValue={values.name} className={inputClass} />
      </Field>

      <Field label="Description (optional)" htmlFor="description">
        <textarea id="description" name="description" defaultValue={values.description} rows={2} className={inputClass} />
      </Field>

      <Field label="Billing cadence" htmlFor="cadenceInterval">
        <select id="cadenceInterval" name="cadenceInterval" defaultValue={values.cadenceInterval} className={inputClass}>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
      </Field>

      <Field
        label="Gift card value delivered each cycle ($)"
        htmlFor="giftCardValue"
        error={errors.giftCardValue}
        hint="The face value of the gift card the realtor receives each billing cycle."
      >
        <input
          id="giftCardValue"
          name="giftCardValue"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={values.giftCardValue}
          className={inputClass}
        />
      </Field>

      <Field
        label="Discounted price charged ($)"
        htmlFor="price"
        error={errors.price}
        hint="What the realtor is actually billed each cycle for that gift card."
      >
        <input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={values.price}
          className={inputClass}
        />
      </Field>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={values.isActive}
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]/30"
        />
        <span className="text-sm font-medium text-[var(--color-text)]">
          Active (realtors can subscribe to this tier)
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Saving (syncs with Stripe)…">{submitLabel}</SubmitButton>
    </form>
  );
}
