import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { buildReport, REPORTS, type ReportId } from "@/lib/reports/definitions";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/** Reports with PDF/Excel export (PRD §13.2). */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; from?: string; to?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/reports");
  const { report: requested, from, to } = await searchParams;

  const reportId = (REPORTS.some((r) => r.id === requested) ? requested : "enrolments") as ReportId;

  const report = await buildReport(reportId, {
    from: from ? new Date(from) : null,
    to: to ? new Date(`${to}T23:59:59.999Z`) : null,
  });

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const rangeQuery = query.toString();

  // Only the first 50 rows are shown; the export carries everything.
  const preview = report.rows.slice(0, 50);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-muted-foreground">
          Every export is recorded in the audit log — an export is itself a processing activity.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {REPORTS.map((item) => (
          <Link
            key={item.id}
            href={`/admin/reports?report=${item.id}${rangeQuery ? `&${rangeQuery}` : ""}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              item.id === reportId ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
            }`}
          >
            {item.title}
          </Link>
        ))}
      </nav>

      <form action="/admin/reports" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5">
        <input type="hidden" name="report" value={reportId} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
        >
          Apply range
        </button>

        <div className="ml-auto flex flex-wrap gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((format) => (
            <a
              key={format}
              href={`/api/reports/${reportId}?format=${format}${rangeQuery ? `&${rangeQuery}` : ""}`}
              className={
                format === "xlsx"
                  ? "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                  : "rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
              }
            >
              {format === "xlsx" ? "Download Excel" : `Download ${format.toUpperCase()}`}
            </a>
          ))}
        </div>
      </form>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{report.title}</h2>
          <p className="text-sm text-muted-foreground">
            {report.rows.length} row{report.rows.length === 1 ? "" : "s"}
            {report.rows.length > preview.length ? ` · showing first ${preview.length}` : ""}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>

        {report.summary && report.summary.length > 0 && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {report.summary.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-surface p-4">
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 font-display text-xl font-bold">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {report.rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No data in this period.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  {report.columns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-4 py-3 font-medium">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((row, index) => (
                  <tr key={index}>
                    {report.columns.map((column) => (
                      <td key={column.key} className="whitespace-nowrap px-4 py-2.5">
                        {formatCell(row[column.key], column.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatCell(value: string | number | Date | null, type: string): string {
  if (value === null || value === undefined || value === "") return "—";

  if (type === "currency") {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(value) / 100);
  }
  if (type === "percent") return `${Number(value)}%`;
  if (type === "date" && value instanceof Date) {
    return value.toLocaleDateString("en-NG", { dateStyle: "medium" });
  }
  return String(value);
}
