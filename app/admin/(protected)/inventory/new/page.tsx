import Link from "next/link";
import { NewToteForm } from "../new-tote-form";

export default function NewTotePage() {
  return (
    <div>
      <Link href="/admin/inventory" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Inventory
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Add Tote</h1>
      <div className="mt-6">
        <NewToteForm />
      </div>
    </div>
  );
}
