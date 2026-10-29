import Link from "next/link";
import { Flash } from "@/components/flash";
import { listCustomers } from "@/lib/db/queries";
import { canEdit, requireSession } from "@/lib/session";
import { CustomerRowActions } from "./customer-row-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

const STATUS_MESSAGES: Record<string, string> = {
  created: "Customer created.",
  updated: "Customer updated.",
  activated: "Customer activated.",
  deactivated: "Customer deactivated.",
  deleted: "Customer deleted.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "in-use":
    "That customer is used by one or more quotations and cannot be deleted. Deactivate it instead.",
  "not-found": "That customer no longer exists.",
};

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function CustomersPage({
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
  const params = await searchParams;
  const q = single(params.q);
  const requestedStatus = single(params.status);
  const status = ["active", "inactive", "all"].includes(requestedStatus)
    ? requestedStatus
    : "active";

  const rows = await listCustomers(status === "active", q);
  const customers =
    status === "inactive" ? rows.filter((customer) => !customer.isActive) : rows;

  const notice = STATUS_MESSAGES[single(params.notice)];
  const error = ERROR_MESSAGES[single(params.error)];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {customers.filter((customer) => customer.isActive).length} active ·{" "}
            {customers.length} shown. Details are snapshotted onto quotations.
          </p>
        </div>
        {editable ? (
          <Link href="/customers/new" className="btn-primary">
            New customer
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
            placeholder="Name, contact, city or email"
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
          <Link href="/customers" className="btn-secondary">
            Reset
          </Link>
        ) : null}
      </form>

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
                {editable ? <th className="text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 6 : 5}
                    className="py-10 text-center text-slate-500"
                  >
                    {q || status !== "active"
                      ? "No customers match this filter."
                      : "No customers yet. Add the first customer to start quoting."}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className={customer.isActive ? undefined : "opacity-60"}
                  >
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
                    {editable ? (
                      <td className="text-right">
                        <CustomerRowActions
                          customerId={customer.id}
                          name={customer.name}
                          isActive={customer.isActive}
                        />
                      </td>
                    ) : null}
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
