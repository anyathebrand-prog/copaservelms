import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getCohortReport } from "@/lib/cohorts";
import { StatCard } from "@/components/student/stat-card";
import { ProgressBar } from "@/components/student/progress-bar";
import { SubmitButton } from "@/components/ui/submit-button";
import { addMembersAction, enrolCohortAction, removeMemberAction } from "../actions";

export const metadata: Metadata = { title: "Cohort" };
export const dynamic = "force-dynamic";

/** One cohort: who is in it, how far they have got, and enrolling them at once. */
export default async function CohortPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  await requireRole(["ADMIN", "SUPER_ADMIN"], `/admin/cohorts/${cohortId}`);

  const cohort = await getCohortReport(cohortId);
  if (!cohort) notFound();

  const memberIds = new Set(cohort.members.map((member) => member.id));

  const [candidates, courses] = await Promise.all([
    // Only people who could actually join. An organisation's cohort is closed
    // to outsiders, so offering them here would mean picking a name and
    // watching nothing happen.
    prisma.user.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        ...(cohort.organization ? { organizationId: cohort.organizationId } : {}),
      },
      orderBy: { email: "asc" },
      take: 500,
      select: {
        id: true,
        email: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const available = candidates.filter((candidate) => !memberIds.has(candidate.id));

  const dates = [
    cohort.startsAt ? cohort.startsAt.toLocaleDateString("en-NG", { dateStyle: "medium" }) : null,
    cohort.endsAt ? cohort.endsAt.toLocaleDateString("en-NG", { dateStyle: "medium" }) : null,
  ].filter(Boolean);

  const subtitle =
    [cohort.organization?.name, cohort.course?.title, dates.length > 0 ? dates.join(" – ") : null]
      .filter(Boolean)
      .join(" · ") || "No organisation or course attached";

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin/cohorts" className="text-sm text-muted-foreground hover:text-foreground">
          ← Cohorts
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{cohort.name}</h1>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Members" value={cohort.summary.members} />
        <StatCard label="Enrolled" value={cohort.summary.enrolled} />
        <StatCard label="Completed" value={cohort.summary.completed} />
        <StatCard label="Average progress" value={`${cohort.summary.averageProgress}%`} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Enrol the cohort</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enrols every member into the chosen course at once. Anyone already enrolled is left as
          they are, so running this twice does not disturb work in progress.
        </p>

        <form action={enrolCohortAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="cohortId" value={cohort.id} />
          <label className="min-w-64 flex-1">
            <span className="mb-1.5 block text-sm font-medium">Course</span>
            <select
              name="courseId"
              required
              defaultValue={cohort.courseId ?? ""}
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
          <SubmitButton
            pendingLabel="Enrolling..."
            disabled={courses.length === 0 || cohort.summary.members === 0}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Enrol {cohort.summary.members} member{cohort.summary.members === 1 ? "" : "s"}
          </SubmitButton>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Add members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {cohort.organization
            ? `Only people in ${cohort.organization.name} can join this cohort.`
            : "Anyone with an active account can join this cohort."}
        </p>

        {available.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nobody left to add.</p>
        ) : (
          <form action={addMembersAction} className="mt-4 space-y-3">
            <input type="hidden" name="cohortId" value={cohort.id} />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                People{" "}
                <span className="font-normal text-muted-foreground">
                  (hold ctrl to pick several)
                </span>
              </span>
              <select
                name="userIds"
                multiple
                required
                size={Math.min(available.length, 8)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
              >
                {available.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {`${candidate.profile?.firstName ?? ""} ${candidate.profile?.lastName ?? ""}`.trim() ||
                      candidate.email}
                    {" — "}
                    {candidate.email}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton
              pendingLabel="Adding..."
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Add to cohort
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Members</h2>

        {cohort.members.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nobody in this cohort yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Department</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Progress</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cohort.members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{member.department ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          member.completed > 0
                            ? "bg-success/10 text-success"
                            : member.enrolled
                              ? "bg-brand-pale text-brand"
                              : "bg-warning/10 text-warning"
                        }`}
                      >
                        {member.completed > 0
                          ? "completed"
                          : member.enrolled
                            ? "in progress"
                            : "not enrolled"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-28">
                          <ProgressBar value={member.progress} />
                        </div>
                        <span className="text-xs text-muted-foreground">{member.progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={removeMemberAction}>
                        <input type="hidden" name="cohortId" value={cohort.id} />
                        <input type="hidden" name="userId" value={member.id} />
                        <button
                          type="submit"
                          title="Removes them from this cohort; their enrolments and certificates remain"
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
