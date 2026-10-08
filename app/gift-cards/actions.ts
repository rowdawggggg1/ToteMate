"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createGiftCardPurchaseCheckoutUrl } from "@/lib/giftcards";

export type GiftCardPurchaseActionState = {
  error?: string;
};

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
}

const schema = z.object({
  amountCents: z.coerce.number().int().positive(),
  purchasedByName: z.string().trim().min(1, "Enter your name."),
  purchasedByEmail: z.string().trim().email("Enter a valid email."),
  recipientName: z.string().trim().optional().default(""),
  recipientEmail: z.string().trim().email("Enter a valid email.").or(z.literal("")).default(""),
});

/**
 * Public gift-card purchase (full price, sourceType "purchased"). Never
 * trusts the amount from a hidden form field alone to set a price --
 * redirects straight into Stripe Checkout, which is the actual charge;
 * the gift card itself is only created once Stripe confirms payment (see
 * the webhook's handleCheckoutSessionCompleted).
 */
export async function purchaseGiftCardAction(
  _prevState: GiftCardPurchaseActionState,
  formData: FormData
): Promise<GiftCardPurchaseActionState> {
  const parsed = schema.safeParse({
    amountCents: formData.get("amountCents"),
    purchasedByName: formData.get("purchasedByName"),
    purchasedByEmail: formData.get("purchasedByEmail"),
    recipientName: formData.get("recipientName"),
    recipientEmail: formData.get("recipientEmail"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  let url: string;
  try {
    url = await createGiftCardPurchaseCheckoutUrl({
      amountCents: parsed.data.amountCents,
      purchasedByName: parsed.data.purchasedByName,
      purchasedByEmail: parsed.data.purchasedByEmail,
      recipientName: parsed.data.recipientName || undefined,
      recipientEmail: parsed.data.recipientEmail || undefined,
      successUrl: `${siteOrigin()}/gift-cards?purchased=1`,
      cancelUrl: `${siteOrigin()}/gift-cards`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start checkout. Please try again." };
  }

  redirect(url);
}
