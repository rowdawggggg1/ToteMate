"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingText,
}: {
  children: ReactNode;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
    >
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
