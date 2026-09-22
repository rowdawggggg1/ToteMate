import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins, adminSessions } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "totemate_admin_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // ~1 week, per spec

/**
 * Sessions are opaque random tokens, not signed JWTs. Only the SHA-256
 * hash of the token is ever stored -- the raw token exists only in the
 * HTTP-only cookie. This avoids needing a separate session-signing secret
 * while still making individual sessions revocable.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(adminId: string): Promise<void> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(adminSessions).values({
    adminId,
    tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Independently re-validates the session against the database every time:
 * checks the token hash matches an active, non-revoked, non-expired
 * session, and that the associated admin account is still active. This is
 * the authoritative check -- proxy.ts only checks cookie presence.
 */
export async function getSessionAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const db = getDb();

  const rows = await db
    .select({ admin: admins })
    .from(adminSessions)
    .innerJoin(admins, eq(adminSessions.adminId, admins.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.admin.isActive) return null;

  return row.admin;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashToken(token);
    const db = getDb();
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.tokenHash, tokenHash));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
