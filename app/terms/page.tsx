import Link from "next/link";
import type { Metadata } from "next";
import { Clause, LegalPage } from "@/components/landing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms on which CopaServe is provided.",
};

/**
 * Public terms of service.
 *
 * Required by Google before an OAuth consent screen can be published, and by
 * any institutional buyer before a purchase order. Kept short and specific to
 * how this platform actually works — particularly around certificates, which
 * are the thing anyone would end up arguing about.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="1 September 2026"
      summary="The terms on which CopaServe is provided, and what a certificate from us does and does not mean."
    >
      <Clause heading="Who provides this service">
        <p>
          CopaServe is operated by Business Intelligence Technologies Limited (BIT Ltd), Lagos,
          Nigeria. Using the platform means accepting these terms.
        </p>
      </Clause>

      <Clause heading="Your account">
        <p>
          You need an account to enrol in a course. Keep your sign-in details to yourself; you are
          responsible for what is done through your account. Two-factor authentication is available
          and we recommend it, particularly for administrator accounts.
        </p>
        <p>
          Accounts are for one person. Sharing an account defeats the purpose of a certificate that
          names you.
        </p>
      </Clause>

      <Clause heading="Courses and access">
        <p>
          Where a course is paid for, access begins on payment and continues for the period stated
          on the course. Where an organisation enrols you, your access follows the arrangement it
          has with us.
        </p>
        <p>
          Courses are updated over time. We may improve or reorganise material; we will not remove
          a course you are part-way through without giving you a reasonable opportunity to finish
          it.
        </p>
      </Clause>

      <Clause heading="What a certificate means">
        <p>
          A certificate records that a named person completed a named course on this platform and
          met its assessment requirements. That is all it asserts. It is not a licence, a
          professional registration, or an accreditation by any regulator, and it does not
          substitute for one where the law requires it.
        </p>
        <p>
          Every certificate carries a credential ID that anyone can{" "}
          <Link href="/verify" className="font-medium text-brand hover:underline">
            check
          </Link>
          . We may revoke a certificate — and the verification page will say so immediately — where
          it was issued in error, where the work was not the holder&rsquo;s own, or where it has
          expired. We will tell the holder why.
        </p>
        <p>
          Minting a certificate to a blockchain, where offered, is optional. A certificate is
          equally valid whether or not it has been minted, and nothing about learning or
          certification requires a wallet.
        </p>
      </Clause>

      <Clause heading="Payment and refunds">
        <p>
          Prices are shown in naira and include any applicable tax unless stated otherwise. Payment
          is taken by Paystack or Flutterwave; we never see your card details.
        </p>
        <p>
          If a course is not what was described, or the platform prevented you from taking it, tell
          us and we will refund you. We do not generally refund a course you have substantially
          completed, because at that point you have had what you paid for.
        </p>
        <p>
          Corporate purchases are governed by the invoice and any separate agreement, which take
          precedence over this section.
        </p>
      </Clause>

      <Clause heading="Acceptable use">
        <p>Do not:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>share, resell or republish course material;</li>
          <li>submit work that is not your own for assessment;</li>
          <li>attempt to obtain a certificate you have not earned;</li>
          <li>interfere with the platform, or with other people&rsquo;s use of it;</li>
          <li>attempt to access data that is not yours.</li>
        </ul>
        <p>
          We may suspend an account that does these things. Where a certificate was obtained
          through misconduct, we will revoke it.
        </p>
      </Clause>

      <Clause heading="Course material">
        <p>
          Course material belongs to BIT Ltd or to the instructor who wrote it. Enrolling gives you
          a personal, non-transferable right to use it for your own learning. Work you submit
          remains yours; you give us permission to store and assess it for that purpose.
        </p>
      </Clause>

      <Clause heading="Availability">
        <p>
          We work to keep the platform available but do not promise it will never be interrupted.
          Where we plan maintenance that will affect you, we will say so in advance.
        </p>
      </Clause>

      <Clause heading="Liability">
        <p>
          We are responsible for providing the service described here with reasonable care. We are
          not liable for indirect or consequential loss, or for decisions made by third parties on
          the strength of a certificate. Nothing here excludes liability that cannot lawfully be
          excluded.
        </p>
      </Clause>

      <Clause heading="Ending your account">
        <p>
          You can close your account at any time from your{" "}
          <Link href="/student/privacy" className="font-medium text-brand hover:underline">
            privacy centre
          </Link>
          . Certificates already issued remain verifiable, because their whole value depends on
          that — see the{" "}
          <Link href="/privacy" className="font-medium text-brand hover:underline">
            privacy notice
          </Link>{" "}
          for what is kept and why.
        </p>
      </Clause>

      <Clause heading="Governing law">
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria, and disputes are
          subject to the jurisdiction of the Nigerian courts.
        </p>
      </Clause>
    </LegalPage>
  );
}
