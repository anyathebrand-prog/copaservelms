import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getAllDataRequests } from "@/lib/privacy";
import { resolveRequestAction } from "./actions";

export const metadata: Metadata = { title: "Compliance" };

const LABELS: Record<string, string> = {
  ACCESS: "Access request",
  CORRECTION: "Correction request",
  ERASURE: "Erasure request",
  PORTABILITY: "Portability request",
  OBJECTION: "Objection",
  WITHDRAW_CONSENT: "Consent withdrawal",
};

const FILTERS = ["PENDING", "IN_PROGRESS", "COMPLETED", "REJECTED", "ALL"] as const;

/** Admin compliance dashboard — data subject requests (PRD §12.3). */
export default async function AdminPrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/privacy");
  const { status = "PENDING" } = await searchParams;

  const requests = await getAllDataRequests(
    status === "ALL"
      ? undefined
      : (status as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED"),
  );

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Compliance</h1>
        <p className="mt-1 text-muted-foreground">
          Data subject requests under the NDPA. Every resolution is written to the audit log.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            href={`/admin/privacy?status=${filter}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              status === filter ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
            }`}
          >
            {filter.replaceAll("_", " ").toLowerCase()}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No requests in this state.
        </p>
      ) : (
        <ul className="space-y-4">
          {requests.map((request) => (
            <li key={request.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{LABELS[request.type] ?? request.type}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {request.user.profile?.firstName} {request.user.profile?.lastName} (
                    {request.user.email})
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Raised{" "}
                    {request.createdAt.toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    request.status === "COMPLETED"
                      ? "bg-success/10 text-success"
                      : request.status === "REJECTED"
                        ? "bg-danger/10 text-danger"
                        : "bg-warning/10 text-warning"
                  }`}
                >
                  {request.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </div>

              {request.details && (
                <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm">{request.details}</p>
              )}

              {request.resolution ? (
                <p className="mt-3 text-sm">
                  <span className="font-medium">Resolution:</span> {request.resolution}
                  {request.handledBy && (
                    <span className="text-muted-foreground"> — {request.handledBy.email}</span>
                  )}
                </p>
              ) : (
                <form action={resolveRequestAction} className="mt-4 space-y-3 border-t border-border pt-4">
                  <input type="hidden" name="requestId" value={request.id} />
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">
                      What was done, and what was retained
                    </span>
                    <textarea
                      name="resolution"
                      required
                      rows={2}
                      placeholder="e.g. Profile fields erased; certificate records retained under statutory obligation."
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <StatusButton value="IN_PROGRESS" label="Mark in progress" />
                    <StatusButton value="COMPLETED" label="Complete" primary />
                    <StatusButton value="REJECTED" label="Reject" />
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusButton({
  value,
  label,
  primary = false,
}: {
  value: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="submit"
      name="status"
      value={value}
      className={
        primary
          ? "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          : "rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
      }
    >
      {label}
    </button>
  );
}
