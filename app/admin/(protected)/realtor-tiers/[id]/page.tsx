import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { realtorSubscriptionTiers } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { updateTierAction } from "../actions";
import { TierForm, type TierFormValues } from "../tier-form";

export const dynamic = "force-dynamic";

export default async function EditTierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select()
    .from(realtorSubscriptionTiers)
    .where(eq(realtorSubscriptionTiers.id, id))
    .limit(1);
  const tier = rows[0];

  if (!tier) {
    notFound();
  }

  const initialValues: TierFormValues = {
    name: tier.name,
    description: tier.description ?? "",
    cadenceInterval: tier.cadenceInterval as "month" | "year",
    giftCardValue: centsToDollarsString(tier.giftCardValueCents),
    price: centsToDollarsString(tier.priceCents),
    isActive: tier.isActive,
  };

  const boundAction = updateTierAction.bind(null, tier.id);

  return (
    <div>
      <Link href="/admin/realtor-tiers" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Subscription Tiers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Edit Tier</h1>
      <div className="mt-6">
        <TierForm initialValues={initialValues} action={boundAction} submitLabel="Save Changes" />
      </div>
    </div>
  );
}
