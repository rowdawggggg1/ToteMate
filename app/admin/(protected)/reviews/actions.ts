"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";

async function getReviewOr404(reviewId: string) {
  const db = getDb();
  const rows = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
  return rows[0] ?? null;
}

export async function approveReviewAction(reviewId: string): Promise<void> {
  const admin = await requireAdmin();
  const review = await getReviewOr404(reviewId);
  if (!review) return;

  const db = getDb();
  await db
    .update(reviews)
    .set({ status: "approved", moderatedAt: new Date(), moderatedByAdminId: admin.id, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REVIEW_APPROVED",
    entityType: "review",
    entityId: reviewId,
  });

  revalidatePath("/admin/reviews");
  revalidatePath("/");
}

export async function rejectReviewAction(reviewId: string): Promise<void> {
  const admin = await requireAdmin();
  const review = await getReviewOr404(reviewId);
  if (!review) return;

  const db = getDb();
  await db
    .update(reviews)
    .set({ status: "rejected", moderatedAt: new Date(), moderatedByAdminId: admin.id, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REVIEW_REJECTED",
    entityType: "review",
    entityId: reviewId,
  });

  revalidatePath("/admin/reviews");
  revalidatePath("/");
}

/** The "take it away if needed" toggle -- independent of approve/reject,
 * so a previously-approved review can be pulled from public view (and put
 * back) without re-running moderation. Only meaningful for an approved
 * review (a pending/rejected one never shows publicly regardless), but
 * harmless to call either way. */
export async function toggleReviewPublicAction(reviewId: string): Promise<void> {
  const admin = await requireAdmin();
  const review = await getReviewOr404(reviewId);
  if (!review) return;

  const db = getDb();
  const nextPublic = !review.isPublic;
  await db
    .update(reviews)
    .set({ isPublic: nextPublic, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: nextPublic ? "REVIEW_SHOWN_PUBLICLY" : "REVIEW_HIDDEN_PUBLICLY",
    entityType: "review",
    entityId: reviewId,
  });

  revalidatePath("/admin/reviews");
  revalidatePath("/");
}

export async function deleteReviewAction(reviewId: string): Promise<void> {
  const admin = await requireAdmin();
  const review = await getReviewOr404(reviewId);
  if (!review) return;

  const db = getDb();
  await db.delete(reviews).where(eq(reviews.id, reviewId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REVIEW_DELETED",
    entityType: "review",
    entityId: reviewId,
    before: review,
  });

  revalidatePath("/admin/reviews");
  revalidatePath("/");
}
