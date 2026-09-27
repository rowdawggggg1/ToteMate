import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faqs } from "@/lib/db/schema";
import { updateFaqAction } from "../actions";
import { FaqForm, type FaqFormValues } from "../faq-form";

export const dynamic = "force-dynamic";

export default async function EditFaqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const rows = await db.select().from(faqs).where(eq(faqs.id, id)).limit(1);
  const faq = rows[0];

  if (!faq) {
    notFound();
  }

  const initialValues: FaqFormValues = {
    question: faq.question,
    answer: faq.answer,
    displayOrder: faq.displayOrder,
    isActive: faq.isActive,
  };

  const boundAction = updateFaqAction.bind(null, faq.id);

  return (
    <div>
      <Link href="/admin/faqs" className="text-sm text-[var(--color-muted)] hover:underline">
        ← FAQs
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Edit FAQ</h1>
      <div className="mt-6">
        <FaqForm initialValues={initialValues} action={boundAction} submitLabel="Save Changes" />
      </div>
    </div>
  );
}
