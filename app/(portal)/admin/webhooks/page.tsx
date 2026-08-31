import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { listEndpoints, listRecentDeliveries } from "@/lib/webhooks";
import { WebhookForm } from "@/components/admin/webhook-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteEndpointAction, toggleEndpointAction } from "./actions";

export const metadata: Metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

/** Webhook management (PRD §13.3). */
export default async function WebhooksPage() {
  await requireRole(["SUPER_ADMIN"], "/admin/webhooks");

  const [endpoints, deliveries, organizations] = await Promise.all([
    listEndpoints(),
    listRecentDeliveries(undefined, 20),
    prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-muted-foreground">
          Push events to partner systems instead of making them poll. Every delivery is signed, and
          every attempt is recorded.
        </p>
      </header>

      <WebhookForm organizations={organizations} />

      <section>
        <h2 className="font-display text-xl font-semibold">Endpoints</h2>

        {endpoints.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No endpoints yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{endpoint.name}</p>
                    {!endpoint.isActive && (
                      <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                        disabled
                      </span>
                    )}
                    {endpoint.isActive && endpoint.failureCount > 0 && (
                      <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                        {endpoint.failureCount} recent failure{endpoint.failureCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{endpoint.url}</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {endpoint.events.map((e) => e.replaceAll("_", ".").toLowerCase()).join(", ")}
                    {endpoint.organization ? ` · ${endpoint.organization.name}` : " · all activity"}
                    {" · "}
                    {endpoint.lastSuccessAt
                      ? `last delivered ${endpoint.lastSuccessAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}`
                      : "never delivered"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={toggleEndpointAction}>
                    <input type="hidden" name="endpointId" value={endpoint.id} />
                    <input type="hidden" name="isActive" value={String(!endpoint.isActive)} />
                    <SubmitButton
                      pendingLabel="Saving..."
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                    >
                      {endpoint.isActive ? "Disable" : "Enable"}
                    </SubmitButton>
                  </form>
                  <form action={deleteEndpointAction}>
                    <input type="hidden" name="endpointId" value={endpoint.id} />
                    <SubmitButton
                      pendingLabel="Removing..."
                      className="rounded-lg px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                    >
                      Delete
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Recent deliveries</h2>

        {deliveries.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing sent yet. Events appear here as certificates are issued and payments succeed.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Endpoint</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Attempts</th>
                  <th className="px-5 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-5 py-3 font-mono text-xs">
                      {delivery.event.replaceAll("_", ".").toLowerCase()}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{delivery.endpoint.name}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          delivery.status === "DELIVERED"
                            ? "bg-success/10 text-success"
                            : delivery.status === "FAILED"
                              ? "bg-danger/10 text-danger"
                              : "bg-warning/10 text-warning"
                        }`}
                      >
                        {delivery.status.toLowerCase()}
                      </span>
                      {delivery.error && (
                        <span className="mt-1 block max-w-xs truncate text-xs text-muted-foreground">
                          {delivery.error}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {delivery.attempts}
                      {delivery.responseCode ? ` · ${delivery.responseCode}` : ""}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {(delivery.deliveredAt ?? delivery.createdAt).toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
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
