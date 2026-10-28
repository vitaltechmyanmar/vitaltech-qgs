"use client";

import { useActionState } from "react";
import type { CompanySettings } from "@/lib/db/schema";
import { Decimal } from "@/lib/domain/money";
import {
  updateCompanySettings,
  type CompanySettingsState,
} from "./actions";

const initialState: CompanySettingsState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-red-700" role="alert">
      {messages[0]}
    </p>
  );
}

export function CompanyForm({ company }: { company: CompanySettings }) {
  const [state, formAction, pending] = useActionState(
    updateCompanySettings,
    initialState,
  );
  const taxPct = new Decimal(company.defaultTaxRate)
    .mul(100)
    .toDecimalPlaces(3)
    .toString();

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="legalName">
            Legal name
          </label>
          <input
            id="legalName"
            name="legalName"
            required
            maxLength={200}
            defaultValue={company.legalName}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.legalName} />
        </div>

        <div>
          <label className="label" htmlFor="brandName">
            Brand name
          </label>
          <input
            id="brandName"
            name="brandName"
            required
            maxLength={200}
            defaultValue={company.brandName}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.brandName} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="tagline">
            Tagline
          </label>
          <input
            id="tagline"
            name="tagline"
            maxLength={300}
            defaultValue={company.tagline ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.tagline} />
        </div>

        <div>
          <label className="label" htmlFor="registrationNo">
            Company registration no.
          </label>
          <input
            id="registrationNo"
            name="registrationNo"
            maxLength={100}
            defaultValue={company.registrationNo ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.registrationNo} />
        </div>

        <div>
          <label className="label" htmlFor="taxId">
            Tax ID
          </label>
          <input
            id="taxId"
            name="taxId"
            maxLength={100}
            defaultValue={company.taxId ?? ""}
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
            defaultValue={company.phone ?? ""}
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
            defaultValue={company.email ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.email} />
        </div>

        <div>
          <label className="label" htmlFor="website">
            Website
          </label>
          <input
            id="website"
            name="website"
            type="url"
            maxLength={300}
            placeholder="https://vitaltechmyanmar.com"
            defaultValue={company.website ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.website} />
        </div>

        <div>
          <label className="label" htmlFor="quotePrefix">
            Quote prefix
          </label>
          <input
            id="quotePrefix"
            name="quotePrefix"
            required
            maxLength={20}
            defaultValue={company.quotePrefix}
            className="w-full uppercase"
          />
          <FieldError messages={state.fieldErrors?.quotePrefix} />
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
            defaultValue={company.address ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.address} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="bankDetails">
            Bank details (printed on quotations)
          </label>
          <textarea
            id="bankDetails"
            name="bankDetails"
            rows={4}
            maxLength={4000}
            defaultValue={company.bankDetails ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.bankDetails} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800">Quotation defaults</h3>
        <p className="mt-1 text-xs text-slate-500">
          Applied when a new quotation is started. Existing quotations keep their
          saved customer, line items, prices and terms.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="defaultCurrency">
            Default currency
          </label>
          <select
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue={company.defaultCurrency}
            className="w-full"
          >
            <option value="MMK">MMK</option>
            <option value="USD">USD</option>
            <option value="THB">THB</option>
          </select>
          <FieldError messages={state.fieldErrors?.defaultCurrency} />
        </div>

        <div>
          <label className="label" htmlFor="defaultTaxPct">
            Default tax rate (%)
          </label>
          <input
            id="defaultTaxPct"
            name="defaultTaxPct"
            type="number"
            step="0.001"
            min="0"
            max="100"
            required
            defaultValue={taxPct}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.defaultTaxPct} />
        </div>

        <div>
          <label className="label" htmlFor="taxLabel">
            Tax label
          </label>
          <input
            id="taxLabel"
            name="taxLabel"
            required
            maxLength={100}
            defaultValue={company.taxLabel}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.taxLabel} />
        </div>

        <div>
          <label className="label" htmlFor="defaultValidityDays">
            Default validity (days)
          </label>
          <input
            id="defaultValidityDays"
            name="defaultValidityDays"
            type="number"
            min="1"
            max="365"
            step="1"
            required
            defaultValue={company.defaultValidityDays}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.defaultValidityDays} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="defaultPaymentTerms">
            Payment terms
          </label>
          <textarea
            id="defaultPaymentTerms"
            name="defaultPaymentTerms"
            rows={2}
            maxLength={4000}
            defaultValue={company.defaultPaymentTerms ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.defaultPaymentTerms} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="defaultDeliveryTerms">
            Delivery terms
          </label>
          <textarea
            id="defaultDeliveryTerms"
            name="defaultDeliveryTerms"
            rows={2}
            maxLength={4000}
            defaultValue={company.defaultDeliveryTerms ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.defaultDeliveryTerms} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="defaultWarrantyTerms">
            Warranty terms
          </label>
          <textarea
            id="defaultWarrantyTerms"
            name="defaultWarrantyTerms"
            rows={2}
            maxLength={4000}
            defaultValue={company.defaultWarrantyTerms ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.defaultWarrantyTerms} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="footerNote">
            PDF footer note
          </label>
          <textarea
            id="footerNote"
            name="footerNote"
            rows={2}
            maxLength={2000}
            defaultValue={company.footerNote ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.footerNote} />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Company profile saved. New quotations and PDFs will use these values.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Last updated {company.updatedAt.toLocaleString("en-GB", { timeZone: "Asia/Yangon" })}
        </p>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
