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
