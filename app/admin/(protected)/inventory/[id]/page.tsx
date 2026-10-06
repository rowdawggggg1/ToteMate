import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { totes } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { EditToteForm } from "../edit-tote-form";
import { ReplaceToteForm } from "../replace-tote-form";
import type { TOTE_STATUSES } from "../tote-statuses";

export const dynamic = "force-dynamic";

export default async function EditTotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db.select().from(totes).where(eq(totes.id, id)).limit(1);
  const tote = rows[0];

  if (!tote) {
    notFound();
  }

  let replacesLabel: string | null = null;
  if (tote.replacesToteId) {
    const prevRows = await db
      .select({ number: totes.number })
      .from(totes)
      .where(eq(totes.id, tote.replacesToteId))
      .limit(1);
    if (prevRows[0]) replacesLabel = prevRows[0].number;
  }

  return (
    <div>
      <Link href="/admin/inventory" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Inventory
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Tote {tote.number}</h1>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--color-muted)]">
        <div>
          <dt className="inline font-medium text-[var(--color-text)]">Completed rentals:</dt>{" "}
          <dd className="inline">{tote.completedRentalCount}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--color-text)]">Net profit attributed:</dt>{" "}
          <dd className="inline">${centsToDollarsString(tote.netProfitAttributedCents)}</dd>
        </div>
        {replacesLabel && (
          <div>
            <dt className="inline font-medium text-[var(--color-text)]">Replaces:</dt>{" "}
            <dd className="inline">Tote {replacesLabel}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6">
        <EditToteForm
          toteId={tote.id}
          initialValues={{
            status: tote.status as (typeof TOTE_STATUSES)[number],
            notes: tote.notes ?? "",
          }}
        />
      </div>

      {tote.status !== "retired" && (
        <div className="mt-8">
          <ReplaceToteForm toteId={tote.id} number={tote.number} />
        </div>
      )}
    </div>
  );
}
