import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getRevenueReport, generateOrdersCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * Route Handlers sit outside the (protected) layout tree, so this checks
 * authorization itself rather than relying on that layout -- same
 * defense-in-depth reasoning as every Server Action in this app.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const report = await getRevenueReport({ from, to, groupBy: "day" });
  const csv = generateOrdersCsv(report);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="revenue-${from}-to-${to}.csv"`,
    },
  });
}
