import Link from "next/link";

export function SiteFooter({
  businessName,
  contactEmail,
  contactPhone,
  serviceArea,
}: {
  businessName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  serviceArea: string | null;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="font-serif text-lg font-semibold text-[var(--color-text)]">
              {businessName}
            </p>
            {serviceArea && (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Serving {serviceArea}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <Link href="/#how-it-works" className="text-[var(--color-text)] hover:underline">
              How It Works
            </Link>
            <Link href="/#packages" className="text-[var(--color-text)] hover:underline">
              Packages
            </Link>
            <Link href="/#faq" className="text-[var(--color-text)] hover:underline">
              FAQ
            </Link>
            <Link href="/realtors" className="text-[var(--color-text)] hover:underline">
              Realtors
            </Link>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {contactEmail && (
              <a href={`mailto:${contactEmail}`} className="text-[var(--color-text)] hover:underline">
                {contactEmail}
              </a>
            )}
            {contactPhone && (
              <a href={`tel:${contactPhone}`} className="text-[var(--color-text)] hover:underline">
                {contactPhone}
              </a>
            )}
            <Link
              href="/book"
              className="mt-2 inline-block w-fit rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
            >
              Book Now
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-[var(--color-muted)]">
          © {year} {businessName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
