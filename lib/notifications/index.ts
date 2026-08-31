import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/app-url";
import { getSettings } from "@/lib/settings";
import {
  getEmailDriver,
  getSmsDriver,
  type EmailDriver,
  type SmsDriver,
} from "./providers";
import type { NotificationChannel } from "@/app/generated/prisma/enums";

/**
 * Notification dispatch (PRD §13.2), governed by NDPA consent (§12.1).
 *
 * The rule that shapes this module: **transactional messages are not
 * marketing.** A certificate the person earned, a grade on work they submitted,
 * a receipt for money they paid — these are part of the service and are sent
 * regardless of marketing consent. Announcements and campaigns require consent
 * that has been granted and not withdrawn.
 *
 * Conflating the two is the classic compliance failure: either you spam people
 * who opted out, or you withhold a certificate from someone who merely declined
 * a newsletter.
 */

export type NotificationKind =
  | "certificate.issued"
  | "certificate.revoked"
  | "assignment.graded"
  | "course.approved"
  | "course.rejected"
  | "enrolment.granted"
  | "payment.receipt"
  | "organisation.invite"
  | "announcement";

/** Kinds that are part of the service, not promotion. */
const TRANSACTIONAL: NotificationKind[] = [
  "certificate.issued",
  "certificate.revoked",
  "assignment.graded",
  "course.approved",
  "course.rejected",
  "enrolment.granted",
  "payment.receipt",
  "organisation.invite",
];

export function isTransactional(kind: NotificationKind): boolean {
  return TRANSACTIONAL.includes(kind);
}

export type SendInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actionUrl?: string | null;
  /** Channels to attempt beyond in-app, subject to preference and consent. */
  channels?: NotificationChannel[];
  metadata?: Record<string, unknown>;
};

export type SendOutcome = {
  notificationId: string | null;
  inApp: boolean;
  email: "sent" | "skipped" | "failed" | "not-configured" | "no-consent" | "opted-out";
  sms: "sent" | "skipped" | "failed" | "not-configured" | "no-consent" | "opted-out";
  suppressed?: "no-consent";
};

/** Current marketing consent, derived from the newest entry per type. */
async function hasMarketingConsent(userId: string, channel: "EMAIL" | "SMS"): Promise<boolean> {
  const type = channel === "EMAIL" ? "MARKETING_EMAIL" : "MARKETING_SMS";

  const latest = await prisma.consentLog.findFirst({
    where: { userId, type },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });

  // No record means never granted. Absence of consent is not consent.
  return latest?.action === "GRANTED" || latest?.action === "UPDATED";
}

/**
 * Record and deliver a notification.
 *
 * The in-app row is always written — it is the durable record, and the one
 * channel that needs no consent because the person only sees it inside their
 * own account. External channels are attempted after that, and their failure
 * never undoes the record.
 */
export async function sendNotification(
  input: SendInput,
  drivers?: { email?: EmailDriver; sms?: SmsDriver },
): Promise<SendOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true, email: true, phone: true, status: true, deletedAt: true,
      profile: { select: { firstName: true, communicationPrefs: true } },
    },
  });

  const outcome: SendOutcome = {
    notificationId: null, inApp: false, email: "skipped", sms: "skipped",
  };

  // A deactivated or erased account is not messaged at all.
  if (!user || user.deletedAt !== null || user.status === "DEACTIVATED") return outcome;

  const marketing = !isTransactional(input.kind);

  // A marketing message to someone without consent is not sent, and not even
  // recorded in-app: it should not have been generated for them at all.
  if (marketing) {
    const [emailConsent, smsConsent] = await Promise.all([
      hasMarketingConsent(user.id, "EMAIL"),
      hasMarketingConsent(user.id, "SMS"),
    ]);
    if (!emailConsent && !smsConsent) {
      return { ...outcome, email: "no-consent", sms: "no-consent", suppressed: "no-consent" };
    }
  }

  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      channel: "IN_APP",
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl ?? null,
      metadata: { kind: input.kind, ...(input.metadata ?? {}) } as never,
      sentAt: new Date(),
    },
    select: { id: true },
  });

  outcome.notificationId = notification.id;
  outcome.inApp = true;

  const prefs = (user.profile?.communicationPrefs ?? {}) as Record<string, boolean>;
  const wanted = input.channels ?? [];

  if (wanted.includes("EMAIL")) {
    outcome.email = await deliverEmail(user, input, prefs, marketing, drivers?.email);
  }

  if (wanted.includes("SMS")) {
    outcome.sms = await deliverSms(user, input, prefs, marketing, drivers?.sms);
  }

  return outcome;
}

async function deliverEmail(
  user: { id: string; email: string; profile: { firstName: string } | null },
  input: SendInput,
  prefs: Record<string, boolean>,
  marketing: boolean,
  driver?: EmailDriver,
): Promise<SendOutcome["email"]> {
  // Preferences govern optional channels. A transactional message still
  // respects an explicit opt-out of email, because the in-app record remains.
  if (prefs.EMAIL === false) return "opted-out";
  if (marketing && !(await hasMarketingConsent(user.id, "EMAIL"))) return "no-consent";

  const settings = await getSettings();
  const emailDriver = driver ?? getEmailDriver();
  const result = await emailDriver.send({
    to: user.email,
    subject: input.title,
    text: input.body,
    html: renderHtml(input, user.profile?.firstName ?? "", settings),
  });

  if (!result.ok) {
    return emailDriver.id === "console" ? "not-configured" : "failed";
  }

  return "sent";
}

async function deliverSms(
  user: { id: string; phone: string | null },
  input: SendInput,
  prefs: Record<string, boolean>,
  marketing: boolean,
  driver?: SmsDriver,
): Promise<SendOutcome["sms"]> {
  if (!user.phone) return "skipped";
  if (prefs.SMS === false) return "opted-out";
  if (marketing && !(await hasMarketingConsent(user.id, "SMS"))) return "no-consent";

  const smsDriver = driver ?? getSmsDriver();
  // SMS is charged per segment, so the body is truncated rather than split.
  const result = await smsDriver.send({
    to: user.phone,
    text: `${input.title}: ${input.body}`.slice(0, 300),
  });

  if (!result.ok) return smsDriver.id === "console" ? "not-configured" : "failed";
  return "sent";
}

/** Minimal branded HTML. Inline styles, because email clients ignore stylesheets. */
function renderHtml(
  input: SendInput,
  firstName: string,
  branding: { institutionName: string; primaryColor: string; supportEmail: string | null },
): string {
  const greeting = firstName ? `Hello ${escapeHtml(firstName)},` : "Hello,";
  // Absolute, because a relative path in an email client points nowhere.
  const action = input.actionUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(absoluteUrl(input.actionUrl))}" style="background:${escapeHtml(branding.primaryColor)};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open CopaServe</a></p>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7f5;font-family:Inter,Arial,sans-serif;color:#0b0b0b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<p style="margin:0 0 8px;color:${escapeHtml(branding.primaryColor)};font-weight:700;letter-spacing:.04em;font-size:12px">COPASERVE</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 8px">${greeting}</p>
<p style="margin:0;line-height:1.6;color:#5b655c">${escapeHtml(input.body)}</p>
${action}
<p style="margin:24px 0 0;font-size:12px;color:#5b655c">${escapeHtml(branding.institutionName)}${
    branding.supportEmail
      ? ` &middot; <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:#5b655c">${escapeHtml(branding.supportEmail)}</a>`
      : ""
  }</p>
</div></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getNotifications(userId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, title: true, body: true, actionUrl: true,
      readAt: true, createdAt: true, metadata: true,
    },
  });
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, notificationId?: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    // Scoped to the caller: an id alone must not mark someone else's as read.
    where: { userId, readAt: null, ...(notificationId ? { id: notificationId } : {}) },
    data: { readAt: new Date() },
  });

  return result.count;
}

/**
 * Broadcast to many recipients (§13.2).
 *
 * An announcement is marketing, so each recipient is filtered by consent inside
 * sendNotification. The count returned is what was actually sent, not what was
 * attempted — the difference is the point.
 */
export async function broadcast(
  input: { title: string; body: string; actionUrl?: string | null; courseId?: string | null },
  actorId: string,
  drivers?: { email?: EmailDriver; sms?: SmsDriver },
): Promise<{ attempted: number; delivered: number; suppressed: number }> {
  const recipients = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      ...(input.courseId ? { enrollments: { some: { courseId: input.courseId } } } : {}),
    },
    select: { id: true },
    take: 5000,
  });

  let delivered = 0;
  let suppressed = 0;

  for (const recipient of recipients) {
    const outcome = await sendNotification(
      {
        userId: recipient.id,
        kind: "announcement",
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl ?? null,
        channels: ["EMAIL"],
      },
      drivers,
    );

    if (outcome.suppressed === "no-consent") suppressed += 1;
    else if (outcome.inApp) delivered += 1;
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "notification.broadcast",
      entityType: "Notification",
      after: {
        title: input.title,
        attempted: recipients.length,
        delivered,
        suppressedForConsent: suppressed,
      },
    },
  });

  return { attempted: recipients.length, delivered, suppressed };
}
