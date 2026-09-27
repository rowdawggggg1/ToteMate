import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { updatePackageAction } from "../actions";
import { PackageForm, type PackageFormValues } from "../package-form";

export const dynamic = "force-dynamic";

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db.select().from(packages).where(eq(packages.id, id)).limit(1);
  const pkg = rows[0];

  if (!pkg) {
    notFound();
  }

  const initialValues: PackageFormValues = {
    name: pkg.name,
    description: pkg.description ?? "",
    toteQuantity: pkg.toteQuantity,
    price: centsToDollarsString(pkg.priceCents),
    rentalDurationWeeks: pkg.rentalDurationWeeks,
    includesDolly: pkg.includesDolly,
    useCaseDescription: pkg.useCaseDescription ?? "",
    photoUrl: pkg.photoUrl ?? "",
    isActive: pkg.isActive,
    isFeatured: pkg.isFeatured,
    displayOrder: pkg.displayOrder,
  };

  const boundAction = updatePackageAction.bind(null, pkg.id);

  return (
    <div>
      <Link
        href="/admin/packages"
        className="text-sm text-[var(--color-muted)] hover:underline"
      >
        ← Packages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
        Edit {pkg.name}
      </h1>
      <div className="mt-6">
        <PackageForm
          initialValues={initialValues}
          action={boundAction}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
