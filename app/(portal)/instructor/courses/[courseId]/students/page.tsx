import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getCourseStudents } from "@/lib/instructor";
import { ProgressBar } from "@/components/student/progress-bar";

export const metadata: Metadata = { title: "Students" };

/** Enrolled student progress (PRD §10.4). */
export default async function CourseStudentsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireRole(
    ["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"],
    `/instructor/courses/${courseId}/students`,
  );

  const students = await getCourseStudents(courseId, user.id, user.roles);
  if (!students) notFound();

  const completed = students.filter((s) => s.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/instructor/courses/${courseId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to course
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Students</h1>
        <p className="mt-1 text-muted-foreground">
          {students.length} enrolled · {completed} completed
        </p>
      </header>

      {students.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No one has enrolled in this course yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Progress</th>
                <th className="px-5 py-3 font-medium">Enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">{student.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        student.status === "COMPLETED"
                          ? "bg-success/10 text-success"
                          : "bg-brand-pale text-brand"
                      }`}
                    >
                      {student.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-32">
                        <ProgressBar value={student.progressPercent} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {student.progressPercent}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {student.enrolledAt.toLocaleDateString("en-NG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CSV export and targeted announcements are §10.4 follow-ups; both need
          the email/notification layer that arrives in Phase 2. */}
    </div>
  );
}
