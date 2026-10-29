import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductWithPricesById } from "@/lib/db/queries";
import { formatDate } from "@/lib/domain/format";
import { requireRole } from "@/lib/session";
import { ProductForm } from "../../product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("sales", "admin");
  const { id } = await params;
  const product = await getProductWithPricesById(id);
  if (!product) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono">{product.sku}</span> · last updated{" "}
            {formatDate(product.updatedAt)}. Existing quotations keep their saved
            line snapshots.
          </p>
        </div>
        <Link href="/products" className="btn-secondary">
          Back to products
        </Link>
      </div>

      <section className="card p-5">
        <ProductForm product={product} />
      </section>
    </div>
  );
}
