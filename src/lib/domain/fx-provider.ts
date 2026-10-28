/**
 * Pure parsing for exchange-rate provider payloads.
 *
 * Two shapes are accepted:
 *
 * 1. USD-based open feed (open.er-api.com), where `rates.MMK` is MMK per USD
 *    and `rates.THB` is THB per USD:
 *      { base_code: "USD", rates: { USD: 1, THB: 33.7, MMK: 2097.5 } }
 * 2. The original direct shape, already expressed as MMK per unit:
 *      { date: "2026-10-28", rates: { USD: 4500, THB: 125 } }
 *
 * The rest of the app always works in MMK per one unit of the quote currency.
 */

export const OPEN_FX_URL = "https://open.er-api.com/v6/latest/USD";

export type ParsedFxRates = {
  effectiveDate?: string;
  /** MMK per one unit of each supported foreign currency. */
  rates: { USD: number; THB: number };
};

type ProviderPayload = {
  result?: string;
  "error-type"?: string;
  base_code?: string;
  date?: string;
  rates?: Record<string, unknown>;
};

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseFxProviderPayload(payload: unknown): ParsedFxRates {
  if (!payload || typeof payload !== "object") {
    throw new Error("FX provider returned an invalid payload");
  }

  const data = payload as ProviderPayload;

  if (data.result === "error" || data.result === "failed") {
    throw new Error(`FX provider error: ${data["error-type"] ?? data.result}`);
  }

  const rates = data.rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("FX provider payload has no rates");
  }

  const usd = rates.USD;
  const thb = rates.THB;
  const mmk = rates.MMK;
  const usdBased = data.base_code === "USD" || (usd === 1 && isPositive(mmk));

  if (usdBased) {
    if (!isPositive(usd) || !isPositive(thb) || !isPositive(mmk)) {
      throw new Error("FX provider payload is missing USD, THB or MMK");
    }
    return {
      effectiveDate: isDate(data.date) ? data.date : undefined,
      rates: { USD: mmk / usd, THB: mmk / thb },
    };
  }

  if (!isPositive(usd) || !isPositive(thb)) {
    throw new Error("FX provider payload is missing USD or THB");
  }

  return {
    effectiveDate: isDate(data.date) ? data.date : undefined,
    rates: { USD: usd, THB: thb },
  };
}
