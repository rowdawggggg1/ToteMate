import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rentalAgreementVersions } from "@/lib/db/schema";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteAgreementVersionAction, publishAgreementVersionAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]",
  active: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  superseded: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
};

export default async function AgreementsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(rentalAgreementVersions)
    .orderBy(desc(rentalAgreementVersions.createdAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Rental Agreements</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
            Only one version is active at a time. New bookings sign against whichever version
            is active -- publishing a new one never changes what past customers already agreed
            to. This is a plain-language starting template, not legal advice; have a lawyer
            review it before relying on it.
          </p>
        </div>
        <Link
          href="/admin/agreements/new"
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New Draft
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">
          No agreement versions yet -- create a draft to get started.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/agreements/${version.id}`}
                  className="font-medium text-[var(--color-text)] hover:underline"
                >
                  {version.versionLabel}
                </Link>
                <div className="mt-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[version.status] ?? ""
                    }`}
                  >
                    {version.status[0].toUpperCase() + version.status.slice(1)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 whitespace-nowrap">
                {version.status === "draft" && (
                  <>
                    <form action={publishAgreementVersionAction.bind(null, version.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="Publish this version? It will become the one new bookings sign, and the currently active version (if any) will be superseded."
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Publish
                      </ConfirmSubmitButton>
                    </form>
                    <form action={deleteAgreementVersionAction.bind(null, version.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="Delete this draft? This cannot be undone."
                        className="text-xs font-medium text-[var(--color-error)] hover:underline"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
