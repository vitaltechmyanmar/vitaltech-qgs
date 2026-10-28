import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { yangonToday } from "@/lib/db/queries";
import { OPEN_FX_URL, parseFxProviderPayload } from "@/lib/domain/fx-provider";

export type FxSyncResult = {
  effectiveDate: string;
  provider: string;
  updated: string[];
};

/**
 * Fetch the latest USD/THB rates and upsert today's exchange_rates rows.
 *
 * - Defaults to the free open.er-api.com feed; set FX_PROVIDER_URL to override.
 * - Manual rows for the same currency/day are never overwritten.
 * - Existing quotations keep their frozen fx_rate_mmk_per_unit.
 */
export async function syncExchangeRates(
  fetchImpl: typeof fetch = fetch,
): Promise<FxSyncResult> {
  const url = process.env.FX_PROVIDER_URL?.trim() || OPEN_FX_URL;
  const provider = new URL(url).hostname;

  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      ...(process.env.FX_API_KEY
        ? { authorization: `Bearer ${process.env.FX_API_KEY}` }
        : {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FX provider returned ${response.status}`);
  }

  const parsed = parseFxProviderPayload(await response.json());
  const effectiveDate = parsed.effectiveDate ?? yangonToday();
  const updated: string[] = [];

  for (const currency of ["USD", "THB"] as const) {
    const value = parsed.rates[currency].toFixed(8);
    const result = await getDb().execute(sql`
      insert into exchange_rates (currency, mmk_per_unit, effective_date, source, note)
      values (${currency}, ${value}, ${effectiveDate}, 'provider', ${provider})
      on conflict (currency, effective_date) do update
        set mmk_per_unit = excluded.mmk_per_unit,
            source = 'provider',
            note = excluded.note
        where exchange_rates.source <> 'manual'
      returning currency
    `);

    if (result.rows.length > 0) updated.push(currency);
  }

  return { effectiveDate, provider, updated };
}
