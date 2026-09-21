"use client";

import { useEffect, useState } from "react";

/**
 * An instructor at a lesson screen, animated — on the Teach with us page.
 *
 * Supplied as a 1.8MB GIF; served as a 322KB MP4. Animated WebP was tried and
 * lost to the GIF at every setting (flat-colour artwork suits GIF's palette),
 * while video, which only stores what changes between frames, comes in at a
 * fifth of the size. A muted, looping, inline video is how a GIF is meant to
 * be put on a page now.
 *
 * The page renders the still first, and swaps in the video only after the
 * browser has said motion is welcome. So a visitor whose device asks for
 * reduced motion never downloads the animation at all — a CSS rule could hide
 * the video, but it would still be fetched — and nobody sees an empty box
 * while the video loads, because the still is its poster too.
 *
 * Both files had their near-white background forced to pure white, which is
 * what the page is; left as the original's #FEFDFE, it showed as a faint box.
 *
 * Decorative: the heading beside it already says what it shows, so it is
 * hidden from screen readers rather than described twice.
 */
const STILL = "/brand/illustrations/teach-still.webp";
const VIDEO = "/brand/illustrations/teach.mp4";

export function TeachIllustration() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAnimate(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const frame = "mx-auto block h-auto w-full max-w-[320px] sm:max-w-[380px] lg:max-w-none";

  return animate ? (
    <video
      src={VIDEO}
      poster={STILL}
      width={640}
      height={480}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      preload="auto"
      aria-hidden
      tabIndex={-1}
      className={frame}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- a 16KB still that must match the video's poster exactly
    <img src={STILL} alt="" aria-hidden width={640} height={480} fetchPriority="high" className={frame} />
  );
}
