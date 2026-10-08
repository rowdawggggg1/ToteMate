"use client";

import { useActionState } from "react";
import { issueGiftCardAction, addDenominationAction, type GiftCardActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: GiftCardActionState = {};

export function IssueGiftCardForm() {
  const [state, formAction] = useActionState(issueGiftCardAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="w-28">
        <Field label="Amount ($)" htmlFor="amount" error={errors.amount}>
          <input id="amount" name="amount" type="number" step="0.01" min="0.01" className={inputClass} />
        </Field>
      </div>
      <div className="min-w-[10rem] flex-1">
        <Field label="Recipient name (optional)" htmlFor="recipientName">
          <input id="recipientName" name="recipientName" className={inputClass} />
        </Field>
      </div>
      <div className="min-w-[12rem] flex-1">
        <Field label="Recipient email (optional)" htmlFor="recipientEmail" error={errors.recipientEmail}>
          <input id="recipientEmail" name="recipientEmail" type="email" className={inputClass} />
        </Field>
      </div>
      <div className="min-w-[10rem] flex-1">
        <Field label="Notes (optional)" htmlFor="notes">
          <input id="notes" name="notes" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>Issue Gift Card</SubmitButton>
      {state.error && <p className="w-full text-sm text-[var(--color-error)]">{state.error}</p>}
      {state.success && <p className="w-full text-sm text-[var(--color-primary)]">Gift card issued.</p>}
    </form>
  );
}

export function AddDenominationForm() {
  const [state, formAction] = useActionState(addDenominationAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3">
      <div className="w-28">
        <Field label="Amount ($)" htmlFor="denomAmount">
          <input id="denomAmount" name="amount" type="number" step="0.01" min="0.01" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>Add</SubmitButton>
      {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}
    </form>
  );
}
