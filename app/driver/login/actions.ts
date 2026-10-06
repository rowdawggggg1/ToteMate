"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateAndCreateSession } from "@/lib/auth/login";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type DriverLoginActionState = {
  error?: string;
};

const GENERIC_ERROR = { error: "Invalid email or password." };

export async function driverLoginAction(
  _prevState: DriverLoginActionState,
  formData: FormData
): Promise<DriverLoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return GENERIC_ERROR;
  }

  const result = await authenticateAndCreateSession(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return { error: result.error };
  }

  // Any active staff account (owner or driver) can use the driver portal
  // -- an owner checking what drivers see is a reasonable thing to allow,
  // not a security hole, since it's strictly less access than /admin.
  redirect("/driver");
}
