import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getDownloads } from "@/lib/downloads";

export const metadata: Metadata = { title: "Downloads" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  certificate: "Certificate",
  submission: "Your submission",
  resource: "Course resource",
};

/** Download centre (PRD §14). */
export default async function DownloadsPage() {
  const user = await requireUser("/student/downloads");
  const items = await getDownloads(user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Downloads</h1>
        <p className="mt-1 text-muted-foreground">
          Your certificates, the work you have submitted, and resources from your courses. Links are
          generated fresh each time you open this page and expire shortly afterwards.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing to download yet.{" "}
          <Link href="/student/courses" className="font-medium text-brand hover:underline">
            Your courses
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {KIND_LABELS[item.kind]}
                  {item.subtitle ? ` · ${item.subtitle}` : ""}
                  {item.sizeBytes ? ` · ${Math.max(1, Math.round(item.sizeBytes / 1024))} KB` : ""}
                  {" · "}
                  {item.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </p>
              </div>

              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                >
                  Download
                </a>
              ) : (
                // An unavailable file is stated rather than offered as a link
                // that fails when clicked.
                <span className="shrink-0 text-xs text-muted-foreground">Unavailable</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
