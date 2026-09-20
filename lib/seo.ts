import type { Metadata } from "next";

/**
 * Shared pieces of the site's metadata.
 *
 * The one thing worth knowing here: a page that sets `openGraph` replaces the
 * root layout's block outright rather than merging into it — and that includes
 * the generated share picture from app/opengraph-image.tsx. So any page with
 * its own Open Graph block has to name the image again, or its links share
 * with no preview at all. SITE_OG_IMAGE is that image, ready to spread in.
 */
export const SITE_OG_IMAGE = [
  {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "CopaServe — Learn. Get Certified. Verify.",
  },
] satisfies NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;

/**
 * Open Graph and Twitter blocks for one page, with the site picture attached.
 *
 * `url` is relative; metadataBase in the root layout makes it absolute.
 */
export function shareMetadata({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  return {
    alternates: { canonical: url },
    openGraph: { title, description, url, images: SITE_OG_IMAGE },
    twitter: { title, description, images: SITE_OG_IMAGE },
  };
}
