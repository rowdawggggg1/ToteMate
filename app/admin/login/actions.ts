"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginActionState = {
  error?: string;
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_ERROR = { error: "Invalid email or password." };

/** Only ever allow redirecting back into the admin app itself. */
function safeNextPath(next: string | undefined | null): string {
  if (!next) return "/admin";
  if (!next.startsWith("/admin")) return "/admin";
  if (next.startsWith("//")) return "/admin";
  return next;
}

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return GENERIC_ERROR;
  }

  const { email, password, next } = parsed.data;
  const db = getDb();

  const rows = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  const admin = rows[0];

  if (!admin || !admin.isActive) {
    return GENERIC_ERROR;
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    return {
      error: "Too many failed attempts. Please try again in a few minutes.",
    };
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

    return GENERIC_ERROR;
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
  redirect(safeNextPath(next));
}
