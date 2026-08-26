import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-6 shadow-[0_8px_30px_-18px_rgb(10_81_14/0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgb(10_81_14/0.45)] ${className}`}
    >
      {children}
    </div>
  );
}
