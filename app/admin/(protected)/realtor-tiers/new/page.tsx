import Link from "next/link";
import { createTierAction } from "../actions";
import { TierForm } from "../tier-form";

export default function NewTierPage() {
  return (
    <div>
      <Link href="/admin/realtor-tiers" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Subscription Tiers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">New Tier</h1>
      <div className="mt-6">
        <TierForm action={createTierAction} submitLabel="Create Tier" />
      </div>
    </div>
  );
}
