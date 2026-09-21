/**
 * YouTube and Vimeo links, in the shapes people actually paste.
 *
 * Split in two on purpose. Recognising a link — which provider, which video —
 * is the same everywhere; how it should play is not. The homepage wants an
 * ambient loop that starts muted on its own. A lesson wants the opposite: it
 * waits for the learner, plays with sound, and stops at the end, because a
 * lecture that restarts itself behind a quiz is a bug, not a feature.
 *
 * Unlisted videos are the expected case for courses — public enough to embed,
 * not listed for anyone to find — so their private hashes are carried through.
 * A Vimeo unlisted link is vimeo.com/<id>/<hash>, and the hash has to reach
 * the player as ?h=, or the embed refuses to play it.
 */

export type VideoLink =
  | { provider: "youtube"; id: string }
  | { provider: "vimeo"; id: string; hash: string | null };

/** YouTube ids are 11 characters from a fixed alphabet. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[0-9a-f]+$/i;

export function parseVideoLink(raw: string | null | undefined): VideoLink | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  // youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID, /live/ID —
  // any of them carrying ?si=, ?t= or a trailing slash.
  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = host === "youtu.be" ? parts[0] : (url.searchParams.get("v") ?? parts[parts.length - 1]);
    return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
  }

  // vimeo.com/ID, vimeo.com/ID/HASH (unlisted), vimeo.com/channels/x/ID,
  // player.vimeo.com/video/ID?h=HASH.
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const at = parts.findIndex((part) => VIMEO_ID.test(part));
    if (at === -1) return null;
    const next = parts[at + 1];
    const hash = url.searchParams.get("h") ?? (next && VIMEO_HASH.test(next) ? next : null);
    return { provider: "vimeo", id: parts[at], hash };
  }

  return null;
}

/**
 * The URL to put in an iframe.
 *
 * "ambient": the homepage — loops, starts by itself, muted, because every
 * browser blocks autoplay with sound and an unmuted autoplay is a page where
 * nothing plays at all.
 *
 * "lesson": waits to be played, with sound, and plays once.
 */
export function embedSrc(link: VideoLink, mode: "ambient" | "lesson"): string {
  if (link.provider === "youtube") {
    const params =
      mode === "ambient"
        ? `loop=1&playlist=${link.id}&rel=0&autoplay=1&mute=1&playsinline=1`
        : // rel=0 keeps the suggestions at the end to this channel's own
          // videos, rather than whatever YouTube thinks comes next.
          `rel=0&playsinline=1`;
    return `https://www.youtube-nocookie.com/embed/${link.id}?${params}`;
  }

  const params = new URLSearchParams();
  if (link.hash) params.set("h", link.hash);
  if (mode === "ambient") {
    params.set("loop", "1");
    params.set("autoplay", "1");
    params.set("muted", "1");
  } else {
    // Keep the player's chrome to the video itself: no owner byline or
    // portrait competing with the lesson title above it.
    params.set("byline", "0");
    params.set("portrait", "0");
  }
  return `https://player.vimeo.com/video/${link.id}?${params.toString()}`;
}

/** A direct link to a media file a <video> or <audio> element can play. */
export function isDirectMediaFile(raw: string): boolean {
  return /\.(mp4|m4v|webm|mov|ogv|mp3|m4a|aac|wav|ogg|oga)(\?|#|$)/i.test(raw);
}
