import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getAdminOverview, getCourseQueue } from "@/lib/admin";
import { StatCard } from "@/components/student/stat-card";
import { StatusBadge } from "@/components/instructor/status-badge";

export const metadata: Metadata = { title: "Admin" };

/** Admin dashboard widgets (PRD §13.1). */
export default async function AdminDashboard() {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin");
  const [overview, queue] = await Promise.all([getAdminOverview(), getCourseQueue("SUBMITTED")]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as {user.email}
          {user.roles.includes("SUPER_ADMIN") ? " · Super Admin" : ""}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={overview.students} />
        <StatCard label="Instructors" value={overview.instructors} />
        <StatCard label="Active courses" value={overview.activeCourses} />
        <StatCard label="Awaiting review" value={overview.pendingCourses} />
        <StatCard label="Certificates issued" value={overview.certificatesIssued} />
        <StatCard label="Wallets connected" value={overview.walletsConnected} />
        <StatCard label="Pending users" value={overview.pendingUsers} />
        <StatCard
          label="Revenue"
          value={new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            maximumFractionDigits: 0,
          }).format(overview.revenueMinor / 100)}
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Awaiting review</h2>
          <Link href="/admin/courses" className="text-sm font-medium text-brand hover:underline">
            All courses
          </Link>
        </div>

        {queue.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing is waiting for review.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {queue.slice(0, 5).map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
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
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink href="/admin/courses" title="Course management" body="Approve, publish, and archive courses." />
        <QuickLink href="/admin/users" title="User management" body="Approve instructors, manage roles, suspend accounts." />
        <QuickLink href="/admin/audit" title="Audit log" body="Every administrative action, append-only." />
      </div>
    </div>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand"
    >
      <p className="font-display font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
