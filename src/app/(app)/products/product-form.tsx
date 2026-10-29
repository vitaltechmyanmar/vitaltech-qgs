"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ProductWithPrices } from "@/lib/db/queries";
import { Decimal } from "@/lib/domain/money";
import { saveProduct, type ProductFormState } from "./actions";

const initialState: ProductFormState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-red-700" role="alert">
      {messages[0]}
    </p>
  );
}

export function ProductForm({ product }: { product?: ProductWithPrices }) {
  const [state, formAction, pending] = useActionState(saveProduct, initialState);
  const taxPct = product
    ? new Decimal(product.taxRate).mul(100).toDecimalPlaces(3).toString()
    : "5";

  return (
    <form action={formAction} className="space-y-6">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sku">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            required
            maxLength={64}
            defaultValue={product?.sku ?? ""}
            className="w-full font-mono uppercase"
            placeholder="VT-SW-9200"
          />
          <FieldError messages={state.fieldErrors?.sku} />
        </div>

        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <input
            id="category"
            name="category"
            maxLength={100}
            defaultValue={product?.category ?? ""}
            className="w-full"
            placeholder="Network"
          />
          <FieldError messages={state.fieldErrors?.category} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Item name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={300}
            defaultValue={product?.name ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.name} />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={2000}
            defaultValue={product?.description ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.description} />
        </div>

        <div>
          <label className="label" htmlFor="unit">
            Unit
          </label>
          <input
            id="unit"
            name="unit"
            required
            maxLength={20}
            defaultValue={product?.unit ?? "pcs"}
            className="w-full"
            placeholder="pcs"
          />
          <FieldError messages={state.fieldErrors?.unit} />
        </div>

        <div>
          <label className="label" htmlFor="taxPct">
            Tax rate (%)
          </label>
          <input
            id="taxPct"
            name="taxPct"
            type="number"
            step="0.001"
            min="0"
            max="100"
            required
            defaultValue={taxPct}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.taxPct} />
        </div>

        <div>
          <label className="label" htmlFor="costPriceMmk">
            Cost price (MMK)
          </label>
          <input
            id="costPriceMmk"
            name="costPriceMmk"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.costPriceMmk ?? "0"}
            className="w-full"
          />
          <p className="mt-1 text-xs text-slate-500">
            Used for margin reporting; never shown to customers.
          </p>
          <FieldError messages={state.fieldErrors?.costPriceMmk} />
        </div>

        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Sell prices</h3>
          <p className="mt-1 text-xs text-slate-500">
            The MMK price is required. Leave USD or THB blank to hide that price
            in the quotation editor.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="priceMmk">
            MMK price
          </label>
          <input
            id="priceMmk"
            name="priceMmk"
            type="number"
            step="0.0001"
            min="0"
            required
            defaultValue={product?.prices.MMK ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.priceMmk} />
        </div>

        <div>
          <label className="label" htmlFor="priceUsd">
            USD price
          </label>
          <input
            id="priceUsd"
            name="priceUsd"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={product?.prices.USD ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.priceUsd} />
        </div>

        <div>
          <label className="label" htmlFor="priceThb">
            THB price
          </label>
          <input
            id="priceThb"
            name="priceThb"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={product?.prices.THB ?? ""}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.priceThb} />
        </div>

        <div className="flex items-end sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={product?.isActive ?? true}
            />
            Active — available in the quotation editor
          </label>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Link href="/products" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}
