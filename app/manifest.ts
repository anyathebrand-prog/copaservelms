import type { MetadataRoute } from "next";

/**
 * The web app manifest.
 *
 * Replaces the one that shipped in the favicon export, which had an empty name,
 * an empty short name and a white theme colour — so "Add to home screen" would
 * have offered an untitled icon opening onto a white splash screen.
 *
 * Static on purpose. The institution name is a platform setting, but a manifest
 * that reads the database would make every install prompt a database query, and
 * this is the product's own name rather than a tenant's.
 *
 * `--brand-ink` is the theme colour rather than the green: it is what the site
 * header actually is, and the theme colour paints the browser chrome around the
 * page, which should match the top of the page and not the logo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CopaServe — Learn. Get Certified. Verify.",
    short_name: "CopaServe",
    description:
      "Professional certification in data protection, compliance, cybersecurity and governance, with certificates anyone can verify.",
    start_url: "/",
    // Opens at the dashboard for someone who has installed it and signed in;
    // the middleware sends everyone else to sign in from there.
    id: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#04170a",
    background_color: "#04170a",
    categories: ["education", "business", "productivity"],
    lang: "en-NG",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Cropped by the launcher to a circle or squircle, so the mark sits at
      // 80% on a brand ground with a safe zone it can cut into.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My courses", url: "/student/courses" },
      { name: "Verify a certificate", url: "/verify" },
    ],
  };
}
