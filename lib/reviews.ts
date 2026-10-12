/**
 * Patch 4: reviews. An order can be reviewed once it's essentially done
 * (picked_up or completed) -- a review request is a one-time-use token
 * (same opaque-token-hash pattern as the "Manage My Booking" link) emailed
 * to the customer, either automatically when the order is marked
 * completed (if businessSettings.reviewAutoRequestEnabled) or manually
 * from the order page any time after that. The review itself only gets
 * written once the customer actually submits it; moderation (approve/
 * reject, and a separate isPublic toggle) happens in Admin -> Reviews.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, reviews } from "@/lib/db/schema";
import { generateManageToken, hashManageToken } from "@/lib/manage-token";

export type OrderRow = typeof orders.$inferSelect;

/** An order is eligible for a review request once the rental is
 * essentially over -- no need to wait for the fully-wrapped-up
 * "completed" status (tote cleaning/inventory release), just that the
 * totes are back. */
const REVIEWABLE_STATUSES = ["picked_up", "completed"];

export function canRequestReview(order: OrderRow): boolean {
  return REVIEWABLE_STATUSES.includes(order.status) && !order.reviewSubmittedAt;
}

export type RequestReviewResult = { ok: true; reviewToken: string } | { ok: false; error: string };

/**
 * Generates a fresh review-request token for an order and stores its hash
 * -- called both by the automatic send (markCompletedAction) and the
 * manual "Request Review" / "Resend" action. Safe to call again on an
 * order that already has a token (e.g. a resend); the old token is simply
 * replaced and stops working.
 */
export async function createReviewRequest(order: OrderRow): Promise<RequestReviewResult> {
  if (!canRequestReview(order)) {
    return { ok: false, error: "This order isn't eligible for a review request yet." };
  }

  const reviewToken = generateManageToken();
  const db = getDb();
  await db
    .update(orders)
    .set({
      reviewTokenHash: hashManageToken(reviewToken),
      reviewRequestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  return { ok: true, reviewToken };
}

export type SubmitReviewInput = {
  orderId: string;
  token: string;
  rating: number;
  comment: string;
  customerName: string;
  isAnonymous: boolean;
};

export type SubmitReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const db = getDb();
  const orderRows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  const order = orderRows[0];
  if (!order) return { ok: false, error: "Order not found." };
  if (!order.reviewTokenHash || hashManageToken(input.token) !== order.reviewTokenHash) {
    return { ok: false, error: "This review link is invalid." };
  }
  if (order.reviewSubmittedAt) {
    return { ok: false, error: "A review has already been submitted for this order." };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  }

  const inserted = await db
    .insert(reviews)
    .values({
      orderId: order.id,
      customerName: input.isAnonymous ? null : input.customerName.trim() || null,
      isAnonymous: input.isAnonymous,
      rating: input.rating,
      comment: input.comment.trim() || null,
    })
    .onConflictDoNothing({ target: reviews.orderId })
    .returning({ id: reviews.id });

  if (!inserted[0]) {
    return { ok: false, error: "A review has already been submitted for this order." };
  }

  await db
    .update(orders)
    .set({ reviewSubmittedAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  return { ok: true };
}

export type PublicReviewSummary = { averageRating: number; count: number };

/** Aggregate used for the public "4.8 ★ from 23 reviews" style summary --
 * only ever counts reviews that are BOTH approved and still toggled
 * public, so a review the owner pulls back out of public view also drops
 * out of the average immediately. */
export async function getPublicReviewSummary(): Promise<PublicReviewSummary> {
  const db = getDb();
  const rows = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(and(eq(reviews.status, "approved"), eq(reviews.isPublic, true)));
  if (rows.length === 0) return { averageRating: 0, count: 0 };
  const sum = rows.reduce((acc, r) => acc + r.rating, 0);
  return { averageRating: sum / rows.length, count: rows.length };
}

export async function getPublicReviews(limit = 12) {
  const db = getDb();
  return db
    .select()
    .from(reviews)
    .where(and(eq(reviews.status, "approved"), eq(reviews.isPublic, true)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}
