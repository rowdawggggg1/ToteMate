"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";

const packageSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().optional().default(""),
  toteQuantity: z.coerce.number().int().min(1, "Must be at least 1."),
  price: z.coerce.number().min(0, "Must be zero or more."),
  rentalDurationWeeks: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1 full week."),
  includesDolly: z.coerce.boolean(),
  useCaseDescription: z.string().trim().optional().default(""),
  photoUrl: z.string().trim().url("Enter a valid URL.").or(z.literal("")).default(""),
  isActive: z.coerce.boolean(),
  isFeatured: z.coerce.boolean(),
  displayOrder: z.coerce.number().int().min(0),
});

export type PackageActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parsePackageForm(formData: FormData) {
  return packageSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    toteQuantity: formData.get("toteQuantity"),
    price: formData.get("price"),
    rentalDurationWeeks: formData.get("rentalDurationWeeks"),
    includesDolly: formData.get("includesDolly"),
    useCaseDescription: formData.get("useCaseDescription"),
    photoUrl: formData.get("photoUrl"),
    isActive: formData.get("isActive"),
    isFeatured: formData.get("isFeatured"),
    displayOrder: formData.get("displayOrder"),
  });
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export async function createPackageAction(
  _prevState: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const admin = await requireAdmin();
  const parsed = parsePackageForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = parsed.data;
  const db = getDb();

  let newId: string | null = null;

  await db.transaction(async (tx) => {
    if (data.isFeatured) {
      // Only one package can be "Most Popular" at a time.
      await tx.update(packages).set({ isFeatured: false });
    }
    const inserted = await tx
      .insert(packages)
      .values({
        name: data.name,
        description: data.description || null,
        toteQuantity: data.toteQuantity,
        priceCents: dollarsToCents(data.price),
        rentalDurationWeeks: data.rentalDurationWeeks,
        includesDolly: data.includesDolly,
        useCaseDescription: data.useCaseDescription || null,
        photoUrl: data.photoUrl || null,
        isActive: data.isActive,
        isFeatured: data.isFeatured,
        displayOrder: data.displayOrder,
      })
      .returning({ id: packages.id });
    newId = inserted[0]?.id ?? null;
  });

  if (!newId) {
    return { error: "We couldn't create this package. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "PACKAGE_CREATED",
    entityType: "package",
    entityId: newId,
    after: data,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
  redirect("/admin/packages");
}

export async function updatePackageAction(
  packageId: string,
  _prevState: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const admin = await requireAdmin();
  const parsed = parsePackageForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = parsed.data;
  const db = getDb();

  const existingRows = await db
    .select()
    .from(packages)
    .where(eq(packages.id, packageId))
    .limit(1);
  const existing = existingRows[0];

  if (!existing) {
    return { error: "This package no longer exists." };
  }

  const nextValues = {
    name: data.name,
    description: data.description || null,
    toteQuantity: data.toteQuantity,
    priceCents: dollarsToCents(data.price),
    rentalDurationWeeks: data.rentalDurationWeeks,
    includesDolly: data.includesDolly,
    useCaseDescription: data.useCaseDescription || null,
    photoUrl: data.photoUrl || null,
    isActive: data.isActive,
    isFeatured: data.isFeatured,
    displayOrder: data.displayOrder,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    if (data.isFeatured) {
      // Only one package can be "Most Popular" at a time.
      await tx.update(packages).set({ isFeatured: false }).where(ne(packages.id, packageId));
    }
    await tx.update(packages).set(nextValues).where(eq(packages.id, packageId));
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "PACKAGE_UPDATED",
    entityType: "package",
    entityId: packageId,
    before: existing,
    after: nextValues,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
  redirect("/admin/packages");
}

export async function toggleActiveAction(packageId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  const nextActive = !existing.isActive;
  await db
    .update(packages)
    .set({ isActive: nextActive, updatedAt: new Date() })
    .where(eq(packages.id, packageId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: nextActive ? "PACKAGE_ACTIVATED" : "PACKAGE_DEACTIVATED",
    entityType: "package",
    entityId: packageId,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
}

export async function toggleFeaturedAction(packageId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  const nextFeatured = !existing.isFeatured;

  await db.transaction(async (tx) => {
    if (nextFeatured) {
      // Only one package can be "Most Popular" at a time.
      await tx.update(packages).set({ isFeatured: false }).where(ne(packages.id, packageId));
    }
    await tx
      .update(packages)
      .set({ isFeatured: nextFeatured, updatedAt: new Date() })
      .where(eq(packages.id, packageId));
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "PACKAGE_FEATURED_CHANGED",
    entityType: "package",
    entityId: packageId,
    after: { isFeatured: nextFeatured },
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
}

export async function deletePackageAction(packageId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  // Safe to hard-delete for now because no orders exist yet to reference a
  // package. Once the booking phase adds orders, this must be changed to
  // check for referencing orders first and deactivate instead of deleting
  // if any exist (per spec Section 9.25-9.26).
  await db.delete(packages).where(eq(packages.id, packageId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "PACKAGE_DELETED",
    entityType: "package",
    entityId: packageId,
    before: existing,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
}
