import type { Metadata } from "next";
import { Building2, ClipboardCheck, Users } from "lucide-react";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { ContactForm } from "@/components/landing/contact-form";
import { shareMetadata } from "@/lib/seo";

const CONTACT_DESCRIPTION =
  "Training compliance, governance and data protection teams across an organisation — bulk enrolment, cohorts and reporting.";

export const metadata: Metadata = {
  title: "Talk to us",
  description: CONTACT_DESCRIPTION,
  ...shareMetadata({
    title: "Talk to us about training your team",
    description: CONTACT_DESCRIPTION,
    url: "/contact",
  }),
};

/**
 * The corporate enquiry page.
 *
 * Static apart from the form, so it costs nothing to serve and cannot be taken
 * down by a database hiccup — the one page whose entire job is to let somebody
 * reach a person should not be the page that fails.
 */
export const dynamic = "force-static";

const POINTS = [
  {
    icon: Users,
    title: "Bulk enrolment and cohorts",
    body: "Put a department through together, track them as a group, and add people as they join.",
  },
  {
    icon: ClipboardCheck,
    title: "Reporting you can hand over",
    body: "Completion by team, with certificates an auditor or regulator can verify independently.",
  },
  {
    icon: Building2,
    title: "Invoiced, not carded",
    body: "Pay against a proforma invoice by transfer, which is how procurement actually works.",
  },
];

export default function ContactPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            For organisations
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Train your teams,
            <span className="block text-muted-foreground">prove it to your regulator.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Tell us what you need and who needs it. Someone will reply to you directly — usually
            within one working day.
          </p>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0 rounded-3xl border border-border bg-surface p-6 sm:p-8">
              <ContactForm source="contact" />
            </div>

            <aside className="min-w-0 space-y-6">
              {POINTS.map((point) => (
                <div key={point.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-pale">
                    <point.icon className="size-5 text-brand" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{point.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
                  </div>
                </div>
              ))}

              <p className="rounded-2xl bg-surface-muted px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                Already a learner with a question about your own courses? The assistant in the
                corner of any page answers those faster than we can.
              </p>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
