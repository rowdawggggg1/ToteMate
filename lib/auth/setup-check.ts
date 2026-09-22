import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";

/**
 * The database is authoritative for setup state -- never a frontend flag.
 * Returns false whenever the singleton settings row doesn't exist yet or
 * hasn't had setupCompletedAt set.
 */
export async function isSetupComplete(): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ setupCompletedAt: businessSettings.setupCompletedAt })
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);

  return Boolean(rows[0]?.setupCompletedAt);
}
