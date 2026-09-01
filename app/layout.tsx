import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Lufga, self-hosted.
 *
 * One family for the whole site: headings and body differ by weight and size
 * rather than by typeface. This replaces the Inter/Space Grotesk pairing in
 * PRD §6.3 — a deliberate divergence from the spec, not an oversight.
 *
 * Only the four weights the codebase uses are shipped (500 and 600 carry most
 * of the interface, 700 the headings, 400 the body), subset to Latin plus the
 * punctuation, currency and arrows actually rendered. Four weights come to
 * ~68KB total, against ~400KB for the unsubset TTFs, and they are served from
 * our own origin rather than fetched from Google.
 *
 * No italics: the codebase does not use any.
 */
const lufga = localFont({
  src: [
    { path: "./fonts/lufga-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/lufga-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/lufga-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/lufga-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-lufga",
  display: "swap",
  // Lufga has no naira sign, so ₦ is drawn from whichever of these does. The
  // browser resolves that per glyph, so prices stay readable.
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "CopaServe — Learn. Get Certified. Verify. Mint.",
    template: "%s · CopaServe",
  },
  description:
    "Nigeria's next-generation professional learning platform for Data Protection, Compliance, Governance, Web3, Cybersecurity and Emerging Technologies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lufga.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
