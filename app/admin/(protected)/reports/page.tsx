import Link from "next/link";
import { getRevenueReport, type ReportGroupBy } from "@/lib/reports";
import { centsToDollarsString } from "@/lib/money";
import { inputClass } from "@/components/ui/field";

export const dynamic = "force-dynamic";

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; groupBy?: string }>;
}) {
  const params = await searchParams;
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : isoDateDaysAgo(30);
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : todayIso();
  const groupBy: ReportGroupBy =
    params.groupBy === "week" || params.groupBy === "month" ? params.groupBy : "day";

  const report = await getRevenueReport({ from, to, groupBy });

  const exportHref = `/admin/reports/export?from=${from}&to=${to}`;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Financial reports</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Revenue is recognized when payment actually succeeds, not on the delivery date.
          </p>
        </div>
        <Link
          href={exportHref}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          Export CSV
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="from" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={from} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={to} className={inputClass} />
        </div>
        <div>
          <label htmlFor="groupBy" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
            Group by
          </label>
          <select id="groupBy" name="groupBy" defaultValue={groupBy} className={inputClass}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)]"
        >
          Update
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Order revenue" value={`$${centsToDollarsString(report.totalRevenueCents)}`} sub={`${report.orderCount} paid orders`} />
        <StatCard
          label="Late fees collected"
          value={`$${centsToDollarsString(report.totalLateFeesCollectedCents)}`}
        />
        <StatCard
          label="Gift cards sold"
          value={`$${centsToDollarsString(report.totalGiftCardPurchaseRevenueCents)}`}
        />
        <StatCard
          label="Referral discounts given"
          value={`$${centsToDollarsString(report.totalReferralDiscountsGivenCents)}`}
        />
        <StatCard
          label="Referral rewards owed"
          value={`$${centsToDollarsString(report.totalReferralRewardsOwedCents)}`}
          sub="Still unpaid as of today"
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Revenue by {groupBy}</h2>
        {report.byPeriod.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">No paid orders in this range.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                <th className="py-2">{groupBy === "month" ? "Month" : "Week/Day of"}</th>
                <th className="py-2 text-right">Orders</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {report.byPeriod.map((row) => (
                <tr key={row.period} className="border-b border-[var(--color-border)]">
                  <td className="py-2 text-[var(--color-text)]">{row.period}</td>
                  <td className="py-2 text-right text-[var(--color-text)]">{row.orderCount}</td>
                  <td className="py-2 text-right text-[var(--color-text)]">
                    ${centsToDollarsString(row.revenueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Revenue by package</h2>
        {report.byPackage.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">No paid orders in this range.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                <th className="py-2">Package</th>
                <th className="py-2 text-right">Orders</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {report.byPackage.map((row) => (
                <tr key={row.packageName} className="border-b border-[var(--color-border)]">
                  <td className="py-2 text-[var(--color-text)]">{row.packageName}</td>
                  <td className="py-2 text-right text-[var(--color-text)]">{row.orderCount}</td>
                  <td className="py-2 text-right text-[var(--color-text)]">
                    ${centsToDollarsString(row.revenueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}
