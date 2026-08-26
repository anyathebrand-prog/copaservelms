import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { buildReport, REPORTS, type ReportId } from "@/lib/reports/definitions";
import { MIME, renderReport, reportFilename, type Format } from "@/lib/reports/render";

/**
 * GET /api/reports/:reportId?format=csv|xlsx|pdf
 *
 * Reports carry personal data across every learner and payer, so this is
 * admin-only and each download writes an audit entry — an export is itself a
 * processing activity under the NDPA (§12.3).
 */
export const dynamic = "force-dynamic";

const FORMATS: Format[] = ["csv", "xlsx", "pdf"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isAdmin(user.roles)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { reportId } = await params;
  if (!REPORTS.some((r) => r.id === reportId)) {
    return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "csv") as Format;
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: "Unsupported format." }, { status: 400 });
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const report = await buildReport(reportId as ReportId, {
    from: from ? new Date(from) : null,
    // Inclusive of the end date: a range ending "today" should contain today.
    to: to ? new Date(`${to}T23:59:59.999Z`) : null,
  });

  const body = await renderReport(report, format);
  const requestHeaders = await headers();

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "report.export",
      entityType: "Report",
      entityId: reportId,
      after: { format, rows: report.rows.length, from, to },
      ipAddress: requestHeaders.get("x-forwarded-for"),
      userAgent: requestHeaders.get("user-agent"),
    },
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${reportFilename(report, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
