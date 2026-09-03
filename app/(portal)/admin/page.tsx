import Link from "next/link";
import type { Metadata } from "next";
import {
  Award,
  BookOpen,
  Building2,
  GraduationCap,
  ScrollText,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getAdminOverview, getCourseQueue } from "@/lib/admin";
import { getApplicationSummary } from "@/lib/instructor-applications";
import { StatCard } from "@/components/student/stat-card";
import { StatusBadge } from "@/components/instructor/status-badge";
import { EmptyState, HeroFigure, HeroMetric, Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Admin" };

/**
 * Admin dashboard (PRD §13.1).
 *
 * Revenue leads, because it was previously the eighth of eight identical
 * tiles — the same visual weight as "wallets connected", which is not a fair
 * account of what an operator cares about. The two figures that mean somebody
 * has to act, courses awaiting review and users awaiting approval, are pulled
 * out of the grid into a queue that says so.
 */
export default async function AdminDashboard() {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin");
  const [overview, queue, applications] = await Promise.all([
    getAdminOverview(),
    getCourseQueue("SUBMITTED"),
    getApplicationSummary(),
  ]);

  const naira = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  });

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Overview</h1>
        <p className="mt-1.5 text-muted-foreground">
          {user.email}
          {user.roles.includes("SUPER_ADMIN") ? " · Super Admin" : ""}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <HeroMetric
          eyebrow="Revenue"
          value={naira.format(overview.revenueMinor / 100)}
          caption="Successful payments, all time."
        >
          <dl className="grid grid-cols-3 gap-4">
            <HeroFigure label="Students" value={overview.students} />
            <HeroFigure label="Instructors" value={overview.instructors} />
            <HeroFigure label="Certificates" value={overview.certificatesIssued} />
          </dl>
        </HeroMetric>

        <Panel title="Needs attention">
          {overview.pendingCourses === 0 &&
          overview.pendingUsers === 0 &&
          applications.pending === 0 ? (
            <EmptyState>Nothing is waiting on you.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {overview.pendingCourses > 0 && (
                <QueueRow
                  href="/admin/courses"
                  icon={BookOpen}
                  count={overview.pendingCourses}
                  noun="course"
                  detail="submitted for review"
                />
              )}
              {overview.pendingUsers > 0 && (
                <QueueRow
                  href="/admin/users"
                  icon={UserCheck}
                  count={overview.pendingUsers}
                  noun="account"
                  detail="awaiting approval"
                />
              )}
              {applications.pending > 0 && (
                <QueueRow
                  href="/admin/instructors"
                  icon={GraduationCap}
                  count={applications.pending}
                  noun="applicant"
                  detail="waiting to teach"
                />
              )}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Students" value={overview.students} />
        <StatCard icon={UserCheck} label="Instructors" value={overview.instructors} />
        <StatCard icon={BookOpen} label="Active courses" value={overview.activeCourses} />
        <StatCard icon={Award} label="Certificates issued" value={overview.certificatesIssued} />
      </div>

      <Panel title="Awaiting review" action={{ href: "/admin/courses", label: "All courses" }}>
        {queue.length === 0 ? (
          <EmptyState>Nothing is waiting for review.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {queue.slice(0, 5).map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{course.title}</p>
                    <StatusBadge status={course.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {course.instructor.profile?.firstName} {course.instructor.profile?.lastName} ·{" "}
                    {course._count.modules} modules
                  </p>
                </div>
                <Link
                  href="/admin/courses"
                  className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          href="/admin/organizations"
          icon={Building2}
          title="Organisations"
          body="Corporate accounts, departments, and bulk enrolment."
        />
        <QuickLink
          href="/admin/privacy"
          icon={ShieldCheck}
          title="Compliance"
          body="NDPA requests, consent records, and retention."
        />
        <QuickLink
          href="/admin/audit"
          icon={ScrollText}
          title="Audit log"
          body="Every administrative action, append-only."
        />
        <QuickLink
          href="/admin/settings"
          icon={Wallet}
          title="Settings"
          body={`Platform configuration · ${overview.walletsConnected} wallets linked.`}
        />
      </div>
    </div>
  );
}

function QueueRow({
  href,
  icon: Icon,
  count,
  noun,
  detail,
}: {
  href: string;
  icon: typeof BookOpen;
  count: number;
  noun: string;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3.5 transition hover:border-warning/50"
      >
        <Icon className="size-5 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-warning">
            {count} {noun}
            {count === 1 ? "" : "s"}
          </span>{" "}
          <span className="text-muted-foreground">{detail}</span>
        </p>
      </Link>
    </li>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: typeof BookOpen;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand/30"
    >
      <Icon className="size-5 text-brand" />
      <p className="mt-3 font-display font-semibold transition group-hover:text-brand">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </Link>
  );
}
