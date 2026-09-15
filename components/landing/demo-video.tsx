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

/** Turns a YouTube or Vimeo link — in any of the shapes people paste — into an embed URL. */
function embedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID, /shorts/ID
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).pop();
    return id ? `https://player.vimeo.com/video/${id}` : null;
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
