import { getDepartmentReport } from "@/lib/cohorts";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  assignDepartmentAction,
  createDepartmentAction,
  deleteDepartmentAction,
} from "@/app/(portal)/admin/cohorts/actions";

/**
 * Departments within one organisation (PRD §13.3).
 *
 * Kept beside the members list rather than on a page of its own: a department
 * only means anything in relation to the people in it, and the question it
 * answers — which part of this company is behind on its training — is the same
 * question the organisation page exists to answer.
 */
export async function DepartmentsPanel({ organizationId }: { organizationId: string }) {
  const [report, members] = await Promise.all([
    getDepartmentReport(organizationId),
    prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { email: "asc" },
      take: 500,
      select: {
        id: true,
        email: true,
        departmentId: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-xl font-semibold">Departments</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Groups within this organisation, so completion can be read per team rather than as one
        number. {report.unassigned} member{report.unassigned === 1 ? " is" : "s are"} not in a
        department.
      </p>

      <form action={createDepartmentAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="min-w-56 flex-1">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="Legal"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>
        <label className="w-32">
          <span className="mb-1.5 block text-sm font-medium">Code</span>
          <input
            name="code"
            placeholder="LEG"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>
        <SubmitButton
          pendingLabel="Adding..."
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Add department
        </SubmitButton>
      </form>

      {report.departments.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No departments yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">People</th>
                <th className="px-4 py-3 font-medium">Enrolments</th>
                <th className="px-4 py-3 font-medium">Completion</th>
                <th className="px-4 py-3 font-medium">Avg progress</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.departments.map((department) => (
                <tr key={department.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{department.name}</span>
                    {department.code && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {department.code}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{department.members}</td>
                  <td className="px-4 py-3 text-muted-foreground">{department.enrolments}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {department.completed} of {department.enrolments} ({department.completionRate}%)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{department.averageProgress}%</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteDepartmentAction}>
                      <input type="hidden" name="organizationId" value={organizationId} />
                      <input type="hidden" name="departmentId" value={department.id} />
                      <button
                        type="submit"
                        title="Removes the department; its people stay, without one"
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.departments.length > 0 && members.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">Assign people</h3>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium">
                    {`${member.profile?.firstName ?? ""} ${member.profile?.lastName ?? ""}`.trim() ||
                      member.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>

                <form action={assignDepartmentAction} className="flex items-center gap-2">
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="userId" value={member.id} />
                  <select
                    name="departmentId"
                    defaultValue={member.departmentId ?? ""}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none transition focus:border-brand"
                  >
                    <option value="">No department</option>
                    {report.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    pendingLabel="Saving..."
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-muted"
                  >
                    Save
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
