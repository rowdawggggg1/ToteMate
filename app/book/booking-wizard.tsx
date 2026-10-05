"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { centsToDollarsString } from "@/lib/money";
import { SignaturePad, type SignaturePadHandle } from "@/components/public/signature-pad";
import { submitBookingAction, sendBookingConfirmationEmailAction } from "./actions";
import type { CreateBookingResult } from "@/lib/orders";

export type PackageOption = {
  id: string;
  name: string;
  description: string | null;
  toteQuantity: number;
  priceCents: number;
  rentalDurationWeeks: number;
  includesDolly: boolean;
  photoUrl: string | null;
};

export type AddOnOption = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  packageId: string | null;
  isWeeklyExtension: boolean;
};

export type AgreementInfo = {
  id: string;
  versionLabel: string;
  content: string;
};

type AddressForm = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

const emptyAddress: AddressForm = { street: "", city: "", province: "", postalCode: "", country: "Canada" };

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addWeeksClientSide(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function BookingWizard({
  currency,
  minLeadTimeDays,
  preselectedPackageId,
  packages,
  addOns,
  agreement,
  stripePublishableKey,
}: {
  businessName: string;
  currency: string;
  minLeadTimeDays: number;
  preselectedPackageId: string | null;
  packages: PackageOption[];
  addOns: AddOnOption[];
  agreement: AgreementInfo;
  stripePublishableKey: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    preselectedPackageId && packages.some((p) => p.id === preselectedPackageId)
      ? preselectedPackageId
      : packages[0]?.id ?? null
  );
  const [addOnQuantities, setAddOnQuantities] = useState<Record<string, number>>({});
  const [extensionWeeks, setExtensionWeeks] = useState(0);

  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(todayPlusDays(minLeadTimeDays));
  const [preferredDeliveryWindow, setPreferredDeliveryWindow] = useState("");
  const [preferredPickupWindow, setPreferredPickupWindow] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [deliveryAddress, setDeliveryAddress] = useState<AddressForm>(emptyAddress);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [pickupSameAsDelivery, setPickupSameAsDelivery] = useState(true);
  const [pickupAddress, setPickupAddress] = useState<AddressForm>(emptyAddress);
  const [pickupInstructions, setPickupInstructions] = useState("");

  const [agreementChecked, setAgreementChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booking, setBooking] = useState<
    Extract<CreateBookingResult, { ok: true }> | null
  >(null);

  const signaturePadRef = useRef<SignaturePadHandle>(null);

  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null;
  const generalAddOns = addOns.filter((a) => a.packageId === null && !a.isWeeklyExtension);
  const packageAddOns = addOns.filter(
    (a) => a.packageId === selectedPackageId && !a.isWeeklyExtension
  );
  const weeklyExtension = addOns.find(
    (a) => a.packageId === selectedPackageId && a.isWeeklyExtension
  );

  const confirmedPickupDate = selectedPackage
    ? addWeeksClientSide(
        requestedDeliveryDate,
        selectedPackage.rentalDurationWeeks + extensionWeeks
      )
    : null;

  const stripePromise = useMemo(
    () => (stripePublishableKey ? loadStripe(stripePublishableKey) : null),
    [stripePublishableKey]
  );

  function setAddOnQuantity(addOnId: string, quantity: number) {
    setAddOnQuantities((prev) => ({ ...prev, [addOnId]: Math.max(0, quantity) }));
  }

  async function handleReviewSubmit() {
    if (!selectedPackage) return;
    const signatureDataUrl = signaturePadRef.current?.getDataUrl() ?? null;
    if (!agreementChecked || !signatureDataUrl) {
      setSubmitError("Please sign and agree to the rental agreement to continue.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const addOnSelections = Object.entries(addOnQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([addOnId, quantity]) => ({ addOnId, quantity }));

    const result = await submitBookingAction({
      packageId: selectedPackage.id,
      addOnSelections,
      extensionWeeks,
      customerName,
      customerEmail,
      customerPhone,
      requestedDeliveryDate,
      preferredDeliveryWindow: preferredDeliveryWindow || undefined,
      preferredPickupWindow: preferredPickupWindow || undefined,
      deliveryAddress,
      deliveryInstructions: deliveryInstructions || undefined,
      pickupSameAsDelivery,
      pickupAddress: pickupSameAsDelivery ? undefined : pickupAddress,
      pickupInstructions: pickupSameAsDelivery ? undefined : pickupInstructions || undefined,
      agreementVersionId: agreement.id,
      agreementSignatureDataUrl: signatureDataUrl,
    });

    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setBooking(result);
    setStep(4);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <StepIndicator step={step} />

      {step === 1 && selectedPackage && (
        <div className="mt-8 space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Choose a package</h2>
            <div className="mt-4 space-y-3">
              {packages.map((pkg) => (
                <label
                  key={pkg.id}
                  className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 ${
                    selectedPackageId === pkg.id
                      ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="package"
                    checked={selectedPackageId === pkg.id}
                    onChange={() => {
                      setSelectedPackageId(pkg.id);
                      setAddOnQuantities({});
                      setExtensionWeeks(0);
                    }}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-[var(--color-text)]">{pkg.name}</span>
                      <span className="shrink-0 font-medium text-[var(--color-text)]">
                        ${centsToDollarsString(pkg.priceCents)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {pkg.toteQuantity} totes · {pkg.rentalDurationWeeks}{" "}
                      {pkg.rentalDurationWeeks === 1 ? "week" : "weeks"}
                      {pkg.includesDolly ? " · includes dolly" : ""}
                    </p>
                    {pkg.description && (
                      <p className="mt-1 text-sm text-[var(--color-muted)]">{pkg.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {weeklyExtension && (
            <div>
              <h3 className="font-medium text-[var(--color-text)]">Extend your rental</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Add extra full weeks at ${centsToDollarsString(weeklyExtension.priceCents)}/week.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <Stepper
                  value={extensionWeeks}
                  onChange={setExtensionWeeks}
                  min={0}
                  label="extension weeks"
                />
              </div>
            </div>
          )}

          {(generalAddOns.length > 0 || packageAddOns.length > 0) && (
            <div>
              <h3 className="font-medium text-[var(--color-text)]">Add-ons</h3>
              <ul className="mt-2 space-y-3">
                {[...packageAddOns, ...generalAddOns].map((addOn) => (
                  <li
                    key={addOn.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--color-text)]">{addOn.name}</p>
                      <p className="text-sm text-[var(--color-muted)]">
                        ${centsToDollarsString(addOn.priceCents)} each
                      </p>
                    </div>
                    <Stepper
                      value={addOnQuantities[addOn.id] ?? 0}
                      onChange={(v) => setAddOnQuantity(addOn.id, v)}
                      min={0}
                      label={addOn.name}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <NextButton onClick={() => setStep(2)} disabled={!selectedPackage}>
              Continue
            </NextButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8 space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Delivery date & address</h2>
            <div className="mt-4 space-y-4">
              <FormField label="Delivery date">
                <input
                  type="date"
                  min={todayPlusDays(minLeadTimeDays)}
                  value={requestedDeliveryDate}
                  onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              {confirmedPickupDate && (
                <p className="text-sm text-[var(--color-muted)]">
                  Pickup date: <span className="font-medium">{confirmedPickupDate}</span>
                </p>
              )}
              <FormField label="Preferred delivery time (optional)">
                <input
                  value={preferredDeliveryWindow}
                  onChange={(e) => setPreferredDeliveryWindow(e.target.value)}
                  placeholder="e.g. Morning"
                  className={inputClass}
                />
              </FormField>

              <AddressFields address={deliveryAddress} onChange={setDeliveryAddress} />
              <FormField label="Delivery instructions (optional)">
                <textarea
                  rows={2}
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pickupSameAsDelivery}
                onChange={(e) => setPickupSameAsDelivery(e.target.checked)}
              />
              <span className="text-sm font-medium text-[var(--color-text)]">
                Pickup address is the same as delivery
              </span>
            </label>

            {!pickupSameAsDelivery && (
              <div className="mt-4 space-y-4">
                <FormField label="Preferred pickup time (optional)">
                  <input
                    value={preferredPickupWindow}
                    onChange={(e) => setPreferredPickupWindow(e.target.value)}
                    placeholder="e.g. Afternoon"
                    className={inputClass}
                  />
                </FormField>
                <AddressFields address={pickupAddress} onChange={setPickupAddress} />
                <FormField label="Pickup instructions (optional)">
                  <textarea
                    rows={2}
                    value={pickupInstructions}
                    onChange={(e) => setPickupInstructions(e.target.value)}
                    className={inputClass}
                  />
                </FormField>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Your details</h2>
            <div className="mt-4 space-y-4">
              <FormField label="Full name">
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Email">
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Phone">
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          <div className="flex justify-between">
            <BackButton onClick={() => setStep(1)} />
            <NextButton
              onClick={() => setStep(3)}
              disabled={
                !customerName ||
                !customerEmail ||
                !customerPhone ||
                !deliveryAddress.street ||
                !deliveryAddress.city
              }
            >
              Continue
            </NextButton>
          </div>
        </div>
      )}

      {step === 3 && selectedPackage && (
        <div className="mt-8 space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Review your booking</h2>
            <div className="mt-4 space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
              <p>
                <span className="font-medium text-[var(--color-text)]">Package:</span>{" "}
                {selectedPackage.name}
              </p>
              <p>
                <span className="font-medium text-[var(--color-text)]">Duration:</span>{" "}
                {selectedPackage.rentalDurationWeeks + extensionWeeks}{" "}
                {selectedPackage.rentalDurationWeeks + extensionWeeks === 1 ? "week" : "weeks"}
                {extensionWeeks > 0 ? ` (includes ${extensionWeeks} extra)` : ""}
              </p>
              <p>
                <span className="font-medium text-[var(--color-text)]">Delivery:</span>{" "}
                {requestedDeliveryDate}
              </p>
              <p>
                <span className="font-medium text-[var(--color-text)]">Pickup:</span>{" "}
                {confirmedPickupDate}
              </p>
              <p>
                <span className="font-medium text-[var(--color-text)]">Delivery address:</span>{" "}
                {deliveryAddress.street}, {deliveryAddress.city}
              </p>
              <p className="pt-2 text-xs text-[var(--color-muted)]">
                Your exact total -- including distance-based delivery/pickup pricing -- is
                calculated next, before you pay.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Rental agreement</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Version {agreement.versionLabel}</p>
            <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-mono text-xs leading-relaxed">
              {agreement.content}
            </div>
          </div>

          <div>
            <h3 className="font-medium text-[var(--color-text)]">Sign to agree</h3>
            <SignaturePad ref={signaturePadRef} className="mt-2" />
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={agreementChecked}
              onChange={(e) => setAgreementChecked(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-[var(--color-text)]">
              I have read and agree to the rental agreement above.
            </span>
          </label>

          {submitError && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {submitError}
            </p>
          )}

          <div className="flex justify-between">
            <BackButton onClick={() => setStep(2)} />
            <NextButton onClick={handleReviewSubmit} disabled={submitting}>
              {submitting ? "Checking availability…" : "Continue to payment"}
            </NextButton>
          </div>
        </div>
      )}

      {step === 4 && booking && stripePromise && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Payment</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Order {booking.orderNumber} -- total due:{" "}
            <span className="font-medium text-[var(--color-text)]">
              ${centsToDollarsString(booking.finalAmountCents)} {currency}
            </span>
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret: booking.clientSecret }}>
            <PaymentStep
              onSuccess={() => {
                void sendBookingConfirmationEmailAction(booking.orderId, booking.manageToken);
                setStep(5);
              }}
            />
          </Elements>
        </div>
      )}

      {step === 5 && booking && (
        <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Booking confirmed!</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Order <span className="font-medium">{booking.orderNumber}</span>. A confirmation
            email is on its way to {customerEmail}.
          </p>
          <a
            href={`/manage/${booking.orderId}?token=${booking.manageToken}`}
            className="mt-4 inline-block rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white"
          >
            Manage My Booking
          </a>
        </div>
      )}
    </div>
  );
}

function PaymentStep({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function handlePay() {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setProcessing(false);

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      return;
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onSuccess();
    } else {
      setError("Payment did not complete. Please try again.");
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={!stripe || processing}
        className="inline-flex items-center justify-center rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {processing ? "Processing…" : "Pay now"}
      </button>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const labels = ["Package", "Details", "Agree & Sign", "Payment", "Done"];
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[var(--color-muted)]">
      {labels.map((label, i) => (
        <li
          key={label}
          className={i + 1 === step ? "text-[var(--color-primary)]" : undefined}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20";

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[var(--color-text)]">{label}</label>
      {children}
    </div>
  );
}

function AddressFields({
  address,
  onChange,
}: {
  address: AddressForm;
  onChange: (next: AddressForm) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="Street address">
          <input
            value={address.street}
            onChange={(e) => onChange({ ...address, street: e.target.value })}
            className={inputClass}
          />
        </FormField>
      </div>
      <FormField label="City">
        <input
          value={address.city}
          onChange={(e) => onChange({ ...address, city: e.target.value })}
          className={inputClass}
        />
      </FormField>
      <FormField label="Province">
        <input
          value={address.province}
          onChange={(e) => onChange({ ...address, province: e.target.value })}
          className={inputClass}
        />
      </FormField>
      <FormField label="Postal code">
        <input
          value={address.postalCode}
          onChange={(e) => onChange({ ...address, postalCode: e.target.value })}
          className={inputClass}
        />
      </FormField>
      <FormField label="Country">
        <input
          value={address.country}
          onChange={(e) => onChange({ ...address, country: e.target.value })}
          className={inputClass}
        />
      </FormField>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-8 w-8 rounded-full border border-[var(--color-border)] text-[var(--color-text)]"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-medium text-[var(--color-text)]">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + 1)}
        className="h-8 w-8 rounded-full border border-[var(--color-border)] text-[var(--color-text)]"
      >
        +
      </button>
    </div>
  );
}

function NextButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-[var(--color-muted)] hover:underline"
    >
      ← Back
    </button>
  );
}
