"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { rentalAgreementVersions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";

export type AgreementActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const agreementSchema = z.object({
  versionLabel: z.string().trim().min(1, "A version label is required."),
  content: z.string().trim().min(1, "Agreement content is required."),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createAgreementVersionAction(
  _prevState: AgreementActionState,
  formData: FormData
): Promise<AgreementActionState> {
  const admin = await requireAdmin();
  const parsed = agreementSchema.safeParse({
    versionLabel: formData.get("versionLabel"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const db = getDb();
  const inserted = await db
    .insert(rentalAgreementVersions)
    .values({ ...parsed.data, status: "draft" })
    .returning({ id: rentalAgreementVersions.id });
  const newId = inserted[0]?.id;

  if (!newId) {
    return { error: "We couldn't create this draft. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "AGREEMENT_VERSION_CREATED",
    entityType: "rental_agreement_version",
    entityId: newId,
    after: parsed.data,
  });

  revalidatePath("/admin/agreements");
  redirect("/admin/agreements");
}

export async function updateAgreementVersionAction(
  versionId: string,
  _prevState: AgreementActionState,
  formData: FormData
): Promise<AgreementActionState> {
  const admin = await requireAdmin();
  const parsed = agreementSchema.safeParse({
    versionLabel: formData.get("versionLabel"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const db = getDb();
  const existingRows = await db
    .select()
    .from(rentalAgreementVersions)
    .where(eq(rentalAgreementVersions.id, versionId))
    .limit(1);
  const existing = existingRows[0];

  if (!existing) {
    return { error: "This agreement version no longer exists." };
  }

  // Once a version has been published, its content must never change --
  // orders that signed against it rely on it staying exactly as it was
  // (and already carry their own frozen snapshot regardless). Only drafts
  // are editable.
  if (existing.status !== "draft") {
    return { error: "Only draft versions can be edited. Create a new draft instead." };
  }

  await db
    .update(rentalAgreementVersions)
    .set(parsed.data)
    .where(eq(rentalAgreementVersions.id, versionId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "AGREEMENT_VERSION_UPDATED",
    entityType: "rental_agreement_version",
    entityId: versionId,
    before: existing,
    after: parsed.data,
  });

  revalidatePath("/admin/agreements");
  redirect("/admin/agreements");
}

/**
 * Publishing a draft makes it "the" active agreement that new bookings
 * snapshot at signing time, and demotes whichever version was previously
 * active to "superseded". Only one version is ever active at once.
 */
export async function publishAgreementVersionAction(versionId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(rentalAgreementVersions)
      .where(eq(rentalAgreementVersions.id, versionId))
      .limit(1);
    const existing = rows[0];
    if (!existing || existing.status !== "draft") return;

    await tx
      .update(rentalAgreementVersions)
      .set({ status: "superseded" })
      .where(eq(rentalAgreementVersions.status, "active"));

    await tx
      .update(rentalAgreementVersions)
      .set({ status: "active", publishedAt: new Date() })
      .where(eq(rentalAgreementVersions.id, versionId));
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "AGREEMENT_VERSION_PUBLISHED",
    entityType: "rental_agreement_version",
    entityId: versionId,
  });

  revalidatePath("/admin/agreements");
}

export async function deleteAgreementVersionAction(versionId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db
    .select()
    .from(rentalAgreementVersions)
    .where(eq(rentalAgreementVersions.id, versionId))
    .limit(1);
  const existing = rows[0];
  if (!existing || existing.status !== "draft") return;

  await db.delete(rentalAgreementVersions).where(eq(rentalAgreementVersions.id, versionId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "AGREEMENT_VERSION_DELETED",
    entityType: "rental_agreement_version",
    entityId: versionId,
    before: existing,
  });

  revalidatePath("/admin/agreements");
}
