import { requireSession } from "@/lib/session";
import { getReportData } from "@/lib/db/queries";
import { formatMoney, formatNumber } from "@/lib/domain/format";
import { StatusBadge } from "../quotations/status-badge";
import type { QuotationStatus } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requireSession();
  const { monthly, pipeline, products } = await getReportData();
  const showMargin = session.user.role !== "viewer";

  const quoted = monthly.reduce((sum, row) => sum + Number(row.quotedMmk), 0);
  const won = monthly.reduce((sum, row) => sum + Number(row.wonMmk), 0);
  const issued = monthly.reduce((sum, row) => sum + Number(row.quotesIssued), 0);
  const wins = monthly.reduce((sum, row) => sum + Number(row.quotesWon), 0);
  const winRate = issued > 0 ? (wins / issued) * 100 : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quoted and won value in MMK, using each quotation&apos;s frozen FX rate.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="label">Quoted (12 months)</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(quoted, "MMK")}</p>
        </div>
        <div className="card p-4">
          <p className="label">Won (12 months)</p>
          <p className="text-xl font-semibold tabular-nums text-emerald-700">
            {formatMoney(won, "MMK")}
          </p>
        </div>
        <div className="card p-4">
          <p className="label">Quotes issued</p>
          <p className="text-xl font-semibold tabular-nums">{formatNumber(issued, 0)}</p>
        </div>
        <div className="card p-4">
          <p className="label">Win rate</p>
          <p className="text-xl font-semibold tabular-nums">{winRate.toFixed(1)}%</p>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Monthly sales</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Created</th>
                <th className="text-right">Issued</th>
                <th className="text-right">Won</th>
                <th className="text-right">Quoted MMK</th>
                <th className="text-right">Won MMK</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No quotation history yet.
                  </td>
                </tr>
              ) : (
                monthly.map((row) => (
                  <tr key={row.month}>
                    <td className="font-medium">{row.month}</td>
                    <td className="text-right tabular-nums">{row.quotesCreated}</td>
                    <td className="text-right tabular-nums">{row.quotesIssued}</td>
                    <td className="text-right tabular-nums">{row.quotesWon}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.quotedMmk, "MMK")}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.wonMmk, "MMK")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">Pipeline by status</h2>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Status</th>
                <th className="text-right">Quotes</th>
                <th className="text-right">Value MMK</th>
                <th className="text-right">Average</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    Nothing in the pipeline.
                  </td>
                </tr>
              ) : (
                pipeline.map((row) => (
                  <tr key={row.status}>
                    <td>
                      <StatusBadge status={row.status as QuotationStatus} />
                    </td>
                    <td className="text-right tabular-nums">{row.quoteCount}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.valueMmk, "MMK")}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.avgValueMmk, "MMK")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">Top products (sent + accepted)</h2>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Quotes</th>
                <th className="text-right">Revenue MMK</th>
                {showMargin ? <th className="text-right">Margin</th> : null}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={showMargin ? 4 : 3} className="py-8 text-center text-slate-500">
                    No issued quotations yet.
                  </td>
                </tr>
              ) : (
                products.map((row) => (
                  <tr key={row.productKey}>
                    <td>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.sku ?? "Ad-hoc"}</p>
                    </td>
                    <td className="text-right tabular-nums">{row.quoteCount}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.revenueMmk, "MMK")}</td>
                    {showMargin ? (
                      <td className="text-right tabular-nums">{formatMoney(row.marginMmk, "MMK")}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
