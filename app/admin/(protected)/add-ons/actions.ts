"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { addOns, orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";

const addOnSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    description: z.string().trim().optional().default(""),
    price: z.coerce.number().min(0, "Must be zero or more."),
    imageUrl: z.string().trim().url("Enter a valid URL.").or(z.literal("")).default(""),
    isActive: z.coerce.boolean(),
    displayOrder: z.coerce.number().int().min(0),
    // "" means "general -- available with any package"
    packageId: z.string().trim().optional().default(""),
    isWeeklyExtension: z.coerce.boolean(),
  })
  .refine((data) => !data.isWeeklyExtension || data.packageId !== "", {
    message: "A weekly extension must be tied to a specific package.",
    path: ["packageId"],
  });

export type AddOnActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseAddOnForm(formData: FormData) {
  return addOnSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    imageUrl: formData.get("imageUrl"),
    isActive: formData.get("isActive"),
    displayOrder: formData.get("displayOrder"),
    packageId: formData.get("packageId"),
    isWeeklyExtension: formData.get("isWeeklyExtension"),
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

export async function createAddOnAction(
  _prevState: AddOnActionState,
  formData: FormData
): Promise<AddOnActionState> {
  const admin = await requireAdmin();
  const parsed = parseAddOnForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = parsed.data;
  const db = getDb();
  const packageId = data.packageId || null;

  let newId: string | null = null;

  await db.transaction(async (tx) => {
    // Only one add-on can be "the" weekly extension for a given package.
    if (data.isWeeklyExtension && packageId) {
      await tx
        .update(addOns)
        .set({ isWeeklyExtension: false })
        .where(eq(addOns.packageId, packageId));
    }

    const inserted = await tx
      .insert(addOns)
      .values({
        name: data.name,
        description: data.description || null,
        priceCents: dollarsToCents(data.price),
        imageUrl: data.imageUrl || null,
        isActive: data.isActive,
        displayOrder: data.displayOrder,
        packageId,
        isWeeklyExtension: data.isWeeklyExtension,
      })
      .returning({ id: addOns.id });

    newId = inserted[0]?.id ?? null;
  });

  if (!newId) {
    return { error: "We couldn't create this add-on. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ADDON_CREATED",
    entityType: "add_on",
    entityId: newId,
    after: data,
  });

  revalidatePath("/admin/add-ons");
  revalidatePath("/");
  redirect("/admin/add-ons");
}

export async function updateAddOnAction(
  addOnId: string,
  _prevState: AddOnActionState,
  formData: FormData
): Promise<AddOnActionState> {
  const admin = await requireAdmin();
  const parsed = parseAddOnForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = parsed.data;
  const db = getDb();
  const packageId = data.packageId || null;

  const existingRows = await db
    .select()
    .from(addOns)
    .where(eq(addOns.id, addOnId))
    .limit(1);
  const existing = existingRows[0];

  if (!existing) {
    return { error: "This add-on no longer exists." };
  }

  const nextValues = {
    name: data.name,
    description: data.description || null,
    priceCents: dollarsToCents(data.price),
    imageUrl: data.imageUrl || null,
    isActive: data.isActive,
    displayOrder: data.displayOrder,
    packageId,
    isWeeklyExtension: data.isWeeklyExtension,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    if (data.isWeeklyExtension && packageId) {
      await tx
        .update(addOns)
        .set({ isWeeklyExtension: false })
        .where(and(eq(addOns.packageId, packageId), ne(addOns.id, addOnId)));
    }
    await tx.update(addOns).set(nextValues).where(eq(addOns.id, addOnId));
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ADDON_UPDATED",
    entityType: "add_on",
    entityId: addOnId,
    before: existing,
    after: nextValues,
  });

  revalidatePath("/admin/add-ons");
  revalidatePath("/");
  redirect("/admin/add-ons");
}

export async function toggleAddOnActiveAction(addOnId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(addOns).where(eq(addOns.id, addOnId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  const nextActive = !existing.isActive;
  await db
    .update(addOns)
    .set({ isActive: nextActive, updatedAt: new Date() })
    .where(eq(addOns.id, addOnId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: nextActive ? "ADDON_ACTIVATED" : "ADDON_DEACTIVATED",
    entityType: "add_on",
    entityId: addOnId,
  });

  revalidatePath("/admin/add-ons");
  revalidatePath("/");
}

export async function deleteAddOnAction(addOnId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(addOns).where(eq(addOns.id, addOnId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  // Orders snapshot an add-on's name/price at booking time, so a stale
  // reference here can't corrupt an order's own record. This check still
  // covers the one place an order keeps a live-ish reference (the weekly
  // extension add-on id) -- deactivating instead of deleting when any
  // order used this as its extension add-on, for a cleaner admin history.
  // (Other add-ons an order purchased live only in that order's jsonb
  // snapshot, which deleting this row can't affect.)
  const referencingOrder = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.weeklyExtensionAddOnId, addOnId))
    .limit(1);

  if (referencingOrder.length > 0) {
    await db
      .update(addOns)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(addOns.id, addOnId));

    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "ADDON_DEACTIVATED_INSTEAD_OF_DELETED",
      entityType: "add_on",
      entityId: addOnId,
      notes: "Used as a weekly extension on an existing order -- deactivated rather than deleted.",
    });

    revalidatePath("/admin/add-ons");
    revalidatePath("/");
    return;
  }

  await db.delete(addOns).where(eq(addOns.id, addOnId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ADDON_DELETED",
    entityType: "add_on",
    entityId: addOnId,
    before: existing,
  });

  revalidatePath("/admin/add-ons");
  revalidatePath("/");
}
