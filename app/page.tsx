import Link from "next/link";
import { ArrowRight, ArrowUpRight, ScanLine, ShieldCheck, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Hero } from "@/components/landing/hero";
import { VerifyWidget } from "@/components/landing/verify-widget";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * Public landing experience (PRD §7).
 *
 * Section order follows §7.2 exactly. Featured courses come from the database,
 * so the page is empty-state-correct before any course is published rather
 * than shipping placeholder cards that would later need removing.
 *
 * Only the hero is a client component. Everything below it stays server-
 * rendered and scroll-revealed with IntersectionObserver, which keeps this
 * page cacheable at the edge — the reason it loads in ~75ms rather than the
 * ~550ms it took when the header asked the server who the visitor was.
 */
export const revalidate = 300;

export default async function HomePage() {
  const [featured, certificationCount, categories] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      take: 6,
      select: {
        id: true,
        title: true,
        slug: true,
        subtitle: true,
        level: true,
        priceMinor: true,
        currency: true,
        estimatedMinutes: true,
        category: { select: { name: true } },
        instructor: { select: { profile: { select: { displayName: true, firstName: true, lastName: true } } } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true } }),
  ]);

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* 1. Hero */}
        <Hero courseCount={certificationCount} domainCount={categories.length} />

        {/* 2. Featured Courses */}
        <Section
          id="courses"
          eyebrow="Featured"
          title="Courses built by practitioners"
          description="Certification tracks designed by compliance and governance professionals, not generalists."
        >
          {featured.length === 0 ? (
            <Card className="text-center">
              <p className="font-medium">Courses are being prepared.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The first certification tracks go live shortly.{" "}
                <Link href="/signup" className="font-medium text-brand hover:underline">
                  Create an account
                </Link>{" "}
                to be notified.
              </p>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((course, index) => (
                <Reveal key={course.id} delay={index * 60}>
                  <Link href={`/courses/${course.slug}`} className="group block h-full">
                    <Card className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        {course.category && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                            {course.category.name}
                          </p>
                        )}
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </div>

                      <h3 className="mt-2 font-display text-lg font-semibold leading-snug">
                        {course.title}
                      </h3>
                      {course.subtitle && (
                        <p className="mt-2 flex-1 text-sm text-muted-foreground">{course.subtitle}</p>
                      )}

                      <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm">
                        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                          {course.level.toLowerCase()}
                          {course.estimatedMinutes
                            ? ` · ${Math.round(course.estimatedMinutes / 60)}h`
                            : ""}
                        </span>
                        <span className="font-display font-semibold">
                          {formatPrice(course.priceMinor, course.currency)}
                        </span>
                      </div>
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </Section>

        {/* 3. Professional Certifications */}
        <Section
          muted
          eyebrow="Certifications"
          title="Credentials that hold up to scrutiny"
          description="Every track ends in a certificate an employer or regulator can verify in seconds."
        >
          {categories.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-muted-foreground">
                Certification domains appear here as tracks are published.
              </p>
            </Card>
          ) : (
            /* An indexed list rather than another grid of identical cards: four
               boxes after the six above reads as one long grid, and the domains
               are a set to scan, not tiles to compare. */
            <ul className="divide-y divide-border border-y border-border">
              {categories.map((category, index) => (
                <Reveal key={category.id} delay={index * 40}>
                  <li className="group flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:gap-8">
                    <span className="font-mono text-sm text-brand/60">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-xl font-semibold sm:w-64 sm:shrink-0">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </li>
                </Reveal>
              ))}
            </ul>
          )}
        </Section>

        {/* 4. Why Learn with BIT */}
        <Section
          eyebrow="Why BIT Ltd"
          title="Built by a compliance firm, for compliance professionals"
        >
          <div className="grid gap-10 sm:grid-cols-3">
            {WHY_BIT.map((item, index) => (
              <Reveal key={item.title} delay={index * 60}>
                <div className="border-t-2 border-brand pt-5">
                  <span className="font-display text-4xl font-bold text-brand-pale">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* 5. Certificate Verification — the differentiator, so it gets the
            page's one dark band and the visual weight that comes with it. */}
        <section id="verify" className="relative overflow-hidden bg-brand text-white">
          <div
            aria-hidden
            className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-bright/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-bright">
                <ScanLine className="size-4" />
                Verification
              </p>
              <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Check any certificate in seconds
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-white/70">
                Every certificate carries a QR code linking here. No account, no login — enter an ID
                and see the result, including whether it has been revoked.
              </p>
            </Reveal>

            <Reveal delay={120} className="mt-10">
              <VerifyWidget />
            </Reveal>
          </div>
        </section>

        {/* 6. Wallet-ready Certificates */}
        <Section
          eyebrow="Web3-ready"
          title="Your certificate, optionally on-chain"
          description="Learning and certification never require a wallet. Minting is an addition for those who want it, not a dependency."
        >
          <div className="grid gap-6 sm:grid-cols-3">
            {WALLET_POINTS.map((item, index) => (
              <Reveal key={item.title} delay={index * 60}>
                <Card className="h-full">
                  <item.icon className="size-6 text-brand" />
                  <h3 className="mt-4 font-display font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* 7. Testimonials */}
        <Section muted eyebrow="Testimonials" title="What learners say">
          <Card className="text-center">
            <p className="text-sm text-muted-foreground">
              Learner stories will appear here once the first cohorts complete their certification.
            </p>
          </Card>
        </Section>

        {/* 8. Corporate Training */}
        <Section
          eyebrow="For organisations"
          title="Train your team, prove it to your regulator"
          description="Bulk enrolment, cohort management, and compliance reporting for banks, telcos, and government agencies."
        >
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-border bg-brand-pale/50 p-8 sm:flex-row sm:items-center sm:p-10">
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Corporate accounts get departments and cohorts, consolidated reporting on staff
                completion, verifiable proof of training, and dedicated onboarding.
              </p>
              <a
                href="mailto:training@bitltd.example"
                className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Talk to us
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </Reveal>
        </Section>

        {/* 9. Trusted Institutions */}
        <Section muted eyebrow="Trusted by" title="Institutions we work with">
          <Card className="text-center">
            <p className="text-sm text-muted-foreground">
              Partner institution logos appear here once launch partners are confirmed.
            </p>
          </Card>
        </Section>

        {/* 10. FAQ */}
        <Section eyebrow="FAQ" title="Common questions">
          <div className="mx-auto max-w-3xl space-y-3">
            {FAQ.map((item, index) => (
              <Reveal key={item.q} delay={index * 40}>
                <details className="group rounded-2xl border border-border bg-surface p-5 transition hover:border-brand/30">
                  <summary className="cursor-pointer list-none font-medium marker:content-none">
                    <span className="flex items-center justify-between gap-4">
                      {item.q}
                      <span className="shrink-0 text-xl leading-none text-brand transition group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </Section>
      </main>

      {/* 11. Footer */}
      <SiteFooter />
    </>
  );
}

function formatPrice(minor: number, currency: string): string {
  if (minor === 0) return "Free";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    minor / 100,
  );
}

const WHY_BIT = [
  {
    title: "Compliance-grade credibility",
    body: "Courses authored by practitioners who do this work daily, with NDPA-by-design privacy built into the platform itself.",
  },
  {
    title: "Verifiable by anyone",
    body: "Certificates are QR-verifiable instantly by employers and regulators — no phone calls, no PDF forgery risk.",
  },
  {
    title: "Enterprise-ready",
    body: "Cohorts, bulk enrolment, and reporting designed for institutional buyers, not retrofitted onto a consumer product.",
  },
];

const WALLET_POINTS = [
  {
    icon: ShieldCheck,
    title: "No wallet required",
    body: "Enrol, learn, and earn a fully valid certificate without ever touching crypto.",
  },
  {
    icon: Wallet,
    title: "Mint when you're ready",
    body: "Link a wallet later and mint your credential on Avalanche. Your certificate is equally valid either way.",
  },
  {
    icon: ScanLine,
    title: "Privacy preserved",
    body: "Only non-sensitive fields go on-chain. Personal data stays off the blockchain entirely.",
  },
];

const FAQ = [
  {
    q: "Do I need a crypto wallet to use CopaServe?",
    a: "No. Wallet linking is entirely optional and happens after signup. Every learning and certification feature works without one.",
  },
  {
    q: "How does certificate verification work?",
    a: "Each certificate carries a QR code and a credential ID. Anyone can enter that ID on the verification page — no account needed — and see the certificate's current status instantly, including whether it has been revoked.",
  },
  {
    q: "What happens if a certificate is revoked?",
    a: "The verification page reflects it immediately. Revocation is an administrative action taken for academic misconduct, expiry, or correction.",
  },
  {
    q: "Is my personal data protected?",
    a: "Yes. The platform is built to the Nigeria Data Protection Act by design: consent is logged, data is minimised, and you can access, correct, export, or erase your data from your privacy settings.",
  },
];
