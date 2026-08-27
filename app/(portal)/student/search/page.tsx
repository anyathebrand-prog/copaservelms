import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { search } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

/** Global search across courses, lessons, discussions, and certificates (§14). */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser("/student/search");
  const { q = "" } = await searchParams;

  const results = await search(q, user.id, user.roles);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Search</h1>
        <p className="mt-1 text-muted-foreground">
          Courses, lessons you have access to, discussions, and your certificates.
        </p>
      </header>

      <form action="/student/search" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Search for anything"
          aria-label="Search"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none transition focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Search
        </button>
      </form>

      {q.trim().length === 0 ? null : q.trim().length < 2 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Type at least two characters.
        </p>
      ) : results.total === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing found for &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {results.total} result{results.total === 1 ? "" : "s"} for &ldquo;{results.query}&rdquo;
          </p>

          {results.groups.map((group) => (
            <section key={group.group}>
              <h2 className="font-display text-lg font-semibold">{group.label}</h2>
              <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
                {group.hits.map((hit) => (
                  <li key={hit.id}>
                    <Link
                      href={hit.href}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-surface-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{hit.title}</span>
                        {hit.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      {hit.badge && (
                        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          {hit.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
