"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";

export type RealtorActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function createRealtorAction(
  _prevState: RealtorActionState,
  formData: FormData
): Promise<RealtorActionState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const db = getDb();
  const existing = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, parsed.data.email))
    .limit(1);
  if (existing.length > 0) {
    return { fieldErrors: { email: "An account with this email already exists." } };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const inserted = await db
    .insert(admins)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: "realtor",
    })
    .returning({ id: admins.id });
  const newId = inserted[0]?.id;

  if (!newId) {
    return { error: "We couldn't create this realtor account. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REALTOR_CREATED",
    entityType: "admin",
    entityId: newId,
    after: { name: parsed.data.name, email: parsed.data.email },
  });

  revalidatePath("/admin/realtors");
  redirect("/admin/realtors");
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  isActive: z.coerce.boolean(),
  newPassword: z.string().trim().optional().default(""),
});

export async function updateRealtorAction(
  realtorId: string,
  _prevState: RealtorActionState,
  formData: FormData
): Promise<RealtorActionState> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    isActive: formData.get("isActive"),
    newPassword: formData.get("newPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (parsed.data.newPassword && parsed.data.newPassword.length < 8) {
    return { fieldErrors: { newPassword: "Password must be at least 8 characters." } };
  }

  const db = getDb();

  const existingRows = await db
    .select()
    .from(admins)
    .where(eq(admins.id, realtorId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing || existing.role !== "realtor") {
    return { error: "This realtor account no longer exists." };
  }

  const emailTaken = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, parsed.data.email))
    .limit(1);
  if (emailTaken.length > 0 && emailTaken[0].id !== realtorId) {
    return { fieldErrors: { email: "Another account already uses this email." } };
  }

  const nextValues: Partial<typeof admins.$inferInsert> = {
    name: parsed.data.name,
    email: parsed.data.email,
    isActive: parsed.data.isActive,
    updatedAt: new Date(),
  };
  if (parsed.data.newPassword) {
    nextValues.passwordHash = await hashPassword(parsed.data.newPassword);
    nextValues.failedLoginAttempts = 0;
    nextValues.lockedUntil = null;
  }

  await db.update(admins).set(nextValues).where(eq(admins.id, realtorId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REALTOR_UPDATED",
    entityType: "admin",
    entityId: realtorId,
    before: { name: existing.name, email: existing.email, isActive: existing.isActive },
    after: { name: parsed.data.name, email: parsed.data.email, isActive: parsed.data.isActive },
    notes: parsed.data.newPassword ? "Password was reset." : undefined,
  });

  revalidatePath("/admin/realtors");
  redirect("/admin/realtors");
}

/**
 * Removes a realtor account. Hard-deletes it when nothing else references
 * it; if the realtor has history attached (a referral code, a gift card
 * issued to them, a subscription), that FK reference blocks the delete,
 * so this falls back to deactivating the account instead -- same end
 * result from the owner's point of view (they can no longer log in),
 * without silently breaking that history.
 */
export async function deleteRealtorAction(realtorId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db
    .select()
    .from(admins)
    .where(and(eq(admins.id, realtorId), eq(admins.role, "realtor")))
    .limit(1);
  const existing = rows[0];
  if (!existing) return;

  try {
    await db.delete(admins).where(eq(admins.id, realtorId));
    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "REALTOR_DELETED",
      entityType: "admin",
      entityId: realtorId,
      before: { name: existing.name, email: existing.email },
    });
  } catch {
    await db
      .update(admins)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(admins.id, realtorId));
    await writeAudit({
      actor: { type: "admin", id: admin.id, email: admin.email },
      action: "REALTOR_DEACTIVATED_INSTEAD_OF_DELETED",
      entityType: "admin",
      entityId: realtorId,
      notes:
        "Couldn't be hard-deleted -- this realtor has history attached (a referral code, gift card, or subscription), so they were deactivated instead.",
    });
  }

  revalidatePath("/admin/realtors");
  redirect("/admin/realtors");
}
