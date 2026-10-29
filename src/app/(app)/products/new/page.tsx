import Link from "next/link";
import { requireRole } from "@/lib/session";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireRole("sales", "admin");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New catalog item</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sell prices are per currency; cost is always MMK.
          </p>
        </div>
        <Link href="/products" className="btn-secondary">
          Back to products
        </Link>
      </div>

      <section className="card p-5">
        <ProductForm />
      </section>
    </div>
  );
}
