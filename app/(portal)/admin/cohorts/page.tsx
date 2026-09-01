import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { listCohorts } from "@/lib/cohorts";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCohortAction } from "./actions";

export const metadata: Metadata = { title: "Cohorts" };
export const dynamic = "force-dynamic";

/** Cohorts (PRD §13.3): groups moving through training together. */
export default async function CohortsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/cohorts");

  const [cohorts, organizations, courses] = await Promise.all([
    listCohorts(),
    prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Cohorts</h1>
        <p className="mt-1 text-muted-foreground">
          A group that trains together. Enrol an intake once rather than person by person, and
          track it as a group afterwards.
        </p>
      </header>

      <form action={createCohortAction} className="grid gap-4 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2">
        <h2 className="font-display text-xl font-semibold sm:col-span-2">New cohort</h2>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="January 2026 intake"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Organisation</span>
          <select
            name="organizationId"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          >
            <option value="">None</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Restricts membership to that organisation&rsquo;s people.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Course</span>
          <select
            name="courseId"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          >
            <option value="">Not tied to one course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Progress is then reported against this course.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Starts</span>
          <input
            type="date"
            name="startsAt"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Ends</span>
          <input
            type="date"
            name="endsAt"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <div className="sm:col-span-2">
          <SubmitButton
            pendingLabel="Creating..."
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Create cohort
          </SubmitButton>
        </div>
      </form>

      <section>
        <h2 className="font-display text-xl font-semibold">All cohorts</h2>

        {cohorts.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No cohorts yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {cohorts.map((cohort) => (
              <li
                key={cohort.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="min-w-0">
                  <Link href={`/admin/cohorts/${cohort.id}`} className="font-medium hover:text-brand">
                    {cohort.name}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {cohort._count.members} member{cohort._count.members === 1 ? "" : "s"}
                    {cohort.organization ? ` · ${cohort.organization.name}` : ""}
                    {cohort.course ? ` · ${cohort.course.title}` : ""}
                    {cohort.startsAt
                      ? ` · from ${cohort.startsAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}`
                      : ""}
                  </p>
                </div>

                <Link
                  href={`/admin/cohorts/${cohort.id}`}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                >
                  Manage
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
