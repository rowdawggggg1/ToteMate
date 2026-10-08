import Link from "next/link";
import { createRealtorAction } from "../actions";
import { RealtorForm } from "../realtor-form";

export default function NewRealtorPage() {
  return (
    <div>
      <Link href="/admin/realtors" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Realtors
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">New Realtor</h1>
      <div className="mt-6">
        <RealtorForm action={createRealtorAction} submitLabel="Create Realtor" />
      </div>
    </div>
  );
}
