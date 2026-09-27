import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addOns, packages } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { updateAddOnAction } from "../actions";
import { AddOnForm, type AddOnFormValues } from "../addon-form";

export const dynamic = "force-dynamic";

export default async function EditAddOnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [addOnRows, packageRows] = await Promise.all([
    db.select().from(addOns).where(eq(addOns.id, id)).limit(1),
    db
      .select({ id: packages.id, name: packages.name })
      .from(packages)
      .orderBy(asc(packages.displayOrder), asc(packages.name)),
  ]);

  const addOn = addOnRows[0];
  if (!addOn) {
    notFound();
  }

  const initialValues: AddOnFormValues = {
    name: addOn.name,
    description: addOn.description ?? "",
    price: centsToDollarsString(addOn.priceCents),
    imageUrl: addOn.imageUrl ?? "",
    isActive: addOn.isActive,
    displayOrder: addOn.displayOrder,
    packageId: addOn.packageId ?? "",
    isWeeklyExtension: addOn.isWeeklyExtension,
  };

  const boundAction = updateAddOnAction.bind(null, addOn.id);

  return (
    <div>
      <Link
        href="/admin/add-ons"
        className="text-sm text-[var(--color-muted)] hover:underline"
      >
        ← Add-Ons
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
        Edit {addOn.name}
      </h1>
      <div className="mt-6">
        <AddOnForm
          initialValues={initialValues}
          action={boundAction}
          submitLabel="Save Changes"
          packageOptions={packageRows}
        />
      </div>
    </div>
  );
}
