import type { ReactNode } from "react";

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  muted = false,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <section id={id} className={muted ? "bg-surface-muted" : undefined}>
      <div className="mx-auto max-w-6xl px-6 py-20">
        {(eyebrow || title) && (
          <header className="mb-12 max-w-2xl">
            {eyebrow && (
              <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>
            )}
            {title && (
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
            )}
            {description && <p className="mt-4 text-lg text-muted-foreground">{description}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
