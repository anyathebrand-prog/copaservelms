import type { ReactNode } from "react";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * Shared frame for the public policy pages.
 *
 * Plain, narrow, and legible. A privacy notice nobody can read is a notice
 * nobody has been given, which under the NDPA is closer to a failure of
 * transparency than to a design choice.
 */
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader dark />
      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{summary}</p>
          <p className="mt-6 text-sm text-muted-foreground">Last updated {updated}</p>

          <div className="legal-prose mt-12">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** One numbered section of a policy. */
export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-border pt-8 first:mt-0 first:border-0 first:pt-0">
      <h2 className="font-display text-xl font-semibold tracking-tight">{heading}</h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
