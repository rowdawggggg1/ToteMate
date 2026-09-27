import Link from "next/link";
import { centsToDollarsString } from "@/lib/money";

export type PublicPackage = {
  id: string;
  name: string;
  description: string | null;
  toteQuantity: number;
  priceCents: number;
  rentalDurationWeeks: number;
  includesDolly: boolean;
  useCaseDescription: string | null;
  isFeatured: boolean;
};

export function PackageCard({ pkg }: { pkg: PublicPackage }) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-[var(--color-surface)] p-6 shadow-sm ${
        pkg.isFeatured
          ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
          : "border-[var(--color-border)]"
      }`}
    >
      {pkg.isFeatured && (
        <span className="absolute -top-3 left-6 rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white">
          Most Popular
        </span>
      )}

      <h3 className="text-lg font-semibold text-[var(--color-text)]">{pkg.name}</h3>

      <p className="mt-2 text-3xl font-semibold text-[var(--color-text)]">
        ${centsToDollarsString(pkg.priceCents)}
      </p>
      <p className="text-sm text-[var(--color-muted)]">
        {pkg.rentalDurationWeeks} week{pkg.rentalDurationWeeks === 1 ? "" : "s"} rental
      </p>

      <ul className="mt-4 space-y-1.5 text-sm text-[var(--color-text)]">
        <li>{pkg.toteQuantity} reusable totes</li>
        <li>{pkg.includesDolly ? "Dolly included" : "Dolly not included"}</li>
        <li>Delivery & pickup calculated at checkout</li>
      </ul>

      {pkg.useCaseDescription && (
        <p className="mt-4 text-sm text-[var(--color-muted)]">{pkg.useCaseDescription}</p>
      )}
      {pkg.description && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">{pkg.description}</p>
      )}

      <Link
        href={`/book?package=${pkg.id}`}
        className="mt-6 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-center text-sm font-medium text-white"
      >
        Book Now
      </Link>
    </div>
  );
}
