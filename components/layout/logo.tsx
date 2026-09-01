import Image from "next/image";
import Link from "next/link";

/**
 * The CopaServe lockup.
 *
 * One component so the logo has a single definition: swapping the asset or its
 * proportions later is one edit rather than five. Dimensions come from the
 * artwork's real 4.59:1 ratio, so it never distorts.
 *
 * Two colourways of one drawing. `dark` is brand green, for light surfaces;
 * `variant="white"` is the artwork's own pale green, for the ink header,
 * footer and sidebar. Both are knockouts — the counter of the S is
 * transparent, so whatever sits behind shows through it, exactly as in the
 * supplied artwork. Recolouring in CSS is not an option for the same reason:
 * a filter would invert the transparency along with the fill.
 */
const RATIO = 1520 / 331;

export function Logo({
  height = 28,
  variant = "dark",
  className = "",
}: {
  height?: number;
  variant?: "dark" | "white";
  className?: string;
}) {
  return (
    <Image
      src={variant === "white" ? "/brand/copaserve-logo-white.png" : "/brand/copaserve-logo.png"}
      alt="CopaServe"
      width={Math.round(height * RATIO)}
      height={height}
      // The logo is above the fold everywhere it appears.
      priority
      className={className}
    />
  );
}

export function LogoLink({
  href = "/",
  height = 28,
  variant = "dark",
}: {
  href?: string;
  height?: number;
  variant?: "dark" | "white";
}) {
  return (
    <Link href={href} className="inline-flex items-center" aria-label="CopaServe home">
      <Logo height={height} variant={variant} />
    </Link>
  );
}
