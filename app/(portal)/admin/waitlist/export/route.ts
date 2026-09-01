import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { exportWaitlistCsv } from "@/lib/waitlist";

/**
 * GET /admin/waitlist/export
 *
 * Unsubscribed addresses are excluded inside exportWaitlistCsv rather than
 * here, because the most likely fate of this file is being pasted into
 * something that sends mail, and a filter the caller has to remember is a
 * filter someone eventually forgets.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const csv = await exportWaitlistCsv();
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="copaserve-waitlist-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
