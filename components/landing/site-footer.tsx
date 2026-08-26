import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3">
        <div>
          <Logo height={26} />
          <p className="mt-2 text-sm text-muted-foreground">
            Learn. Get Certified. Verify. Mint.
          </p>
        </div>

        <div className="text-sm">
          <p className="font-semibold">Platform</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><Link href="#courses" className="transition hover:text-foreground">Courses</Link></li>
            <li><Link href="#verify" className="transition hover:text-foreground">Verify a certificate</Link></li>
            <li><Link href="/signup" className="transition hover:text-foreground">Create an account</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="font-semibold">Company</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>Business Intelligence Technologies Limited</li>
            <li>Lagos, Nigeria</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Business Intelligence Technologies Limited. All rights reserved.
      </div>
    </footer>
  );
}
