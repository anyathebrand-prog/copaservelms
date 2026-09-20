import Image from "next/image";

/**
 * Who stands behind CopaServe, and who uses it.
 *
 * Two lists on purpose. BIT Technologies owns and operates the platform; it is
 * not an institution CopaServe "works with", and putting the operator's own
 * logo under a "Trusted by" heading is the kind of claim a compliance buyer is
 * trained to check. Separating them means the parent company can be shown
 * prominently and honestly, and nothing goes in the partner row until there is
 * something real to put in it.
 *
 * The row is not only institutions — Inside The Hive is a community. The
 * heading on the homepage says so, because a community listed under a claim
 * about institutions is the same overstatement in the other direction.
 *
 * Logos live in public/brand/partners/. Adding one is a line here plus the
 * file — no component changes.
 */

export type Partner = {
  name: string;
  /** Path under /public. */
  logo: string;
  /** The artwork's intrinsic size, so the aspect ratio is never guessed. */
  width: number;
  height: number;
  href?: string;
};

/** The company that owns and runs the platform. */
export const OPERATOR: Partner = {
  name: "BIT Technologies",
  logo: "/brand/partners/bit-technologies.png",
  // The artwork's own pixels. Display size comes from CSS; these are here so
  // the browser reserves the right box and the card does not jump as it loads.
  width: 549,
  height: 53,
};

/** Institutions and communities that actually work with CopaServe. */
export const PARTNERS: Partner[] = [
  {
    name: "Inside The Hive",
    logo: "/brand/partners/inside-the-hive.png",
    width: 512,
    height: 503,
  },
  {
    // Alt text is the name alone. The tagline in the artwork reads "Your
    // trusted crypto paddy", and there is no reason to copy that wording into
    // the page text: the row credits a partner, it does not advertise what
    // they sell, and this domain is already being judged on how much crypto
    // vocabulary its markup carries.
    name: "gidSwap",
    logo: "/brand/partners/gidswap.png",
    width: 512,
    height: 232,
  },
];

/**
 * How much room one logo gets in the row.
 *
 * A wide wordmark, a stacked lockup and a round badge cannot share a single
 * rule. Capping them all at the same height makes the badge unreadable — the
 * rim lettering on a 32px circle is a smudge — while capping them all at the
 * same width makes the wordmark tower over everything else. So the artwork's
 * own aspect ratio picks the bucket, and the caps are chosen to carry roughly
 * equal visual weight rather than equal pixels.
 *
 * Derived rather than configured, so adding a partner stays one entry above
 * with no styling decision attached to it.
 */
function sizing(partner: Partner): string {
  const ratio = partner.width / partner.height;
  if (ratio < 1.6) return "max-h-20 max-w-20"; // round badge
  if (ratio < 4) return "max-h-12 max-w-[150px]"; // stacked lockup
  return "max-h-8 max-w-[170px]"; // wide wordmark
}

function Logo({ partner, className = "" }: { partner: Partner; className?: string }) {
  return (
    <Image
      src={partner.logo}
      alt={partner.name}
      width={partner.width}
      height={partner.height}
      className={className}
    />
  );
}

export function OperatorMark() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-surface px-8 py-10 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Built and operated by
      </p>

      {/* Sized by width, never by height. A fixed height plus preflight's
          max-width:100% throws the aspect ratio away as soon as the card gets
          narrow than the artwork — on a 360px phone this wordmark came out
          26% too wide for its height. Someone's registered mark is the last
          thing that should be quietly stretched. */}
      <Logo partner={OPERATOR} className="h-auto w-full max-w-[300px] object-contain sm:max-w-[360px]" />

      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Business Intelligence Technologies Limited, Lagos — the company behind CopaServe and the
        signatory on every certificate it issues.
      </p>
    </div>
  );
}

export function PartnerLogos() {
  if (PARTNERS.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
        Partner logos appear here once launch partners are confirmed.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-14 gap-y-10">
      {PARTNERS.map((partner) => (
        <li key={partner.name}>
          {/* Greyscale at rest so a wall of competing brand colours does not
              pull attention off the page's own. */}
          {/* max-* with auto dimensions, so a wide mark is clamped by width and
              a tall one by height, and neither is distorted. */}
          <Logo
            partner={partner}
            className={`h-auto w-auto object-contain opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0 ${sizing(partner)}`}
          />
        </li>
      ))}
    </ul>
  );
}
