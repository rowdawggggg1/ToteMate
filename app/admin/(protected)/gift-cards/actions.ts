"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { giftCardDenominations, giftCards } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import { createGiftCard } from "@/lib/giftcards";
import { sendGiftCardPurchaseEmail } from "@/lib/email";

export type GiftCardActionState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

const issueSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than $0."),
  recipientName: z.string().trim().optional().default(""),
  recipientEmail: z.string().trim().email("Enter a valid email.").or(z.literal("")).default(""),
  notes: z.string().trim().optional().default(""),
});

/** Admin manually creates a free gift card (sourceType = "admin_issued"). */
export async function issueGiftCardAction(
  _prevState: GiftCardActionState,
  formData: FormData
): Promise<GiftCardActionState> {
  const admin = await requireAdmin();

  const parsed = issueSchema.safeParse({
    amount: formData.get("amount"),
    recipientName: formData.get("recipientName"),
    recipientEmail: formData.get("recipientEmail"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  const giftCard = await createGiftCard({
    amountCents: dollarsToCents(parsed.data.amount),
    sourceType: "admin_issued",
    recipientName: parsed.data.recipientName || null,
    recipientEmail: parsed.data.recipientEmail || null,
    notes: parsed.data.notes || null,
    createdByAdminId: admin.id,
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "GIFT_CARD_ISSUED",
    entityType: "gift_card",
    entityId: giftCard.id,
    after: { code: giftCard.code, amountCents: giftCard.initialValueCents },
  });

  if (giftCard.recipientEmail) {
    await sendGiftCardPurchaseEmail(giftCard).catch(() => {});
  }

  revalidatePath("/admin/gift-cards");
  return { success: true };
}

const denominationSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than $0."),
});

export async function addDenominationAction(
  _prevState: GiftCardActionState,
  formData: FormData
): Promise<GiftCardActionState> {
  const admin = await requireAdmin();
  const parsed = denominationSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid amount." };
  }

  const db = getDb();
  await db.insert(giftCardDenominations).values({
    amountCents: dollarsToCents(parsed.data.amount),
  });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "GIFT_CARD_DENOMINATION_ADDED",
    entityType: "gift_card_denomination",
    after: { amountCents: dollarsToCents(parsed.data.amount) },
  });

  revalidatePath("/admin/gift-cards");
  return { success: true };
}

export async function toggleDenominationAction(
  denominationId: string,
  isActive: boolean,
  _formData: FormData
): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();
  await db
    .update(giftCardDenominations)
    .set({ isActive })
    .where(eq(giftCardDenominations.id, denominationId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: isActive ? "GIFT_CARD_DENOMINATION_ENABLED" : "GIFT_CARD_DENOMINATION_DISABLED",
    entityType: "gift_card_denomination",
    entityId: denominationId,
  });

  revalidatePath("/admin/gift-cards");
}

export async function disableGiftCardAction(giftCardId: string, _formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();
  await db.update(giftCards).set({ status: "disabled", updatedAt: new Date() }).where(eq(giftCards.id, giftCardId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "GIFT_CARD_DISABLED",
    entityType: "gift_card",
    entityId: giftCardId,
  });

  revalidatePath("/admin/gift-cards");
}
