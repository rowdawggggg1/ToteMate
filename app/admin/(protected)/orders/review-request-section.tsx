"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestReviewAction } from "./actions";

export function ReviewRequestSection({
  orderId,
  canRequest,
  reviewRequestedAt,
  reviewSubmittedAt,
}: {
  orderId: string;
  canRequest: boolean;
  reviewRequestedAt: string | null;
  reviewSubmittedAt: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(reviewRequestedAt);
  const [isPending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await requestReviewAction(orderId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSentAt(new Date().toISOString());
    });
  }

  if (reviewSubmittedAt) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        A review was submitted for this order on {new Date(reviewSubmittedAt).toLocaleDateString()}.{" "}
        <Link href="/admin/reviews" className="text-[var(--color-primary)] hover:underline">
          View in Reviews →
        </Link>
      </p>
    );
  }

  if (!canRequest) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        A review can be requested once the totes have been picked up.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sentAt && (
        <p className="text-sm text-[var(--color-muted)]">
          Request sent {new Date(sentAt).toLocaleString()}. No response yet.
        </p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={send}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Sending…" : sentAt ? "Resend Request" : "Request Review"}
      </button>
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
