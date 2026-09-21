/**
 * The shapes of a YouTube link people actually paste.
 *
 * The homepage video is configured by pasting a URL into an environment
 * variable, and a shape this does not recognise falls back to the placeholder
 * — which looks exactly like not having set one. Cheap to check, annoying to
 * diagnose live.
 *
 *   npx tsx scripts/verify-video-url.ts
 */
import { embedUrl } from "../components/landing/demo-video";
import { embedSrc, parseVideoLink } from "../lib/video-embed";

const CASES: [string, string | null][] = [
  ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://youtu.be/dQw4w9WgXcQ?si=abc123", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://www.youtube.com/live/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?loop=1&playlist=dQw4w9WgXcQ&rel=0&autoplay=1&mute=1&playsinline=1"],
  ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789?loop=1&autoplay=1&muted=1"],
  ["not a url", null],
  ["https://example.com/video", null],
  ["https://drive.google.com/file/d/abc/view", null],
];

/**
 * Lesson videos: the same links, played the way a lesson should be — waiting
 * for the learner, with sound, once. Unlisted Vimeo is the case that matters:
 * its private hash must reach the player, or the embed refuses to play.
 */
const LESSON_CASES: [string, string | null][] = [
  ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1"],
  ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789?byline=0&portrait=0"],
  ["https://vimeo.com/123456789/abc123def4", "https://player.vimeo.com/video/123456789?h=abc123def4&byline=0&portrait=0"],
  ["https://player.vimeo.com/video/123456789?h=abc123def4&badge=0", "https://player.vimeo.com/video/123456789?h=abc123def4&byline=0&portrait=0"],
  ["https://vimeo.com/channels/staffpicks/123456789", "https://player.vimeo.com/video/123456789?byline=0&portrait=0"],
  ["https://www.youtube.com/watch?v=tooshort", null],
  ["javascript:alert(1)", null],
  ["https://example.com/lecture.mp4", null],
];

let passed = 0;
for (const [input, expected] of CASES) {
  const actual = embedUrl(input);
  const ok = actual === expected;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS  " : "FAIL  "}${input}\n        -> ${actual}`);
}

console.log("\n--- lesson player ---");
for (const [input, expected] of LESSON_CASES) {
  const link = parseVideoLink(input);
  const actual = link ? embedSrc(link, "lesson") : null;
  const ok = actual === expected;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS  " : "FAIL  "}${input}\n        -> ${actual}`);
}

const total = CASES.length + LESSON_CASES.length;
console.log(`\n${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
