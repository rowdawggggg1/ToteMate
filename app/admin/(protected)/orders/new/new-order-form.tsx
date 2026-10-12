"use client";

import { useActionState, useState } from "react";
import { createCustomOrderAction, type CreateCustomOrderActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type PackageOption = {
  id: string;
  name: string;
  priceCents: number;
  toteQuantity: number;
  rentalDurationWeeks: number;
  hasWeeklyExtension: boolean;
};

const initialState: CreateCustomOrderActionState = { ok: true };

export function NewOrderForm({ packages }: { packages: PackageOption[] }) {
  const [state, formAction] = useActionState(createCustomOrderAction, initialState);
  const [pickupSameAsDelivery, setPickupSameAsDelivery] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"mark_paid" | "charge_stripe">("mark_paid");
  const selectedPackageId = packages[0]?.id ?? "";
  const [packageId, setPackageId] = useState(selectedPackageId);
  const selectedPackage = packages.find((p) => p.id === packageId);

  if (state.ok && state.createdOrderNumber) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Order {state.createdOrderNumber} created
        </h2>
        {state.checkoutUrl ? (
          <>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Send this payment link to the customer. The order shows as &quot;payment pending&quot;
              until they pay.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={state.checkoutUrl}
                onFocus={(e) => e.currentTarget.select()}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(state.checkoutUrl ?? "")}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
              >
                Copy link
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            This order is marked as paid.
          </p>
        )}
        <a
          href={`/admin/orders/${state.createdOrderId}`}
          className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          View order →
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Customer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="customerName" error={state.fieldErrors?.customerName}>
            <input id="customerName" name="customerName" required className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="customerEmail" error={state.fieldErrors?.customerEmail}>
            <input id="customerEmail" name="customerEmail" type="email" required className={inputClass} />
          </Field>
          <Field label="Phone" htmlFor="customerPhone" error={state.fieldErrors?.customerPhone}>
            <input id="customerPhone" name="customerPhone" required className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Package &amp; dates</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Package" htmlFor="packageId" error={state.fieldErrors?.packageId}>
            <select
              id="packageId"
              name="packageId"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              className={inputClass}
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} -- {p.toteQuantity} totes, {p.rentalDurationWeeks} wk(s)
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Extra weeks (optional)"
            htmlFor="extensionWeeks"
            hint={selectedPackage && !selectedPackage.hasWeeklyExtension ? "This package has no weekly extension." : undefined}
          >
            <input
              id="extensionWeeks"
              name="extensionWeeks"
              type="number"
              min="0"
              step="1"
              defaultValue="0"
              disabled={selectedPackage ? !selectedPackage.hasWeeklyExtension : false}
              className={inputClass}
            />
          </Field>
          <Field
            label="Delivery date"
            htmlFor="requestedDeliveryDate"
            error={state.fieldErrors?.requestedDeliveryDate}
            hint="No minimum lead time applies here -- blocked dates, daily capacity, and tote inventory are still checked."
          >
            <input id="requestedDeliveryDate" name="requestedDeliveryDate" type="date" required className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Delivery address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Street" htmlFor="deliveryStreet" error={state.fieldErrors?.deliveryStreet}>
            <input id="deliveryStreet" name="deliveryStreet" required className={inputClass} />
          </Field>
          <Field label="City" htmlFor="deliveryCity" error={state.fieldErrors?.deliveryCity}>
            <input id="deliveryCity" name="deliveryCity" required className={inputClass} />
          </Field>
          <Field label="Province/region" htmlFor="deliveryProvince" error={state.fieldErrors?.deliveryProvince}>
            <input id="deliveryProvince" name="deliveryProvince" required className={inputClass} />
          </Field>
          <Field label="Postal/ZIP code" htmlFor="deliveryPostalCode" error={state.fieldErrors?.deliveryPostalCode}>
            <input id="deliveryPostalCode" name="deliveryPostalCode" required className={inputClass} />
          </Field>
          <Field label="Country" htmlFor="deliveryCountry" error={state.fieldErrors?.deliveryCountry}>
            <input id="deliveryCountry" name="deliveryCountry" defaultValue="Canada" required className={inputClass} />
          </Field>
          <Field label="Delivery instructions (optional)" htmlFor="deliveryInstructions">
            <input id="deliveryInstructions" name="deliveryInstructions" className={inputClass} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            name="pickupSameAsDelivery"
            checked={pickupSameAsDelivery}
            onChange={(e) => setPickupSameAsDelivery(e.target.checked)}
          />
          Pickup address is the same as delivery
        </label>

        {!pickupSameAsDelivery && (
          <div className="grid gap-4 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2">
            <Field label="Pickup street" htmlFor="pickupStreet">
              <input id="pickupStreet" name="pickupStreet" className={inputClass} />
            </Field>
            <Field label="Pickup city" htmlFor="pickupCity">
              <input id="pickupCity" name="pickupCity" className={inputClass} />
            </Field>
            <Field label="Pickup province/region" htmlFor="pickupProvince">
              <input id="pickupProvince" name="pickupProvince" className={inputClass} />
            </Field>
            <Field label="Pickup postal/ZIP code" htmlFor="pickupPostalCode">
              <input id="pickupPostalCode" name="pickupPostalCode" className={inputClass} />
            </Field>
            <Field label="Pickup country" htmlFor="pickupCountry">
              <input id="pickupCountry" name="pickupCountry" defaultValue="Canada" className={inputClass} />
            </Field>
            <Field label="Pickup instructions (optional)" htmlFor="pickupInstructions">
              <input id="pickupInstructions" name="pickupInstructions" className={inputClass} />
            </Field>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Pricing</h2>
        <p className="text-xs text-[var(--color-muted)]">
          No automatic distance pricing for a custom order -- enter the delivery/pickup fee directly.
          Package price: {selectedPackage ? `$${(selectedPackage.priceCents / 100).toFixed(2)}` : "--"}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery fee ($)" htmlFor="deliveryFee">
            <input id="deliveryFee" name="deliveryFee" type="number" step="0.01" min="0" defaultValue="0" className={inputClass} />
          </Field>
          <Field label="Pickup fee ($)" htmlFor="pickupFee">
            <input id="pickupFee" name="pickupFee" type="number" step="0.01" min="0" defaultValue="0" className={inputClass} />
          </Field>
          <Field label="Manual total override ($, optional)" htmlFor="priceOverride" hint="Leave blank to use package + extension + fees.">
            <input id="priceOverride" name="priceOverride" type="number" step="0.01" min="0" className={inputClass} />
          </Field>
          <Field label="Override reason (optional)" htmlFor="priceOverrideReason">
            <input id="priceOverrideReason" name="priceOverrideReason" className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Payment</h2>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="paymentMethod"
              value="mark_paid"
              checked={paymentMethod === "mark_paid"}
              onChange={() => setPaymentMethod("mark_paid")}
            />
            Mark as paid now (collected outside the app -- cash, e-transfer, etc.)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="paymentMethod"
              value="charge_stripe"
              checked={paymentMethod === "charge_stripe"}
              onChange={() => setPaymentMethod("charge_stripe")}
            />
            Send a Stripe payment link
          </label>
        </div>
        <Field label="Internal notes (optional, not visible to the customer)" htmlFor="internalNotes">
          <textarea id="internalNotes" name="internalNotes" rows={2} className={inputClass} />
        </Field>
      </section>

      {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}
      <SubmitButton>Create Order</SubmitButton>
    </form>
  );
}
