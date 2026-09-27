import { and, asc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addOns, faqs, packages } from "@/lib/db/schema";

/**
 * Active packages in display order. This is the one place that decides
 * what counts as "publicly bookable" -- the homepage and the future
 * booking flow should both call this rather than querying the table
 * directly, so there's a single authoritative definition.
 */
export async function getActivePackages() {
  const db = getDb();
  return db
    .select()
    .from(packages)
    .where(eq(packages.isActive, true))
    .orderBy(asc(packages.displayOrder), asc(packages.name));
}

/**
 * Active add-ons available for a given package: general add-ons
 * (packageId is null) plus any add-ons specific to that package
 * (including its weekly extension, if configured).
 */
export async function getActiveAddOnsForPackage(packageId: string) {
  const db = getDb();
  return db
    .select()
    .from(addOns)
    .where(
      and(
        eq(addOns.isActive, true),
        or(isNull(addOns.packageId), eq(addOns.packageId, packageId))
      )
    )
    .orderBy(asc(addOns.displayOrder), asc(addOns.name));
}

export async function getActiveFaqs() {
  const db = getDb();
  return db
    .select()
    .from(faqs)
    .where(eq(faqs.isActive, true))
    .orderBy(asc(faqs.displayOrder), asc(faqs.createdAt));
}
