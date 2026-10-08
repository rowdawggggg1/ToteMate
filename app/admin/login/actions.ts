"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateAndCreateSession } from "@/lib/auth/login";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginActionState = {
  error?: string;
};

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

  const result = await authenticateAndCreateSession(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return { error: result.error };
  }

  // Driver/realtor accounts share this login form/table but have no
  // business in the full admin panel (requireAdmin() would bounce them
  // right back out anyway) -- send them straight to their own portal
  // instead, ignoring whatever "next" was on the URL.
  if (result.admin.role === "driver") {
    redirect("/driver");
  }
  if (result.admin.role === "realtor") {
    redirect("/realtor");
  }

  redirect(safeNextPath(parsed.data.next));
}
