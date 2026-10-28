import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { yangonToday } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.FX_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Marks overdue `sent` quotations as expired. Safe to run more than once. */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await getDb().execute(sql`
      with overdue as (
        update quotations
           set status = 'expired'
         where status = 'sent'
           and valid_until is not null
           and valid_until < ${yangonToday()}
        returning id
      )
      insert into quotation_events (quotation_id, event_type, details)
      select id, 'expired', '{"reason":"validity elapsed"}'::jsonb from overdue
      returning quotation_id
    `);

    return Response.json({ ok: true, expired: result.rows.length });
  } catch (error) {
    console.error("[cron/expire] failed", error);
    return Response.json({ error: "expire_failed" }, { status: 500 });
  }
}
