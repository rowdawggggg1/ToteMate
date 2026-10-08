"use client";

import { useActionState } from "react";
import {
  subscribeToTierAction,
  cancelSubscriptionAction,
  purchaseGiftCardAction,
  type RealtorActionState,
} from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

const initialState: RealtorActionState = {};

export function SubscribeForm({ tierId }: { tierId: string }) {
  const boundAction = subscribeToTierAction.bind(null, tierId);
  const [state, formAction] = useActionState(boundAction, initialState);

  return (
    <form action={formAction}>
      <SubmitButton pendingText="Starting…">Subscribe</SubmitButton>
      {state.error && <p className="mt-1 text-xs text-[var(--color-error)]">{state.error}</p>}
    </form>
  );
}

export function CancelSubscriptionForm() {
  return (
    <form action={cancelSubscriptionAction}>
      <ConfirmSubmitButton
        confirmMessage="Cancel your subscription? You'll keep receiving gift cards until the end of the current billing period."
        className="mt-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)]"
      >
        Cancel at period end
      </ConfirmSubmitButton>
    </form>
  );
}

export function GiftCardPurchaseForm() {
  const [state, formAction] = useActionState(purchaseGiftCardAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="w-28">
        <Field label="Amount ($)" htmlFor="amount">
          <input id="amount" name="amount" type="number" step="0.01" min="0.01" className={inputClass} />
        </Field>
      </div>
      <div className="min-w-[10rem] flex-1">
        <Field label="Recipient name (optional)" htmlFor="recipientName">
          <input id="recipientName" name="recipientName" className={inputClass} />
        </Field>
      </div>
      <div className="min-w-[12rem] flex-1">
        <Field label="Recipient email (optional)" htmlFor="recipientEmail">
          <input id="recipientEmail" name="recipientEmail" type="email" className={inputClass} />
        </Field>
      </div>
      <SubmitButton pendingText="Starting…">Buy Gift Card</SubmitButton>
      {state.error && <p className="w-full text-sm text-[var(--color-error)]">{state.error}</p>}
    </form>
  );
}
