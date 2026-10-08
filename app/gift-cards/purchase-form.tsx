"use client";

import { useActionState, useState } from "react";
import { purchaseGiftCardAction, type GiftCardPurchaseActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { centsToDollarsString } from "@/lib/money";

const initialState: GiftCardPurchaseActionState = {};

export function GiftCardPurchaseForm({
  denominations,
}: {
  denominations: Array<{ id: string; amountCents: number }>;
}) {
  const [state, formAction] = useActionState(purchaseGiftCardAction, initialState);
  const [amountCents, setAmountCents] = useState(denominations[0]?.amountCents ?? 0);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">Amount</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {denominations.map((d) => (
            <label
              key={d.id}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-sm ${
                amountCents === d.amountCents
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]"
                  : "border-[var(--color-border)] text-[var(--color-text)]"
              }`}
            >
              <input
                type="radio"
                name="amountCents"
                value={d.amountCents}
                checked={amountCents === d.amountCents}
                onChange={() => setAmountCents(d.amountCents)}
                className="sr-only"
              />
              ${centsToDollarsString(d.amountCents)}
            </label>
          ))}
        </div>
      </div>

      <Field label="Your name" htmlFor="purchasedByName">
        <input id="purchasedByName" name="purchasedByName" required className={inputClass} />
      </Field>
      <Field label="Your email" htmlFor="purchasedByEmail" hint="Your receipt goes here.">
        <input id="purchasedByEmail" name="purchasedByEmail" type="email" required className={inputClass} />
      </Field>
      <Field label="Recipient name (optional)" htmlFor="recipientName">
        <input id="recipientName" name="recipientName" className={inputClass} />
      </Field>
      <Field
        label="Recipient email (optional)"
        htmlFor="recipientEmail"
        hint="Leave blank if you're keeping it or giving it in person."
      >
        <input id="recipientEmail" name="recipientEmail" type="email" className={inputClass} />
      </Field>

      {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}

      <SubmitButton pendingText="Starting checkout…">
        Buy ${centsToDollarsString(amountCents)} Gift Card
      </SubmitButton>
    </form>
  );
}
