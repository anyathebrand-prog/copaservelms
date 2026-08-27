import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCalendar, toIcs } from "@/lib/calendar";

/**
 * GET /api/calendar.ics — the caller's own deadlines as a calendar feed.
 *
 * Session-authenticated rather than token-based, which means a desktop client
 * that cannot carry the session cookie will not subscribe. That is the right
 * trade for now: a permanent unguessable feed URL is a credential that never
 * expires and cannot be revoked without breaking every subscriber, and this
 * feed lists a named person's coursework.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const events = await getCalendar(user.id);
  const body = toIcs(events, "CopaServe — my learning");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="copaserve.ics"',
      "Cache-Control": "no-store",
    },
  });
}
