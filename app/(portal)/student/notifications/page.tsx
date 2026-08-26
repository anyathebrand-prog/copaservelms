import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";
import { getCurrentUser } from "@/lib/auth";
import { countUnread, getNotifications, markRead } from "@/lib/notifications";

export const metadata: Metadata = { title: "Notifications" };

/** Mark everything read. Scoped to the session user inside markRead. */
async function markAllReadAction(): Promise<void> {
  "use server";
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  await markRead(user.id);
  revalidatePath("/student/notifications");
}

export default async function NotificationsPage() {
  const user = await requireUser("/student/notifications");
  const [notifications, unread] = await Promise.all([
    getNotifications(user.id),
    countUnread(user.id),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {unread === 0 ? "You are all caught up." : `${unread} unread`}
          </p>
        </div>

        {unread > 0 && (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
            >
              Mark all read
            </button>
          </form>
        )}
      </header>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing here yet. Course updates, grades, and certificates will appear as they happen.
        </p>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`rounded-2xl border p-5 ${
                notification.readAt === null
                  ? "border-brand/30 bg-brand-pale/30"
                  : "border-border bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{notification.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {notification.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </time>
              </div>

              {notification.actionUrl && (
                <Link
                  href={notification.actionUrl}
                  className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
                >
                  View →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
