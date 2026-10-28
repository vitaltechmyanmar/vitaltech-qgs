"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveQuotation } from "@/app/(app)/quotations/actions";
import { Decimal, dec, money } from "@/lib/domain/money";
import { formatDecimal, formatMoney } from "@/lib/domain/format";
import { computeTotals } from "@/lib/domain/pricing";
import { evaluateGuardrails } from "@/lib/domain/guardrails";
import type {
  EditorCustomer,
  EditorDefaults,
  EditorLine,
  EditorProduct,
  EditorQuote,
} from "@/lib/editor-types";

type Props = {
  mode: "create" | "edit";
  quote?: EditorQuote;
  customers: EditorCustomer[];
  products: EditorProduct[];
  defaults: EditorDefaults;
  fxRates: Record<string, string>;
  isAdmin: boolean;
  taxLabel: string;
  presetCustomerId?: string;
};

let nextLineId = 1000;

function blankLine(taxPct: string): EditorLine {
  return {
    key: `new-${nextLineId++}`,
    productId: null,
    sku: null,
    name: "",
    description: "",
    unit: "pcs",
    quantity: "1",
    unitPrice: "0",
    discountPct: "0",
    taxPct,
  };
}

function numericText(value: string): string {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function safe(value: string): string {
  const trimmed = numericText(value).replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

export function QuoteEditor({
  mode,
  quote,
  customers,
  products,
  defaults,
  fxRates,
  isAdmin,
  taxLabel,
  presetCustomerId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const dirtyRef = useRef(false);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const [header, setHeader] = useState(() => ({
    customerId: quote?.customerId ?? presetCustomerId ?? "",
    currency: quote?.currency ?? defaults.currency,
    projectTitle: quote?.projectTitle ?? "",
    subject: quote?.subject ?? "",
    discountKind: quote?.discountKind ?? ("none" as const),
    discountValue: quote?.discountValue ?? "0",
    defaultTaxPct: quote?.defaultTaxPct ?? defaults.taxPct,
    validUntil: quote?.validUntil ?? defaults.validUntil,
    paymentTerms: quote?.paymentTerms ?? defaults.paymentTerms,
    deliveryTerms: quote?.deliveryTerms ?? defaults.deliveryTerms,
    warrantyTerms: quote?.warrantyTerms ?? defaults.warrantyTerms,
    exclusions: quote?.exclusions ?? defaults.exclusions,
    notes: quote?.notes ?? "",
  }));

  const [lines, setLines] = useState<EditorLine[]>(
    () => quote?.lines ?? [blankLine(defaults.taxPct)],
  );

  const markDirty = () => {
    dirtyRef.current = true;
  };

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((line) => ({
          quantity: safe(line.quantity),
          unitPrice: safe(line.unitPrice),
          discountPct: safe(line.discountPct),
          taxRate: new Decimal(safe(line.taxPct)).div(100).toString(),
        })),
        header.discountKind,
        safe(header.discountValue),
      ),
    [lines, header.discountKind, header.discountValue],
  );

  const costTotalMmk = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const product = line.productId ? productById.get(line.productId) : undefined;
        const cost = product?.costPriceMmk ?? "0";
        return sum.plus(money(dec(safe(line.quantity)).mul(dec(cost))));
      }, new Decimal(0)),
    [lines, productById],
  );

  const guardrails = useMemo(
    () =>
      evaluateGuardrails({
        totals,
        fxRateMmkPerUnit: fxRates[header.currency] ?? "1",
        costTotalMmk: costTotalMmk.toFixed(2),
        isAdmin,
      }),
    [totals, fxRates, header.currency, costTotalMmk, isAdmin],
  );

  const mmkTotal = dec(fxRates[header.currency] ?? "1").mul(totals.grandTotal);

  const missingPrices = useMemo(
    () =>
      lines.filter((line) => {
        if (!line.productId) return false;
        const product = productById.get(line.productId);
        return !product?.prices[header.currency];
      }),
    [lines, productById, header.currency],
  );

  function updateHeader<K extends keyof typeof header>(key: K, value: (typeof header)[K]) {
    markDirty();
    setHeader((current) => ({ ...current, [key]: value }));
  }

  function updateLine(key: string, patch: Partial<EditorLine>) {
    markDirty();
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function changeCurrency(currency: string) {
    markDirty();
    setHeader((current) => ({ ...current, currency }));
    setLines((current) =>
      current.map((line) => {
        if (!line.productId) return line;
        const product = productById.get(line.productId);
        return { ...line, unitPrice: product?.prices[currency] ?? "0" };
      }),
    );
  }

  function applyProduct(key: string, productId: string) {
    if (!productId) {
      updateLine(key, { productId: null, sku: null });
      return;
    }
    const product = productById.get(productId);
    if (!product) return;
    updateLine(key, {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? "",
      unit: product.unit,
      taxPct: new Decimal(product.taxRate).mul(100).toString(),
      unitPrice: product.prices[header.currency] ?? "0",
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = {
      id: quote?.id,
      customerId: header.customerId,
      projectTitle: header.projectTitle || null,
      subject: header.subject || null,
      currency: header.currency as "MMK" | "USD" | "THB",
      discountKind: header.discountKind,
      discountValue: safe(header.discountValue),
      defaultTaxRate: new Decimal(safe(header.defaultTaxPct)).div(100).toFixed(5),
      validUntil: header.validUntil || null,
      paymentTerms: header.paymentTerms || null,
      deliveryTerms: header.deliveryTerms || null,
      warrantyTerms: header.warrantyTerms || null,
      exclusions: header.exclusions || null,
      notes: header.notes || null,
      expectedUpdatedAt: quote?.updatedAt ?? null,
      items: lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        name: line.name.trim(),
        description: line.description.trim() || null,
        unit: line.unit || "pcs",
        quantity: safe(line.quantity),
        unitPrice: safe(line.unitPrice),
        discountPct: safe(line.discountPct),
        taxRate: new Decimal(safe(line.taxPct)).div(100).toFixed(5),
        costUnitMmk: "0",
      })),
    };

    startTransition(async () => {
      const result = await saveQuotation(payload);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      dirtyRef.current = false;
      router.push(`/quotations/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {mode === "create" ? "New quotation" : "Edit draft"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {quote ? `${quote.quoteNo}${quote.revision > 1 ? ` Rev ${quote.revision}` : ""}` : "Untitled quotation"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={quote ? `/quotations/${quote.id}` : "/quotations"}
            className="btn-secondary"
          >
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-xs">
              {Object.entries(fieldErrors).slice(0, 6).map(([field, messages]) => (
                <li key={field}>
                  {field}: {messages.join(", ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="card p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="customerId">
              Customer
            </label>
            <select
              id="customerId"
              className="w-full"
              value={header.customerId}
              onChange={(event) => {
                const customer = customers.find((row) => row.id === event.target.value);
                updateHeader("customerId", event.target.value);
                if (customer && mode === "create") {
                  updateHeader("currency", customer.defaultCurrency);
                }
              }}
              required
            >
              <option value="">Select a customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.city ? ` · ${customer.city}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="currency">
              Currency
            </label>
            <select
              id="currency"
              className="w-full"
              value={header.currency}
              onChange={(event) => changeCurrency(event.target.value)}
            >
              <option value="MMK">MMK</option>
              <option value="USD">USD</option>
              <option value="THB">THB</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              FX{" "}
              {header.currency === "MMK"
                ? "1"
                : formatDecimal(fxRates[header.currency] ?? "0", 8)}{" "}
              MMK per unit
              {header.currency !== "MMK" ? " · frozen on save" : ""}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="validUntil">
              Valid until
            </label>
            <input
              id="validUntil"
              type="date"
              className="w-full"
              value={header.validUntil}
              onChange={(event) => updateHeader("validUntil", event.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="label" htmlFor="projectTitle">
              Project / opportunity
            </label>
            <input
              id="projectTitle"
              className="w-full"
              value={header.projectTitle}
              onChange={(event) => updateHeader("projectTitle", event.target.value)}
              placeholder="e.g. Head office network refresh"
            />
          </div>

          <div>
            <label className="label" htmlFor="subject">
              Subject line
            </label>
            <input
              id="subject"
              className="w-full"
              value={header.subject}
              onChange={(event) => updateHeader("subject", event.target.value)}
              placeholder="Quotation for supply and installation"
            />
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Line items</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              markDirty();
              setLines((current) => [...current, blankLine(header.defaultTaxPct)]);
            }}
          >
            Add line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-8 px-3 py-2">#</th>
                <th className="min-w-[240px] px-3 py-2">Item</th>
                <th className="w-20 px-2 py-2">Qty</th>
                <th className="w-20 px-2 py-2">Unit</th>
                <th className="w-32 px-2 py-2">Unit price</th>
                <th className="w-20 px-2 py-2">Disc %</th>
                <th className="w-20 px-2 py-2">Tax %</th>
                <th className="w-28 px-2 py-2 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-3 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-3">
                    <select
                      className="mb-2 w-full"
                      value={line.productId ?? ""}
                      onChange={(event) => applyProduct(line.key, event.target.value)}
                    >
                      <option value="">— Free-text line —</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} · {product.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full font-medium"
                      value={line.name}
                      onChange={(event) => updateLine(line.key, { name: event.target.value })}
                      placeholder="Description"
                      required
                    />
                    <input
                      className="mt-1 w-full text-xs"
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.key, { description: event.target.value })
                      }
                      placeholder="Optional detail shown on the PDF"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-full text-right"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, { quantity: numericText(event.target.value) })
                      }
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-full"
                      value={line.unit}
                      onChange={(event) => updateLine(line.key, { unit: event.target.value })}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-full text-right"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(line.key, { unitPrice: numericText(event.target.value) })
                      }
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-full text-right"
                      inputMode="decimal"
                      value={line.discountPct}
                      onChange={(event) =>
                        updateLine(line.key, { discountPct: numericText(event.target.value) })
                      }
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-full text-right"
                      inputMode="decimal"
                      value={line.taxPct}
                      onChange={(event) =>
                        updateLine(line.key, { taxPct: numericText(event.target.value) })
                      }
                    />
                  </td>
                  <td className="px-2 py-3 text-right font-medium tabular-nums">
                    {totals.lines[index]?.lineTotal.toFixed(2) ?? "0.00"}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => {
                        markDirty();
                        setLines((current) =>
                          current.length > 1
                            ? current.filter((row) => row.key !== line.key)
                            : current,
                        );
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {missingPrices.length > 0 ? (
          <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            {missingPrices.length} catalog line(s) have no {header.currency} price. Enter
            the unit price manually or update the catalog.
          </p>
        ) : null}

        <div className="grid gap-4 border-t border-slate-200 px-4 py-4 md:grid-cols-[1fr_360px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="discountKind">
                Header discount
              </label>
              <div className="flex gap-2">
                <select
                  id="discountKind"
                  value={header.discountKind}
                  onChange={(event) =>
                    updateHeader(
                      "discountKind",
                      event.target.value as "none" | "percent" | "amount",
                    )
                  }
                >
                  <option value="none">None</option>
                  <option value="percent">Percent</option>
                  <option value="amount">Amount</option>
                </select>
                <input
                  className="w-full text-right"
                  inputMode="decimal"
                  value={header.discountValue}
                  disabled={header.discountKind === "none"}
                  onChange={(event) =>
                    updateHeader("discountValue", numericText(event.target.value))
                  }
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="defaultTax">
                Default tax % (new lines)
              </label>
              <input
                id="defaultTax"
                className="w-full text-right"
                inputMode="decimal"
                value={header.defaultTaxPct}
                onChange={(event) =>
                  updateHeader("defaultTaxPct", numericText(event.target.value))
                }
              />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotal, header.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Discount</dt>
                <dd className="tabular-nums">
                  − {formatMoney(totals.discountTotal, header.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{taxLabel}</dt>
                <dd className="tabular-nums">{formatMoney(totals.vatTotal, header.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(totals.grandTotal, header.currency)}</dd>
              </div>
              {header.currency !== "MMK" ? (
                <div className="flex justify-between text-xs text-slate-500">
                  <dt>MMK equivalent</dt>
                  <dd className="tabular-nums">{formatMoney(mmkTotal, "MMK")}</dd>
                </div>
              ) : null}
            </dl>

            {header.discountKind === "percent" && safe(header.discountValue) !== "0" ? (
              <p className="mt-3 text-xs text-slate-500">
                Effective discount:{" "}
                {totals.discountTotal.div(totals.subtotal.isZero() ? 1 : totals.subtotal).mul(100).toFixed(1)}%
              </p>
            ) : null}

            {guardrails.warnings.length > 0 ? (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {guardrails.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            {guardrails.blockers.length > 0 ? (
              <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {guardrails.blockers.map((blocker) => (
                  <p key={blocker}>{blocker}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="mb-3 font-semibold">Terms and notes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="paymentTerms">
              Payment terms
            </label>
            <textarea
              id="paymentTerms"
              rows={3}
              className="w-full"
              value={header.paymentTerms}
              onChange={(event) => updateHeader("paymentTerms", event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="deliveryTerms">
              Delivery terms
            </label>
            <textarea
              id="deliveryTerms"
              rows={3}
              className="w-full"
              value={header.deliveryTerms}
              onChange={(event) => updateHeader("deliveryTerms", event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="warrantyTerms">
              Warranty
            </label>
            <textarea
              id="warrantyTerms"
              rows={3}
              className="w-full"
              value={header.warrantyTerms}
              onChange={(event) => updateHeader("warrantyTerms", event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="exclusions">
              Exclusions
            </label>
            <textarea
              id="exclusions"
              rows={3}
              className="w-full"
              value={header.exclusions}
              onChange={(event) => updateHeader("exclusions", event.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="notes">
              Internal / customer note
            </label>
            <textarea
              id="notes"
              rows={3}
              className="w-full"
              value={header.notes}
              onChange={(event) => updateHeader("notes", event.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="text-sm">
            <span className="text-slate-500">Total</span>{" "}
            <span className="font-semibold tabular-nums">
              {formatMoney(totals.grandTotal, header.currency)}
            </span>
            {header.currency !== "MMK" ? (
              <span className="ml-2 text-xs text-slate-500">
                ≈ {formatMoney(mmkTotal, "MMK")}
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Link
              href={quote ? `/quotations/${quote.id}` : "/quotations"}
              className="btn-secondary"
            >
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
