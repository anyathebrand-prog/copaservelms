"use client";

import { useEffect, useState } from "react";
import { MARK_VIEW_BOX, SLAB_DOWN, SLAB_UP } from "@/components/brand/mark";

/**
 * The mark, covering the first load.
 *
 * The route-level loading.tsx files cannot do this. They only run once the app
 * is already going, during a navigation between pages — on a cold load the
 * browser shows nothing at all until the HTML arrives and then paints the
 * finished page, so there is no gap for them to fill.
 *
 * The window this does cover is the real one: markup has arrived and painted,
 * but the JavaScript that makes it work has not run yet. It is server-rendered
 * so it is on screen at first paint, and it clears on mount — which is the
 * moment the page becomes interactive, and so the honest definition of the
 * site being up.
 *
 * The 320ms floor is there because a fast connection would otherwise flash it
 * for one frame, which reads as a glitch rather than as loading.
 *
 * If the JavaScript never arrives, the CSS gives up on its own after six
 * seconds and uncovers the page. A splash screen that can trap someone on a
 * blank rectangle is worse than no splash screen.
 */
export function BootScreen() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 320);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`boot-screen ${done ? "boot-screen-done" : ""}`} aria-hidden>
      <svg
        viewBox={MARK_VIEW_BOX}
        width={116}
        height={100}
        fill="currentColor"
        className="mark-loader overflow-visible"
      >
        <path className="mark-slab-up" d={SLAB_UP} />
        <path className="mark-slab-down" d={SLAB_DOWN} />
      </svg>
    </div>
  );
}
