import Link from "next/link";
import { createDriverAction } from "../actions";
import { DriverForm } from "../driver-form";

export default function NewDriverPage() {
  return (
    <div>
      <Link href="/admin/drivers" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Drivers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">New Driver</h1>
      <div className="mt-6">
        <DriverForm action={createDriverAction} submitLabel="Create Driver" />
      </div>
    </div>
  );
}
