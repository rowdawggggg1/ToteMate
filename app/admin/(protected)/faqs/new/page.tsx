import Link from "next/link";
import { createFaqAction } from "../actions";
import { FaqForm } from "../faq-form";

export default function NewFaqPage() {
  return (
    <div>
      <Link href="/admin/faqs" className="text-sm text-[var(--color-muted)] hover:underline">
        ← FAQs
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">New FAQ</h1>
      <div className="mt-6">
        <FaqForm action={createFaqAction} submitLabel="Create FAQ" />
      </div>
    </div>
  );
}
