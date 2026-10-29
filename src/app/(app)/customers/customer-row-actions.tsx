"use client";

import Link from "next/link";
import { deleteCustomer, setCustomerActive } from "./actions";

const small = "px-2 py-1 text-xs";

export function CustomerRowActions({
  customerId,
  name,
  isActive,
}: {
  customerId: string;
  name: string;
  isActive: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={`/quotations/new?customer=${customerId}`}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        New quote
      </Link>
      <Link href={`/customers/${customerId}/edit`} className={`btn-secondary ${small}`}>
        Edit
      </Link>
      <form action={setCustomerActive}>
        <input type="hidden" name="id" value={customerId} />
        <input type="hidden" name="active" value={isActive ? "false" : "true"} />
        <button type="submit" className={`btn-secondary ${small}`}>
          {isActive ? "Deactivate" : "Activate"}
        </button>
      </form>
      <form
        action={deleteCustomer}
        onSubmit={(event) => {
          const message = `Delete ${name}? This cannot be undone. Customers used by quotations must be deactivated instead.`;
          if (!window.confirm(message)) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={customerId} />
        <button type="submit" className={`btn-danger ${small}`}>
          Delete
        </button>
      </form>
    </div>
  );
}
