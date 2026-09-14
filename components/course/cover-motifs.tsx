import type { ReactNode } from "react";

/**
 * The illustration on a course cover.
 *
 * Drawn rather than generated, for reasons that are practical before they are
 * aesthetic: these cost nothing, cannot 404, stay sharp at any size, and use
 * the brand's exact colours rather than an approximation of them. An image
 * model asked for a document also tends to write pseudo-text on it, which on a
 * compliance platform looks wrong in a specific and embarrassing way.
 *
 * Iconographic on purpose. No people, no offices, no stock-photograph staging —
 * each one is the single object the course is actually about.
 *
 * Keyed by slug first so the two NDPA courses and the two cybersecurity ones do
 * not share a picture, then by category so a course an instructor creates
 * tomorrow still gets something relevant rather than a blank.
 */

const MINT = "#dcf8dd";
const BRIGHT = "#05ff12";
const INK = "#04170a";
const DEEP = "#0a510e";

/** A sealed record: the NDPA as something that protects a file. */
function SealedRecord() {
  return (
    <g transform="translate(114 30)">
      <rect width="92" height="118" rx="6" fill={MINT} opacity="0.95" />
      <rect x="14" y="18" width="64" height="7" rx="3.5" fill={DEEP} opacity="0.45" />
      <rect x="14" y="34" width="48" height="7" rx="3.5" fill={DEEP} opacity="0.28" />
      <rect x="14" y="50" width="58" height="7" rx="3.5" fill={DEEP} opacity="0.28" />
      <g transform="translate(46 64)">
        <path d="M-34 6 L0 -6 L34 6 L34 38 C34 60 0 74 0 74 C0 74 -34 60 -34 38 Z" fill={INK} />
        <path d="M-30 10 L0 0 L30 10 L30 36 C30 55 0 67 0 67 C0 67 -30 55 -30 36 Z" fill={BRIGHT} opacity="0.92" />
        <rect x="-7" y="30" width="14" height="16" rx="3" fill={INK} />
        <path d="M-5 30 v-6 a5 5 0 0 1 10 0 v6" fill="none" stroke={INK} strokeWidth="3.4" />
      </g>
    </g>
  );
}

/** A statute with a seal: the Act itself, for the practitioner's course. */
function Statute() {
  return (
    <g transform="translate(80 38)">
      <path d="M0 8 C26 -2 54 -2 78 8 L78 96 C54 86 26 86 0 96 Z" fill={MINT} opacity="0.95" />
      <path d="M82 8 C106 -2 134 -2 160 8 L160 96 C134 86 106 86 82 96 Z" fill={MINT} opacity="0.8" />
      <path d="M78 8 L82 8 L82 96 L78 96 Z" fill={DEEP} opacity="0.45" />
      {[24, 40, 56].map((y) => (
        <g key={y}>
          <rect x="14" y={y} width="48" height="5" rx="2.5" fill={DEEP} opacity="0.3" />
          <rect x="98" y={y - 2} width="48" height="5" rx="2.5" fill={DEEP} opacity="0.22" />
        </g>
      ))}
      <g transform="translate(120 84)">
        <circle r="22" fill={BRIGHT} opacity="0.92" />
        <circle r="14" fill="none" stroke={INK} strokeWidth="3" />
        <path d="M-6 26 L-10 44 L0 38 L10 44 L6 26 Z" fill={INK} />
      </g>
    </g>
  );
}

/** The lure and the hook: how an attack actually starts. */
function Phishing() {
  return (
    <>
      <g transform="translate(58 44)">
        <rect y="10" width="120" height="86" rx="8" fill={MINT} opacity="0.93" />
        <path d="M0 18 L60 62 L120 18" fill="none" stroke={DEEP} strokeWidth="7" strokeLinejoin="round" opacity="0.55" />
      </g>
      <g transform="translate(196 30)" stroke={BRIGHT} strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M20 0 v52" />
        <path d="M20 52 a22 22 0 1 1 -22 -22" />
      </g>
      <circle cx="216" cy="22" r="6" fill={BRIGHT} />
    </>
  );
}

/** A key that fits: the everyday habits half of security. */
function LockAndKey() {
  return (
    <>
      <g transform="translate(108 30)">
        <path d="M-34 10 L0 -4 L34 10 L34 56 C34 86 0 108 0 108 C0 108 -34 86 -34 56 Z"
              transform="translate(34 0)" fill={MINT} opacity="0.95" />
        <g transform="translate(34 52)">
          <circle r="13" fill={DEEP} opacity="0.75" />
          <rect x="-4" y="6" width="8" height="20" rx="3" fill={DEEP} opacity="0.75" />
        </g>
      </g>
      <g transform="translate(206 76) rotate(-24)">
        <circle cx="12" cy="12" r="12" fill="none" stroke={BRIGHT} strokeWidth="7" />
        <path d="M24 12 L62 12" stroke={BRIGHT} strokeWidth="7" strokeLinecap="round" />
        <path d="M50 12 v12" stroke={BRIGHT} strokeWidth="7" strokeLinecap="round" />
        <path d="M60 12 v9" stroke={BRIGHT} strokeWidth="7" strokeLinecap="round" />
      </g>
    </>
  );
}

/** Looking hard at money moving: anti-money-laundering and KYC. */
function FollowTheMoney() {
  return (
    <>
      <g transform="translate(74 52)">
        <rect width="118" height="72" rx="8" fill={MINT} opacity="0.93" />
        <circle cx="59" cy="36" r="19" fill="none" stroke={DEEP} strokeWidth="6" opacity="0.5" />
        <path d="M59 22 v28 M52 29 h14 M52 43 h14" stroke={DEEP} strokeWidth="5" strokeLinecap="round" opacity="0.5" />
        <rect x="12" y="12" width="16" height="6" rx="3" fill={DEEP} opacity="0.3" />
        <rect x="90" y="54" width="16" height="6" rx="3" fill={DEEP} opacity="0.3" />
      </g>
      <g transform="translate(176 36)">
        <circle cx="34" cy="34" r="30" fill="none" stroke={BRIGHT} strokeWidth="8" />
        <circle cx="34" cy="34" r="30" fill={BRIGHT} opacity="0.12" />
        <path d="M56 56 L78 78" stroke={BRIGHT} strokeWidth="10" strokeLinecap="round" />
      </g>
    </>
  );
}

/** Blocks put in order: content management. */
function ContentBlocks() {
  return (
    <g transform="translate(86 34)">
      <rect x="0" y="66" width="148" height="26" rx="6" fill={MINT} opacity="0.55" />
      <rect x="0" y="96" width="148" height="26" rx="6" fill={MINT} opacity="0.45" />
      <rect x="-6" y="24" width="160" height="34" rx="7" fill={MINT} opacity="0.95" />
      <rect x="10" y="36" width="72" height="10" rx="5" fill={DEEP} opacity="0.45" />
      <g transform="translate(126 41)">
        <circle r="15" fill={BRIGHT} opacity="0.95" />
        <path d="M-6 0 L-1 6 L7 -5" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <rect x="-6" y="0" width="52" height="12" rx="6" fill={BRIGHT} opacity="0.5" />
    </g>
  );
}

/** Alignment and a palette: design for people who are not designers. */
function LayoutGrid() {
  return (
    <>
      <g transform="translate(74 34)">
        <rect width="116" height="112" rx="8" fill={MINT} opacity="0.93" />
        <rect x="14" y="16" width="60" height="12" rx="4" fill={DEEP} opacity="0.5" />
        <rect x="14" y="38" width="88" height="6" rx="3" fill={DEEP} opacity="0.22" />
        <rect x="14" y="52" width="88" height="6" rx="3" fill={DEEP} opacity="0.22" />
        <rect x="14" y="70" width="42" height="28" rx="5" fill={DEEP} opacity="0.3" />
        <rect x="62" y="70" width="40" height="28" rx="5" fill={DEEP} opacity="0.18" />
      </g>
      {/* The alignment guide, which is the whole lesson. */}
      <path d="M88 20 L88 160" stroke={BRIGHT} strokeWidth="2.5" strokeDasharray="7 6" opacity="0.9" />
      <g transform="translate(214 52)">
        <rect width="34" height="34" rx="6" fill={BRIGHT} opacity="0.9" />
        <rect y="42" width="34" height="34" rx="6" fill={MINT} opacity="0.75" />
      </g>
    </>
  );
}

/** One thing pulled forward, the rest waiting: attention and priorities. */
function Priorities() {
  return (
    <>
      <g transform="translate(70 40)">
        <rect x="8" y="34" width="128" height="22" rx="6" fill={MINT} opacity="0.4" />
        <rect x="8" y="64" width="128" height="22" rx="6" fill={MINT} opacity="0.32" />
        <rect y="0" width="144" height="26" rx="7" fill={MINT} opacity="0.96" />
        <rect x="14" y="9" width="66" height="8" rx="4" fill={DEEP} opacity="0.45" />
        <g transform="translate(120 13)">
          <circle r="9" fill={BRIGHT} />
          <path d="M-4 0 L-1 4 L5 -4" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <g transform="translate(228 94)">
        <circle r="28" fill="none" stroke={BRIGHT} strokeWidth="7" />
        <path d="M0 -16 L0 0 L11 9" fill="none" stroke={BRIGHT} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

/** A draft being cut down: writing people act on. */
function Editing() {
  return (
    <>
      <g transform="translate(88 28)">
        <rect width="104" height="128" rx="6" fill={MINT} opacity="0.95" />
        <rect x="16" y="22" width="72" height="8" rx="4" fill={DEEP} opacity="0.5" />
        <rect x="16" y="42" width="56" height="8" rx="4" fill={DEEP} opacity="0.22" />
        <rect x="16" y="62" width="72" height="8" rx="4" fill={DEEP} opacity="0.22" />
        <rect x="16" y="82" width="44" height="8" rx="4" fill={DEEP} opacity="0.22" />
        <path d="M12 46 L92 46" stroke={DEEP} strokeWidth="3" opacity="0.7" />
        <path d="M12 66 L92 66" stroke={DEEP} strokeWidth="3" opacity="0.7" />
      </g>
      <g transform="translate(200 88) rotate(-28)">
        <path d="M0 0 L16 0 L16 44 L8 60 L0 44 Z" fill={BRIGHT} />
        <path d="M0 44 L16 44 L8 60 Z" fill={INK} />
      </g>
    </>
  );
}

const BY_SLUG: Record<string, () => ReactNode> = {
  "demo-ndpa-foundations": SealedRecord,
  "ndpa-practitioner-introduction": Statute,
  "cybersecurity-for-nigerian-workplaces": Phishing,
  "demo-cyber-essentials": LockAndKey,
  "aml-kyc-nigerian-institutions": FollowTheMoney,
  "content-management": ContentBlocks,
  "design-fundamentals-for-non-designers": LayoutGrid,
  "working-deliberately": Priorities,
  "writing-that-gets-read": Editing,
};

/** So a course created tomorrow is not blank. */
const BY_CATEGORY: Record<string, () => ReactNode> = {
  "Data Protection": SealedRecord,
  Cybersecurity: LockAndKey,
  Compliance: FollowTheMoney,
  "Professional Development": Priorities,
  Design: LayoutGrid,
};

export function coverMotif(slug: string, category?: string | null): ReactNode {
  const Motif = BY_SLUG[slug] ?? (category ? BY_CATEGORY[category] : undefined);
  return Motif ? <Motif /> : null;
}
