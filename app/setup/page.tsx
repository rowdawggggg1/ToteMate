import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup-check";
import { SetupForm } from "./setup-form";

// This page queries the database. Without this, Next.js will try to
// pre-render it at build time (before the database necessarily has any
// tables), which fails the Vercel build. Forcing dynamic rendering means
// it only ever runs when someone actually visits the page, at runtime.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupComplete()) {
    redirect("/admin/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <SetupForm />
    </main>
  );
}
