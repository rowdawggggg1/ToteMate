import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { realtorSubscriptionTiers } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function RealtorTiersPage() {
  const db = getDb();
  const tiers = await db
    .select()
    .from(realtorSubscriptionTiers)
    .orderBy(asc(realtorSubscriptionTiers.displayOrder), asc(realtorSubscriptionTiers.priceCents));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Realtor subscription tiers</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Each tier gives a subscribed realtor a recurring gift card at a discounted price.
            Saving a tier automatically creates/updates its Stripe Product and Price.
          </p>
        </div>
        <Link
          href="/admin/realtor-tiers/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New Tier
        </Link>
      </div>

      {tiers.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No subscription tiers yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {tiers.map((tier) => (
            <li key={tier.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/realtor-tiers/${tier.id}`}
                  className="font-medium text-[var(--color-text)] hover:underline"
                >
                  {tier.name}
                </Link>
                <p className="text-sm text-[var(--color-muted)]">
                  ${centsToDollarsString(tier.priceCents)}/{tier.cadenceInterval} for a $
                  {centsToDollarsString(tier.giftCardValueCents)} gift card
                </p>
              </div>
              <span
                className={
                  tier.isActive
                    ? "shrink-0 rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                    : "shrink-0 rounded-full bg-[var(--color-muted)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]"
                }
              >
                {tier.isActive ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
