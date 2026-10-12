"use client";

import { useActionState, useState } from "react";
import { submitReviewFormAction, type SubmitReviewFormState } from "./actions";

const initialState: SubmitReviewFormState = { ok: false };

export function ReviewFormClient({ orderId, token, packageName }: { orderId: string; token: string; packageName: string }) {
  const boundAction = submitReviewFormAction.bind(null, orderId, token);
  const [state, formAction] = useActionState(boundAction, initialState);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isAnonymous, setIsAnonymous] = useState(false);

  if (state.ok) {
    return (
      <div className="text-center">
        <h1 className="font-serif text-2xl font-semibold text-[var(--color-text)]">Thank you!</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Your review has been submitted and will appear on our site once it&apos;s been reviewed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-center font-serif text-2xl font-semibold text-[var(--color-text)]">
        How was your rental?
      </h1>
      <p className="mt-2 text-center text-sm text-[var(--color-muted)]">{packageName}</p>

      <form action={formAction} className="mt-8 space-y-5">
        <div className="flex justify-center gap-1" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHoverRating(value)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              className="text-4xl leading-none"
            >
              <span
                className={
                  value <= (hoverRating || rating)
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-border)]"
                }
              >
                ★
              </span>
            </button>
          ))}
        </div>
        <input type="hidden" name="rating" value={rating} />

        <div>
          <label htmlFor="comment" className="text-sm font-medium text-[var(--color-text)]">
            Tell us more (optional)
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={4}
            className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        {!isAnonymous && (
          <div>
            <label htmlFor="customerName" className="text-sm font-medium text-[var(--color-text)]">
              Your name (shown with your review)
            </label>
            <input
              id="customerName"
              name="customerName"
              className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            name="isAnonymous"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
          />
          Post anonymously
        </label>

        {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}

        <button
          type="submit"
          disabled={rating === 0}
          className="w-full rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Submit Review
        </button>
      </form>
    </div>
  );
}
