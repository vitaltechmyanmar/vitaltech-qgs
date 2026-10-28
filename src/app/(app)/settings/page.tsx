import { requireAdmin } from "@/lib/session";
import { getCompanySettings, listLatestFxRates } from "@/lib/db/queries";
import { formatDate, formatNumber } from "@/lib/domain/format";
import { CompanyForm } from "./company-form";
import { FxRefreshButton } from "./fx-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const [company, rates] = await Promise.all([getCompanySettings(), listLatestFxRates()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Company profile and exchange rates. Profile changes apply to every PDF
          rendered from now on; quotation defaults apply when a new quote is
          started.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Company profile</h2>
        <CompanyForm company={company} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="font-semibold">Latest exchange rates</h2>
            <p className="mt-1 text-xs text-slate-500">
              MMK per one unit. Pulled from open.er-api.com unless FX_PROVIDER_URL
              is set. Rates are history rows; manual rows are never overwritten.
            </p>
          </div>
          <FxRefreshButton />
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Currency</th>
              <th className="text-right">MMK per unit</th>
              <th>Effective</th>
              <th>Source</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No exchange rates yet. Run the seed script.
                </td>
              </tr>
            ) : (
              rates.map((rate) => (
                <tr key={rate.currency}>
                  <td className="font-medium">{rate.currency}</td>
                  <td className="text-right tabular-nums">{formatNumber(rate.mmkPerUnit, 4)}</td>
                  <td>{formatDate(rate.effectiveDate)}</td>
                  <td className="text-slate-600">{rate.source}</td>
                  <td className="text-slate-500">{rate.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
