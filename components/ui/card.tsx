import type { ReactNode } from "react";

/**
 * The surface everything on the marketing pages sits on.
 *
 * A rounded box with a hairline border and a faint shadow is the default look
 * of every generated page on the internet, so this leans on two things that
 * are cheap and specific instead: a large radius, and a brand-green wash that
 * arrives on hover rather than sitting there permanently.
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`group/card relative overflow-hidden rounded-3xl border border-border bg-surface p-7 transition duration-300 hover:-translate-y-1 hover:border-brand/25 hover:shadow-[0_24px_60px_-28px_rgb(10_81_14/0.45)] ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-40 bg-[radial-gradient(ellipse_at_center,rgb(10_81_14/0.10),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
