import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuotationDetail } from "@/lib/db/queries";
import { canEdit, requireSession } from "@/lib/session";
import { formatDate, formatDecimal, formatMoney, quoteNumberLabel } from "@/lib/domain/format";
import { createRevision, deleteDraft, updateStatus } from "../actions";
import { StatusBadge } from "../status-badge";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  sent: "Sent to customer",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  revised: "Revision created",
  pdf_generated: "PDF generated",
  note_added: "Note added",
};

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getQuotationDetail(id);
  if (!detail) notFound();

  const { quote, items, events } = detail;
  const customer = quote.customerSnapshot;
  const editable = canEdit(session.user.role);
  const isDraft = quote.status === "draft";
  const error = typeof query.error === "string" ? query.error : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/quotations" className="text-sm text-slate-500 hover:text-slate-800">
            ← Quotations
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {quoteNumberLabel(quote.quoteNo, quote.revision)}
            </h1>
            <StatusBadge status={quote.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {quote.projectTitle || quote.subject || "Untitled quotation"} ·{" "}
            {formatDate(quote.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/api/quotations/${quote.id}/pdf`}
            target="_blank"
            className="btn-secondary"
          >
            Preview PDF
          </Link>
          <a
            href={`/api/quotations/${quote.id}/pdf?download=1`}
            className="btn-secondary"
          >
            Download
          </a>
          {editable && isDraft ? (
            <Link href={`/quotations/${quote.id}/edit`} className="btn-primary">
              Edit draft
            </Link>
          ) : null}
        </div>
      </div>

      {error === "owner" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This draft belongs to another user. An administrator can edit it.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="label">Customer</p>
                <p className="font-medium">{customer.name}</p>
                {customer.attention ? <p className="text-sm">Attn: {customer.attention}</p> : null}
                {customer.address ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                    {customer.address}
                  </p>
                ) : null}
                {customer.city || customer.country ? (
                  <p className="text-sm text-slate-600">
                    {[customer.city, customer.country].filter(Boolean).join(", ")}
                  </p>
                ) : null}
                {customer.phone ? <p className="text-sm text-slate-600">{customer.phone}</p> : null}
                {customer.email ? <p className="text-sm text-slate-600">{customer.email}</p> : null}
                {customer.taxId ? (
                  <p className="text-sm text-slate-600">Tax ID: {customer.taxId}</p>
                ) : null}
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Currency</dt>
                  <dd className="font-medium">{quote.currency}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">FX rate</dt>
                  <dd className="tabular-nums">
                    {formatDecimal(quote.fxRateMmkPerUnit, 8)} MMK / unit
                    {quote.fxRateDate ? ` (${formatDate(quote.fxRateDate)})` : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Valid until</dt>
                  <dd>{formatDate(quote.validUntil)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Last updated</dt>
                  <dd>{formatDate(quote.updatedAt)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">Line items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit price</th>
                    <th className="text-right">Disc %</th>
                    <th className="text-right">Tax %</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="text-slate-400">{index + 1}</td>
                      <td>
                        <p className="font-medium">{item.name}</p>
                        {item.description ? (
                          <p className="text-xs text-slate-500">{item.description}</p>
                        ) : null}
                        {item.sku ? (
                          <p className="text-xs text-slate-400">SKU {item.sku}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {formatDecimal(item.quantity, 3)} {item.unit}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {formatDecimal(item.unitPrice, 4)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatDecimal(item.discountPct, 3)}
                      </td>
                      <td className="text-right tabular-nums">
                        {(Number(item.taxRate) * 100).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">
                        {formatMoney(item.lineTotal ?? "0", quote.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-4">
              <dl className="w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(quote.subtotal, quote.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Discount</dt>
                  <dd className="tabular-nums">
                    − {formatMoney(quote.discountTotal, quote.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tax</dt>
                  <dd className="tabular-nums">{formatMoney(quote.vatTotal, quote.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">
                    {formatMoney(quote.grandTotal, quote.currency)}
                  </dd>
                </div>
                {quote.currency !== "MMK" ? (
                  <div className="flex justify-between text-xs text-slate-500">
                    <dt>MMK equivalent</dt>
                    <dd className="tabular-nums">{formatMoney(quote.grandTotalMmk, "MMK")}</dd>
                  </div>
                ) : null}
                {session.user.role !== "viewer" ? (
                  <div className="flex justify-between text-xs text-slate-500">
                    <dt>Estimated margin</dt>
                    <dd className="tabular-nums">{formatMoney(quote.marginMmk ?? "0", "MMK")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>

          {quote.paymentTerms || quote.deliveryTerms || quote.warrantyTerms || quote.exclusions ? (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Terms</h2>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                {quote.paymentTerms ? (
                  <div>
                    <p className="label">Payment</p>
                    <p className="whitespace-pre-line text-slate-700">{quote.paymentTerms}</p>
                  </div>
                ) : null}
                {quote.deliveryTerms ? (
                  <div>
                    <p className="label">Delivery</p>
                    <p className="whitespace-pre-line text-slate-700">{quote.deliveryTerms}</p>
                  </div>
                ) : null}
                {quote.warrantyTerms ? (
                  <div>
                    <p className="label">Warranty</p>
                    <p className="whitespace-pre-line text-slate-700">{quote.warrantyTerms}</p>
                  </div>
                ) : null}
                {quote.exclusions ? (
                  <div>
                    <p className="label">Exclusions</p>
                    <p className="whitespace-pre-line text-slate-700">{quote.exclusions}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {quote.notes ? (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">Notes</h2>
              <p className="whitespace-pre-line text-sm text-slate-700">{quote.notes}</p>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5">
          {editable ? (
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Actions</h2>
              <div className="space-y-2">
                {isDraft ? (
                  <form action={updateStatus}>
                    <input type="hidden" name="id" value={quote.id} />
                    <input type="hidden" name="status" value="sent" />
                    <button type="submit" className="btn-primary w-full">
                      Mark as sent
                    </button>
                  </form>
                ) : null}

                {quote.status === "sent" ? (
                  <>
                    <form action={updateStatus}>
                      <input type="hidden" name="id" value={quote.id} />
                      <input type="hidden" name="status" value="accepted" />
                      <button
                        type="submit"
                        className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700"
                      >
                        Mark accepted
                      </button>
                    </form>
                    <form action={updateStatus}>
                      <input type="hidden" name="id" value={quote.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button type="submit" className="btn-secondary w-full">
                        Mark rejected
                      </button>
                    </form>
                  </>
                ) : null}

                {quote.status !== "draft" && quote.status !== "cancelled" ? (
                  <form action={createRevision}>
                    <input type="hidden" name="id" value={quote.id} />
                    <button type="submit" className="btn-secondary w-full">
                      Create revision
                    </button>
                  </form>
                ) : null}

                {isDraft || quote.status === "sent" ? (
                  <form action={updateStatus}>
                    <input type="hidden" name="id" value={quote.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <button type="submit" className="btn-danger w-full">
                      Cancel quotation
                    </button>
                  </form>
                ) : null}

                {isDraft && session.user.role === "admin" ? (
                  <form action={deleteDraft}>
                    <input type="hidden" name="id" value={quote.id} />
                    <button type="submit" className="btn-danger w-full">
                      Delete draft
                    </button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Activity</h2>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event) => {
                  const note =
                    typeof event.details.note === "string" ? event.details.note : null;
                  return (
                    <li key={event.id} className="border-l-2 border-slate-200 pl-3">
                      <p className="text-sm font-medium">
                        {EVENT_LABELS[event.eventType] ?? event.eventType}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(event.createdAt)}
                      </p>
                      {note ? <p className="mt-1 text-xs text-slate-600">{note}</p> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
