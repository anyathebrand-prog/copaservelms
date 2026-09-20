import { ImageResponse } from "next/og";
import { MARK_VIEW_BOX, SLAB_DOWN, SLAB_UP } from "@/components/brand/mark";

/**
 * The picture that appears when a CopaServe link is shared.
 *
 * Drawn here rather than kept as a file in /public, so it cannot drift from
 * the brand: the mark comes from the same paths the site's logo uses, and the
 * colours are the brand ink and green.
 *
 * Every page inherits this unless it sets its own — a course page uses its
 * own banner instead, which is the more useful picture for that link.
 */
export const alt = "CopaServe — Learn. Get Certified. Verify.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #04170a 0%, #0a510e 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <svg viewBox={MARK_VIEW_BOX} width={132} height={114} fill="#05ff12">
          <path d={SLAB_UP} />
          <path d={SLAB_DOWN} />
        </svg>

        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 40 }}>
          CopaServe
        </div>

        <div style={{ display: "flex", fontSize: 40, color: "rgba(255,255,255,0.72)", marginTop: 16 }}>
          Learn. Get Certified. Verify.
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.5)", marginTop: 48 }}>
          Professional certification for data protection, compliance and cybersecurity
        </div>
      </div>
    ),
    size,
  );
}
