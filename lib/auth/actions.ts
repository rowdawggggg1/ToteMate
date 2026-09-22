"use server";

import { redirect } from "next/navigation";
import { destroySession } from "./session";

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}
