import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getAuditLog } from "@/lib/admin";

export const metadata: Metadata = { title: "Audit log" };

/**
 * Audit log (PRD §12.3, §13.2).
 *
 * Read-only by construction: the table has no update or delete policy, and
 * nothing in the app offers a way to edit an entry.
 */
export default async function AuditLogPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/audit");
  const entries = await getAuditLog(100);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-muted-foreground">
          Append-only record of administrative actions. Showing the 100 most recent.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No administrative actions recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Entity</th>
                <th className="px-5 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {entry.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-3">
                    {entry.actor ? (
                      <>
                        <p className="font-medium">
                          {entry.actor.profile?.firstName} {entry.actor.profile?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.actor.email}</p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">system</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{entry.action}</code>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{entry.entityType}</td>
                  <td className="max-w-md px-5 py-3">
                    <pre className="overflow-x-auto text-xs text-muted-foreground">
                      {JSON.stringify(entry.after ?? entry.before ?? {})}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
