import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { listApiKeys } from "@/lib/api-keys";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { revokeApiKeyAction } from "./actions";

export const metadata: Metadata = { title: "API keys" };
export const dynamic = "force-dynamic";

/** API key management (PRD §13.3). */
export default async function ApiKeysPage() {
  // Super Admin only: a key is machine access to the platform.
  await requireRole(["SUPER_ADMIN"], "/admin/api-keys");

  const [keys, organizations] = await Promise.all([
    listApiKeys(),
    prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">API keys</h1>
        <p className="mt-1 text-muted-foreground">
          Machine access for partners and corporate integrations. Keys are stored only as a hash,
          so a lost key is replaced rather than recovered.
        </p>
      </header>

      <ApiKeyForm organizations={organizations} />

      <section>
        <h2 className="font-display text-xl font-semibold">Issued keys</h2>

        {keys.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No keys issued yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {keys.map((key) => {
              const expired = key.expiresAt !== null && key.expiresAt < new Date();

              return (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{key.name}</p>
                      {key.revokedAt && (
                        <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          revoked
                        </span>
                      )}
                      {!key.revokedAt && expired && (
                        <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                          expired
                        </span>
                      )}
                    </div>

                    <p className="mt-1 font-mono text-xs text-muted-foreground">{key.prefix}…</p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {key.scopes.map((scope) => scope.replaceAll("_", " ").toLowerCase()).join(", ") ||
                        "no scopes"}
                      {key.organization ? ` · ${key.organization.name}` : " · platform-wide"}
                      {" · "}
                      {key.lastUsedAt
                        ? `last used ${key.lastUsedAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}`
                        : "never used"}
                    </p>
                  </div>

                  {!key.revokedAt && (
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="keyId" value={key.id} />
                      <SubmitButton
                        pendingLabel="Revoking..."
                        className="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                      >
                        Revoke
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
