"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { realtorSubscriptionTiers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import { syncStripeTierProduct } from "@/lib/realtor-subscriptions";

export type TierActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const tierSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().optional().default(""),
  cadenceInterval: z.enum(["month", "year"]),
  giftCardValue: z.coerce.number().positive("Enter an amount greater than $0."),
  price: z.coerce.number().positive("Enter an amount greater than $0."),
  isActive: z.coerce.boolean(),
});

export async function createTierAction(
  _prevState: TierActionState,
  formData: FormData
): Promise<TierActionState> {
  const admin = await requireAdmin();
  const parsed = tierSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    cadenceInterval: formData.get("cadenceInterval"),
    giftCardValue: formData.get("giftCardValue"),
    price: formData.get("price"),
    isActive: formData.get("isActive"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  const db = getDb();
  const inserted = await db
    .insert(realtorSubscriptionTiers)
    .values({
      name: parsed.data.name,
      description: parsed.data.description || null,
      cadenceInterval: parsed.data.cadenceInterval,
      giftCardValueCents: dollarsToCents(parsed.data.giftCardValue),
      priceCents: dollarsToCents(parsed.data.price),
      isActive: parsed.data.isActive,
    })
    .returning();
  const tier = inserted[0];
  if (!tier) return { error: "We couldn't create this tier. Please try again." };

  // Create the Stripe Product + Price now so the tier is immediately
  // subscribable -- never leave a tier half-configured if this fails.
  try {
    const { stripeProductId, stripePriceId } = await syncStripeTierProduct(tier);
    await db
      .update(realtorSubscriptionTiers)
      .set({ stripeProductId, stripePriceId })
      .where(eq(realtorSubscriptionTiers.id, tier.id));
  } catch (err) {
    return {
      error:
        "Tier saved, but Stripe setup failed: " +
        (err instanceof Error ? err.message : "please check your Stripe configuration.") +
        " Edit and save the tier again once that's fixed.",
    };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REALTOR_TIER_CREATED",
    entityType: "realtor_subscription_tier",
    entityId: tier.id,
    after: parsed.data,
  });

  revalidatePath("/admin/realtor-tiers");
  redirect("/admin/realtor-tiers");
}

export async function updateTierAction(
  tierId: string,
  _prevState: TierActionState,
  formData: FormData
): Promise<TierActionState> {
  const admin = await requireAdmin();
  const parsed = tierSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    cadenceInterval: formData.get("cadenceInterval"),
    giftCardValue: formData.get("giftCardValue"),
    price: formData.get("price"),
    isActive: formData.get("isActive"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  const db = getDb();
  const existingRows = await db
    .select()
    .from(realtorSubscriptionTiers)
    .where(eq(realtorSubscriptionTiers.id, tierId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return { error: "This tier no longer exists." };

  const priceOrCadenceChanged =
    existing.priceCents !== dollarsToCents(parsed.data.price) ||
    existing.cadenceInterval !== parsed.data.cadenceInterval;

  const nextValues = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    cadenceInterval: parsed.data.cadenceInterval,
    giftCardValueCents: dollarsToCents(parsed.data.giftCardValue),
    priceCents: dollarsToCents(parsed.data.price),
    isActive: parsed.data.isActive,
    updatedAt: new Date(),
  };

  await db.update(realtorSubscriptionTiers).set(nextValues).where(eq(realtorSubscriptionTiers.id, tierId));

  // Only hits Stripe when something price-relevant actually changed --
  // Prices are immutable in Stripe, so this creates a new one and retires
  // the old one (syncStripeTierProduct). Existing subscribers keep paying
  // their original price until they resubscribe; that's a deliberate,
  // practical trade-off rather than force-migrating anyone mid-cycle.
  try {
    const { stripeProductId, stripePriceId } = await syncStripeTierProduct(
      { ...existing, ...nextValues },
      priceOrCadenceChanged
    );
    await db
      .update(realtorSubscriptionTiers)
      .set({ stripeProductId, stripePriceId })
      .where(eq(realtorSubscriptionTiers.id, tierId));
  } catch (err) {
    return {
      error:
        "Saved, but updating Stripe failed: " +
        (err instanceof Error ? err.message : "please check your Stripe configuration."),
    };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REALTOR_TIER_UPDATED",
    entityType: "realtor_subscription_tier",
    entityId: tierId,
    before: existing,
    after: nextValues,
  });

  revalidatePath("/admin/realtor-tiers");
  redirect("/admin/realtor-tiers");
}
