import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getCourseSchedule } from "@/lib/live-classes";
import { scheduleLiveClassAction, updateLiveClassAction } from "./actions";

export const metadata: Metadata = { title: "Live classes" };
export const dynamic = "force-dynamic";

/** Scheduling and attendance for one course (PRD §9.7, §10.4). */
export default async function CourseLiveClassesPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireRole(
    ["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"],
    `/instructor/courses/${courseId}/live-classes`,
  );

  const schedule = await getCourseSchedule(courseId, user.id, user.roles);
  if (!schedule) notFound();

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/instructor/courses/${courseId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {schedule.course.title}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Live classes</h1>
        <p className="mt-1 text-muted-foreground">
          {schedule.enrolled} enrolled learner{schedule.enrolled === 1 ? "" : "s"} will be notified
          when you schedule a session.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Schedule a session</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the meeting in Zoom or Google Meet, then paste the join link here. CopaServe does
          not create the meeting for you — it handles the schedule, reminders, attendance, and replay.
        </p>

        <form action={scheduleLiveClassAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="courseId" value={courseId} />

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium">Title</span>
            <input
              name="title"
              required
              placeholder="Week 3 — breach response workshop"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium">Description</span>
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Starts</span>
            <input
              type="datetime-local"
              name="startsAt"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ends</span>
            <input
              type="datetime-local"
              name="endsAt"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Provider</span>
            <select
              name="provider"
              defaultValue="ZOOM"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            >
              <option value="ZOOM">Zoom</option>
              <option value="GOOGLE_MEET">Google Meet</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Join link</span>
            <input
              name="joinUrl"
              type="url"
              placeholder="https://zoom.us/j/…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Schedule and notify learners
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Sessions</h2>

        {schedule.classes.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No sessions scheduled yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {schedule.classes.map((liveClass) => (
              <li key={liveClass.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{liveClass.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {liveClass.startsAt.toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      · {liveClass.provider.replaceAll("_", " ").toLowerCase()}
                    </p>
                    <p className="mt-1 text-sm">
                      {liveClass.present}/{schedule.enrolled} joined ({liveClass.attendanceRate}%)
                    </p>
                    {!liveClass.joinUrl && (
                      <p className="mt-1 text-sm text-warning">
                        No join link yet — learners cannot attend until you add one.
                      </p>
                    )}
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      liveClass.status === "CANCELLED"
                        ? "bg-danger/10 text-danger"
                        : liveClass.status === "ENDED"
                          ? "bg-surface-muted text-muted-foreground"
                          : "bg-brand-pale text-brand"
                    }`}
                  >
                    {liveClass.status.toLowerCase()}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <form action={updateLiveClassAction} className="flex items-end gap-2">
                    <input type="hidden" name="liveClassId" value={liveClass.id} />
                    <label className="flex-1">
                      <span className="mb-1.5 block text-xs font-medium">Join link</span>
                      <input
                        name="joinUrl"
                        type="url"
                        defaultValue={liveClass.joinUrl ?? ""}
                        placeholder="https://…"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-muted"
                    >
                      Save
                    </button>
                  </form>

                  <form action={updateLiveClassAction} className="flex items-end gap-2">
                    <input type="hidden" name="liveClassId" value={liveClass.id} />
                    <label className="flex-1">
                      <span className="mb-1.5 block text-xs font-medium">Replay link</span>
                      <input
                        name="recordingUrl"
                        type="url"
                        defaultValue={liveClass.recordingUrl ?? ""}
                        placeholder="https://…"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-muted"
                    >
                      Save
                    </button>
                  </form>
                </div>

                {liveClass.status !== "CANCELLED" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={updateLiveClassAction}>
                      <input type="hidden" name="liveClassId" value={liveClass.id} />
                      <input type="hidden" name="status" value="ENDED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                      >
                        Mark ended
                      </button>
                    </form>
                    <form action={updateLiveClassAction}>
                      <input type="hidden" name="liveClassId" value={liveClass.id} />
                      <input type="hidden" name="status" value="CANCELLED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                      >
                        Cancel session
                      </button>
                    </form>
                  </div>
                )}

                {liveClass.attendances.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Attendance ({liveClass.attendances.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {liveClass.attendances.map((attendance, index) => (
                        <li key={index}>
                          {attendance.user.profile?.firstName} {attendance.user.profile?.lastName} (
                          {attendance.user.email})
                          {attendance.joinedAt
                            ? ` — joined ${attendance.joinedAt.toLocaleTimeString("en-NG", { timeStyle: "short" })}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
