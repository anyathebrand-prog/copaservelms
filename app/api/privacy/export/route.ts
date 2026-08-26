import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { exportUserData } from "@/lib/privacy";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/privacy/export — "Download my data" (PRD §12.2).
 *
 * Serves the caller's own data only; there is no id parameter, so there is
 * nothing to tamper with. The export is itself a processing activity, so it
 * writes an audit entry.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const [data, requestHeaders] = await Promise.all([exportUserData(user.id), headers()]);

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "privacy.export",
      entityType: "User",
      entityId: user.id,
      after: { self_service: true },
      ipAddress: requestHeaders.get("x-forwarded-for"),
      userAgent: requestHeaders.get("user-agent"),
    },
  });

  const filename = `copaserve-data-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
