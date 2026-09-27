import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { createAddOnAction } from "../actions";
import { AddOnForm } from "../addon-form";

export const dynamic = "force-dynamic";

export default async function NewAddOnPage() {
  const db = getDb();
  const packageRows = await db
    .select({ id: packages.id, name: packages.name })
    .from(packages)
    .orderBy(asc(packages.displayOrder), asc(packages.name));

  return (
    <div>
      <Link
        href="/admin/add-ons"
        className="text-sm text-[var(--color-muted)] hover:underline"
      >
        ← Add-Ons
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">New Add-On</h1>
      <div className="mt-6">
        <AddOnForm
          action={createAddOnAction}
          submitLabel="Create Add-On"
          packageOptions={packageRows}
        />
      </div>
    </div>
  );
}
