"use client";

import { useActionState } from "react";
import { updateReferralSettingsAction, type ReferralSettingsActionState } from "./actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: ReferralSettingsActionState = {};

export type ReferralSettingsInitialValues = {
  referrerRewardType: "fixed" | "percentage";
  referrerRewardValue: string;
  refereeDiscountEnabled: boolean;
  refereeDiscountType: "fixed" | "percentage";
  refereeDiscountValue: string;
  refereeDiscountRealtorEnabled: boolean;
  refereeDiscountRealtorType: "fixed" | "percentage";
  refereeDiscountRealtorValue: string;
  realtorsEarnReferrerReward: boolean;
};

export function ReferralSettingsForm({
  initialValues,
}: {
  initialValues: ReferralSettingsInitialValues;
}) {
  const [state, formAction] = useActionState(updateReferralSettingsAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="font-medium text-[var(--color-text)]">Referrer reward</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Whoever owns a referral code earns this reward every time it's used. This isn't store
          credit -- it's tracked as owed to them below, and you pay it out yourself (e-transfer,
          cash, etc.), then mark it paid.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Reward type" htmlFor="referrerRewardType">
            <select
              id="referrerRewardType"
              name="referrerRewardType"
              defaultValue={initialValues.referrerRewardType}
              className={inputClass}
            >
              <option value="fixed">Fixed $ amount</option>
              <option value="percentage">Percentage of order</option>
            </select>
          </Field>
          <Field
            label="Reward value"
            htmlFor="referrerRewardValue"
            error={errors.referrerRewardValue}
            hint="Dollars, or a percentage (e.g. 10 for 10%), depending on the type above."
          >
            <input
              id="referrerRewardValue"
              name="referrerRewardValue"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initialValues.referrerRewardValue}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="font-medium text-[var(--color-text)]">Referee discount -- customer codes</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Optional: also give the new customer a discount on their own order when they use a
          regular customer's referral code. This is independent of the realtor-code discount
          below -- you can run one without the other.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            name="refereeDiscountEnabled"
            defaultChecked={initialValues.refereeDiscountEnabled}
          />
          Give the referred customer a discount
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Discount type" htmlFor="refereeDiscountType">
            <select
              id="refereeDiscountType"
              name="refereeDiscountType"
              defaultValue={initialValues.refereeDiscountType}
              className={inputClass}
            >
              <option value="fixed">Fixed $ amount</option>
              <option value="percentage">Percentage of order</option>
            </select>
          </Field>
          <Field
            label="Discount value"
            htmlFor="refereeDiscountValue"
            error={errors.refereeDiscountValue}
          >
            <input
              id="refereeDiscountValue"
              name="refereeDiscountValue"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initialValues.refereeDiscountValue}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="font-medium text-[var(--color-text)]">Referee discount -- realtor codes</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Optional: give a discount to a client who books using a REALTOR's referral code
          specifically -- separate from the customer-code discount above, so you can offer realtor
          clients a perk without necessarily running the same promo for everyone.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            name="refereeDiscountRealtorEnabled"
            defaultChecked={initialValues.refereeDiscountRealtorEnabled}
          />
          Give a realtor's referred client a discount
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Discount type" htmlFor="refereeDiscountRealtorType">
            <select
              id="refereeDiscountRealtorType"
              name="refereeDiscountRealtorType"
              defaultValue={initialValues.refereeDiscountRealtorType}
              className={inputClass}
            >
              <option value="fixed">Fixed $ amount</option>
              <option value="percentage">Percentage of order</option>
            </select>
          </Field>
          <Field
            label="Discount value"
            htmlFor="refereeDiscountRealtorValue"
            error={errors.refereeDiscountRealtorValue}
          >
            <input
              id="refereeDiscountRealtorValue"
              name="refereeDiscountRealtorValue"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initialValues.refereeDiscountRealtorValue}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="font-medium text-[var(--color-text)]">Realtor codes -- referrer reward</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Realtors already profit from subscriptions/gift cards, so their own referral code earns
          THEM nothing by default -- it just discounts their client's order (if the realtor-code
          discount above is on). Turn this on later if you want realtors to also earn the referrer
          reward.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            name="realtorsEarnReferrerReward"
            defaultChecked={initialValues.realtorsEarnReferrerReward}
          />
          Realtors also earn the referrer reward
        </label>
      </div>

      {state.error && <p className="text-sm text-[var(--color-error)]">{state.error}</p>}
      {state.success && <p className="text-sm text-[var(--color-primary)]">Settings saved.</p>}

      <SubmitButton>Save referral settings</SubmitButton>
    </form>
  );
}
