import { requireSession } from "@/lib/session";
import { listProductsWithPrices } from "@/lib/db/queries";
import { Decimal, dec } from "@/lib/domain/money";
import { formatMoney } from "@/lib/domain/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const session = await requireSession();
  const products = await listProductsWithPrices();
  const showCost = session.user.role !== "viewer";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Product catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          {products.length} active items. Prices are per currency; cost is always MMK.
        </p>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={showCost ? 9 : 7} className="py-10 text-center text-slate-500">
                    No catalog items yet. Run the seed script or add products.
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
                    <tr key={product.id}>
                      <td className="whitespace-nowrap font-mono text-xs">{product.sku}</td>
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
                        {product.prices.USD ? formatMoney(product.prices.USD, "USD") : "—"}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {product.prices.THB ? formatMoney(product.prices.THB, "THB") : "—"}
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
                              marginPct.lessThan(15) ? "text-amber-700" : "text-emerald-700"
                            }
                          >
                            {marginPct.toFixed(1)}%
                          </span>
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
