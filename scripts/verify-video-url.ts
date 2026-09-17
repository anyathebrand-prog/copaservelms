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

let passed = 0;
for (const [input, expected] of CASES) {
  const actual = embedUrl(input);
  const ok = actual === expected;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS  " : "FAIL  "}${input}\n        -> ${actual}`);
}

console.log(`\n${passed}/${CASES.length} passed`);
process.exit(passed === CASES.length ? 0 : 1);
