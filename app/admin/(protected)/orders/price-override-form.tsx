"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { setPriceOverrideAction, type OrderActionState } from "./actions";

const initialState: OrderActionState = { ok: true };

export function PriceOverrideForm({
  orderId,
  currentOverride,
  currentReason,
}: {
  orderId: string;
  currentOverride: string;
  currentReason: string;
}) {
  const boundAction = setPriceOverrideAction.bind(null, orderId);
  const [state, formAction] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Manual price override ($)"
        htmlFor="priceOverride"
        hint="Replaces the calculated total shown to the customer. Leave blank to use the calculated total. This does not automatically refund or charge the difference in Stripe -- do that separately if needed."
      >
        <input
          id="priceOverride"
          name="priceOverride"
          type="number"
          step="0.01"
          min={0}
          defaultValue={currentOverride}
          className={inputClass}
        />
      </Field>
      <Field label="Reason (optional)" htmlFor="priceOverrideReason">
        <input
          id="priceOverrideReason"
          name="priceOverrideReason"
          defaultValue={currentReason}
          className={inputClass}
        />
      </Field>
      {!state.ok && state.error && (
        <p className="text-sm text-[var(--color-error)]">{state.error}</p>
      )}
      <SubmitButton pendingText="Saving…">Save override</SubmitButton>
    </form>
  );
}
