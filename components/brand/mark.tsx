/**
 * The CopaServe mark, as geometry.
 *
 * Until now the mark existed only as a PNG, which can be placed but not drawn,
 * recoloured, masked or animated. These two paths were traced from
 * public/brand/copaserve-mark.png by scripts/trace-mark.ts and checked by
 * rendering them back over the original.
 *
 * Two slabs, not one path: they are the interlock the mark is built from, and
 * keeping them separate is what lets the loader move them independently.
 * SLAB_DOWN is the lower-right form, SLAB_UP the upper-left one.
 *
 * The viewBox is wider than the artwork's square on purpose — the slabs travel
 * diagonally in the loader, and a tight box would clip them mid-loop.
 */
export const SLAB_UP =
  "M16.359 15.899L0 64.977L66.129 64.516L70.276 50.922L51.152 50.922L49.539 55.3L23.041 55.3" +
  "L23.272 53.456L32.719 25.806L58.986 25.576L57.834 30.184L77.189 30.184L81.797 15.899L16.59 15.899Z";

export const SLAB_DOWN =
  "M34.332 34.562L29.724 48.618L49.078 48.618L50.461 44.47L76.959 44.47L74.194 53.917L67.512 73.733" +
  "L40.783 73.733L42.166 69.355L22.581 69.355L18.203 83.641L83.641 83.641L84.101 82.949" +
  "L99.77 35.484L99.539 34.562L34.562 34.562Z";

export const MARK_VIEW_BOX = "-8 0 116 100";

/** Ink height to width, so a caller can size by either without distorting. */
export const MARK_RATIO = 116 / 100;

/**
 * The static mark.
 *
 * Fills with currentColor, so it takes the brand green on a light surface and
 * white on the ink chrome without a second asset.
 */
export function Mark({
  size = 32,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEW_BOX}
      width={Math.round(size * MARK_RATIO)}
      height={size}
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <path d={SLAB_UP} />
      <path d={SLAB_DOWN} />
    </svg>
  );
}
