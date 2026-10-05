import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { getActiveFaqs, getActivePackages } from "@/lib/catalog";
import { buildPublicThemeStyle } from "@/lib/theme";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { PackageCard } from "@/components/public/package-card";

export const dynamic = "force-dynamic";

const HOW_IT_WORKS = [
  {
    title: "Choose your package",
    description: "Pick the tote package that fits the size of your move.",
  },
  {
    title: "We deliver",
    description: "We drop the totes off at your place on your chosen day.",
  },
  {
    title: "You pack & move",
    description: "Pack up without wrestling with piles of cardboard boxes.",
  },
  {
    title: "We pick them up",
    description: "Once you're done, we come collect the totes -- no breakdown required.",
  },
  { title: "Done", description: "That's it. No boxes to flatten or haul to recycling." },
];

const BENEFITS = [
  { title: "Reusable", description: "The same totes go out again and again instead of being thrown away after one move." },
  { title: "Sturdy", description: "Built to hold up to real moving day, not just sit on a shelf." },
  { title: "Waterproof", description: "No soggy bottoms if it's raining on moving day." },
  { title: "Stackable", description: "Uniform totes stack cleanly in a truck, trailer, or hallway." },
];

export default async function HomePage() {
  let settings: typeof businessSettings.$inferSelect | undefined;
  let packages: Awaited<ReturnType<typeof getActivePackages>> = [];
  let faqs: Awaited<ReturnType<typeof getActiveFaqs>> = [];
  let loadError = false;

  try {
    const db = getDb();
    const [settingsRows, packageRows, faqRows] = await Promise.all([
      db.select().from(businessSettings).where(eq(businessSettings.id, 1)).limit(1),
      getActivePackages(),
      getActiveFaqs(),
    ]);
    settings = settingsRows[0];
    packages = packageRows;
    faqs = faqRows;
  } catch {
    loadError = true;
  }

  const businessName = settings?.businessName ?? "ToteMate";
  const tagline = settings?.tagline;
  const contactEmail = settings?.contactEmail ?? null;
  const contactPhone = settings?.contactPhone ?? null;
  const serviceArea = settings?.serviceArea ?? null;
  const logoUrl = settings?.logoUrl ?? null;
  const heroImageUrl = settings?.heroImageUrl ?? null;
  const themeStyle = buildPublicThemeStyle(settings);

  return (
    <div
      style={themeStyle}
      className="flex min-h-screen flex-col bg-[var(--color-background)]"
    >
      <SiteHeader businessName={businessName} logoUrl={logoUrl} />

      <main className="flex-1">
        {loadError && (
          <div className="bg-[var(--color-warning)]/10 px-4 py-3 text-center text-sm text-[var(--color-warning)]">
            Something went wrong while loading the page. Please refresh, or contact us
            if the problem continues.
          </div>
        )}

        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <span className="inline-block rounded-full bg-[var(--color-accent)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              Reusable moving totes
            </span>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-[var(--color-text)] sm:text-5xl">
              Move smarter, skip the cardboard
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[var(--color-muted)] lg:mx-0">
              {tagline ??
                "We deliver sturdy, reusable moving totes to your door and pick them up when you're done -- no cardboard required."}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <a
                href="/book"
                className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white"
              >
                Book Now
              </a>
              <a
                href="#how-it-works"
                className="rounded-lg border border-[var(--color-border)] px-6 py-3 text-sm font-medium text-[var(--color-text)]"
              >
                See How It Works
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted)] lg:justify-start">
              <span>✓ Delivered &amp; picked up</span>
              <span>✓ Waterproof &amp; stackable</span>
              <span>✓ Nothing to break down</span>
            </div>
          </div>

          <div className="relative">
            {heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-provided external URL
              <img
                src={heroImageUrl}
                alt={`${businessName} totes`}
                className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg"
              />
            ) : (
              <ToteStackIllustration className="aspect-[4/3] w-full rounded-3xl bg-[var(--color-surface)] shadow-lg" />
            )}
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center font-serif text-3xl font-semibold text-[var(--color-text)]">
              How It Works
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-5">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={step.title} className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white">
                    {i + 1}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-[var(--color-text)]">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Packages */}
        <section id="packages" className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center font-serif text-3xl font-semibold text-[var(--color-text)]">
              Packages & Pricing
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[var(--color-muted)]">
              Delivery and pickup pricing is calculated based on your location and shown
              before you pay.
            </p>

            {packages.length === 0 ? (
              <p className="mt-10 text-center text-sm text-[var(--color-muted)]">
                Packages are currently being updated. Please contact us for availability.
              </p>
            ) : (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Benefits */}
        <section className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center font-serif text-3xl font-semibold text-[var(--color-text)]">
              Why Reusable Totes
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map((benefit) => (
                <div key={benefit.title} className="rounded-2xl border border-[var(--color-border)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">
                    {benefit.title}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service area */}
        {serviceArea && (
          <section className="py-16">
            <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
              <h2 className="font-serif text-2xl font-semibold text-[var(--color-text)]">
                Where We Serve
              </h2>
              <p className="mt-2 text-[var(--color-muted)]">Serving {serviceArea}.</p>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="faq" className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <h2 className="text-center font-serif text-3xl font-semibold text-[var(--color-text)]">
              Frequently Asked Questions
            </h2>
            {faqs.length === 0 ? (
              <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
                No FAQs published yet.
              </p>
            ) : (
              <div className="mt-8">
                {faqs.map((faq) => (
                  <details
                    key={faq.id}
                    className="group border-b border-[var(--color-border)] py-4 [&::-webkit-details-marker]:hidden"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-[var(--color-text)]">
                      {faq.question}
                      <span className="shrink-0 text-xl leading-none text-[var(--color-muted)] transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{faq.answer}</p>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Contact */}
        {(contactEmail || contactPhone) && (
          <section id="contact" className="py-16">
            <div className="mx-auto max-w-xl px-4 text-center sm:px-6">
              <h2 className="font-serif text-2xl font-semibold text-[var(--color-text)]">
                Still have questions?
              </h2>
              <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
                {contactEmail && (
                  <a
                    href={`mailto:${contactEmail}`}
                    className="rounded-lg border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)]"
                  >
                    Email Us
                  </a>
                )}
                {contactPhone && (
                  <a
                    href={`sms:${contactPhone}`}
                    className="rounded-lg border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)]"
                  >
                    Text Us
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="border-t border-[var(--color-border)] bg-[var(--color-primary)] py-16 text-center">
          <h2 className="font-serif text-2xl font-semibold text-white sm:text-3xl">
            Ready to make your move easier?
          </h2>
          <a
            href="/book"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-medium text-[var(--color-primary)]"
          >
            Book Now
          </a>
        </section>
      </main>

      <SiteFooter
        businessName={businessName}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        serviceArea={serviceArea}
      />
    </div>
  );
}

/**
 * Default hero artwork shown when no hero image URL is set in Business
 * Settings -- a simple stack of totes so the homepage never looks empty.
 */
function ToteStackIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      role="img"
      aria-label="Illustration of stacked moving totes"
    >
      <rect width="400" height="300" fill="var(--color-surface)" />
      <g>
        <rect x="90" y="180" width="220" height="80" rx="14" fill="var(--color-primary)" />
        <rect x="90" y="180" width="220" height="18" rx="9" fill="var(--color-primary-dark)" />
        <rect x="130" y="150" width="140" height="20" rx="6" fill="var(--color-primary-dark)" />

        <rect x="115" y="95" width="170" height="80" rx="14" fill="var(--color-secondary)" />
        <rect x="115" y="95" width="170" height="18" rx="9" fill="var(--color-primary)" />
        <rect x="150" y="65" width="100" height="20" rx="6" fill="var(--color-primary)" />

        <rect x="140" y="20" width="120" height="70" rx="14" fill="var(--color-accent)" />
        <rect x="140" y="20" width="120" height="16" rx="8" fill="var(--color-primary-dark)" />
      </g>
    </svg>
  );
}
