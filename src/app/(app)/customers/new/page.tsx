import Link from "next/link";
import { requireRole } from "@/lib/session";
import { CustomerForm } from "../customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireRole("sales", "admin");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New customer</h1>
          <p className="mt-1 text-sm text-slate-500">
            Customer details are copied onto each quotation when it is saved.
          </p>
        </div>
        <Link href="/customers" className="btn-secondary">
          Back to customers
        </Link>
      </div>

      <section className="card p-5">
        <CustomerForm />
      </section>
    </div>
  );
}
