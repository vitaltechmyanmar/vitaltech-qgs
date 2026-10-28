"use client";

import { useActionState } from "react";
import { refreshExchangeRates, type FxRefreshState } from "./actions";

const initialState: FxRefreshState = {};

export function FxRefreshButton() {
  const [state, formAction, pending] = useActionState(
    refreshExchangeRates,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Refreshing…" : "Refresh rates"}
      </button>
      {state.message ? (
        <p role="status" className="max-w-xs text-right text-xs text-emerald-700">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
