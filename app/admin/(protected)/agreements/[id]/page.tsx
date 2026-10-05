import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rentalAgreementVersions } from "@/lib/db/schema";
import { updateAgreementVersionAction } from "../actions";
import { AgreementForm } from "../agreement-form";

export const dynamic = "force-dynamic";

export default async function EditAgreementVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select()
    .from(rentalAgreementVersions)
    .where(eq(rentalAgreementVersions.id, id))
    .limit(1);
  const version = rows[0];

  if (!version) {
    notFound();
  }

  const isDraft = version.status === "draft";
  const boundAction = updateAgreementVersionAction.bind(null, version.id);

  return (
    <div>
      <Link href="/admin/agreements" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Rental Agreements
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
        {version.versionLabel}
      </h1>

      {isDraft ? (
        <div className="mt-6">
          <AgreementForm
            initialValues={{ versionLabel: version.versionLabel, content: version.content }}
            action={boundAction}
            submitLabel="Save changes"
          />
        </div>
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            This version is {version.status} and can no longer be edited -- orders may already
            reference it as the terms they agreed to. Create a new draft instead.
          </p>
          <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-mono text-xs leading-relaxed text-[var(--color-text)]">
            {version.content}
          </pre>
        </div>
      )}
    </div>
  );
}
