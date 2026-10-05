import Link from "next/link";
import { createAgreementVersionAction } from "../actions";
import { AgreementForm } from "../agreement-form";

const STARTER_CONTENT = `RENTAL AGREEMENT (DRAFT TEMPLATE -- replace with your own reviewed wording)

1. Rental Totes & Equipment
The customer rents the quantity of totes (and any add-ons, such as a dolly) described in their order confirmation, for the rental period stated there.

2. Care of Totes
The customer agrees to keep the totes dry, avoid overloading them beyond a reasonable weight, and return them in the condition they were delivered in, normal wear excepted.

3. Damaged, Lost, or Late Totes
Fees for damaged, lost, or late totes are as described in the order confirmation and the current fee schedule. Late fees are only applied at the business's discretion, not automatically.

4. Cancellations & Refunds
Cancellation eligibility and any applicable fee are described in the order confirmation at the time of booking.

5. Liability
[Replace with your own reviewed liability/indemnification language.]

By signing below, the customer agrees to the terms above.`;

export default function NewAgreementVersionPage() {
  return (
    <div>
      <Link href="/admin/agreements" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Rental Agreements
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">New Draft</h1>
      <div className="mt-6">
        <AgreementForm
          initialValues={{ versionLabel: "", content: STARTER_CONTENT }}
          action={createAgreementVersionAction}
          submitLabel="Save draft"
        />
      </div>
    </div>
  );
}
