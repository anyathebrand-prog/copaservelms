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
export const metadata: Metadata = {
  title: {
    default: "CopaServe — Learn. Get Certified. Verify. Mint.",
    template: "%s · CopaServe",
  },
  description:
    "Nigeria's next-generation professional learning platform for Data Protection, Compliance, Governance, Web3, Cybersecurity and Emerging Technologies.",
  // One manifest, at the path Flux's service worker expects and caches.
  manifest: "/manifest.json",
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
