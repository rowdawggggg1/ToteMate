"use server";

import { revalidatePath } from "next/cache";
import { submitReview } from "@/lib/reviews";

export type SubmitReviewFormState = { ok: boolean; error?: string };

export async function submitReviewFormAction(
  orderId: string,
  token: string,
  _prevState: SubmitReviewFormState,
  formData: FormData
): Promise<SubmitReviewFormState> {
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "");
  const isAnonymous = formData.get("isAnonymous") === "on";
  const customerName = String(formData.get("customerName") ?? "");

  const result = await submitReview({ orderId, token, rating, comment, customerName, isAnonymous });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/review/${orderId}`);
  return { ok: true };
}
