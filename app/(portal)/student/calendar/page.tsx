import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getCalendar, type CalendarEvent } from "@/lib/calendar";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

/** Deadlines and live classes across a learner's courses (§14). */
export default async function CalendarPage() {
  const user = await requireUser("/student/calendar");
  const events = await getCalendar(user.id);

  const upcoming = events.filter((event) => !event.past);
  const past = events.filter((event) => event.past).reverse();
  const overdue = past.filter((event) => event.overdue);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-1 text-muted-foreground">
            Live classes and assignment deadlines from your courses.
          </p>
        </div>

        <a
          href="/api/calendar.ics"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
        >
          Subscribe (.ics)
        </a>
      </header>

      {overdue.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold text-danger">
            Overdue ({overdue.length})
          </h2>
          <ul className="mt-3 space-y-3">
            {overdue.map((event) => (
              <EventRow key={`${event.kind}-${event.id}`} event={event} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nothing scheduled. Deadlines and live classes appear here as your instructors set them.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((event) => (
              <EventRow key={`${event.kind}-${event.id}`} event={event} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">Past</h2>
          <ul className="mt-3 space-y-3">
            {past.slice(0, 20).map((event) => (
              <EventRow key={`${event.kind}-${event.id}`} event={event} muted />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EventRow({ event, muted = false }: { event: CalendarEvent; muted?: boolean }) {
  return (
    <li
      className={`rounded-2xl border bg-surface p-5 ${
        event.overdue ? "border-danger/40" : "border-border"
      } ${muted ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={event.href} className="font-medium hover:text-brand">
              {event.title}
            </Link>
            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {event.kind === "assignment" ? "assignment" : "live class"}
            </span>
            {event.done && (
              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                {event.kind === "assignment" ? "submitted" : "attended"}
              </span>
            )}
            {event.overdue && (
              <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                overdue
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{event.courseTitle}</p>
        </div>

        <time className="shrink-0 text-sm text-muted-foreground">
          {event.startsAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
        </time>
      </div>
    </li>
  );
}
