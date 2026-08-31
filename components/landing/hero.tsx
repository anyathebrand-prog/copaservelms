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
import { ArrowRight, BadgeCheck, QrCode, ShieldCheck } from "lucide-react";

/**
 * Landing hero (PRD §7.1).
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
 * Everything is gated on prefers-reduced-motion: the reduced path renders the
 * finished state, so nothing is hidden from anyone who turns motion off.
 */

/** The headline, split where it should breathe. */
const HEADLINE = ["Learn.", "Get Certified.", "Verify."] as const;

export function Hero({
  courseCount,
  domainCount,
}: {
  courseCount: number;
  domainCount: number;
}) {
  const reduced = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackdrop reduced={Boolean(reduced)} />

      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface/80 px-4 py-1.5 text-sm font-medium text-brand backdrop-blur"
          >
            <span className="relative flex size-2">
              {!reduced && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-bright opacity-75" />
              )}
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            Powered by Business Intelligence Technologies Limited
          </motion.p>

          <h1 className="mt-6 font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.25rem]">
            {HEADLINE.map((word, index) => (
              <motion.span
                key={word}
                initial={reduced ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, delay: 0.15 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="block"
              >
                {word}
              </motion.span>
            ))}

            <motion.span
              initial={reduced ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.55, delay: 0.51, ease: [0.16, 1, 0.3, 1] }}
              className="relative inline-block text-brand"
            >
              Mint.
              {/* The underline draws after the word settles, so the eye is
                  led to it rather than shown it. */}
              <motion.span
                aria-hidden
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, delay: 1, ease: [0.16, 1, 0.3, 1] }}
                style={{ originX: 0 }}
                className="absolute -bottom-1 left-0 h-1.5 w-full rounded-full bg-brand-bright"
              />
            </motion.span>
          </h1>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground"
          >
            Nigeria&apos;s next-generation professional learning platform for Data Protection,
            Compliance, Governance, Web3, Cybersecurity and Emerging Technologies.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.82 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgb(10_81_14/0.6)] transition hover:brightness-110"
            >
              Start Learning
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#courses"
              className="rounded-xl border border-border bg-surface/80 px-6 py-3.5 text-sm font-semibold backdrop-blur transition hover:bg-surface-muted"
            >
              Explore Courses
            </Link>
          </motion.div>

          <motion.dl
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-border pt-8"
          >
            <Stat value={courseCount} label="Courses published" reduced={Boolean(reduced)} />
            <Stat value={domainCount} label="Training domains" reduced={Boolean(reduced)} />
            <Stat value="Instant" label="Verification" reduced={Boolean(reduced)} />
          </motion.dl>
        </div>

        <CertificatePreview reduced={Boolean(reduced)} />
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

  const display = animated ? count : value;

  return (
    <div>
      <dd className="font-display text-3xl font-bold text-brand sm:text-4xl">{display}</dd>
      <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}

/**
 * The floating credential card (PRD §7.1 "floating 3D cards", "animated
 * dashboard preview").
 *
 * A certificate rather than an abstract shape, because the certificate is the
 * product. It is labelled as a sample: a marketing page showing what looks
 * like a real person's credential would be a fabricated record, and the
 * credential ID here is deliberately not a valid one.
 */
function CertificatePreview({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // Pointer parallax. Springs rather than raw values, so the card settles
  // instead of snapping to the cursor.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 120, damping: 18, mass: 0.6 });
  const springY = useSpring(pointerY, { stiffness: 120, damping: 18, mass: 0.6 });
  const rotateY = useTransform(springX, [-0.5, 0.5], [-14, 6]);
  const rotateX = useTransform(springY, [-0.5, 0.5], [8, -8]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    // Coarse pointers have no hover, so tilting on touch would just mean the
    // card lurches under the finger that is trying to scroll past it.
    if (reduced || event.pointerType !== "mouse") return;

    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;

    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function handlePointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      initial={reduced ? false : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-md [perspective:1400px]"
    >
      {/* The float lives on this wrapper and the tilt on the child. A CSS
          animation on transform outranks an inline style, so the two would
          overwrite each other on one element and the parallax would die. */}
      <div className={reduced ? "" : "animate-float"}>
      <motion.div
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="glass-panel relative rounded-3xl p-7"
      >
        <div className="flex items-start justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <BadgeCheck className="size-3.5" />
            Verified
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sample
          </span>
        </div>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Certificate of Completion
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold leading-snug">
          Nigeria Data Protection Act — Practitioner
        </h2>

        <dl className="mt-7 space-y-3 border-t border-border pt-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Credential ID</dt>
            <dd className="font-mono text-xs">CS-SAMPLE-0000</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-success">Active</dd>
          </div>
        </dl>

        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-pale/60 p-3">
          <QrCode className="size-9 shrink-0 text-brand" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Scan or enter the ID to verify — no account required.
          </p>
        </div>
      </motion.div>
      </div>

      {/* Two satellite chips at different float phases, so the group reads as
          depth rather than as one object moving. */}
      <div
        className={`glass-panel absolute -left-4 top-16 hidden items-center gap-2 rounded-2xl px-4 py-3 sm:flex ${
          reduced ? "" : "animate-float-slow"
        }`}
      >
        <ShieldCheck className="size-4 text-brand" />
        <span className="text-xs font-semibold">NDPA by design</span>
      </div>

      <div
        className={`glass-panel absolute -right-2 bottom-10 hidden items-center gap-2 rounded-2xl px-4 py-3 sm:flex ${
          reduced ? "" : "animate-float-delayed"
        }`}
      >
        <span className="size-2 rounded-full bg-brand-bright" />
        <span className="text-xs font-semibold">Wallet-ready</span>
      </div>
    </motion.div>
  );
}

/**
 * Hero backdrop: drifting brand-green light and a faint grid.
 *
 * CSS animations on transform/opacity only, so this stays on the compositor
 * and never triggers layout. Hidden entirely under reduced motion, where a
 * flat wash reads better than a frozen blob.
 */
function HeroBackdrop({ reduced }: { reduced: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-background">
      <div className="hero-grid absolute inset-0" />

      <div
        className={`absolute -left-32 -top-40 size-[34rem] rounded-full bg-brand-pale opacity-70 blur-3xl ${
          reduced ? "" : "animate-drift"
        }`}
      />
      <div
        className={`absolute -right-24 top-24 size-[28rem] rounded-full bg-brand-bright/10 blur-3xl ${
          reduced ? "" : "animate-drift-slow"
        }`}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
