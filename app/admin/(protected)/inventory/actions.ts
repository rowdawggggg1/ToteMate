"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { totes } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { TOTE_STATUSES } from "./tote-statuses";

export type ToteActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const createSchema = z.object({
  number: z.string().trim().min(1, "A tote number is required."),
  notes: z.string().trim().optional().default(""),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createToteAction(
  _prevState: ToteActionState,
  formData: FormData
): Promise<ToteActionState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    number: formData.get("number"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const db = getDb();
  const inserted = await db
    .insert(totes)
    .values({
      number: parsed.data.number,
      notes: parsed.data.notes || null,
      status: "ready",
    })
    .returning({ id: totes.id });
  const newId = inserted[0]?.id;

  if (!newId) {
    return { error: "We couldn't add this tote. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "TOTE_CREATED",
    entityType: "tote",
    entityId: newId,
    after: parsed.data,
  });

  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}

const updateSchema = z.object({
  status: z.enum(TOTE_STATUSES),
  notes: z.string().trim().optional().default(""),
});

export async function updateToteAction(
  toteId: string,
  _prevState: ToteActionState,
  formData: FormData
): Promise<ToteActionState> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse({
    status: formData.get("status"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const db = getDb();
  const existingRows = await db.select().from(totes).where(eq(totes.id, toteId)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    return { error: "This tote no longer exists." };
  }

  const nextValues = {
    status: parsed.data.status,
    notes: parsed.data.notes || null,
    // Only "retired" records a retirement timestamp; moving a tote back out
    // of "retired" clears it, since it's active fleet again.
    retiredAt: parsed.data.status === "retired" ? existing.retiredAt ?? new Date() : null,
    updatedAt: new Date(),
  };

  await db.update(totes).set(nextValues).where(eq(totes.id, toteId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "TOTE_UPDATED",
    entityType: "tote",
    entityId: toteId,
    before: existing,
    after: nextValues,
  });

  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}

const replaceSchema = z.object({
  reason: z.string().trim().optional().default(""),
});

/**
 * Replaces a physical tote: creates a brand-new tote row carrying the same
 * business-facing number (so the number the business always calls it by
 * stays the same), linked back via replacesToteId, and retires the old
 * physical unit -- preserving its historical rental count / profit
 * attribution rather than deleting it (Section 19).
 */
export async function replaceToteAction(
  oldToteId: string,
  _prevState: ToteActionState,
  formData: FormData
): Promise<ToteActionState> {
  const admin = await requireAdmin();
  const parsed = replaceSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const db = getDb();
  let newId: string | null = null;

  await db.transaction(async (tx) => {
    const existingRows = await tx.select().from(totes).where(eq(totes.id, oldToteId)).limit(1);
    const existing = existingRows[0];
    if (!existing) return;

    const retirementNote = parsed.data.reason
      ? `Replaced: ${parsed.data.reason}`
      : "Replaced with a new physical tote.";

    await tx
      .update(totes)
      .set({
        status: existing.status === "lost" ? "lost" : "retired",
        retiredAt: existing.retiredAt ?? new Date(),
        notes: existing.notes ? `${existing.notes}\n${retirementNote}` : retirementNote,
        updatedAt: new Date(),
      })
      .where(eq(totes.id, oldToteId));

    const inserted = await tx
      .insert(totes)
      .values({
        number: existing.number,
        status: "ready",
        replacesToteId: existing.id,
      })
      .returning({ id: totes.id });

    newId = inserted[0]?.id ?? null;
  });

  if (!newId) {
    return { error: "We couldn't replace this tote. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "TOTE_REPLACED",
    entityType: "tote",
    entityId: newId,
    notes: `Replaces tote ${oldToteId}`,
  });

  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}
