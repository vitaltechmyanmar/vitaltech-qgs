import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listCustomers } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireSession();
  const customers = await listCustomers(false);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">
          {customers.filter((customer) => customer.isActive).length} active of{" "}
          {customers.length} total.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Currency</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No customers yet. Run the seed script or add customers.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <p className="font-medium">{customer.name}</p>
                      {customer.taxId ? (
                        <p className="text-xs text-slate-500">Tax ID {customer.taxId}</p>
                      ) : null}
                    </td>
                    <td className="text-slate-600">
                      {customer.attention ? <p>{customer.attention}</p> : null}
                      {customer.phone ? <p className="text-xs">{customer.phone}</p> : null}
                      {customer.email ? <p className="text-xs">{customer.email}</p> : null}
                    </td>
                    <td className="text-slate-600">
                      {[customer.city, customer.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="text-slate-600">{customer.defaultCurrency}</td>
                    <td>
                      <span
                        className={`badge ${
                          customer.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {customer.isActive ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/quotations/new?customer=${customer.id}`}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        New quote
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
