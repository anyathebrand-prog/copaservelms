# Product Requirements Document (PRD)
## CopaServe — Enterprise Learning Management System
**Powered by Business Intelligence Technologies Limited (BIT Ltd)**

| Field | Detail |
|---|---|
| Document Owner | Victor (Product) |
| Company | Business Intelligence Technologies Limited (BIT Ltd) |
| Product | CopaServe LMS |
| Status | Draft v1.0 |
| Last Updated | August 25, 2026 |

---

## 1. Executive Summary

CopaServe is a modern, enterprise-grade Learning Management System built for BIT Ltd, positioning it as Nigeria's leading platform for professional certification in **Data Protection, IT Governance, Compliance, Risk Management, Corporate Governance, and Web3/Emerging Technologies**.

The product experience should feel like **"Coursera meets Notion meets Stripe Dashboard"** — enterprise-grade information density with Apple-level polish, motion, and micro-interaction craft. CopaServe differentiates on three fronts:

1. **Compliance-grade credibility** — built by a governance/compliance firm, for governance/compliance professionals, with NDPA-by-design privacy architecture.
2. **Verifiable, Web3-ready credentials** — every certificate is QR-verifiable instantly, with an optional path to on-chain minting (Avalanche EVM) without forcing crypto adoption on users who don't want it.
3. **Enterprise-grade UX** — most compliance/professional training platforms in Nigeria look dated; CopaServe should not.

---

## 2. Problem Statement

- Professionals seeking Data Protection/NDPA, IT Governance, and Compliance certification in Nigeria currently rely on fragmented, low-trust platforms (PDF certificates with no verification, clunky UX, no analytics for corporate buyers).
- Corporate and institutional buyers (banks, telcos, government agencies) need **auditable, verifiable proof of staff compliance training** — something most local LMS tools don't support well.
- Web3/credentialing is emerging as a trust layer for professional certification globally, but no Nigerian compliance-training provider currently offers a credible, standards-based path to on-chain verification.

## 3. Goals & Success Metrics

### 3.1 Business Goals
- Establish CopaServe as BIT Ltd's flagship digital learning product, replacing manual/offline certification delivery.
- Enable corporate/institutional training contracts (bulk enrollment, cohorts, compliance reporting) as a revenue line, not just individual course sales.
- Build a verifiable credentialing system BIT Ltd can license or white-label to other institutions later (Super Admin / multi-tenant groundwork).

### 3.2 Success Metrics (illustrative — to be finalized with stakeholders)
| Metric | Target (Year 1) |
|---|---|
| Registered learners | TBD |
| Certificates issued | TBD |
| Corporate/institutional accounts onboarded | TBD |
| Certificate verification page visits (trust signal) | TBD |
| Course completion rate | ≥ 60% |
| Certificate generation → email delivery time | < 60 seconds |
| Platform uptime | 99.9% |

*(Numeric targets intentionally left as placeholders pending business input — flag to fill in before engineering kickoff.)*

## 4. Target Users & Personas

| Persona | Description | Primary Needs |
|---|---|---|
| **Student / Learner** | Compliance officers, DPOs, IT/governance professionals, Web3-curious learners | Clear course progress, credible certificates, flexible payment, mobile-friendly learning |
| **Instructor** | BIT Ltd subject-matter experts and partner facilitators | Easy course authoring, visibility into student performance, revenue transparency |
| **Admin** | BIT Ltd operations/compliance staff | Approvals, payments oversight, reporting, NDPA compliance management |
| **Super Admin** | BIT Ltd platform owner | Institution branding, multi-campus/corporate account management, platform configuration |
| **Corporate Buyer (secondary persona)** | HR/Compliance heads enrolling staff cohorts | Bulk enrollment, compliance reporting, verifiable proof of training completion |
| **Verifier (external, unauthenticated)** | Employers, regulators, third parties | Fast, trustworthy certificate verification via QR/URL |

## 5. Scope Overview

This PRD covers the full product surface as specified. Given the scope, engineering should treat this as a **multi-phase roadmap**, not a single release — see Section 14 (Phasing).

### 5.1 In Scope (Full Product Vision)
- Public marketing/landing site
- Authentication & role-based access (Student, Instructor, Admin, Super Admin)
- Student portal (courses, quizzes, assignments, live classes, certificates, wallet, profile)
- Instructor dashboard (course builder, student management, analytics)
- Admin dashboard (user/course/payment/notification/report management)
- Certificate generation, QR verification, and revocation system
- Web3-ready certificate architecture (wallet connection + optional minting on Avalanche EVM)
- Digital badges & gamification
- Discussion/community layer
- Global search, calendar, download center
- NDPA privacy center & compliance dashboard
- Security (RBAC, 2FA-ready, audit trails)
- Super Admin / multi-tenant groundwork (institution branding, corporate orgs)

### 5.2 Explicitly Out of Scope for Initial Build (Future Placeholders)
- Live smart contract deployment/minting (architecture only — see Section 11.5)
- AI Tutor, AI Quiz Generator, AI Assignment Feedback, AI Learning Assistant
- Native mobile apps (API groundwork only)
- SCORM/xAPI support
- Offline learning mode
- Employer verification portal (beyond the public verify page)

---

## 6. Technical Architecture

### 6.1 Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, Shadcn UI, Framer Motion, React Hook Form, TanStack Query, Lucide Icons |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime), Prisma ORM, Node/NestJS-compatible API layer |
| Data Access Control | Row Level Security (RLS) enforced at the database layer for all role-scoped data |
| Storage | Supabase Storage (PDFs, assignments, videos, certificates), architected for Cloudflare R2 compatibility |
| Payments (future) | Paystack, Flutterwave |
| Communications (future) | Resend (email), Termii (SMS) |
| Video Conferencing (future) | Zoom, Google Meet (placeholder integration) |
| Web3 (future) | WalletConnect, MetaMask, Coinbase Wallet, Rainbow, Avalanche Core Wallet — targeting Avalanche EVM first, Polygon-compatible |

### 6.2 Architectural Principles
- **RLS-first**: every table with user-owned or role-scoped data must have RLS policies before any UI ships against it — this is a hard gate, not a nice-to-have, given the compliance nature of the product.
- **Storage abstraction**: file storage calls should go through an internal storage service interface so Supabase Storage can be swapped/mirrored to Cloudflare R2 without touching business logic.
- **Web3 as an optional layer**: no core learning, certification, or verification flow should ever *require* a connected wallet. Minting is additive.
- **Audit-everything**: given the compliance positioning, all admin actions (approvals, revocations, role changes, data exports/deletions) must write to an audit log table.

### 6.3 Design System
| Element | Spec |
|---|---|
| Primary colors | Green `#0a510e`, Bright green `#05ff12`, White `#dcf8dd` |
| Secondary colors | Black, Light Gray |
| Status colors | Emerald (success), Orange (warning) |
| Headings font | Space Grotesk |
| Body font | Inter |
| Surface style | Light glassmorphism, rounded corners, soft/smooth shadows |
| Motion | Framer Motion throughout — page transitions, hover elevation, animated counters, skeleton loading, scroll-triggered reveals, confetti on quiz pass, certificate reveal animation, mint success animation |
| Responsiveness | Desktop, tablet, mobile — collapsible sidebar on desktop/tablet, bottom nav on mobile, touch gestures supported |

*Design note to flag: the certificate template spec (Section 11.2) calls for "purple and gold accents," which conflicts with the platform's green/black/white brand palette. Recommend confirming whether certificates intentionally use a distinct premium palette or should align to brand green/gold.*

---

## 7. Public Site (Landing Experience)

### 7.1 Hero Section
- Animated headline: **"Learn. Get Certified. Verify. Mint."**
- Subtitle: *"Nigeria's next-generation professional learning platform for Data Protection, Compliance, Governance, Web3, Cybersecurity and Emerging Technologies."*
- Primary CTA: **Start Learning**; Secondary CTA: **Explore Courses**
- Floating 3D cards, animated dashboard preview, video preview modal, animated statistics counter

### 7.2 Homepage Sections (in order)
1. Hero
2. Featured Courses
3. Professional Certifications
4. Why Learn with BIT
5. Certificate Verification (explainer + live "try a verification" widget)
6. Wallet-ready Certificates (Web3 explainer, non-technical framing)
7. Testimonials
8. Corporate Training
9. Trusted Institutions (logo strip)
10. FAQ
11. Footer

All sections scroll-animated (fade/slide/parallax reveals).

---

## 8. Authentication & Roles

### 8.1 Auth Methods
- Email/password login
- Magic link
- Google OAuth
- Microsoft OAuth

### 8.2 Roles (RBAC)
| Role | Access Level |
|---|---|
| Student | Own enrollments, submissions, certificates, wallet |
| Instructor | Own courses, enrolled students' data, own analytics |
| Admin | Platform-wide user/course/payment/compliance management |
| Super Admin | Full platform config, institution branding, multi-campus/corporate orgs |

- Wallet linking is **optional** and happens post-login, never a signup requirement.
- 2FA architecture should be ready even if not enforced at launch (Section 13).

---

## 9. Student Portal

### 9.1 Dashboard Overview
Widgets: Active Courses, Completed Courses, Upcoming Live Classes, Assignments Due, Quiz Average, Certificates Earned, Wallet Status, Notifications — plus animated progress ring, weekly learning streak, total learning hours, and achievements.

### 9.2 Sidebar Navigation
Dashboard · My Courses · Certificates · Assignments · Quizzes · Live Classes · Downloads · Wallet · Profile · Settings · Support · Logout

### 9.3 My Courses
- Course cards: thumbnail, instructor, progress bar, "Continue Learning" CTA, lessons remaining, estimated completion time
- Filters: Completed, In Progress, Saved, Category, Search

### 9.4 Course Player
Video player with playback speed control, Picture-in-Picture, captions, lesson notes, bookmarks, resources/downloads, lesson comments, discussion thread, completion checkbox, auto-advance to next lesson, and a persistent course progress sidebar.

### 9.5 Quiz System
- Question types: Multiple Choice, Checkbox, Short Answer, Essay, True/False, Drag-and-Drop, Matching
- Timed quizzes, auto-grading (objective types) + manual grading (essay/short answer)
- Instant feedback, leaderboard, retake policy, and quiz results feed directly into **certificate eligibility logic** (Section 11.3)

### 9.6 Assignment Module
- Upload types: PDF, DOCX, ZIP, images, video
- Draft submissions, resubmission before deadline, grading status tracking, instructor feedback, rubric-based scoring

### 9.7 Live Classes
- Calendar view; Zoom and Google Meet integration placeholders
- Attendance tracking, reminders, replay recordings, downloadable attendance certificate

### 9.8 Student Profile
- Editable: photo, bio, organization, profession, country, phone, emergency contact
- NDPA consent preferences, communication preferences
- Self-service: download personal data, request account deletion (ties into Privacy Center, Section 12.2)

---

## 10. Instructor Dashboard

### 10.1 Overview Widgets
Total Students, Revenue, Courses Published, Completion Rate, Average Quiz Score, Pending Assignments, Certificates Issued, Live Sessions

### 10.2 Sidebar Navigation
Courses · Students · Assignments · Quizzes · Certificates · Analytics · Messages · Settings

### 10.3 Course Builder
Drag-and-drop curriculum builder supporting: modules, lessons, video, PDF, audio, external links, embedded slides, code snippets, lesson prerequisites, estimated duration, lesson preview, and a formal publish workflow (draft → submitted → admin-approved → live).

### 10.4 Student Management
View enrolled students' progress, grades, attendance, and activity history. Send announcements or targeted emails, export CSV, issue manual certificates (admin/instructor override path).

### 10.5 Instructor Analytics
Completion funnel, engagement, watch time, quiz performance, assignment statistics, revenue by course, monthly enrollment chart, engagement heatmaps.

---

## 11. Certificate System *(Core Differentiator)*

### 11.1 Generation Rules
A certificate is issued only when **all** applicable conditions are met:
- 100% of lessons completed
- Minimum quiz score achieved
- Required assignments submitted
- Attendance requirement met (if applicable to course)
- Admin approval, where the course is configured to require it

On eligibility: PDF is generated automatically, stored in cloud storage, emailed to the student, and made available in-dashboard.

### 11.2 Certificate Template Contents
Institution logo, student name, course name, instructor signature, QR code, certificate number, issue date, optional expiry date, credential ID. *(See design note in Section 6.3 re: palette conflict with brand colors.)*

### 11.3 QR Verification
- Every certificate has a QR code linking to a public verification URL (pattern: `verify.bitlearn.ng/CERT-YYYY-NNNNNN`)
- Verification page (public, unauthenticated) shows: Valid/Invalid badge, student name, course, institution, issue date, certificate ID, instructor, blockchain mint status, download and share options

### 11.4 Revocation
Admin-only action. Reasons: academic misconduct, expired certification, administrative correction. Verification page reflects revocation status instantly — this must be treated as a real-time-consistency requirement, not eventually-consistent.

### 11.5 Web3-Ready Certificate Architecture
Built as an **optional layer**, not a dependency for certification validity.

**Wallet Page:** connect via WalletConnect, MetaMask, Coinbase Wallet, Rainbow, or Avalanche Core Wallet. Shows connected network, wallet address, mint eligibility, mint history.

**Mint Flow:** Student initiates "Mint Certificate" → system checks eligibility → generates metadata → uploads metadata JSON → mint transaction → success animation → transaction hash stored.

**NFT Metadata (on-chain-safe fields only):** Certificate ID, course, institution, issue date, credential type, verification URL, badge image. **No sensitive student information is stored on-chain; hashed identifiers only where identification is needed.**

**Blockchain Status states:** Not Minted → Mint Eligible → Mint Pending → Minted → Revoked, with a placeholder link to a block explorer.

**Future Smart Contract Module:** API endpoints prepared (not necessarily implemented at launch) for Mint, Revoke, Verify, and Metadata Retrieval — targeting Avalanche EVM first, with Polygon compatibility considered.

---

## 12. Compliance, Trust & Security

### 12.1 NDPA Compliance (Privacy by Design)
Consent management, cookie consent, privacy notice, terms acceptance, purpose limitation, data minimization, retention policy — plus full data-subject rights support: Access, Correction, Erasure, Withdraw Consent, Object, Portability.

### 12.2 Student Privacy Center
Download my data · Delete my account · Consent history · Privacy settings · Communication preferences · Request data correction

### 12.3 Admin Compliance Dashboard
Consent logs, data processing logs, access logs, subject data export/deletion tools, retention reminders, audit logs, role-based permission management.

### 12.4 Security Features
RBAC, 2FA-ready architecture, encrypted storage, session management, password reset, device login history, audit trail, rate limiting, CAPTCHA placeholder.

**Note:** given BIT Ltd's own positioning as a data protection/compliance authority, CopaServe's own NDPA compliance posture is a credibility requirement, not just a feature — recommend an internal compliance review pass before public launch, not just a QA pass.

---

## 13. Admin & Super Admin

### 13.1 Admin Dashboard Widgets
Total Students, Total Instructors, Active Courses, Revenue, Certificates Issued, Wallets Connected, Verification Requests, Compliance Status, Recent Activities

### 13.2 Admin Modules
- **User Management** — approve instructors, suspend users, bulk import students, role management, permissions, audit logs
- **Course Management** — approve drafts, categories, pricing, bundles, scholarships, corporate enrollment, featured courses
- **Payments** — Paystack/Flutterwave integration, invoices, coupons/discount codes, subscriptions, installment plans, revenue analytics, refund management
- **Notifications** — push, email campaigns, SMS campaigns, scheduled announcements, broadcast messages
- **Reports** — enrollment, revenue, student completion, instructor performance, compliance reports; export to PDF and Excel

### 13.3 Super Admin (Multi-Tenant Groundwork)
Institution branding, multiple instructors, multi-campus support, corporate organizations, department management, student cohorts, API keys, webhook management, platform settings.

---

## 14. Supporting Systems

| System | Key Capabilities |
|---|---|
| **Digital Badges** | Collectible badges (e.g. Certified Data Protection Officer, NDPA Compliance Specialist, Privacy Champion, Cybersecurity Fundamentals, Governance Expert); displayed on profile; mintable later |
| **Gamification** | XP points, learning streaks, badges, leaderboard, course milestones, daily challenges, achievement animations |
| **Discussion/Community** | Course discussions, replies, mentions, likes, pinned resources, instructor announcements, moderation tools |
| **Global Search** | Courses, lessons, certificates, instructors, resources, assignments |
| **Calendar** | Deadlines, live sessions, exam dates, certificate expiry reminders, Google Calendar sync placeholder |
| **Download Center** | Certificates, receipts, resources, assignments, transcripts |

---

## 15. Data Model (High-Level)

Core entities to be modeled in PostgreSQL via Prisma, with RLS policies scoped by role/ownership:

`Users`, `Profiles`, `Roles`, `Courses`, `Modules`, `Lessons`, `Enrollments`, `Quizzes`, `Questions`, `QuizAttempts`, `Assignments`, `Submissions`, `Certificates`, `CertificateTemplates`, `Wallets`, `MintTransactions`, `Payments`, `Notifications`, `ConsentLogs`, `AuditLogs`, `LiveClasses`, `Resources`, `Badges`, `Achievements`, `DiscussionPosts`, `Comments`

**Recommended relational anchors:**
- `Enrollments` joins `Users` ↔ `Courses`, and is the anchor for progress tracking and certificate eligibility.
- `Certificates` references `Enrollments`, `CertificateTemplates`, and optionally `MintTransactions` (1:0..1).
- `AuditLogs` and `ConsentLogs` are append-only and should never support hard deletes, only redaction where legally required.

*(Full ERD with field-level definitions and RLS policy matrix recommended as a follow-on engineering artifact — see Section 16.)*

---

## 16. Phasing Recommendation

Given the scope of this document, a single release is not realistic. Suggested phasing:

**Phase 1 — Core Learning Platform (MVP)**
Landing site, auth + roles, student portal (courses, player, quizzes, assignments), instructor course builder + basic analytics, admin approvals + user management, certificate generation + QR verification (no Web3), basic NDPA privacy center.

**Phase 2 — Monetization & Operations**
Payments (Paystack/Flutterwave), coupons/subscriptions, corporate enrollment, reports (PDF/Excel export), notifications (email/SMS), live classes integration.

**Phase 3 — Trust, Community & Engagement**
Discussion/community layer, gamification, digital badges, global search, calendar, download center, full compliance dashboard, audit logging depth.

**Phase 4 — Web3 & Multi-Tenant**
Wallet connection, mint flow (testnet first), Super Admin multi-campus/corporate org tooling, API keys/webhooks.

**Phase 5 — Future/Placeholder**
AI Tutor/Quiz Generator/Assignment Feedback, native mobile API, SCORM/xAPI, offline learning, employer verification portal, live smart contract deployment.

---

## 17. Open Questions for Stakeholder Input

1. Certificate template palette — confirm purple/gold vs. brand green/black/white.
2. Which corporate/institutional accounts are committed for launch, to prioritize bulk-enrollment and reporting features accordingly?
3. Target numeric goals for Section 3.2 metrics.
4. Is 2FA enforced at launch for Admin/Super Admin roles, or genuinely "ready but optional" for all roles?
5. Confirm `verify.bitlearn.ng` as the production verification domain, or is this a placeholder pending domain decision?
6. Minting: confirm Avalanche EVM testnet-first approach, and who owns smart contract development/audit.
7. Which live-class provider (Zoom vs Google Meet) is prioritized first, given both are currently "placeholder" integrations?

---

*This PRD reflects the full product vision as scoped. Recommend treating Section 16 (Phasing) as the actual build plan, with this document serving as the north-star reference across phases.*
