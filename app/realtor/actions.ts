"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { realtorSubscriptionTiers } from "@/lib/db/schema";
import { requireRealtor } from "@/lib/auth/admin";
import {
  cancelRealtorSubscriptionAtPeriodEnd,
  createRealtorSubscriptionCheckoutUrl,
} from "@/lib/realtor-subscriptions";
import { createGiftCardPurchaseCheckoutUrl } from "@/lib/giftcards";

export type RealtorActionState = {
  error?: string;
};

/** Absolute origin for Stripe Checkout success/cancel URLs -- best-effort from env, falls back to a relative-safe default. */
function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
}

export async function subscribeToTierAction(
  tierId: string,
  _prevState: RealtorActionState,
  _formData: FormData
): Promise<RealtorActionState> {
  const realtor = await requireRealtor();
  const db = getDb();
  const rows = await db
    .select()
    .from(realtorSubscriptionTiers)
    .where(eq(realtorSubscriptionTiers.id, tierId))
    .limit(1);
  const tier = rows[0];
  if (!tier || !tier.isActive) {
    return { error: "That subscription tier isn't available." };
  }

  let url: string;
  try {
    url = await createRealtorSubscriptionCheckoutUrl({
      realtorId: realtor.id,
      realtorEmail: realtor.email,
      tier,
      successUrl: `${siteOrigin()}/realtor?subscribed=1`,
      cancelUrl: `${siteOrigin()}/realtor`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start checkout. Please try again." };
  }

  redirect(url);
}

export async function cancelSubscriptionAction(): Promise<void> {
  const realtor = await requireRealtor();
  await cancelRealtorSubscriptionAtPeriodEnd(realtor.id);
}

const giftCardPurchaseSchema = z.object({
  amount: z.coerce.number().positive("Choose an amount."),
  recipientName: z.string().trim().optional().default(""),
  recipientEmail: z.string().trim().email("Enter a valid email.").or(z.literal("")).default(""),
});

export async function purchaseGiftCardAction(
  _prevState: RealtorActionState,
  formData: FormData
): Promise<RealtorActionState> {
  const realtor = await requireRealtor();
  const parsed = giftCardPurchaseSchema.safeParse({
    amount: formData.get("amount"),
    recipientName: formData.get("recipientName"),
    recipientEmail: formData.get("recipientEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  let url: string;
  try {
    url = await createGiftCardPurchaseCheckoutUrl({
      amountCents: Math.round(parsed.data.amount * 100),
      purchasedByName: realtor.name,
      purchasedByEmail: realtor.email,
      recipientName: parsed.data.recipientName || undefined,
      recipientEmail: parsed.data.recipientEmail || undefined,
      successUrl: `${siteOrigin()}/realtor?purchased=1`,
      cancelUrl: `${siteOrigin()}/realtor`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start checkout. Please try again." };
  }
  redirect(url);
}
