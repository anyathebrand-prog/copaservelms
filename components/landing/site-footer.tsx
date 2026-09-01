import Link from "next/link";
import { Logo } from "@/components/layout/logo";

/**
 * Public footer.
 *
 * Dark, to close the page on the same ink the hero opens with. A page that
 * starts dark and fades out into light grey reads as unfinished; bookending it
 * makes the light middle look deliberate.
 */
export function SiteFooter() {
  return (
    <footer className="hero-ink grain relative overflow-hidden text-white">
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:grid-cols-3">
        <div>
          <Logo height={26} variant="white" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
            Learn. Get Certified. Verify.{" "}
            <span className="font-semibold text-brand-bright">Mint.</span>
          </p>
        </div>

        <div className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Platform</p>
          <ul className="mt-4 space-y-2.5 text-white/70">
            <li>
              <Link href="#courses" className="transition hover:text-brand-bright">
                Courses
              </Link>
            </li>
            <li>
              <Link href="#verify" className="transition hover:text-brand-bright">
                Verify a certificate
              </Link>
            </li>
            <li>
              <Link href="/signup" className="transition hover:text-brand-bright">
                Create an account
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Company</p>
          <ul className="mt-4 space-y-2.5 text-white/70">
            <li>Business Intelligence Technologies Limited</li>
            <li>Lagos, Nigeria</li>
            <li>
              <Link href="/privacy" className="transition hover:text-brand-bright">
                Privacy notice
              </Link>
            </li>
            <li>
              <Link href="/terms" className="transition hover:text-brand-bright">
                Terms of service
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative border-t border-white/10 px-6 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Business Intelligence Technologies Limited. All rights reserved.
      </div>
    </footer>
  );
}
