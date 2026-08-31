import type { Metadata } from "next";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/roles";
import { getLearnerSchedule } from "@/lib/live-classes";
import { joinLiveClassAction } from "./actions";

export const metadata: Metadata = { title: "Live classes" };
export const dynamic = "force-dynamic";

/** Learner schedule (PRD §9.7). */
export default async function LiveClassesPage() {
  const user = await requireUser("/student/live-classes");
  const schedule = await getLearnerSchedule(user.id);

  const upcoming = schedule.filter((item) => item.upcoming && item.status !== "CANCELLED");
  const past = schedule.filter((item) => !item.upcoming || item.status === "CANCELLED").reverse();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Live classes</h1>
        <p className="mt-1 text-muted-foreground">
          Sessions for the courses you are enrolled in. The join link opens 15 minutes before the start.
        </p>
      </header>

      <section>
        <h2 className="font-display text-xl font-semibold">Upcoming</h2>

        {upcoming.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No sessions scheduled.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {upcoming.map((item) => (
              <li key={item.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.course.title}</p>
                    <p className="mt-1 text-sm">
                      {item.startsAt.toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" })}
                      {item.endsAt
                        ? ` – ${item.endsAt.toLocaleTimeString("en-NG", { timeStyle: "short" })}`
                        : ""}
                    </p>
                    {item.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>

                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {item.provider.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>

                <div className="mt-4">
                  {item.joinable ? (
                    <form action={joinLiveClassAction}>
                      <input type="hidden" name="liveClassId" value={item.id} />
                      <SubmitButton pendingLabel="Joining..."
                        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Join session
                      </SubmitButton>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      The join link opens 15 minutes before the session starts.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Past sessions</h2>

        {past.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {past.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.course.title} ·{" "}
                    {item.startsAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {item.status === "CANCELLED" ? (
                    <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                      cancelled
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.attended
                          ? "bg-success/10 text-success"
                          : "bg-surface-muted text-muted-foreground"
                      }`}
                    >
                      {item.attended ? "attended" : "did not join"}
                    </span>
                  )}

                  {item.recordingUrl && (
                    <a
                      href={item.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                    >
                      Watch replay ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
