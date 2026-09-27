"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PackageActionState } from "./actions";

export type PackageFormValues = {
  name: string;
  description: string;
  toteQuantity: number | string;
  price: string;
  rentalDurationWeeks: number | string;
  includesDolly: boolean;
  useCaseDescription: string;
  photoUrl: string;
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number | string;
};

const emptyValues: PackageFormValues = {
  name: "",
  description: "",
  toteQuantity: "",
  price: "",
  rentalDurationWeeks: 1,
  includesDolly: false,
  useCaseDescription: "",
  photoUrl: "",
  isActive: false,
  isFeatured: false,
  displayOrder: 0,
};

const initialState: PackageActionState = {};

export function PackageForm({
  initialValues,
  action,
  submitLabel,
}: {
  initialValues?: PackageFormValues;
  action: (
    state: PackageActionState,
    formData: FormData
  ) => Promise<PackageActionState>;
  submitLabel: string;
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <Field label="Name" htmlFor="name" error={errors.name}>
        <input
          id="name"
          name="name"
          defaultValue={values.name}
          className={inputClass}
        />
      </Field>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={values.description}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tote quantity" htmlFor="toteQuantity" error={errors.toteQuantity}>
          <input
            id="toteQuantity"
            name="toteQuantity"
            type="number"
            min={1}
            defaultValue={values.toteQuantity}
            className={inputClass}
          />
        </Field>
        <Field label="Price ($)" htmlFor="price" error={errors.price}>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min={0}
            defaultValue={values.price}
            className={inputClass}
          />
        </Field>
        <Field
          label="Rental duration (full weeks)"
          htmlFor="rentalDurationWeeks"
          error={errors.rentalDurationWeeks}
        >
          <input
            id="rentalDurationWeeks"
            name="rentalDurationWeeks"
            type="number"
            min={1}
            defaultValue={values.rentalDurationWeeks}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Use case description"
        htmlFor="useCaseDescription"
        hint='e.g. "Great for a smaller apartment move."'
      >
        <input
          id="useCaseDescription"
          name="useCaseDescription"
          defaultValue={values.useCaseDescription}
          className={inputClass}
        />
      </Field>

      <Field label="Photo URL" htmlFor="photoUrl" error={errors.photoUrl}>
        <input
          id="photoUrl"
          name="photoUrl"
          defaultValue={values.photoUrl}
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

      <div className="space-y-3">
        <Checkbox
          id="includesDolly"
          name="includesDolly"
          label="Includes a dolly"
          defaultChecked={values.includesDolly}
        />
        <Checkbox
          id="isActive"
          name="isActive"
          label="Active (visible and bookable on the public site)"
          defaultChecked={values.isActive}
        />
        <Checkbox
          id="isFeatured"
          name="isFeatured"
          label='Mark as "Most Popular"'
          hint="Only one package can be featured at a time -- marking this one will unmark any other."
          defaultChecked={values.isFeatured}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

function Checkbox({
  id,
  name,
  label,
  hint,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]/30"
      />
      <span>
        <span className="block text-sm font-medium text-[var(--color-text)]">
          {label}
        </span>
        {hint && <span className="block text-xs text-[var(--color-muted)]">{hint}</span>}
      </span>
    </label>
  );
}
