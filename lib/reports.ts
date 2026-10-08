/**
 * Financial reporting (Phase 5): a revenue summary (by day/week/month and
 * by package) plus a CSV export, per the locked scope decision
 * ("Revenue summary + export"). Deliberately simple -- this aggregates in
 * JS over the orders already in the date range rather than building a
 * separate reporting/warehouse layer, which would be over-engineering for
 * a single small business's order volume.
 */

import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { giftCards, orderLateFees, orders, referralRedemptions } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";

export type ReportGroupBy = "day" | "week" | "month";

type OrderRow = typeof orders.$inferSelect;

/** Monday-start ISO week label, e.g. "2026-W14" isn't as readable as a date, so this uses the week's Monday date instead. */
function periodKey(dateStr: string, groupBy: ReportGroupBy): string {
  const d = new Date(dateStr + "T00:00:00Z");
  if (groupBy === "month") {
    return dateStr.slice(0, 7); // YYYY-MM
  }
  if (groupBy === "week") {
    const day = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
    const daysSinceMonday = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday);
    return d.toISOString().slice(0, 10);
  }
  return dateStr; // day
}

export type RevenueReport = {
  from: string;
  to: string;
  groupBy: ReportGroupBy;
  orders: OrderRow[];
  totalRevenueCents: number;
  orderCount: number;
  byPackage: Array<{ packageName: string; revenueCents: number; orderCount: number }>;
  byPeriod: Array<{ period: string; revenueCents: number; orderCount: number }>;
  totalLateFeesCollectedCents: number;
  totalReferralDiscountsGivenCents: number;
  totalReferralRewardsOwedCents: number;
  totalGiftCardPurchaseRevenueCents: number;
};

/**
 * `from`/`to` are inclusive YYYY-MM-DD strings. Revenue is recognized on
 * paidAt (when money actually moved), not the delivery date, since that's
 * what "revenue this month" means to a small business owner reconciling
 * against their bank/Stripe statement.
 */
export async function getRevenueReport(params: {
  from: string;
  to: string;
  groupBy: ReportGroupBy;
}): Promise<RevenueReport> {
  const db = getDb();
  const fromDate = new Date(params.from + "T00:00:00.000Z");
  const toDate = new Date(params.to + "T23:59:59.999Z");

  const paidOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), gte(orders.paidAt, fromDate), lte(orders.paidAt, toDate)));

  let totalRevenueCents = 0;
  const byPackageMap = new Map<string, { revenueCents: number; orderCount: number }>();
  const byPeriodMap = new Map<string, { revenueCents: number; orderCount: number }>();

  for (const order of paidOrders) {
    totalRevenueCents += order.finalAmountCents;

    const pkg = byPackageMap.get(order.packageName) ?? { revenueCents: 0, orderCount: 0 };
    pkg.revenueCents += order.finalAmountCents;
    pkg.orderCount += 1;
    byPackageMap.set(order.packageName, pkg);

    const paidDateStr = (order.paidAt ?? order.createdAt).toISOString().slice(0, 10);
    const period = periodKey(paidDateStr, params.groupBy);
    const bucket = byPeriodMap.get(period) ?? { revenueCents: 0, orderCount: 0 };
    bucket.revenueCents += order.finalAmountCents;
    bucket.orderCount += 1;
    byPeriodMap.set(period, bucket);
  }

  const lateFeeRows = await db
    .select()
    .from(orderLateFees)
    .where(and(eq(orderLateFees.status, "charged"), gte(orderLateFees.chargedAt, fromDate), lte(orderLateFees.chargedAt, toDate)));
  const totalLateFeesCollectedCents = lateFeeRows.reduce((sum, f) => sum + f.amountCents, 0);

  const referralRows = await db
    .select()
    .from(referralRedemptions)
    .where(and(gte(referralRedemptions.createdAt, fromDate), lte(referralRedemptions.createdAt, toDate)));
  const totalReferralDiscountsGivenCents = referralRows.reduce((sum, r) => sum + r.refereeDiscountCents, 0);
  const totalReferralRewardsOwedCents = referralRows
    .filter((r) => r.payoutStatus === "owed")
    .reduce((sum, r) => sum + r.referrerRewardCents, 0);

  const purchasedGiftCardRows = await db
    .select()
    .from(giftCards)
    .where(
      and(
        eq(giftCards.sourceType, "purchased"),
        gte(giftCards.createdAt, fromDate),
        lte(giftCards.createdAt, toDate)
      )
    );
  const totalGiftCardPurchaseRevenueCents = purchasedGiftCardRows.reduce(
    (sum, g) => sum + g.initialValueCents,
    0
  );

  return {
    from: params.from,
    to: params.to,
    groupBy: params.groupBy,
    orders: paidOrders,
    totalRevenueCents,
    orderCount: paidOrders.length,
    byPackage: Array.from(byPackageMap.entries())
      .map(([packageName, v]) => ({ packageName, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    byPeriod: Array.from(byPeriodMap.entries())
      .map(([period, v]) => ({ period, ...v }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    totalLateFeesCollectedCents,
    totalReferralDiscountsGivenCents,
    totalReferralRewardsOwedCents,
    totalGiftCardPurchaseRevenueCents,
  };
}

function csvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** CSV of every paid order in the report's range, one row per order. */
export function generateOrdersCsv(report: RevenueReport): string {
  const header = [
    "Order Number",
    "Paid At",
    "Package",
    "Package Price",
    "Add-ons + Extension",
    "Delivery Fee",
    "Pickup Fee",
    "Referral Discount",
    "Gift Card Applied",
    "Final Amount",
    "Currency",
  ];

  const rows = report.orders.map((order) => {
    const addOns = Array.isArray(order.addOns)
      ? (order.addOns as Array<{ priceCents: number; quantity: number }>)
      : [];
    const addOnsTotalCents = addOns.reduce((sum, a) => sum + a.priceCents * a.quantity, 0);
    const extensionTotalCents = (order.weeklyExtensionPriceCents ?? 0) * order.extensionWeeks;

    return [
      order.orderNumber,
      order.paidAt ? order.paidAt.toISOString() : "",
      order.packageName,
      centsToDollarsString(order.packagePriceCents),
      centsToDollarsString(addOnsTotalCents + extensionTotalCents),
      centsToDollarsString(order.deliveryFeeCents),
      centsToDollarsString(order.pickupFeeCents),
      centsToDollarsString(order.referralDiscountCents),
      centsToDollarsString(order.giftCardAmountAppliedCents),
      centsToDollarsString(order.finalAmountCents),
      order.currency,
    ];
  });

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
