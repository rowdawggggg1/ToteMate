export default function AdminDashboardPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Dashboard</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Orders, the calendar, and daily operations will appear here as those parts of
        ToteMate are built in later phases. For now, start by reviewing your business
        settings.
      </p>
      <a
        href="/admin/settings"
        className="mt-6 inline-block rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
      >
        Go to Settings
      </a>
    </div>
  );
}
