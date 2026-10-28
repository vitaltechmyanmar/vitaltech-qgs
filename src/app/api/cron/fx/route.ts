import { syncExchangeRates } from "@/lib/fx/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.FX_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * EventBridge calls this at 09:00 Asia/Yangon.
 * Pulls USD/THB from open.er-api.com (or FX_PROVIDER_URL) and upserts today's
 * rows. A manual rate for the same day is never overwritten.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncExchangeRates();
    console.info("[cron/fx] synced", result);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/fx] failed", error);
    return Response.json({ error: "fx_sync_failed" }, { status: 502 });
  }
}
