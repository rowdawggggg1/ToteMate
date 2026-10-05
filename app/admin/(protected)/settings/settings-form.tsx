"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { updateSettingsAction, type SettingsActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type SettingsInitialValues = {
  businessName: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  currency: string;
  distanceUnit: string;
  timezone: string;
  serviceArea: string;
  logoUrl: string;
  heroImageUrl: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  minLeadTimeDays: number;
  deliveryFreeRadiusKm: string;
  pickupFreeRadiusKm: string;
  maxDeliveryRadiusKm: number | string;
  deliveryRatePerKm: string;
  pickupRatePerKm: string;
  readinessBufferDays: number;
  dailyCapacityEnabled: boolean;
  maxDeliveriesPerDay: number | string;
  maxPickupsPerDay: number | string;
  maxCombinedJobsPerDay: number | string;
  overbookingEnabled: boolean;
  cancellationFeeType: "fixed" | "percentage";
  cancellationFeeAmount: string;
  cancellationFeePercentage: string;
  cancellationWindowHours: number;
  lateFeePerToteDay: string;
  damagedToteFee: string;
  lostToteFee: string;
  bookingPaused: boolean;
};

const initialState: SettingsActionState = {};

export function SettingsForm({
  initialValues,
}: {
  initialValues: SettingsInitialValues;
}) {
  const [state, formAction] = useActionState(updateSettingsAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-10">
      <Section title="Business Information">
        <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
          <input
            id="businessName"
            name="businessName"
            defaultValue={initialValues.businessName}
            className={inputClass}
          />
        </Field>

        <Field label="Tagline" htmlFor="tagline">
          <input
            id="tagline"
            name="tagline"
            defaultValue={initialValues.tagline}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="contactEmail" error={errors.contactEmail}>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={initialValues.contactEmail}
              className={inputClass}
            />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone">
            <input
              id="contactPhone"
              name="contactPhone"
              defaultValue={initialValues.contactPhone}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Business address"
          htmlFor="businessAddress"
          hint="Used as the origin point for delivery and pickup routing in a later phase."
        >
          <input
            id="businessAddress"
            name="businessAddress"
            defaultValue={initialValues.businessAddress}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" htmlFor="currency">
            <input
              id="currency"
              name="currency"
              defaultValue={initialValues.currency}
              className={inputClass}
            />
          </Field>
          <Field label="Distance unit" htmlFor="distanceUnit">
            <select
              id="distanceUnit"
              name="distanceUnit"
              defaultValue={initialValues.distanceUnit}
              className={inputClass}
            >
              <option value="km">Kilometers</option>
              <option value="mi">Miles</option>
            </select>
          </Field>
        </div>

        <Field
          label="Timezone"
          htmlFor="timezone"
          hint="IANA timezone identifier, e.g. America/Edmonton."
        >
          <input
            id="timezone"
            name="timezone"
            defaultValue={initialValues.timezone}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Branding & Photos">
        <Field
          label="Logo URL"
          htmlFor="logoUrl"
          error={errors.logoUrl}
          hint="Shown in the site header. Paste a link to an image you've uploaded somewhere (e.g. an image host or your own file storage) -- there's no file upload here yet."
        >
          <input
            id="logoUrl"
            name="logoUrl"
            defaultValue={initialValues.logoUrl}
            className={inputClass}
          />
        </Field>

        <Field
          label="Hero image URL"
          htmlFor="heroImageUrl"
          error={errors.heroImageUrl}
          hint="Shown large on the homepage. Leave blank to use the default illustration."
        >
          <input
            id="heroImageUrl"
            name="heroImageUrl"
            defaultValue={initialValues.heroImageUrl}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField
            label="Primary color"
            id="primaryColor"
            defaultValue={initialValues.primaryColor}
            error={errors.primaryColor}
          />
          <ColorField
            label="Accent color"
            id="accentColor"
            defaultValue={initialValues.accentColor}
            error={errors.accentColor}
          />
          <ColorField
            label="Background color"
            id="backgroundColor"
            defaultValue={initialValues.backgroundColor}
            error={errors.backgroundColor}
          />
        </div>
      </Section>

      <Section title="Service Area">
        <Field
          label="Service area description"
          htmlFor="serviceArea"
          hint='Shown to customers on the public site, e.g. "Central Alberta." The actual address eligibility check will be enforced separately once booking is built.'
        >
          <textarea
            id="serviceArea"
            name="serviceArea"
            rows={2}
            defaultValue={initialValues.serviceArea}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Scheduling">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum lead time (days)" htmlFor="minLeadTimeDays">
            <input
              id="minLeadTimeDays"
              name="minLeadTimeDays"
              type="number"
              min={0}
              defaultValue={initialValues.minLeadTimeDays}
              className={inputClass}
            />
          </Field>
          <Field
            label="Post-pickup readiness buffer (days)"
            htmlFor="readinessBufferDays"
            hint="Days after pickup before a tote can be rented again."
          >
            <input
              id="readinessBufferDays"
              name="readinessBufferDays"
              type="number"
              min={0}
              defaultValue={initialValues.readinessBufferDays}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Delivery & Pickup Pricing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery free radius (km)" htmlFor="deliveryFreeRadiusKm">
            <input
              id="deliveryFreeRadiusKm"
              name="deliveryFreeRadiusKm"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.deliveryFreeRadiusKm}
              className={inputClass}
            />
          </Field>
          <Field label="Pickup free radius (km)" htmlFor="pickupFreeRadiusKm">
            <input
              id="pickupFreeRadiusKm"
              name="pickupFreeRadiusKm"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.pickupFreeRadiusKm}
              className={inputClass}
            />
          </Field>
          <Field
            label="Delivery rate ($/km, round trip billed)"
            htmlFor="deliveryRatePerKm"
          >
            <input
              id="deliveryRatePerKm"
              name="deliveryRatePerKm"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.deliveryRatePerKm}
              className={inputClass}
            />
          </Field>
          <Field label="Pickup rate ($/km, round trip billed)" htmlFor="pickupRatePerKm">
            <input
              id="pickupRatePerKm"
              name="pickupRatePerKm"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.pickupRatePerKm}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Maximum delivery radius (km)"
          htmlFor="maxDeliveryRadiusKm"
          error={errors.maxDeliveryRadiusKm}
          hint="A hard cutoff, separate from the free radius above. Addresses farther than this will be rejected at booking instead of just priced higher. Leave blank for no limit."
        >
          <input
            id="maxDeliveryRadiusKm"
            name="maxDeliveryRadiusKm"
            type="number"
            step="0.01"
            min={0}
            defaultValue={initialValues.maxDeliveryRadiusKm}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Capacity & Inventory">
        <Checkbox
          id="dailyCapacityEnabled"
          name="dailyCapacityEnabled"
          label="Enable daily capacity limits"
          defaultChecked={initialValues.dailyCapacityEnabled}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Max deliveries / day" htmlFor="maxDeliveriesPerDay">
            <input
              id="maxDeliveriesPerDay"
              name="maxDeliveriesPerDay"
              type="number"
              min={0}
              defaultValue={initialValues.maxDeliveriesPerDay}
              className={inputClass}
            />
          </Field>
          <Field label="Max pickups / day" htmlFor="maxPickupsPerDay">
            <input
              id="maxPickupsPerDay"
              name="maxPickupsPerDay"
              type="number"
              min={0}
              defaultValue={initialValues.maxPickupsPerDay}
              className={inputClass}
            />
          </Field>
          <Field label="Max combined jobs / day" htmlFor="maxCombinedJobsPerDay">
            <input
              id="maxCombinedJobsPerDay"
              name="maxCombinedJobsPerDay"
              type="number"
              min={0}
              defaultValue={initialValues.maxCombinedJobsPerDay}
              className={inputClass}
            />
          </Field>
        </div>
        <Checkbox
          id="overbookingEnabled"
          name="overbookingEnabled"
          label="Allow overbooking beyond current physical tote inventory"
          defaultChecked={initialValues.overbookingEnabled}
        />
      </Section>

      <Section title="Cancellation & Fees">
        <Field label="Cancellation fee type" htmlFor="cancellationFeeType">
          <select
            id="cancellationFeeType"
            name="cancellationFeeType"
            defaultValue={initialValues.cancellationFeeType}
            className={inputClass}
          >
            <option value="fixed">Fixed dollar amount</option>
            <option value="percentage">Percentage of order</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cancellation fee ($, if fixed)" htmlFor="cancellationFeeAmount">
            <input
              id="cancellationFeeAmount"
              name="cancellationFeeAmount"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.cancellationFeeAmount}
              className={inputClass}
            />
          </Field>
          <Field
            label="Cancellation fee (%, if percentage)"
            htmlFor="cancellationFeePercentage"
          >
            <input
              id="cancellationFeePercentage"
              name="cancellationFeePercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={initialValues.cancellationFeePercentage}
              className={inputClass}
            />
          </Field>
        </div>
        <Field
          label="Refund cutoff (hours before scheduled delivery)"
          htmlFor="cancellationWindowHours"
          hint="Cancelling inside this window means no refund at all, regardless of the fee settings above."
        >
          <input
            id="cancellationWindowHours"
            name="cancellationWindowHours"
            type="number"
            min={0}
            defaultValue={initialValues.cancellationWindowHours}
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-[var(--color-muted)]">
          Example: with the default of 24, cancelling more than 24 hours before delivery
          follows the fee settings above; cancelling within 24 hours gets no refund.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Late fee ($ per tote / day)" htmlFor="lateFeePerToteDay">
            <input
              id="lateFeePerToteDay"
              name="lateFeePerToteDay"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.lateFeePerToteDay}
              className={inputClass}
            />
          </Field>
          <Field label="Damaged tote fee ($)" htmlFor="damagedToteFee">
            <input
              id="damagedToteFee"
              name="damagedToteFee"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.damagedToteFee}
              className={inputClass}
            />
          </Field>
          <Field label="Lost tote fee ($)" htmlFor="lostToteFee">
            <input
              id="lostToteFee"
              name="lostToteFee"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initialValues.lostToteFee}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Booking Status">
        <Checkbox
          id="bookingPaused"
          name="bookingPaused"
          label="Pause new online bookings"
          defaultChecked={initialValues.bookingPaused}
          hint="Existing bookings are unaffected. Customers will see booking as temporarily unavailable."
        />
      </Section>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          Settings saved.
        </p>
      )}

      <SubmitButton>Save Settings</SubmitButton>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function ColorField({
  label,
  id,
  defaultValue,
  error,
}: {
  label: string;
  id: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          defaultValue={defaultValue}
          onChange={(e) => {
            const text = document.getElementById(id) as HTMLInputElement | null;
            if (text) text.value = e.target.value;
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-transparent p-1"
          aria-label={`${label} picker`}
        />
        <input
          id={id}
          name={id}
          defaultValue={defaultValue}
          className={inputClass}
        />
      </div>
    </Field>
  );
}

function Checkbox({
  id,
  name,
  label,
  defaultChecked,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
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
        {hint && (
          <span className="block text-xs text-[var(--color-muted)]">{hint}</span>
        )}
      </span>
    </label>
  );
}
