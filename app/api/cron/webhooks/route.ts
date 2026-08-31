import { NextResponse } from "next/server";
import { processPendingDeliveries } from "@/lib/webhooks";

/**
 * GET /api/cron/webhooks — attempt pending webhook deliveries.
 *
 * There is nowhere for a background worker to live on serverless, so retries
 * run on a schedule instead. Vercel signs its cron invocations with
 * CRON_SECRET; without that check this would be an endpoint anyone could use
 * to make the platform issue outbound requests on demand.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  // Refuse rather than run unguarded when no secret is configured: an open
  // trigger is worse than a schedule that has not started yet.
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const result = await processPendingDeliveries();

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
