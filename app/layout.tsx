import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

// PRD §6.3: Space Grotesk for headings, Inter for body.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

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
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
