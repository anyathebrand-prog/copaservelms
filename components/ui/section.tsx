import type { ReactNode } from "react";

export function Section({
  id,
  eyebrow,
  title,
  lede,
  description,
  children,
  muted = false,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  /** Second line of the heading, set back — the heading reads as one phrase
      with the emphasis on the first half. */
  lede?: string;
  description?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <section id={id} className={muted ? "bg-surface-muted" : undefined}>
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        {(eyebrow || title) && (
          <header className="mb-14 max-w-3xl">
            {eyebrow && (
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
                {title}
                {lede && <span className="block text-muted-foreground/60">{lede}</span>}
              </h2>
            )}
            {description && (
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
