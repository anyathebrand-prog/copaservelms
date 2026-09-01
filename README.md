# CopaServe

Enterprise-grade Learning Management System for **Business Intelligence Technologies Limited (BIT Ltd)** — Nigeria's platform for Data Protection, IT Governance, Compliance, Risk Management, Corporate Governance, Professional Certification, and Web3/Emerging Technologies training.

> Learn. Get Certified. Verify. Mint.

Full product spec: [`CopaServe-LMS-PRD.md`](./CopaServe-LMS-PRD.md)

---

## Status

🚧 **Pre-launch / active development** — building in phases (see [Roadmap](#roadmap)).

## Overview

CopaServe combines course delivery, professional certification, and verifiable credentialing in one platform. It's designed to feel like **Coursera meets Notion meets Stripe Dashboard**, with enterprise-grade UI and Apple-level motion polish.

Key differentiators:
- **Instant QR certificate verification** — every certificate is publicly verifiable in seconds
- **Web3-ready credentials** — optional on-chain minting (Avalanche EVM) with no wallet required to learn or get certified
- **NDPA-by-design** — privacy and compliance built into the data model, not bolted on
- **Enterprise buyer support** — corporate cohorts, bulk enrollment, and compliance reporting for institutional clients

## Tech Stack

**Frontend**
- Next.js 16 (App Router) · TypeScript · Tailwind CSS
- Shadcn UI · Framer Motion · React Hook Form · TanStack Query · Lucide Icons

**Backend**
- Supabase (PostgreSQL, Auth, Storage, Realtime)
- Prisma ORM
- Node/NestJS-compatible API structure
- Row Level Security (RLS) enforced on all role-scoped tables

**Storage**
- Supabase Storage (PDFs, assignments, videos, certificates), architected for Cloudflare R2 compatibility

**Planned Integrations**
- Payments: Paystack, Flutterwave
- Live classes: Zoom, Google Meet
- Comms: Resend (email), Termii (SMS)
- Web3: WalletConnect, MetaMask, Coinbase Wallet, Rainbow, Avalanche Core Wallet — targeting Avalanche EVM first

## Roles

| Role | Access |
|---|---|
| Student | Enrollments, submissions, certificates, wallet |
| Instructor | Own courses, enrolled students, analytics |
| Admin | Platform-wide user/course/payment/compliance management |
| Super Admin | Institution branding, multi-campus, corporate orgs, platform settings |

## Getting Started

```bash
# Clone
git clone <repo-url>
cd copaserve

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in Supabase URL/keys, and other service credentials as integrations come online

# Set up the database
npx prisma migrate dev

# Run the dev server
npm run dev
```

App runs at `http://localhost:3000`.

### Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `DATABASE_URL` | Prisma connection string (Supabase pooled, port 6543) |
| `DIRECT_URL` | Direct Postgres connection (port 5432) — required by Prisma Migrate |
| `RESEND_API_KEY` | Email delivery (planned) |
| `TERMII_API_KEY` | SMS delivery (planned) |
| `PAYSTACK_SECRET_KEY` | Payments (planned) |
| `FLUTTERWAVE_SECRET_KEY` | Payments (planned) |

*(Exact list to be finalized as each integration is implemented — see PRD Section 6.1.)*

## Project Structure

```
copaserve/
├── app/                  # Next.js App Router routes
│   ├── (public)/         # Landing site, certificate verification
│   ├── (student)/        # Student portal
│   ├── (instructor)/     # Instructor dashboard
│   ├── (admin)/          # Admin & Super Admin dashboards
│   └── api/               # API routes
├── components/           # Shared UI components (Shadcn-based)
├── lib/                  # Supabase client, utilities, storage abstraction
├── prisma/               # Schema & migrations
└── CopaServe-LMS-PRD.md  # Full product requirements document
```

## Database & Security

Schema is managed via Prisma and includes: `Users`, `Profiles`, `Roles`, `Courses`, `Modules`, `Lessons`, `Enrollments`, `Quizzes`, `Questions`, `QuizAttempts`, `Assignments`, `Submissions`, `Certificates`, `CertificateTemplates`, `Wallets`, `MintTransactions`, `Payments`, `Notifications`, `ConsentLogs`, `AuditLogs`, `LiveClasses`, `Resources`, `Badges`, `Achievements`, `DiscussionPosts`, `Comments`.

All role-scoped and user-owned tables **must** have Row Level Security policies defined before UI ships against them. `AuditLogs` and `ConsentLogs` are append-only.

## Pending configuration

Everything below works in code and is verified against the live database. These
items are waiting on external setup, not on development.

### Email and SMS delivery — waiting on a domain

Notifications are written in-app and delivery is attempted, but **no email
currently leaves the system**: Resend will not verify `copaserve.ng` because the
domain is not yet registered, and it cannot verify `*.vercel.app` because we do
not control its DNS. Failures are recorded rather than hidden — nothing claims
to have sent.

To finish this later:

1. Register `copaserve.ng` and delegate it to nameservers you control.
2. Add the domain in Resend and publish the DKIM/SPF records it gives you.
   Wait for the dashboard to say **Verified**, not Pending.
3. Set `NOTIFICATION_FROM_EMAIL` to an address on that domain.
4. Point `verify.copaserve.ng` (or the apex) at the deployment, and set
   `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_VERIFICATION_BASE_URL` accordingly.

Termii is authenticated and working, but the account balance is low and no SMS
has been sent from this project yet.

### The one deadline: issue no real certificates before the domain is settled

Certificate QR codes bake in their verification URL **at issuance**. While there
are zero certificates, changing the domain is a config edit. After the first
real certificate is issued it becomes a data migration plus a permanent redirect
obligation, because codes already printed or emailed cannot be recalled.

Current base: `https://copaservelms.vercel.app/verify`.

### Also outstanding

- **Google sign-in needs the domain.** The redirect goes to Supabase, not to
  us, so it works immediately for named test users. Publishing the consent
  screen so the public can sign in requires a homepage and privacy policy on a
  domain verified in Google Search Console, and `vercel.app` cannot be verified
  because it is a public suffix.

  The sign-in page asks Supabase which providers are enabled and renders only
  those, so nothing is offered that would dead-end. Enabling Google surfaces its
  button within five minutes, without a deploy.

- **Phone sign-in is built but needs three things switched on.** It signs
  someone into the account that already holds their number — it is a second
  credential, not a second account, because a learner still needs an email to
  receive their certificate.

  1. Supabase → Authentication → Providers → Phone: enable.
  2. Supabase → Authentication → Hooks → Send SMS: point at
     `https://<deployment>/api/auth/sms-hook` and copy the generated secret
     into `SUPABASE_SMS_HOOK_SECRET`. Supabase generates the code; Termii
     delivers it, so no Twilio account is needed.
  3. Termii: top up, and get a sender ID approved — that needs company
     documents and takes days.

  The button stays hidden until Supabase reports phone as enabled, so nothing
  is offered that would dead-end. Numbers are normalised to E.164 by
  `lib/phone.ts`, which is what stops one person holding several accounts.

- **Microsoft was removed.** Consumer Outlook accounts are not the identity
  these learners arrive with. This is a separate decision from enterprise SSO:
  a bank requiring its staff to authenticate against its own Entra ID tenant is
  SAML, which Supabase supports on paid plans, and nothing here forecloses it.

- Email/password and magic link already work — subject to the email note above,
  which is what makes magic link unusable in practice today.
- **Nobody has used the app in a browser.** Every check so far is server-side.

## Roadmap

| Phase | Focus |
|---|---|
| **1 — Core Learning Platform (MVP)** | Landing site, auth/roles, student portal, course builder, admin approvals, certificate generation + QR verification, basic privacy center |
| **2 — Monetization & Operations** | Payments, coupons/subscriptions, corporate enrollment, reports, notifications, live classes |
| **3 — Trust, Community & Engagement** | Discussions, gamification, digital badges, global search, calendar, full compliance dashboard |
| **4 — Web3 & Multi-Tenant** | Wallet connection, mint flow (testnet first), Super Admin multi-campus tooling, API keys/webhooks |
| **5 — Future** | AI Tutor/Quiz Generator/Feedback, mobile API, SCORM/xAPI, offline mode, employer verification portal |

Full detail in the [PRD](./CopaServe-LMS-PRD.md#16-phasing-recommendation).

## Contributing

Internal BIT Ltd project. Development conventions and PR guidelines TBD.

## License

Proprietary — © Business Intelligence Technologies Limited (BIT Ltd). All rights reserved.
