import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { updateDriverAction, deleteDriverAction } from "../actions";
import { DriverForm, type DriverFormValues } from "../driver-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

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

      <div className="mt-8 border-t border-[var(--color-border)] pt-6">
        <form action={deleteDriverAction.bind(null, driver.id)}>
          <ConfirmSubmitButton
            confirmMessage="Remove this driver? If they have history attached (like a recorded late fee), they'll be deactivated instead of deleted so that history stays intact."
            className="rounded-lg border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)]"
          >
            Remove Driver
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
