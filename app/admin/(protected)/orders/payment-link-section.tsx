"use client";

import { useState, useTransition } from "react";
import { regenerateCustomOrderCheckoutLinkAction } from "./new/actions";

export function PaymentLinkSection({ orderId }: { orderId: string }) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateCustomOrderCheckoutLinkAction(orderId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setCheckoutUrl(result.checkoutUrl ?? null);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        This order is still awaiting payment. Generate a Stripe payment link to send the customer.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={generate}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Generating…" : "Generate Payment Link"}
      </button>
      {checkoutUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={checkoutUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(checkoutUrl)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium"
          >
            Copy
          </button>
        </div>
      )}
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
