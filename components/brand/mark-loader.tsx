import { MARK_RATIO, MARK_VIEW_BOX, SLAB_DOWN, SLAB_UP } from "@/components/brand/mark";

/**
 * The mark, loading.
 *
 * The motion comes out of the drawing rather than being applied to it: the two
 * slabs are an interlock, so they part along the diagonal they were assembled
 * on and snap back. Nothing spins — a rotating logo is a logo nobody can read,
 * and the shear in this one makes rotation look like a rendering fault.
 *
 * Keyframes live in globals.css so this stays a server component: a loading
 * state that has to ship a client bundle before it can appear is a loading
 * state that arrives after the thing it was covering for.
 *
 * Below COMPACT_BELOW the slabs trade weight instead of parting. Measuring the
 * mark at button sizes is what forced that: the travel is proportional, so at
 * 14px the slabs move two thirds of a pixel and the loop reads as a blur —
 * and scaling the travel up to compensate pushes the two halves so far apart
 * they stop reading as one logo.
 *
 * Announced with role="status" and a real label, because a spinner that only
 * exists visually leaves a screen reader on a silent page with no way to tell
 * "working" from "broken".
 */

/** Below this height the parting motion is smaller than a pixel. */
const COMPACT_BELOW = 28;

export function MarkLoader({
  size = 40,
  label = "Loading",
  className = "",
}: {
  size?: number;
  /**
   * Read out to assistive technology. Say what is loading where you can; pass
   * "" when the surrounding control already announces that it is busy.
   */
  label?: string;
  className?: string;
}) {
  // An empty label means the surrounding control already announces the state
  // — a button with aria-busy, say. Nesting a second live region inside that
  // makes a screen reader say it twice.
  const announces = label !== "";
  const compact = size < COMPACT_BELOW;
  const up = compact ? "mark-slab-trade-a" : "mark-slab-up";
  const down = compact ? "mark-slab-trade-b" : "mark-slab-down";

  return (
    <span
      role={announces ? "status" : undefined}
      aria-hidden={announces ? undefined : true}
      className={`inline-flex items-center ${className}`}
    >
      <svg
        viewBox={MARK_VIEW_BOX}
        width={Math.round(size * MARK_RATIO)}
        height={size}
        fill="currentColor"
        aria-hidden
        className={`overflow-visible ${compact ? "" : "mark-loader"}`}
      >
        <path className={up} d={SLAB_UP} />
        <path className={down} d={SLAB_DOWN} />
      </svg>
      {announces && <span className="sr-only">{label}</span>}
    </span>
  );
}

/**
 * A whole panel that is still loading.
 *
 * Centred in the space the content will occupy, so the mark does not jump when
 * the real thing replaces it.
 */
export function LoadingPanel({
  label = "Loading",
  caption,
  className = "",
}: {
  label?: string;
  /** Shown on screen. Leave unset for a mark on its own. */
  caption?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-h-64 flex-col items-center justify-center gap-4 ${className}`}>
      <MarkLoader size={44} label={label} className="text-brand" />
      {caption && <p className="text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}
