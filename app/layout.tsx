import type { Metadata } from "next";
import "./globals.css";
import { BootScreen } from "@/components/brand/boot-screen";
import { FragmentSession } from "@/components/auth/fragment-session";
import { FLUX_SW_INITIALIZER_CODE } from "@tsworldtech/flux-next";
import { FluxClientWrapper } from "@/components/flux/flux-client-wrapper";

/**
 * Lufga is declared with plain @font-face in globals.css and served from
 * /public, rather than through next/font/local.
 *
 * next/font/local emits a generated CSS *module* next to the layout. Building
 * that alongside Tailwind on Vercel put Tailwind's preflight inside the
 * generated module, and bare element selectors are illegal in a CSS Module:
 *
 *   Selector "textarea" is not pure. Pure selectors must contain at least one
 *   local class or id.
 *
 * It only reproduced when a build cache was restored, so it passed locally and
 * on a --force build and failed on every ordinary deployment. Declaring the
 * faces by hand removes the generated module, and with it the failure.
 *
 * What next/font would have done for us is replaced explicitly: the files are
 * preloaded below, and font-display: swap is set on each face.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.copaserve.com.ng").replace(/\/$/, "");

/**
 * The title and description below are deliberately free of wallet and minting
 * language, and that is not cosmetic.
 *
 * These two strings are the first thing every automated reader sees — search
 * engines, link scrapers, and the reputation classifiers that payment
 * processors and social platforms run. A young .com.ng domain with a sign-in
 * form and crypto vocabulary in its title reads, to a classifier that counts
 * words rather than understanding them, like a phishing site: X refused to
 * accept a link to this domain on that basis.
 *
 * On-chain certificates are still offered and still described on the homepage.
 * They are a feature of the product, not the pitch, and the metadata now says
 * so. "Emerging Technologies" covers them without spending the token.
 */
const DESCRIPTION =
  "Nigeria's next-generation professional learning platform for Data Protection, Compliance, Governance, Cybersecurity and Emerging Technologies — every course ending in a certificate anyone can verify.";

/**
 * Shared by every page, and overridden per page where it should be.
 *
 * metadataBase is what turns a relative path into the absolute URL that
 * WhatsApp, X and LinkedIn require: without it, share previews resolve
 * against nothing and silently show no image at all.
 *
 * Each page sets its own canonical. Pages reachable at more than one address —
 * with a tracking parameter on the end, say — otherwise look like several
 * pages with the same content.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CopaServe — Learn. Get Certified. Verify.",
    template: "%s · CopaServe",
  },
  description: DESCRIPTION,
  applicationName: "CopaServe",
  // One manifest, at the path Flux's service worker expects and caches.
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "CopaServe",
    locale: "en_NG",
    url: SITE_URL,
    title: "CopaServe — Learn. Get Certified. Verify.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "CopaServe — Learn. Get Certified. Verify.",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Without this, Google shows a thumbnail at best; certificates and
      // course pages are worth a proper image in the result.
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/** Every weight is on screen at first paint, and all four together are ~68KB. */
const WEIGHTS = [400, 500, 600, 700] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Before anything else runs: marks when the service worker is ready,
            so Flux knows whether it can serve offline yet. It only listens —
            it registers and caches nothing itself. */}
        <script id="flux-sw-init" dangerouslySetInnerHTML={{ __html: FLUX_SW_INITIALIZER_CODE }} />
        {WEIGHTS.map((weight) => (
          <link
            key={weight}
            rel="preload"
            href={`/fonts/lufga-${weight}.woff2`}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* First in the body so it is painted with the first frame rather than
            after the page it is covering. */}
        <BootScreen />
        <FragmentSession />
        <FluxClientWrapper>{children}</FluxClientWrapper>
      </body>
    </html>
  );
}
