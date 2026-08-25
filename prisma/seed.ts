/**
 * Reference data seed for CopaServe.
 *
 * Covers the lookup rows the app cannot function without: the four RBAC roles
 * (PRD §8.2), the training domains BIT Ltd sells into, a default certificate
 * template, and the launch badge set (PRD §14).
 *
 * Every write is an upsert keyed on a natural unique column, so this is safe to
 * re-run against a populated database — including production, where it acts as
 * a reconciliation pass rather than an insert.
 *
 * Run with: npm run db:seed
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import type { RoleName } from "../app/generated/prisma/enums";

const adapter = new PrismaPg({
  // Seeding is a migration-shaped task, so prefer the direct connection.
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const ROLES: { name: RoleName; description: string; permissions: string[] }[] = [
  {
    name: "STUDENT",
    description: "Own enrollments, submissions, certificates, and wallet.",
    permissions: ["course.enroll", "lesson.view", "quiz.attempt", "assignment.submit", "certificate.view.own", "wallet.link"],
  },
  {
    name: "INSTRUCTOR",
    description: "Own courses, enrolled students' data, and own analytics.",
    permissions: ["course.create", "course.update.own", "course.submit", "lesson.manage.own", "quiz.manage.own", "assignment.grade.own", "student.view.enrolled", "analytics.view.own"],
  },
  {
    name: "ADMIN",
    description: "Platform-wide user, course, payment, and compliance management.",
    permissions: ["user.manage", "instructor.approve", "course.approve", "course.publish", "payment.manage", "refund.issue", "certificate.issue", "certificate.revoke", "notification.broadcast", "report.export", "compliance.view", "audit.view"],
  },
  {
    name: "SUPER_ADMIN",
    description: "Full platform configuration, branding, and multi-tenant setup.",
    permissions: ["*"],
  },
];

// The seven domains named in the PRD positioning statement, plus Cybersecurity,
// which §14's badge list treats as a first-class track.
const CATEGORIES = [
  { name: "Data Protection", slug: "data-protection", description: "NDPA, GDPR, data privacy operations, and DPO practice." },
  { name: "IT Governance", slug: "it-governance", description: "COBIT, ISO/IEC 38500, and IT strategy alignment." },
  { name: "Compliance", slug: "compliance", description: "Regulatory compliance frameworks and audit readiness." },
  { name: "Risk Management", slug: "risk-management", description: "Enterprise risk identification, assessment, and treatment." },
  { name: "Corporate Governance", slug: "corporate-governance", description: "Board practice, ethics, and organisational accountability." },
  { name: "Cybersecurity", slug: "cybersecurity", description: "Security fundamentals, threat management, and resilience." },
  { name: "Professional Certification", slug: "professional-certification", description: "Structured certification tracks and exam preparation." },
  { name: "Web3 & Emerging Technologies", slug: "web3-emerging-tech", description: "Blockchain, verifiable credentials, AI, and emerging tech." },
];

const BADGES = [
  { name: "Certified Data Protection Officer", slug: "certified-dpo", description: "Completed the full DPO certification track.", xpValue: 500 },
  { name: "NDPA Compliance Specialist", slug: "ndpa-compliance-specialist", description: "Demonstrated applied mastery of the Nigeria Data Protection Act.", xpValue: 400 },
  { name: "Privacy Champion", slug: "privacy-champion", description: "Completed three or more privacy-domain courses.", xpValue: 300 },
  { name: "Cybersecurity Fundamentals", slug: "cybersecurity-fundamentals", description: "Completed the cybersecurity foundation course.", xpValue: 200 },
  { name: "Governance Expert", slug: "governance-expert", description: "Completed the corporate and IT governance track.", xpValue: 400 },
];

async function main() {
  const roles = await Promise.all(
    ROLES.map((role) =>
      prisma.role.upsert({
        where: { name: role.name },
        // Permissions are authoritative here, so a re-run repairs drift.
        update: { description: role.description, permissions: role.permissions },
        create: role,
      }),
    ),
  );
  console.log(`✔ roles: ${roles.map((r) => r.name).join(", ")}`);

  const categories = await Promise.all(
    CATEGORIES.map((category) =>
      prisma.category.upsert({
        where: { slug: category.slug },
        update: { name: category.name, description: category.description },
        create: category,
      }),
    ),
  );
  console.log(`✔ categories: ${categories.length}`);

  const template = await prisma.certificateTemplate.upsert({
    where: { name: "CopaServe Default" },
    update: {},
    create: {
      name: "CopaServe Default",
      isDefault: true,
      // Brand palette from PRD §6.3. The §11.2 spec calls for purple/gold, which
      // conflicts with brand green — open question 1 in §17. Defaulting to brand.
      theme: {
        primary: "#0a510e",
        accent: "#05ff12",
        surface: "#dcf8dd",
        text: "#0b0b0b",
      },
      layout: {
        orientation: "landscape",
        size: "A4",
        fields: [
          "institutionLogo",
          "studentName",
          "courseName",
          "instructorSignature",
          "qrCode",
          "certificateNumber",
          "issueDate",
          "expiryDate",
          "credentialId",
        ],
      },
    },
  });
  console.log(`✔ certificate template: ${template.name}`);

  const badges = await Promise.all(
    BADGES.map((badge) =>
      prisma.badge.upsert({
        where: { slug: badge.slug },
        update: { name: badge.name, description: badge.description, xpValue: badge.xpValue },
        create: { ...badge, criteria: {}, isMintable: false },
      }),
    ),
  );
  console.log(`✔ badges: ${badges.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
