"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowRight, BadgeCheck, Fingerprint, QrCode, ShieldCheck } from "lucide-react";

/**
 * Landing hero (PRD §7.1).
 *
 * A dark band in brand ink, with the bright green (#05ff12) used as light
 * rather than as fill — it appears as glow, as a drawn underline, and as a
 * single lit edge, never as a large area. That restraint is what keeps a neon
 * green from cheapening the deep forest green it belongs to.
 *
 * The four words of the headline are the product in order — learn, get
 * certified, verify, mint — so they arrive one at a time rather than as a
 * block. "Mint." lands last and alone, which is also the honest emphasis: it
 * is the optional final step, not the entry price.
 *
 * §7.1 asks for floating 3D cards and an animated dashboard preview. Both are
 * done with CSS 3D transforms under a perspective, not WebGL. A Three.js hero
 * is ~600KB before any scene code, on a platform whose learners are largely on
 * metered Nigerian mobile data — the tilt, float, and parallax here are
 * indistinguishable at hero scale and cost nothing to download.
 *
 * Everything is gated on prefers-reduced-motion, and the reduced path renders
 * the finished state, so nothing is hidden from anyone who turns motion off.
 */

/** The headline, split where it should breathe. */
const HEADLINE = ["Learn.", "Get Certified.", "Verify."] as const;

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero({
  courseCount,
  domainCount,
}: {
  courseCount: number;
  domainCount: number;
}) {
  const reduced = Boolean(useReducedMotion());

  return (
    <section className="hero-ink grain relative isolate overflow-hidden text-white">
      <HeroBackdrop reduced={reduced} />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-28 pt-16 sm:pb-36 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
        <div>
          <h1 className="font-display text-[clamp(2.9rem,8.5vw,5.5rem)] font-bold leading-[0.94] tracking-[-0.035em]">
            {HEADLINE.map((word, index) => (
              <motion.span
                key={word}
                initial={reduced ? false : { opacity: 0, y: 28, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, delay: 0.15 + index * 0.11, ease: EASE }}
                className="block text-white/95"
              >
                {word}
              </motion.span>
            ))}

            <motion.span
              initial={reduced ? false : { opacity: 0, y: 28, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.48, ease: EASE }}
              className="text-glow relative inline-block"
            >
              Mint.
              {/* Drawn after the word settles, so the eye is led to it rather
                  than shown it. */}
              <motion.span
                aria-hidden
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: 1.05, ease: EASE }}
                style={{ originX: 0 }}
                className="absolute -bottom-2 left-0 h-1.5 w-full rounded-full bg-brand-bright shadow-[0_0_20px_rgba(5,255,18,0.7)]"
              />
            </motion.span>
          </h1>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.68 }}
            className="mt-9 max-w-xl text-lg leading-relaxed text-white/60"
          >
            Nigeria&apos;s next-generation professional learning platform for Data Protection,
            Compliance, Governance, Web3, Cybersecurity and Emerging Technologies.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-bright px-7 py-4 text-sm font-bold text-brand-ink shadow-[0_0_45px_-8px_rgba(5,255,18,0.65)] transition hover:shadow-[0_0_60px_-6px_rgba(5,255,18,0.9)]"
            >
              Start Learning
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="#courses"
              className="rounded-full border border-white/20 px-7 py-4 text-sm font-semibold text-white/90 backdrop-blur transition hover:border-white/40 hover:bg-white/5"
            >
              Explore Courses
            </Link>
          </motion.div>

          <motion.dl
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="mt-14 grid max-w-lg grid-cols-3 gap-8 border-t border-white/10 pt-8"
          >
            <Stat value={courseCount} label="Courses published" reduced={reduced} />
            <Stat value={domainCount} label="Training domains" reduced={reduced} />
            <Stat value="Instant" label="Verification" reduced={reduced} />
          </motion.dl>
        </div>

        <CertificatePreview reduced={reduced} />
      </div>

    </section>
  );
}

/**
 * Animated statistic (PRD §7.1 "animated statistics counter").
 *
 * Counts from zero so the number reads as measured rather than decorative.
 * Non-numeric values are shown as they are.
 */
function Stat({
  value,
  label,
  reduced,
}: {
  value: number | string;
  label: string;
  reduced: boolean;
}) {
  // Only numbers count up, and only when motion is welcome. Deriving the
  // displayed value rather than storing it means the static case needs no
  // effect at all.
  const animated = typeof value === "number" && !reduced;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!animated) return;

    const controls = animate(0, value as number, {
      duration: 1.1,
      delay: 1,
      ease: "easeOut",
      onUpdate: (latest) => setCount(Math.round(latest)),
    });

    return () => controls.stop();
  }, [animated, value]);

  return (
    <div>
      <dd className="font-display text-4xl font-bold tracking-tight text-white">
        {animated ? count : value}
      </dd>
      <dt className="mt-1.5 text-xs uppercase tracking-wider text-white/40">{label}</dt>
    </div>
  );
}

/**
 * The floating credential card (PRD §7.1 "floating 3D cards", "animated
 * dashboard preview").
 *
 * A certificate rather than an abstract shape, because the certificate is the
 * product. It is labelled as a sample and its credential ID is deliberately
 * not a valid one: a marketing page showing what looks like a real person's
 * credential would be a fabricated record.
 */
function CertificatePreview({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // Pointer parallax. Springs rather than raw values, so the card settles
  // instead of snapping to the cursor.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 110, damping: 18, mass: 0.6 });
  const springY = useSpring(pointerY, { stiffness: 110, damping: 18, mass: 0.6 });
  const rotateY = useTransform(springX, [-0.5, 0.5], [-16, 8]);
  const rotateX = useTransform(springY, [-0.5, 0.5], [10, -10]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    // Coarse pointers have no hover, so tilting on touch would just mean the
    // card lurches under the finger that is trying to scroll past it.
    if (reduced || event.pointerType !== "mouse") return;

    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;

    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function resetPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      initial={reduced ? false : { opacity: 0, y: 48 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
      className="relative mx-auto w-full max-w-sm [perspective:1500px] lg:max-w-md"
    >
      {/* The card's own light, thrown onto the ink behind it. */}
      <div aria-hidden className="absolute inset-6 -z-10 rounded-full bg-brand-bright/20 blur-[70px]" />

      {/* The float lives on this wrapper and the tilt on the child. A CSS
          animation on transform outranks an inline style, so the two would
          overwrite each other on one element and the parallax would die. */}
      <div className={reduced ? "" : "animate-float"}>
        <motion.div
          style={reduced ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
          className="glass-dark relative overflow-hidden rounded-[28px] p-7"
        >
          {!reduced && (
            <span
              aria-hidden
              className="animate-sheen pointer-events-none absolute -inset-x-8 top-0 h-32 bg-gradient-to-b from-transparent via-white/25 to-transparent"
            />
          )}

          <div className="flex items-start justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bright/15 px-3 py-1 text-xs font-semibold text-brand-bright">
              <BadgeCheck className="size-3.5" />
              Verified
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
              Sample
            </span>
          </div>

          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Certificate of Completion
          </p>
          <h2 className="mt-2.5 font-display text-[1.6rem] font-bold leading-[1.15] text-white">
            Nigeria Data Protection Act
            <span className="block text-white/50">Practitioner</span>
          </h2>

          <dl className="mt-8 space-y-3.5 border-t border-white/10 pt-6 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-white/40">Credential ID</dt>
              <dd className="font-mono text-xs text-white/80">CS-SAMPLE-0000</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-white/40">Status</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium text-brand-bright">
                <span className="size-1.5 rounded-full bg-brand-bright" />
                Active
              </dd>
            </div>
          </dl>

          <div className="mt-7 flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <QrCode className="size-9 shrink-0 text-brand-bright" />
            <p className="text-xs leading-relaxed text-white/50">
              Scan or enter the ID to verify — no account required.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Two satellite chips at different float phases, so the group reads as
          depth rather than as one object moving. */}
      <div
        className={`glass-dark absolute -left-5 top-20 hidden items-center gap-2 rounded-2xl px-4 py-3 text-white sm:flex ${
          reduced ? "" : "animate-float-slow"
        }`}
      >
        <ShieldCheck className="size-4 text-brand-bright" />
        <span className="text-xs font-semibold">NDPA by design</span>
      </div>

      <div
        className={`glass-dark absolute -right-4 bottom-12 hidden items-center gap-2 rounded-2xl px-4 py-3 text-white sm:flex ${
          reduced ? "" : "animate-float-delayed"
        }`}
      >
        <Fingerprint className="size-4 text-brand-bright" />
        <span className="text-xs font-semibold">Wallet-ready</span>
      </div>
    </motion.div>
  );
}

/**
 * Drifting light and a faint grid over the ink.
 *
 * Held still under reduced motion rather than removed: the depth is doing
 * design work, and the movement is the only part anyone asked to switch off.
 */
function HeroBackdrop({ reduced }: { reduced: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <div className="hero-grid absolute inset-0" />

      <div
        className={`absolute -left-40 -top-52 size-[38rem] rounded-full bg-brand/50 blur-[110px] ${
          reduced ? "" : "animate-drift"
        }`}
      />
      <div
        className={`absolute -right-32 top-10 size-[30rem] rounded-full bg-brand-bright/10 blur-[100px] ${
          reduced ? "" : "animate-drift-slow"
        }`}
      />
    </div>
  );
}
