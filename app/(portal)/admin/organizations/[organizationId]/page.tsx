import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getOrganization } from "@/lib/organizations";
import { StatCard } from "@/components/student/stat-card";
import { ProgressBar } from "@/components/student/progress-bar";
import { readOrgBranding } from "@/lib/settings";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateOrgBrandingAction } from "../../settings/actions";
import { addMembersAction, bulkEnrolAction, removeMemberAction } from "../actions";

export const metadata: Metadata = { title: "Organisation" };

/** One corporate account: members, bulk enrolment, and completion reporting. */
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await requireRole(["ADMIN", "SUPER_ADMIN"], `/admin/organizations/${organizationId}`);

  const [organization, courses] = await Promise.all([
    getOrganization(organizationId),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  if (!organization) notFound();

  const branding = readOrgBranding(organization.branding);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin/organizations" className="text-sm text-muted-foreground hover:text-foreground">
          ← Organisations
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{organization.name}</h1>
        {organization.contactEmail && (
          <p className="mt-1 text-muted-foreground">{organization.contactEmail}</p>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Members" value={organization.summary.members} />
        <StatCard
          label="Onboarded"
          value={organization.summary.onboarded}
          hint="have signed in at least once"
        />
        <StatCard label="Enrolments" value={organization.summary.enrolments} />
        <StatCard label="Completions" value={organization.summary.completions} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Branding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Used where this organisation&rsquo;s people see the platform. Left blank, they see
          CopaServe&rsquo;s own brand.
        </p>

        <form action={updateOrgBrandingAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="organizationId" value={organization.id} />

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium">Logo URL</span>
            <input
              name="logoUrl"
              type="url"
              defaultValue={branding.logoUrl ?? ""}
              placeholder="https://…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Primary colour</span>
            <div className="flex items-center gap-3">
              <input
                name="primaryColor"
                defaultValue={branding.primaryColor ?? ""}
                placeholder="#0a510e"
                pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"
                className="w-40 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none transition focus:border-brand"
              />
              {branding.primaryColor && (
                <span
                  aria-hidden
                  className="size-9 rounded-lg border border-border"
                  style={{ backgroundColor: branding.primaryColor }}
                />
              )}
            </div>
          </label>

          <div className="flex items-end">
            <SubmitButton
              pendingLabel="Saving..."
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Save branding
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Add members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste email addresses separated by commas, spaces, or new lines. Accounts are created for
          people who do not have one yet; they claim it when they sign up with the same address.
        </p>

        <form action={addMembersAction} className="mt-4 space-y-3">
          <input type="hidden" name="organizationId" value={organization.id} />
          <textarea
            name="emails"
            required
            rows={4}
            placeholder="ada@example.com, chidi@example.com"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Add members
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Bulk enrol</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enrols every member into the chosen course. No payment is taken — corporate seats are
          arranged separately, and each enrolment is recorded as granted by you.
        </p>

        <form action={bulkEnrolAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="organizationId" value={organization.id} />
          <label className="min-w-64 flex-1">
            <span className="mb-1.5 block text-sm font-medium">Course</span>
            <select
              name="courseId"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            >
              {courses.length === 0 && <option value="">No published courses</option>}
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={courses.length === 0 || organization.summary.members === 0}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Enrol {organization.summary.members} member
            {organization.summary.members === 1 ? "" : "s"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Members</h2>

        {organization.memberships.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No members yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Courses</th>
                  <th className="px-5 py-3 font-medium">Progress</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {organization.memberships.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          member.hasSignedIn
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {member.hasSignedIn ? "active" : "not signed in"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {member.completed}/{member.courses} complete
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-28">
                          <ProgressBar value={member.averageProgress} />
                        </div>
                        <span className="text-xs text-muted-foreground">{member.averageProgress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={removeMemberAction}>
                        <input type="hidden" name="organizationId" value={organization.id} />
                        <input type="hidden" name="userId" value={member.id} />
                        <button
                          type="submit"
                          title="Removes them from this organisation; their account and certificates remain"
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                        >
                          Remove
                        </button>
                      </form>
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
