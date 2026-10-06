import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { updateDriverAction } from "../actions";
import { DriverForm, type DriverFormValues } from "../driver-form";

export const dynamic = "force-dynamic";

export default async function EditDriverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select()
    .from(admins)
    .where(and(eq(admins.id, id), eq(admins.role, "driver")))
    .limit(1);
  const driver = rows[0];

  if (!driver) {
    notFound();
  }

  const initialValues: DriverFormValues = {
    name: driver.name,
    email: driver.email,
    isActive: driver.isActive,
  };

  const boundAction = updateDriverAction.bind(null, driver.id);

  return (
    <div>
      <Link href="/admin/drivers" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Drivers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Edit Driver</h1>
      <div className="mt-6">
        <DriverForm initialValues={initialValues} action={boundAction} submitLabel="Save Changes" isEdit />
      </div>
    </div>
  );
}
