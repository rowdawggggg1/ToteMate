import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup-check";
import { RealtorLoginForm } from "./login-form";

// Same reasoning as app/admin/login/page.tsx: queries the database, so it
// must never be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export default async function RealtorLoginPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <RealtorLoginForm />
    </main>
  );
}
