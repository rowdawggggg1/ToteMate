"use server";

import { redirect } from "next/navigation";
import { isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { admins, businessSettings } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

const setupSchema = z
  .object({
    name: z.string().trim().min(1, "Please enter your name."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SetupActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function completeSetupAction(
  _prevState: SetupActionState,
  formData: FormData
): Promise<SetupActionState> {
  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { name, email, password } = parsed.data;
  const db = getDb();

  let newAdminId: string | null = null;
  let alreadyInitialized = false;

  try {
    await db.transaction(async (tx) => {
      // Atomically claim the setup row. If it doesn't exist yet, this
      // creates it (with all its column defaults) and claims it in one
      // step; if it exists and is unclaimed, this claims it; if it's
      // already claimed, the WHERE clause fails, RETURNING gives back
      // zero rows, and nothing is changed. This prevents two concurrent
      // submissions from both creating a "first" admin.
      const claimed = await tx
        .insert(businessSettings)
        .values({ id: 1, setupCompletedAt: new Date() })
        .onConflictDoUpdate({
          target: businessSettings.id,
          set: { setupCompletedAt: new Date() },
          where: isNull(businessSettings.setupCompletedAt),
        })
        .returning({ id: businessSettings.id });

      if (claimed.length === 0) {
        alreadyInitialized = true;
        return;
      }

      const passwordHash = await hashPassword(password);

      const inserted = await tx
        .insert(admins)
        .values({ name, email, passwordHash })
        .returning({ id: admins.id });

      newAdminId = inserted[0]?.id ?? null;
    });
  } catch (err) {
    console.error("Setup failed:", err);
    return {
      error: "We couldn't complete setup right now. Please try again.",
    };
  }

  if (alreadyInitialized) {
    redirect("/admin/login");
  }

  if (!newAdminId) {
    return { error: "We couldn't complete setup right now. Please try again." };
  }

  await writeAudit({
    actor: { type: "system" },
    action: "ADMIN_SETUP_COMPLETED",
    entityType: "admin",
    entityId: newAdminId,
    after: { name, email },
  });

  await createSession(newAdminId);
  redirect("/admin");
}
