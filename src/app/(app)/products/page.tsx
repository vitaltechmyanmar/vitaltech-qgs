import Link from "next/link";
import { Flash } from "@/components/flash";
import { listProductsWithPrices } from "@/lib/db/queries";
import { Decimal, dec } from "@/lib/domain/money";
import { formatMoney } from "@/lib/domain/format";
import { canEdit, requireSession } from "@/lib/session";
import { ProductRowActions } from "./product-row-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

const STATUS_MESSAGES: Record<string, string> = {
  created: "Product created.",
  updated: "Product updated.",
  activated: "Product activated.",
  deactivated: "Product deactivated.",
  deleted: "Product deleted.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "in-use":
    "That product is used by one or more quotations and cannot be deleted. Deactivate it instead.",
  "not-found": "That product no longer exists.",
};

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
}) {
  const session = await requireSession();
  const editable = canEdit(session.user.role);
  const showCost = editable;
  const params = await searchParams;
  const q = single(params.q);
  const requestedStatus = single(params.status);
  const status = ["active", "inactive", "all"].includes(requestedStatus)
    ? requestedStatus
    : "active";

  const rows = await listProductsWithPrices(status === "active", q);
  const products =
    status === "inactive" ? rows.filter((product) => !product.isActive) : rows;

  const notice = STATUS_MESSAGES[single(params.notice)];
  const error = ERROR_MESSAGES[single(params.error)];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product catalog</h1>
          <p className="mt-1 text-sm text-slate-500">
            {products.filter((product) => product.isActive).length} active ·{" "}
            {products.length} shown. Prices are per currency; cost is always MMK.
          </p>
        </div>
        {editable ? (
          <Link href="/products/new" className="btn-primary">
            New product
          </Link>
        ) : null}
      </div>

      {error ? <Flash tone="error">{error}</Flash> : null}
      {!error && notice ? <Flash tone="success">{notice}</Flash> : null}

      <form method="get" className="card flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="w-full"
            placeholder="SKU, name or category"
          />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="w-full">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        {q || status !== "active" ? (
          <Link href="/products" className="btn-secondary">
            Reset
          </Link>
        ) : null}
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Category</th>
                <th>Unit</th>
                <th className="text-right">MMK</th>
                <th className="text-right">USD</th>
                <th className="text-right">THB</th>
                {showCost ? <th className="text-right">Cost MMK</th> : null}
                {showCost ? <th className="text-right">Margin</th> : null}
                <th>Status</th>
                {editable ? <th className="text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 11 : 8}
                    className="py-10 text-center text-slate-500"
                  >
                    {q || status !== "active"
                      ? "No products match this filter."
                      : "No catalog items yet. Add the first product to start quoting."}
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const mmk = product.prices.MMK ?? "0";
                  const margin = dec(mmk).minus(dec(product.costPriceMmk));
                  const marginPct = dec(mmk).isZero()
                    ? new Decimal(0)
                    : margin.div(dec(mmk)).mul(100);
                  return (
                    <tr
                      key={product.id}
                      className={product.isActive ? undefined : "opacity-60"}
                    >
                      <td className="whitespace-nowrap font-mono text-xs">
                        {product.sku}
                      </td>
                      <td>
                        <p className="font-medium">{product.name}</p>
                        {product.description ? (
                          <p className="text-xs text-slate-500">{product.description}</p>
                        ) : null}
                      </td>
                      <td className="text-slate-600">{product.category ?? "—"}</td>
                      <td className="text-slate-600">{product.unit}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(mmk, "MMK")}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {product.prices.USD
                          ? formatMoney(product.prices.USD, "USD")
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {product.prices.THB
                          ? formatMoney(product.prices.THB, "THB")
                          : "—"}
                      </td>
                      {showCost ? (
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {formatMoney(product.costPriceMmk, "MMK")}
                        </td>
                      ) : null}
                      {showCost ? (
                        <td className="whitespace-nowrap text-right tabular-nums">
                          <span
                            className={
                              marginPct.lessThan(15)
                                ? "text-amber-700"
                                : "text-emerald-700"
                            }
                          >
                            {marginPct.toFixed(1)}%
                          </span>
                        </td>
                      ) : null}
                      <td>
                        <span
                          className={`badge ${
                            product.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {product.isActive ? "active" : "inactive"}
                        </span>
                      </td>
                      {editable ? (
                        <td className="text-right">
                          <ProductRowActions
                            productId={product.id}
                            name={product.name}
                            isActive={product.isActive}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
