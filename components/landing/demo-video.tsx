import { Play } from "lucide-react";

/**
 * The closing section of the landing page: a look at the product working.
 *
 * A placeholder until there is something to play, and deliberately a real one
 * — the frame is the size and shape the video will be, so the page does not
 * reflow the day the file arrives and nobody has to redesign this section to
 * ship it. Set DEMO_VIDEO_URL and it becomes a player; leave it unset and it
 * says so plainly rather than pretending.
 *
 * Two shapes are accepted because the two likely answers are different. A
 * YouTube or Vimeo link is what happens if somebody records this on a phone
 * and uploads it that afternoon; an .mp4 in Supabase Storage is what happens
 * if the video is made properly and nobody wants YouTube's recommendations
 * sitting under it. Neither should need a code change.
 */
type Props = { src?: string | null };

/**
 * Turns a YouTube or Vimeo link — in any of the shapes people paste — into an
 * embed URL that loops.
 *
 * YouTube needs the video's own id repeated as `playlist` for `loop=1` to do
 * anything: on its own, loop applies to a playlist, and a single video has
 * none, so it plays once and stops. That pair is the whole trick, and it is
 * the reason this returns a built URL rather than just an id.
 *
 * No autoplay. A page that starts making noise as you scroll past is the
 * behaviour everyone mutes the tab for; the loop is for whoever presses play.
 */
export function embedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  const youtube = (id: string) =>
    `https://www.youtube-nocookie.com/embed/${id}?loop=1&playlist=${id}&rel=0`;

  // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID, /shorts/ID,
  // /live/ID — and any of them carrying ?si=, ?t= or a trailing slash.
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? youtube(id) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
    const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();
    return id ? youtube(id) : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).pop();
    return id ? `https://player.vimeo.com/video/${id}?loop=1` : null;
  }

  return null;
}

function isFile(raw: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(raw);
}

export function DemoVideo({ src }: Props) {
  const trimmed = src?.trim() || null;
  const embed = trimmed ? embedUrl(trimmed) : null;
  const file = trimmed && !embed && isFile(trimmed) ? trimmed : null;

  // A link that was set but could not be read would otherwise fall back to the
  // placeholder in silence, which looks identical to not having set one —
  // the most confusing possible outcome for whoever just pasted it.
  if (trimmed && !embed && !file) {
    console.warn(
      `[demo-video] DEMO_VIDEO_URL is set but not recognised: ${trimmed}. ` +
        "Expected a YouTube or Vimeo link, or a direct .mp4/.webm/.mov URL.",
    );
  }

  return (
    <section id="demo" className="hero-ink grain relative overflow-hidden text-white">
      <div aria-hidden className="hero-grid absolute inset-0" />
      <div
        aria-hidden
        className="absolute -left-24 bottom-0 size-96 rounded-full bg-brand-bright/12 blur-[100px]"
      />

      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand-bright">
          See it working
        </p>
        <h2 className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
          A look inside
          <span className="block text-white/40">before you sign up.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/60">
          How a course runs, how the assessment works, and what an employer sees when they check a
          certificate.
        </p>

        {/* The frame is the same shape whether or not there is a video in it,
            so the page does not move when one arrives. */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-white/15 bg-black/30 shadow-2xl">
          <div className="relative aspect-video w-full">
            {embed ? (
              <iframe
                src={embed}
                title="A look inside CopaServe"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 size-full"
              />
            ) : file ? (
              <video
                src={file}
                controls
                loop
                preload="metadata"
                playsInline
                className="absolute inset-0 size-full bg-black object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
                <span
                  aria-hidden
                  className="flex size-16 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur"
                >
                  <Play className="size-6 translate-x-0.5 fill-white/80 text-white/80" />
                </span>
                <p className="text-sm font-medium text-white/70">Walkthrough coming shortly</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
