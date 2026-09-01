import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/**
 * A titled block of the working canvas.
 *
 * Every section in the portal was writing out the same
 * rounded-2xl/border/bg-surface/p-6 by hand, which is why the three dashboards
 * looked identical while doing quite different jobs — the container was the
 * only design any of them had.
 */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  /** Optional "see everything" link, right-aligned against the title. */
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex items-center justify-between gap-4">
          {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
          {action && (
            <Link
              href={action.href}
              className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              {action.label}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/** The one thing on a dashboard that should be read first. */
export function HeroMetric({
  eyebrow,
  value,
  caption,
  children,
}: {
  eyebrow: string;
  value: string | number;
  caption?: string;
  /** Supporting figures, shown along the bottom. */
  children?: ReactNode;
}) {
  return (
    <section className="hero-ink grain relative overflow-hidden rounded-3xl p-7 text-white">
      <div
        aria-hidden
        className="absolute -right-16 -top-16 size-56 rounded-full bg-brand-bright/15 blur-3xl"
      />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
          {eyebrow}
        </p>
        <p className="mt-3 font-display text-6xl font-bold leading-none tracking-tight">{value}</p>
        {caption && <p className="mt-3 text-sm text-white/50">{caption}</p>}
        {children && <div className="mt-7 border-t border-white/10 pt-5">{children}</div>}
      </div>
    </section>
  );
}

/** A figure inside HeroMetric's footer. */
export function HeroFigure({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dd className="font-display text-xl font-bold text-white">{value}</dd>
      <dt className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
    </div>
  );
}

/** Nothing here yet, said without a wall of grey. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
