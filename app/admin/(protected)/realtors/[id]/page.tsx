import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { updateRealtorAction, deleteRealtorAction } from "../actions";
import { RealtorForm, type RealtorFormValues } from "../realtor-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export const dynamic = "force-dynamic";

export default async function EditRealtorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select()
    .from(admins)
    .where(and(eq(admins.id, id), eq(admins.role, "realtor")))
    .limit(1);
  const realtor = rows[0];

  if (!realtor) {
    notFound();
  }

  const initialValues: RealtorFormValues = {
    name: realtor.name,
    email: realtor.email,
    isActive: realtor.isActive,
  };

  const boundAction = updateRealtorAction.bind(null, realtor.id);

  return (
    <div>
      <Link href="/admin/realtors" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Realtors
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Edit Realtor</h1>
      <div className="mt-6">
        <RealtorForm initialValues={initialValues} action={boundAction} submitLabel="Save Changes" isEdit />
      </div>

      <div className="mt-8 border-t border-[var(--color-border)] pt-6">
        <form action={deleteRealtorAction.bind(null, realtor.id)}>
          <ConfirmSubmitButton
            confirmMessage="Remove this realtor? If they have history attached (a referral code, gift card, or subscription), they'll be deactivated instead of deleted so that history stays intact."
            className="rounded-lg border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)]"
          >
            Remove Realtor
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
