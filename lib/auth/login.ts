/**
 * Shared email/password verification logic, used by both /admin/login and
 * /driver/login -- they authenticate against the same `admins` table (see
 * its comment in lib/db/schema.ts: owner and driver are both rows there),
 * so the lockout/attempt-tracking logic lives here once instead of being
 * duplicated per login page. Each page's own "use server" action calls
 * this, then decides where to redirect based on the returned admin's role.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_ERROR = "Invalid email or password.";

export type LoginResult =
  | { ok: true; admin: typeof admins.$inferSelect }
  | { ok: false; error: string };

export async function authenticateAndCreateSession(
  email: string,
  password: string
): Promise<LoginResult> {
  const db = getDb();

  const rows = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  const admin = rows[0];

  if (!admin || !admin.isActive) {
    return { ok: false, error: GENERIC_ERROR };
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: "Too many failed attempts. Please try again in a few minutes." };
  }

  const validPassword = await verifyPassword(password, admin.passwordHash);

  if (!validPassword) {
    const attempts = admin.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await db
      .update(admins)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(admins.id, admin.id));

    return { ok: false, error: GENERIC_ERROR };
  }

  await db
    .update(admins)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ADMIN_LOGIN_SUCCESS",
    entityType: "admin",
    entityId: admin.id,
  });

  await createSession(admin.id);
  return { ok: true, admin };
}
