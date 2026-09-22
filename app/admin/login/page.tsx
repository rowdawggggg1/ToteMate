import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup-check";
import { LoginForm } from "./login-form";

// Same reasoning as app/setup/page.tsx: this queries the database, so it
// must never be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <LoginForm nextPath={params.next ?? ""} />
    </main>
  );
}
