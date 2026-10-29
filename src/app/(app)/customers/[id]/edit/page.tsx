import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerById } from "@/lib/db/queries";
import { formatDate } from "@/lib/domain/format";
import { requireRole } from "@/lib/session";
import { CustomerForm } from "../../customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("sales", "admin");
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Last updated {formatDate(customer.updatedAt)}. Existing quotations keep
            their saved customer snapshot.
          </p>
        </div>
        <Link href="/customers" className="btn-secondary">
          Back to customers
        </Link>
      </div>

      <section className="card p-5">
        <CustomerForm customer={customer} />
      </section>
    </div>
  );
}
