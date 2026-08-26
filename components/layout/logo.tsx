import Image from "next/image";
import Link from "next/link";

/**
 * The CopaServe lockup.
 *
 * One component so the logo has a single definition: swapping the asset or its
 * proportions later is one edit rather than five. Dimensions come from the
 * artwork's real 6.08:1 ratio, so it never distorts.
 *
 * The supplied logo is solid black. `variant="white"` uses the knockout for
 * dark or brand-green surfaces — a black logo on a green header would be
 * unreadable, and inverting in CSS would also invert the transparency.
 */
const RATIO = 1903 / 313;

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
