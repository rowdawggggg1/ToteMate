import Link from "next/link";
import { createPackageAction } from "../actions";
import { PackageForm } from "../package-form";

export default function NewPackagePage() {
  return (
    <div>
      <Link
        href="/admin/packages"
        className="text-sm text-[var(--color-muted)] hover:underline"
      >
        ← Packages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
        New Package
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        New packages start inactive so they can't accidentally be booked before
        you're ready.
      </p>
      <div className="mt-6">
        <PackageForm action={createPackageAction} submitLabel="Create Package" />
      </div>
    </div>
  );
}
