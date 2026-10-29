"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Customer } from "@/lib/db/schema";
import { saveCustomer, type CustomerFormState } from "./actions";

const initialState: CustomerFormState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-red-700" role="alert">
      {messages[0]}
    </p>
  );
}

export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, formAction, pending] = useActionState(saveCustomer, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Customer name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={200}
            defaultValue={customer?.name ?? ""}
            className="w-full"
            placeholder="Myanmar Aye Thar Yar Co., Ltd."
          />
          <FieldError messages={state.fieldErrors?.name} />
        </div>

        <div>
          <label className="label" htmlFor="attention">
            Attention / contact person
          </label>
          <input
            id="attention"
            name="attention"
            maxLength={200}
            defaultValue={customer?.attention ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.attention} />
        </div>

        <div>
          <label className="label" htmlFor="taxId">
            Tax ID
          </label>
          <input
            id="taxId"
            name="taxId"
            maxLength={100}
            defaultValue={customer?.taxId ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.taxId} />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            maxLength={100}
            defaultValue={customer?.phone ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.phone} />
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={200}
            defaultValue={customer?.email ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.email} />
        </div>

        <div>
          <label className="label" htmlFor="city">
            City / township
          </label>
          <input
            id="city"
            name="city"
            maxLength={100}
            defaultValue={customer?.city ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.city} />
        </div>

        <div>
          <label className="label" htmlFor="country">
            Country
          </label>
          <input
            id="country"
            name="country"
            required
            maxLength={100}
            defaultValue={customer?.country ?? "Myanmar"}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.country} />
        </div>

        <div>
          <label className="label" htmlFor="defaultCurrency">
            Default currency
          </label>
          <select
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue={customer?.defaultCurrency ?? "MMK"}
            className="w-full"
          >
            <option value="MMK">MMK</option>
            <option value="USD">USD</option>
            <option value="THB">THB</option>
          </select>
          <FieldError messages={state.fieldErrors?.defaultCurrency} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">
            Address
          </label>
          <textarea
            id="address"
            name="address"
            rows={3}
            maxLength={2000}
            defaultValue={customer?.address ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.address} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Internal notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={4000}
            defaultValue={customer?.notes ?? ""}
            className="w-full"
            placeholder="Not printed on quotations."
          />
          <FieldError messages={state.fieldErrors?.notes} />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={customer?.isActive ?? true}
            />
            Active — available for new quotations
          </label>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Link href="/customers" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : customer ? "Save changes" : "Create customer"}
        </button>
      </div>
    </form>
  );
}
