"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { adminCancelOrderAction, type OrderActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";

const initialState: OrderActionState = { ok: true };

function ConfirmCancelButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-[var(--color-error)] px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
    >
      {pending ? "Cancelling…" : "Confirm Cancellation"}
    </button>
  );
}

export function CancelOrderSection({
  orderId,
  canCancel,
  wasPaid,
  estimatedRefundNote,
}: {
  orderId: string;
  canCancel: boolean;
  wasPaid: boolean;
  estimatedRefundNote: string;
}) {
  const boundAction = adminCancelOrderAction.bind(null, orderId);
  const [state, formAction] = useActionState(boundAction, initialState);
  const [open, setOpen] = useState(false);

  if (!canCancel) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        This order can&apos;t be cancelled from its current status.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)]"
      >
        Cancel Order
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        This cancels the order permanently (it stays in history, just no longer active).
        {wasPaid ? ` ${estimatedRefundNote}` : " This order was never paid, so there's nothing to refund."}
      </p>
      <Field label="Reason (optional, for your own records)" htmlFor="reason">
        <input id="reason" name="reason" className={inputClass} />
      </Field>
      {wasPaid && (
        <Field
          label="Refund override ($, optional -- leave blank to use the automatic cancellation-fee rule)"
          htmlFor="refundOverride"
        >
          <input
            id="refundOverride"
            name="refundOverride"
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
          />
        </Field>
      )}
      <div className="flex items-center gap-3">
        <ConfirmCancelButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-[var(--color-muted)] hover:underline"
        >
          Never mind
        </button>
      </div>
      {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}
    </form>
  );
}
