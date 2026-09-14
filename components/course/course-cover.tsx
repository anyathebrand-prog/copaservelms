import Image from "next/image";
import { MARK_VIEW_BOX, SLAB_DOWN, SLAB_UP } from "@/components/brand/mark";
import { coverMotif } from "@/components/course/cover-motifs";

/**
 * The picture on a course.
 *
 * Every course has one, whether or not anybody uploaded anything. A catalogue
 * where some cards carry an image and others carry a grey rectangle looks
 * broken rather than sparse, and an instructor part-way through building a
 * course should not make the whole page look unfinished.
 *
 * The fallback is generated from the course itself rather than picked from a
 * stock library: the slug seeds the angle and the band positions, so a course
 * always gets the same cover and two courses side by side never get the same
 * one. Stock imagery on a compliance catalogue is also its own kind of lie —
 * a photograph of strangers in a meeting room says nothing true about the NDPA.
 *
 * Drawn as inline SVG on purpose. It costs no request, needs no storage, and
 * cannot 404.
 */

/** A small stable hash, so the same slug always produces the same cover. */
function seedOf(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Category decides the hue, so the catalogue reads as grouped at a glance.
 * Everything stays inside the brand's green-to-ink range rather than becoming
 * a fruit salad.
 */
const PALETTES: Record<string, [string, string]> = {
  "Data Protection": ["#04170a", "#0a510e"],
  Cybersecurity: ["#04170a", "#12463a"],
  "Professional Development": ["#0a2711", "#1d6b2a"],
  Design: ["#04170a", "#2c5a3c"],
  Compliance: ["#071d10", "#0f5a2a"],
};

const DEFAULT_PALETTE: [string, string] = ["#04170a", "#0a510e"];

export function CourseCover({
  title,
  slug,
  thumbnailUrl,
  category,
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 33vw, 100vw",
}: {
  title: string;
  slug: string;
  thumbnailUrl?: string | null;
  category?: string | null;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (thumbnailUrl) {
    return (
      <div className={`relative aspect-[16/9] overflow-hidden bg-surface-muted ${className}`}>
        <Image
          src={thumbnailUrl}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  const seed = seedOf(slug || title);
  const [from, to] = PALETTES[category ?? ""] ?? DEFAULT_PALETTE;
  const motif = coverMotif(slug, category);

  // Derived from the seed: the shear of the brand mark, give or take, so the
  // bands read as part of the same drawing rather than as decoration.
  const angle = 18 + (seed % 14);
  const offset = seed % 40;
  const gradientId = `cover-${seed.toString(36)}`;

  return (
    <div
      aria-hidden
      className={`relative aspect-[16/9] overflow-hidden bg-brand-ink ${className}`}
    >
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="size-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>

        <rect width="320" height="180" fill={`url(#${gradientId})`} />

        {/* Behind the illustration, and fainter when there is one: the bands
            are a backdrop, not the subject. */}
        <g transform={`rotate(-${angle} 160 90)`} opacity={motif ? 0.08 : 0.14}>
          {[0, 1, 2, 3].map((band) => (
            <rect
              key={band}
              x={-80 + offset + band * 92}
              y="-60"
              width="34"
              height="300"
              fill="#ffffff"
            />
          ))}
        </g>

        {motif}

        {/* The mark, quietly, bottom-right — the same place a publisher would
            put a colophon. Dropped when an illustration is present, which
            already occupies that corner. */}
        {!motif && (
          <g transform="translate(232 118) scale(0.62)" opacity="0.22">
            <path d={SLAB_UP} fill="#ffffff" />
            <path d={SLAB_DOWN} fill="#ffffff" />
          </g>
        )}
      </svg>
    </div>
  );
}

/** Exported so a caller can keep the viewBox in step if it draws the mark itself. */
export const COVER_MARK_VIEW_BOX = MARK_VIEW_BOX;
