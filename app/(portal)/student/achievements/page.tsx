import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getAchievements, getLeaderboard } from "@/lib/gamification";
import { StatCard } from "@/components/student/stat-card";

export const metadata: Metadata = { title: "Achievements" };
export const dynamic = "force-dynamic";

/** Badges, XP, streaks, and the leaderboard (PRD §14). */
export default async function AchievementsPage() {
  const user = await requireUser("/student/achievements");
  const [{ badges, stats }, leaderboard] = await Promise.all([
    getAchievements(user.id),
    getLeaderboard(10),
  ]);

  const earned = badges.filter((badge) => badge.earned);
  const locked = badges.filter((badge) => !badge.earned);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Achievements</h1>
        <p className="mt-1 text-muted-foreground">
          {stats.earned} of {stats.total} badges earned.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="XP" value={stats.xpPoints} />
        <StatCard label="Current streak" value={`${stats.currentStreak}d`} />
        <StatCard label="Longest streak" value={`${stats.longestStreak}d`} />
        <StatCard label="Learning time" value={`${Math.round(stats.learningMinutes / 60)}h`} />
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold">Earned</h2>

        {earned.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No badges yet — completing a course earns your first.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {earned.map((badge) => (
              <li key={badge.id} className="rounded-2xl border border-brand/30 bg-brand-pale/30 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-brand">{badge.name}</p>
                  <span className="shrink-0 text-xs font-semibold text-brand">+{badge.xpValue} XP</span>
                </div>
                {badge.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
                )}
                {badge.earnedAt && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Earned {badge.earnedAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Still to earn</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Locked badges are shown with what they take — knowing the target is most of the point.
        </p>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locked.map((badge) => (
            <li key={badge.id} className="rounded-2xl border border-border bg-surface p-5 opacity-80">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-semibold">{badge.name}</p>
                <span className="shrink-0 text-xs text-muted-foreground">+{badge.xpValue} XP</span>
              </div>
              {badge.description && (
                <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
              )}
              <p className="mt-3 rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-medium">
                {badge.requirement}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Leaderboard</h2>

        {leaderboard.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nobody has earned XP yet.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {leaderboard.map((entry) => (
              <li
                key={entry.userId}
                className={`flex items-center justify-between gap-3 px-5 py-3 ${
                  entry.userId === user.id ? "bg-brand-pale/40" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground">
                    {entry.rank}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {entry.name}
                      {entry.userId === user.id && (
                        <span className="ml-2 text-xs text-brand">you</span>
                      )}
                    </span>
                    {entry.organisation && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.organisation}
                      </span>
                    )}
                  </span>
                </span>

                <span className="shrink-0 text-sm">
                  <span className="font-semibold">{entry.xpPoints}</span>
                  <span className="text-muted-foreground"> XP</span>
                  {entry.currentStreak > 1 && (
                    <span className="ml-2 text-xs text-muted-foreground">{entry.currentStreak}d</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
