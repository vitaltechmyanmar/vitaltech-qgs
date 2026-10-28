import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({
      status: "ok",
      db: "ok",
      version: process.env.APP_VERSION ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json(
      {
        status: "degraded",
        db: "unreachable",
        version: process.env.APP_VERSION ?? "dev",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
