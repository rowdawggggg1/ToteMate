import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faqs } from "@/lib/db/schema";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteFaqAction, toggleFaqActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FaqsListPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(faqs)
    .orderBy(asc(faqs.displayOrder), asc(faqs.createdAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">FAQs</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Only active FAQs appear on the public site, in this order.
          </p>
        </div>
        <Link
          href="/admin/faqs/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New FAQ
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No FAQs yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((faq) => (
            <li key={faq.id} className="flex items-start justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/faqs/${faq.id}`}
                  className="font-medium text-[var(--color-text)] hover:underline"
                >
                  {faq.question}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">
                  {faq.answer}
                </p>
                <span
                  className={
                    faq.isActive
                      ? "mt-2 inline-block rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                      : "mt-2 inline-block rounded-full bg-[var(--color-muted)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]"
                  }
                >
                  {faq.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 whitespace-nowrap">
                <form action={toggleFaqActiveAction.bind(null, faq.id)}>
                  <button
                    type="submit"
                    className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {faq.isActive ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteFaqAction.bind(null, faq.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={`Delete this FAQ? This cannot be undone.`}
                    className="text-xs font-medium text-[var(--color-error)] hover:underline"
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
