import Link from "next/link";
import type { Metadata } from "next";
import { Clause, LegalPage } from "@/components/landing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description:
    "How CopaServe collects, uses and protects personal data, under the Nigeria Data Protection Act.",
};

/**
 * Public privacy notice (PRD §12.1).
 *
 * Written from what the system actually does rather than from a template. Every
 * category below corresponds to a real column, every recipient to a service
 * genuinely in the request path, and the cross-border statement to where the
 * database physically is. A notice that describes a different product than the
 * one running is worse than none: it is a documented inaccuracy.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      updated="18 September 2026"
      summary="What CopaServe collects about you, why, where it is kept, and how to get it back or have it removed."
    >
      <Clause heading="Who we are">
        <p>
          CopaServe is operated by Business Intelligence Technologies Limited (BIT Ltd), Lagos,
          Nigeria. We are the data controller for the personal data described here, and we process
          it under the Nigeria Data Protection Act 2023 (NDPA).
        </p>
        <p>
          For anything in this notice, including a request about your data, write to{" "}
          <a href="mailto:privacy@copaserve.com.ng" className="font-medium text-brand hover:underline">
            privacy@copaserve.com.ng
          </a>
          .
        </p>
      </Clause>

      <Clause heading="What we collect">
        <p>
          <strong className="text-foreground">Account details.</strong> Your email address, and
          the name you give us. Optionally a display name, photograph, short biography, profession,
          organisation, country, phone number and an emergency contact — all of which you choose to
          provide and can remove.
        </p>
        <p>
          <strong className="text-foreground">What you do on the platform.</strong> Which courses
          you enrol in, which lessons you complete, quiz attempts and scores, assignment
          submissions, live-class attendance, and derived figures such as your streak, learning
          minutes and points.
        </p>
        <p>
          <strong className="text-foreground">Certificates.</strong> Your name, the course, the
          issuing institution, the instructor, and the dates — recorded so a certificate can be
          verified.
        </p>
        <p>
          <strong className="text-foreground">Payments.</strong> A reference, amount, currency and
          status. Card and bank details are handled entirely by our payment providers and never
          reach CopaServe.
        </p>
        <p>
          <strong className="text-foreground">A wallet address,</strong> only if you choose to link
          one. This is optional and no learning or certification feature requires it.
        </p>
        <p>
          <strong className="text-foreground">Consent records.</strong> What you agreed to, when,
          and from what IP address and browser — kept so we can show what you were told, not to
          profile you.
        </p>
        <p>
          <strong className="text-foreground">What you type to Cruise,</strong> the assistant in
          the corner of the page: your question, and your first name so it can address you. It can
          look up your own enrolments, payments and certificates in order to answer, and can
          re-check a payment or issue a certificate you have already earned. It cannot see anyone
          else&rsquo;s account. Conversations are not stored — closing the tab ends them — though
          anything it changes is recorded in our audit log like any other action.
        </p>
        <p>
          <strong className="text-foreground">Enquiries,</strong> if you write to us about training
          for an organisation: your name, email, and optionally a phone number, organisation and
          team size, along with what you asked. You do not need an account to send one.
        </p>
      </Clause>

      <Clause heading="Why we use it">
        <p>
          If you send an enquiry, we use what you wrote to reply to it and for nothing else. It
          does not add you to a mailing list, and we will not email you about anything other than
          the thing you asked about.
        </p>
        <p>
          To run your account and deliver the courses you enrol in; to mark your work and issue
          certificates; to let employers and regulators verify those certificates; to take payment;
          to send you service messages about your account; and to meet our own legal and audit
          obligations.
        </p>
        <p>
          Marketing email is separate and only ever with your consent, which you can withdraw at
          any time without affecting your account.
        </p>
      </Clause>

      <Clause heading="What certificate verification makes public">
        <p>
          This deserves stating plainly. A certificate carries a credential ID, and anyone holding
          that ID can look it up at{" "}
          <Link href="/verify" className="font-medium text-brand hover:underline">
            our verification page
          </Link>{" "}
          without signing in. The result shows the holder&rsquo;s name, the course, the issuing
          institution, the instructor, the dates, and whether it is still valid.
        </p>
        <p>
          That is the entire point of a verifiable credential, and it is why an employer can trust
          one. But it does mean your name and course become visible to anyone you give the ID to,
          or anyone they pass it on to. No other part of your account, and nothing about your
          progress, scores or payments, is exposed this way.
        </p>
      </Clause>

      <Clause heading="Who else processes it">
        <p>
          We use a small number of providers, each for one job: Supabase (database, authentication
          and file storage), Vercel (hosting), Sendlib (email), Termii (SMS), Kora (payments), and
          Anthropic (the Cruise assistant). They process data on our instructions and for no
          purpose of their own.
        </p>
        <p>
          Cruise is built on Anthropic&rsquo;s Claude. When you send it a message, that message,
          your first name, and whatever it looks up in your account to answer are sent to Anthropic
          in the United States. Under Anthropic&rsquo;s commercial terms it is not used to train their
          models. If you would rather
          nothing of yours went there, do not use Cruise — nothing else on the platform depends on
          it, and every answer it gives is available from the pages themselves.
        </p>
        <p>
          Paystack processed payments taken before September 2026 and still handles refunds and
          queries on those. New payments go through Kora.
        </p>
        <p>
          We do not sell personal data, and we do not share it with advertisers.
        </p>
      </Clause>

      <Clause heading="Where your data is kept">
        <p>
          Our database, file storage and application servers are in London, United Kingdom. Your
          data therefore leaves Nigeria.
        </p>
        <p>
          Some processing happens elsewhere: messages you send to Cruise go to Anthropic in the
          United States, payment details go directly to Kora, and email we send you passes through
          Sendlib. Each of those providers holds only the part it needs to do its job.
        </p>
        <p>
          We chose that location because it is the closest region with the reliability this service
          needs, and because keeping the database and the application in the same place is what
          makes the platform fast enough to use from Nigeria. Transfers are made under the NDPA&rsquo;s
          provisions for cross-border transfer, and our providers are bound by contract to protect
          the data to the same standard.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          Your account data is kept while your account is open. If you ask us to erase it, we
          redact your record rather than dropping the row, because certificates already issued must
          remain verifiable and administrative actions must remain auditable — both are obligations
          we cannot meet by deleting the evidence.
        </p>
        <p>
          Consent and audit records are append-only by design: they exist to show what happened,
          which is not something that can be edited afterwards.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>Under the NDPA you may:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>ask what we hold about you, and get a copy;</li>
          <li>have inaccurate details corrected;</li>
          <li>ask us to erase your data, subject to the retention obligations above;</li>
          <li>withdraw consent to marketing at any time;</li>
          <li>object to processing, or ask us to restrict it;</li>
          <li>complain to the Nigeria Data Protection Commission.</li>
        </ul>
        <p>
          If you have an account, access and export are self-service in your{" "}
          <Link href="/student/privacy" className="font-medium text-brand hover:underline">
            privacy centre
          </Link>
          . Correction and erasure go to a person for review, because both have to be weighed
          against the retention obligations above — you will get an answer either way.
        </p>
      </Clause>

      <Clause heading="Cookies">
        <p>
          We set cookies to keep you signed in. They are necessary for the platform to work and are
          not used for advertising or cross-site tracking. Our hosting provider keeps ordinary
          server logs for security and reliability.
        </p>
      </Clause>

      <Clause heading="Security">
        <p>
          Access to your data is enforced in the database itself, not only in the application, so
          one mistake in a page cannot expose another person&rsquo;s records. Passwords are never
          stored by us. Two-factor authentication is available on every account. Administrative
          actions are written to an audit log.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          If we change how we handle personal data we will update this notice and, where the change
          matters to you, tell you directly rather than relying on you to re-read this page.
        </p>
      </Clause>
    </LegalPage>
  );
}
