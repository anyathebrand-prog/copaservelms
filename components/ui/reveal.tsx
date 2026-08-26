"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-triggered reveal (PRD §7.2 — "all sections scroll-animated").
 *
 * Implemented with IntersectionObserver and CSS rather than Framer Motion:
 * the landing page is otherwise fully server-rendered, and animating it with a
 * motion library would pull the whole page into the client bundle for an
 * effect CSS does natively. Framer Motion still earns its place in the app
 * shell, where interactions are stateful.
 *
 * prefers-reduced-motion is handled globally in globals.css, which collapses
 * the transition to ~0ms.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          // One-shot: re-animating on scroll-back is distracting.
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
