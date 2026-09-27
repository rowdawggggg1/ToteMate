"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { faqs } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";

const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required."),
  answer: z.string().trim().min(1, "Answer is required."),
  displayOrder: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean(),
});

export type FaqActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseFaqForm(formData: FormData) {
  return faqSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive"),
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

export async function createFaqAction(
  _prevState: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  const admin = await requireAdmin();
  const parsed = parseFaqForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = parsed.data;
  const db = getDb();

  const inserted = await db.insert(faqs).values(data).returning({ id: faqs.id });
  const newId = inserted[0]?.id;

  if (!newId) {
    return { error: "We couldn't create this FAQ. Please try again." };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "FAQ_CREATED",
    entityType: "faq",
    entityId: newId,
    after: data,
  });

  revalidatePath("/admin/faqs");
  revalidatePath("/");
  redirect("/admin/faqs");
}

export async function updateFaqAction(
  faqId: string,
  _prevState: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  const admin = await requireAdmin();
  const parsed = parseFaqForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = parsed.data;
  const db = getDb();

  const existingRows = await db.select().from(faqs).where(eq(faqs.id, faqId)).limit(1);
  const existing = existingRows[0];

  if (!existing) {
    return { error: "This FAQ no longer exists." };
  }

  const nextValues = { ...data, updatedAt: new Date() };

  await db.update(faqs).set(nextValues).where(eq(faqs.id, faqId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "FAQ_UPDATED",
    entityType: "faq",
    entityId: faqId,
    before: existing,
    after: nextValues,
  });

  revalidatePath("/admin/faqs");
  revalidatePath("/");
  redirect("/admin/faqs");
}

export async function toggleFaqActiveAction(faqId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(faqs).where(eq(faqs.id, faqId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  const nextActive = !existing.isActive;
  await db
    .update(faqs)
    .set({ isActive: nextActive, updatedAt: new Date() })
    .where(eq(faqs.id, faqId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: nextActive ? "FAQ_ACTIVATED" : "FAQ_DEACTIVATED",
    entityType: "faq",
    entityId: faqId,
  });

  revalidatePath("/admin/faqs");
  revalidatePath("/");
}

export async function deleteFaqAction(faqId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const rows = await db.select().from(faqs).where(eq(faqs.id, faqId)).limit(1);
  const existing = rows[0];
  if (!existing) return;

  await db.delete(faqs).where(eq(faqs.id, faqId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "FAQ_DELETED",
    entityType: "faq",
    entityId: faqId,
    before: existing,
  });

  revalidatePath("/admin/faqs");
  revalidatePath("/");
}
