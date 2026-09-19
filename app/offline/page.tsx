import Link from "next/link";
import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = { title: "You are offline" };

/**
 * Shown by the Flux service worker when a page is requested without a
 * connection and there is no stored copy of it.
 *
 * Static on purpose: this is precached and served with no network at all, so
 * it must not depend on the database, the session, or anything else that
 * needs a server to answer.
 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-pale">
            <WifiOff className="size-6 text-brand" />
          </span>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">You are offline</h1>
          <p className="mt-3 text-muted-foreground">
            This page needs a connection. Check your data or Wi-Fi, then try again — anything you
            were working on is still on your account.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Try again
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
