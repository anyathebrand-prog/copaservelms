import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getCourseForEditing } from "@/lib/instructor";
import { CurriculumEditor } from "@/components/instructor/curriculum-editor";
import { StatusBadge } from "@/components/instructor/status-badge";
import { setStatusAction, updateCourseAction } from "../../actions";

export const metadata: Metadata = { title: "Edit course" };

/** Course builder (PRD §10.3). */
export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireRole(
    ["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"],
    `/instructor/courses/${courseId}`,
  );

  const [course, categories] = await Promise.all([
    getCourseForEditing(courseId, user.id, user.roles),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!course) notFound();

  const isAdmin = user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN");
  // Structure edits are refused while under review or live, mirroring the
  // guard in lib/instructor.ts — the UI must not offer what the server refuses.
  const locked = !isAdmin && !["DRAFT", "ARCHIVED"].includes(course.status);
  const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/instructor" className="text-sm text-muted-foreground hover:text-foreground">
            ← Courses
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight">{course.title}</h1>
            <StatusBadge status={course.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">/{course.slug}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/instructor/courses/${course.id}/students`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
          >
            Students
          </Link>
          <Link
            href={`/instructor/courses/${course.id}/live-classes`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
          >
            Live classes
          </Link>

          {course.status === "DRAFT" && (
            <form action={setStatusAction}>
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="status" value="SUBMITTED" />
              <SubmitButton
                pendingLabel="Saving..."
                disabled={lessonCount === 0}
                title={lessonCount === 0 ? "Add at least one lesson first" : undefined}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                Submit for review
              </SubmitButton>
            </form>
          )}

          {course.status === "SUBMITTED" && (
            <form action={setStatusAction}>
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="status" value="DRAFT" />
              <SubmitButton
                pendingLabel="Saving..."
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
              >
                Withdraw to draft
              </SubmitButton>
            </form>
          )}
        </div>
      </header>

      {/* A disabled button explains itself on hover, which is no explanation at
          all on a phone — and a new course is empty by definition, so this is
          the first state every instructor meets. */}
      {course.status === "DRAFT" && (
        <p className="rounded-lg bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
          This course is a draft, so it does not appear on the site yet.{" "}
          {lessonCount === 0
            ? "Add a module and at least one lesson below, then submit it for review — an admin publishes it from there."
            : "Submit it for review when you are ready; an admin publishes it from there."}
        </p>
      )}

      {course.status === "SUBMITTED" && (
        <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
          Submitted for admin review{course.submittedAt ? ` on ${course.submittedAt.toLocaleDateString("en-NG")}` : ""}.
          Publication is an admin action.
        </p>
      )}

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Details</h2>

        <form action={updateCourseAction} className="mt-4 space-y-4">
          <input type="hidden" name="courseId" value={course.id} />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Title</span>
            <input
              name="title"
              required
              defaultValue={course.title}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Subtitle</span>
            <input
              name="subtitle"
              defaultValue={course.subtitle ?? ""}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Description</span>
            <textarea
              name="description"
              rows={4}
              defaultValue={course.description ?? ""}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Category</span>
              <select
                name="categoryId"
                defaultValue={course.categoryId ?? ""}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Level</span>
              <select
                name="level"
                defaultValue={course.level}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
              >
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Price (₦)</span>
              <input
                name="priceMajor"
                type="number"
                min="0"
                step="1"
                defaultValue={course.priceMinor / 100}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
              />
            </label>
          </div>

          <fieldset className="rounded-xl border border-border p-4">
            <legend className="px-2 text-sm font-medium">Certificate eligibility</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm">Minimum quiz score (%)</span>
                <input
                  name="minQuizScore"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={course.minQuizScore ?? ""}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm">Estimated duration (min)</span>
                <input
                  name="estimatedMinutes"
                  type="number"
                  min="0"
                  defaultValue={course.estimatedMinutes ?? ""}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                />
              </label>
              <div className="space-y-2 pt-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="certificateEnabled"
                    defaultChecked={course.certificateEnabled}
                    className="accent-[var(--brand-green)]"
                  />
                  Issues a certificate
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="requiresAssignments"
                    defaultChecked={course.requiresAssignments}
                    className="accent-[var(--brand-green)]"
                  />
                  Requires assignments
                </label>
              </div>
            </div>
          </fieldset>

          <SubmitButton pendingLabel="Saving..."
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Save details
          </SubmitButton>
        </form>
      </section>

      <CurriculumEditor courseId={course.id} modules={course.modules} locked={locked} />
    </div>
  );
}
