"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MARK_VIEW_BOX, SLAB_DOWN, SLAB_UP } from "@/components/brand/mark";

/**
 * Feedback for a click that is going somewhere.
 *
 * loading.tsx cannot do this, and measuring is what showed why. Clicking a
 * sidebar link on a throttled phone left the old page on screen, unchanged,
 * for 1.3 seconds and then swapped: the loading fallback never rendered once.
 * React does not re-show an already-mounted Suspense boundary's fallback for
 * an update inside a transition, and the portal's boundary is mounted by the
 * first page that loads. So loading.tsx covers a cold load of a dashboard
 * route and nothing after it.
 *
 * A document-level listener rather than useLinkStatus, which has to sit inside
 * each individual Link. Course cards, table rows, breadcrumbs and empty-state
 * links all navigate too, and this covers every one of them without editing
 * them.
 *
 * Deliberately non-blocking: no scrim, pointer-events off. Next navigations
 * are interruptible, and covering the sidebar would take away the ability to
 * change your mind mid-wait.
 *
 * The 150ms delay is in CSS, not here. A prefetched route arrives in well
 * under that, and a bar that flashes for one frame on every click reads as a
 * glitch rather than as progress.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(null);

  // Derived, not stored: writing state in an effect keyed on pathname is the
  // render-then-correct pattern, and it double-renders every navigation.
  const pending = target !== null && target !== pathname;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Anything the browser will not treat as a same-tab navigation.
      // No defaultPrevented check: this runs in the capture phase, and Link
      // calls preventDefault in its own handler — testing it here meant the
      // guard was true for every real navigation and the indicator never
      // rendered once.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      // A hash or a link to where we already are is not a navigation, and
      // arming for one would leave the bar up until the timeout.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      setTarget(url.pathname);
    }

    // Capture, so this sees the click before Link handles it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // A navigation can be cancelled or fail, and an indicator with no end is
  // worse than none: it turns a working page into one that looks stuck.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTarget(null), 8000);
    return () => clearTimeout(timer);
  }, [pending, target]);

  if (!pending) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      <div className="nav-progress-track absolute inset-x-0 top-0 h-0.5 overflow-hidden">
        <div className="nav-progress-bar h-full w-2/5 bg-brand-bright" />
      </div>

      <div className="nav-progress-pill absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-brand-ink/90 px-4 py-2.5 text-white shadow-lg backdrop-blur">
        <svg
          viewBox={MARK_VIEW_BOX}
          width={21}
          height={18}
          fill="currentColor"
          className="overflow-visible text-brand-pale"
        >
          <path className="mark-slab-trade-a" d={SLAB_UP} />
          <path className="mark-slab-trade-b" d={SLAB_DOWN} />
        </svg>
        <span className="text-xs font-medium text-white/70">Loading</span>
      </div>
    </div>
  );
}
