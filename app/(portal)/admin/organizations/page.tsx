import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { listOrganizations } from "@/lib/organizations";
import { createOrganizationAction } from "./actions";

export const metadata: Metadata = { title: "Organisations" };

/** Corporate accounts (PRD §13.3). */
export default async function OrganizationsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/organizations");
  const organizations = await listOrganizations();

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Organisations</h1>
        <p className="mt-1 text-muted-foreground">
          Corporate accounts, staff cohorts, and bulk enrolment.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">New organisation</h2>
        <form action={createOrganizationAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <input
              name="name"
              required
              placeholder="First Bank of Nigeria"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Contact email</span>
            <input
              name="contactEmail"
              type="email"
              placeholder="learning@example.com"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Create organisation
            </button>
          </div>
        </form>
      </section>

      {organizations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No organisations yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {organizations.map((organization) => (
            <li
              key={organization.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
            >
              <div>
                <Link
                  href={`/admin/organizations/${organization.id}`}
                  className="font-medium hover:text-brand"
                >
                  {organization.name}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {organization._count.members} member{organization._count.members === 1 ? "" : "s"}
                  {organization.contactEmail ? ` · ${organization.contactEmail}` : ""}
                </p>
              </div>
              <Link
                href={`/admin/organizations/${organization.id}`}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
              >
                Manage
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
