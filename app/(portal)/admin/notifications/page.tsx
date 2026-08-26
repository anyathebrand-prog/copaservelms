import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { broadcast } from "@/lib/notifications";
import { emailConfigured, smsConfigured } from "@/lib/notifications/providers";

export const metadata: Metadata = { title: "Notifications" };

/**
 * Broadcast an announcement (PRD §13.2).
 *
 * An announcement is marketing, so every recipient is filtered by consent
 * inside sendNotification. The result reports what was suppressed as well as
 * what was sent — the gap is the compliance story, not an error.
 */
async function broadcastAction(formData: FormData): Promise<void> {
  "use server";
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) throw new Error("An announcement needs a title and a message.");

  await broadcast(
    { title, body, courseId: (formData.get("courseId") as string) || null },
    user.id,
  );

  revalidatePath("/admin/notifications");
}

export default async function AdminNotificationsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/notifications");

  const [courses, recent, stats] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.auditLog.findMany({
      where: { action: "notification.broadcast" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, after: true, actor: { select: { email: true } } },
    }),
    prisma.notification.groupBy({ by: ["channel"], _count: true }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Notifications</h1>
      </header>

      {(!emailConfigured() || !smsConfigured()) && (
        <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
          {!emailConfigured() && !smsConfigured()
            ? "Neither email nor SMS is configured, so messages are recorded in-app only."
            : !emailConfigured()
              ? "Email is not configured (RESEND_API_KEY), so messages are recorded in-app only."
              : "SMS is not configured (TERMII_API_KEY)."}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Send an announcement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Announcements are marketing under the NDPA, so they only reach people who granted
          marketing consent and have not withdrawn it. Transactional messages — grades,
          certificates, receipts — are sent separately and are not affected.
        </p>

        <form action={broadcastAction} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Title</span>
            <input
              name="title"
              required
              maxLength={120}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Message</span>
            <textarea
              name="body"
              required
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block sm:max-w-sm">
            <span className="mb-1.5 block text-sm font-medium">Audience</span>
            <select
              name="courseId"
              defaultValue=""
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            >
              <option value="">Everyone</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  Enrolled in {course.title}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Send announcement
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Recent broadcasts</h2>

        {recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No announcements sent yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recent.map((entry) => {
              const detail = entry.after as {
                title?: string;
                attempted?: number;
                delivered?: number;
                suppressedForConsent?: number;
              } | null;

              return (
                <li key={entry.id} className="rounded-2xl border border-border bg-surface p-5">
                  <p className="font-medium">{detail?.title ?? "Announcement"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail?.delivered ?? 0} delivered of {detail?.attempted ?? 0} ·{" "}
                    {detail?.suppressedForConsent ?? 0} withheld for consent
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    {entry.actor?.email ? ` · ${entry.actor.email}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          {stats.reduce((sum, row) => sum + row._count, 0)} notifications recorded in total.
        </p>
      </section>
    </div>
  );
}
