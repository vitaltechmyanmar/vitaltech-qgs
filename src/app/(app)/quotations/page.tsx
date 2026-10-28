import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getStatusCounts, listQuotations } from "@/lib/db/queries";
import { quotationStatusEnum, type QuotationStatus } from "@/lib/db/schema";
import { formatDate, formatMoney, quoteNumberLabel } from "@/lib/domain/format";
import { StatusBadge } from "./status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotations" };

type SearchParams = Promise<{
  status?: string | string[];
  q?: string | string[];
  error?: string | string[];
}>;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const params = await searchParams;

  const statusParam = typeof params.status === "string" ? params.status : "";
  const status = quotationStatusEnum.enumValues.includes(statusParam as QuotationStatus)
    ? (statusParam as QuotationStatus)
    : undefined;
  const q = typeof params.q === "string" ? params.q : "";
  const error = typeof params.error === "string" ? params.error : "";

  const [rows, counts] = await Promise.all([
    listQuotations({ status, q, limit: 100 }),
    getStatusCounts(),
  ]);

  const filters: { label: string; value?: QuotationStatus }[] = [
    { label: "All" },
    ...quotationStatusEnum.enumValues.map((value) => ({
      label: value[0].toUpperCase() + value.slice(1),
      value,
    })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length} shown · {counts.draft ?? 0} drafts in progress
          </p>
        </div>
        <Link href="/quotations/new" className="btn-primary">
          New quotation
        </Link>
      </div>

      {error === "forbidden" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your role does not allow that action.
        </p>
      ) : null}

      <div className="card p-3">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search quote no, project or customer…"
            className="min-w-[240px] flex-1"
          />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {quotationStatusEnum.enumValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
          {q || status ? (
            <Link href="/quotations" className="text-sm text-slate-500 hover:text-slate-800">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="mt-3 flex flex-wrap gap-1">
          {filters.map((filter) => {
            const active = filter.value === status || (!filter.value && !status);
            const href = filter.value ? `/quotations?status=${filter.value}` : "/quotations";
            return (
              <Link
                key={filter.label}
                href={href}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {filter.label}
                {filter.value ? (
                  <span className={active ? "ml-1 text-brand-100" : "ml-1 text-slate-400"}>
                    {counts[filter.value] ?? 0}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium">No quotations match this view.</p>
            <p className="mt-1 text-sm text-slate-500">
              Create the first one, or clear the filters.
            </p>
            <Link href="/quotations/new" className="btn-primary mt-4">
              New quotation
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Customer / project</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">MMK</th>
                  <th>Valid until</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap font-medium">
                      <Link
                        href={`/quotations/${row.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {quoteNumberLabel(row.quoteNo, row.revision)}
                      </Link>
                    </td>
                    <td>
                      <p className="font-medium">{row.customerName}</p>
                      <p className="text-xs text-slate-500">
                        {row.projectTitle || row.subject || "—"}
                      </p>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {formatMoney(row.grandTotal, row.currency)}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs tabular-nums text-slate-500">
                      {formatMoney(row.grandTotalMmk, "MMK")}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">
                      {formatDate(row.validUntil)}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">
                      {formatDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
