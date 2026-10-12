import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, reviews } from "@/lib/db/schema";
import { getPublicReviewSummary } from "@/lib/reviews";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  approveReviewAction,
  deleteReviewAction,
  rejectReviewAction,
  toggleReviewPublicAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  approved: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  rejected: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-[var(--color-accent)]" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-[var(--color-border)]">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function AdminReviewsPage() {
  const db = getDb();
  const rows = await db
    .select({
      id: reviews.id,
      orderId: reviews.orderId,
      orderNumber: orders.orderNumber,
      customerName: reviews.customerName,
      isAnonymous: reviews.isAnonymous,
      rating: reviews.rating,
      comment: reviews.comment,
      status: reviews.status,
      isPublic: reviews.isPublic,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(orders, eq(reviews.orderId, orders.id))
    .orderBy(desc(reviews.createdAt));

  const summary = await getPublicReviewSummary();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Reviews</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Approve or reject submitted reviews, and choose which approved ones show on the public
        site. Public summary right now:{" "}
        {summary.count > 0 ? (
          <>
            <strong>{summary.averageRating.toFixed(1)}★</strong> from {summary.count} review
            {summary.count === 1 ? "" : "s"}
          </>
        ) : (
          "no public reviews yet"
        )}
        .
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No reviews yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[r.status] ?? ""
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.status === "approved" && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.isPublic
                            ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                            : "bg-[var(--color-muted)]/15 text-[var(--color-muted)]"
                        }`}
                      >
                        {r.isPublic ? "Public" : "Hidden"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
                    {r.isAnonymous || !r.customerName ? "Anonymous" : r.customerName}
                  </p>
                  {r.comment && <p className="mt-1 text-sm text-[var(--color-muted)]">{r.comment}</p>}
                  <Link
                    href={`/admin/orders/${r.orderId}`}
                    className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
                  >
                    Order {r.orderNumber} →
                  </Link>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 whitespace-nowrap text-xs">
                  {r.status === "pending" && (
                    <>
                      <form action={approveReviewAction.bind(null, r.id)}>
                        <button type="submit" className="font-medium text-[var(--color-success)] hover:underline">
                          Approve
                        </button>
                      </form>
                      <form action={rejectReviewAction.bind(null, r.id)}>
                        <button type="submit" className="font-medium text-[var(--color-error)] hover:underline">
                          Reject
                        </button>
                      </form>
                    </>
                  )}
                  {r.status === "approved" && (
                    <form action={toggleReviewPublicAction.bind(null, r.id)}>
                      <button type="submit" className="font-medium text-[var(--color-primary)] hover:underline">
                        {r.isPublic ? "Hide from public site" : "Show on public site"}
                      </button>
                    </form>
                  )}
                  {r.status === "rejected" && (
                    <form action={approveReviewAction.bind(null, r.id)}>
                      <button type="submit" className="font-medium text-[var(--color-success)] hover:underline">
                        Approve instead
                      </button>
                    </form>
                  )}
                  <form action={deleteReviewAction.bind(null, r.id)}>
                    <ConfirmSubmitButton
                      confirmMessage="Delete this review permanently? This cannot be undone."
                      className="font-medium text-[var(--color-error)] hover:underline"
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
