"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { blockedDates } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";

const blockedDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  reason: z.string().trim().optional().default(""),
});

export type BlockedDateActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createBlockedDateAction(
  _prevState: BlockedDateActionState,
  formData: FormData
): Promise<BlockedDateActionState> {
  const admin = await requireAdmin();

  const parsed = blockedDateSchema.safeParse({
    date: formData.get("date"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const db = getDb();

  let newId: string | undefined;
  try {
    const inserted = await db
      .insert(blockedDates)
      .values({ date: parsed.data.date, reason: parsed.data.reason || null })
      .returning({ id: blockedDates.id });
    newId = inserted[0]?.id;
  } catch {
    // Most likely the unique constraint on date -- that date is already blocked.
    return { error: "That date is already blocked." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "BLOCKED_DATE_CREATED",
    entityType: "blocked_date",
    entityId: newId,
    after: parsed.data,
  });

  revalidatePath("/admin/blocked-dates");
  return {};
}

export async function deleteBlockedDateAction(blockedDateId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db
    .select()
    .from(blockedDates)
    .where(eq(blockedDates.id, blockedDateId))
    .limit(1);
  const existing = rows[0];
  if (!existing) return;

  await db.delete(blockedDates).where(eq(blockedDates.id, blockedDateId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "BLOCKED_DATE_DELETED",
    entityType: "blocked_date",
    entityId: blockedDateId,
    before: existing,
  });

  revalidatePath("/admin/blocked-dates");
}
