# Homepage walkthrough video

Drop the file here and point `DEMO_VIDEO_URL` at it:

    DEMO_VIDEO_URL="/media/walkthrough.mp4"

Anything under `public/` is served from the site root, so `public/media/x.mp4`
is `/media/x.mp4`. `.mp4`, `.webm` and `.mov` are recognised; `.mp4` (H.264 +
AAC) is the one every browser plays.

The player then autoplays muted, loops, and shows controls — the same as the
YouTube path, without YouTube's branding, related videos or cookies.

## Size matters more than you would think

This file is downloaded by every visitor who scrolls to it, on Nigerian mobile
data. Keep it **under about 10 MB**:

    ffmpeg -i source.mov -vcodec h264 -crf 28 -preset slow \
           -vf "scale=1280:-2" -an walkthrough.mp4

`-an` drops the audio, which is reasonable for a muted autoplay loop and saves
a good deal of size. Raise `-crf` for a smaller file, lower it for better
quality.

## When not to put it here

Files in this folder are committed to git and redeployed with every change, so
a large one slows every clone and every build, and git keeps it forever even
after deletion. Above ~25 MB, upload it to Supabase Storage instead and set
`DEMO_VIDEO_URL` to the public URL — the player treats both the same.
