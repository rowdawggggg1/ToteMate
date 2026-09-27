"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AddOnActionState } from "./actions";

export type AddOnFormValues = {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  isActive: boolean;
  displayOrder: number | string;
  packageId: string;
  isWeeklyExtension: boolean;
};

const emptyValues: AddOnFormValues = {
  name: "",
  description: "",
  price: "",
  imageUrl: "",
  isActive: false,
  displayOrder: 0,
  packageId: "",
  isWeeklyExtension: false,
};

const initialState: AddOnActionState = {};

export function AddOnForm({
  initialValues,
  action,
  submitLabel,
  packageOptions,
}: {
  initialValues?: AddOnFormValues;
  action: (
    state: AddOnActionState,
    formData: FormData
  ) => Promise<AddOnActionState>;
  submitLabel: string;
  packageOptions: { id: string; name: string }[];
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <Field label="Name" htmlFor="name" error={errors.name}>
        <input id="name" name="name" defaultValue={values.name} className={inputClass} />
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

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <Field label="Image URL" htmlFor="imageUrl">
        <input id="imageUrl" name="imageUrl" defaultValue={values.imageUrl} className={inputClass} />
      </Field>

      <Field
        label="Available with"
        htmlFor="packageId"
        error={errors.packageId}
        hint="Leave as General to offer this add-on with every package."
      >
        <select
          id="packageId"
          name="packageId"
          defaultValue={values.packageId}
          className={inputClass}
        >
          <option value="">General (all packages)</option>
          {packageOptions.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="space-y-3">
        <Checkbox
          id="isActive"
          name="isActive"
          label="Active (selectable during checkout)"
          defaultChecked={values.isActive}
        />
        <Checkbox
          id="isWeeklyExtension"
          name="isWeeklyExtension"
          label="This is the weekly extension for the selected package"
          hint="Requires a specific package above (not General). Only one add-on per package can be its weekly extension."
          defaultChecked={values.isWeeklyExtension}
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
