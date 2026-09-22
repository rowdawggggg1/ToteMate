export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-background)] p-8 text-center">
      <h1 className="font-serif text-4xl font-semibold text-[var(--color-text)]">
        ToteMate
      </h1>
      <p className="max-w-md text-[var(--color-muted)]">
        The public booking site is coming together in the next build phase.
        In the meantime, the admin system is live.
      </p>
      <a
        href="/admin/login"
        className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white"
      >
        Admin Login
      </a>
    </main>
  );
}
