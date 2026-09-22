import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--color-text)]">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      )}
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
