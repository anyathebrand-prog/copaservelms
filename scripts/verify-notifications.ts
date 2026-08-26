/**
 * Functional checks for notifications (PRD §13.2) and the consent rule that
 * governs them (§12.1).
 *
 * The distinction under test is transactional versus marketing. Getting it
 * wrong fails in one of two directions, and both are serious: spamming people
 * who opted out, or withholding a certificate from someone who merely declined
 * a newsletter. Both directions are asserted here.
 *
 * A capture driver stands in for Resend/Termii so real sends can be observed
 * without an account or a live message.
 *
 *   npx tsx scripts/verify-notifications.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  broadcast,
  countUnread,
  getNotifications,
  isTransactional,
  markRead,
  sendNotification,
} from "../lib/notifications";
import type { EmailDriver, SmsDriver } from "../lib/notifications/providers";
import { recordConsent, updateCommunicationPrefs } from "../lib/privacy";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.consentLog.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

/** Captures what would have been sent, instead of sending it. */
const sentEmails: { to: string; subject: string }[] = [];
const sentSms: { to: string; text: string }[] = [];

const emailDriver: EmailDriver = {
  id: "capture",
  send: async ({ to, subject }) => {
    sentEmails.push({ to, subject });
    return { ok: true, providerId: "captured" };
  },
};

const smsDriver: SmsDriver = {
  id: "capture",
  send: async ({ to, text }) => {
    sentSms.push({ to, text });
    return { ok: true, providerId: "captured" };
  },
};

const drivers = { email: emailDriver, sms: smsDriver };

async function main() {
  // --- classification -----------------------------------------------------
  check("a certificate is transactional", isTransactional("certificate.issued"), "transactional");
  check("a grade is transactional", isTransactional("assignment.graded"), "transactional");
  check("a corporate enrolment is transactional", isTransactional("enrolment.granted"), "transactional");
  check("an announcement is marketing", !isTransactional("announcement"), "marketing");

  // --- fixtures -----------------------------------------------------------
  const noConsent = await prisma.user.create({
    data: { email: `noconsent-${RUN}@demo.local`, status: "ACTIVE", phone: "+2348000000001",
      profile: { create: { firstName: "No", lastName: "Consent" } } },
  });
  createdUsers.push(noConsent.id);

  const consented = await prisma.user.create({
    data: { email: `consented-${RUN}@demo.local`, status: "ACTIVE", phone: "+2348000000002",
      profile: { create: { firstName: "Yes", lastName: "Consent" } } },
  });
  createdUsers.push(consented.id);
  await recordConsent({ userId: consented.id, type: "MARKETING_EMAIL", action: "GRANTED" });

  const withdrawn = await prisma.user.create({
    data: { email: `withdrawn-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "With", lastName: "Drawn" } } },
  });
  createdUsers.push(withdrawn.id);
  await recordConsent({ userId: withdrawn.id, type: "MARKETING_EMAIL", action: "GRANTED" });
  await recordConsent({ userId: withdrawn.id, type: "MARKETING_EMAIL", action: "WITHDRAWN" });

  const deactivated = await prisma.user.create({
    data: { email: `gone-${RUN}@demo.local`, status: "DEACTIVATED",
      profile: { create: { firstName: "Gone", lastName: "Away" } } },
  });
  createdUsers.push(deactivated.id);

  // --- transactional reaches everyone ------------------------------------
  sentEmails.length = 0;
  const cert = await sendNotification(
    {
      userId: noConsent.id, kind: "certificate.issued",
      title: "Your certificate", body: "It has been issued.",
      channels: ["EMAIL"],
    },
    drivers,
  );

  check("a certificate reaches someone who never consented to marketing",
    cert.inApp && cert.email === "sent", `inApp=${cert.inApp}, email=${cert.email}`);
  check("the transactional email was actually dispatched",
    sentEmails.some((e) => e.to === noConsent.email), `${sentEmails.length} captured`);

  const withdrawnCert = await sendNotification(
    {
      userId: withdrawn.id, kind: "assignment.graded",
      title: "Graded", body: "You scored 82/100.", channels: ["EMAIL"],
    },
    drivers,
  );
  check("a grade still reaches someone who withdrew marketing consent",
    withdrawnCert.email === "sent", `${withdrawnCert.email}`);

  // --- marketing respects consent ----------------------------------------
  sentEmails.length = 0;
  const spam = await sendNotification(
    {
      userId: noConsent.id, kind: "announcement",
      title: "New courses", body: "Check out our new catalogue.", channels: ["EMAIL"],
    },
    drivers,
  );
  check("an announcement is not sent without consent",
    spam.suppressed === "no-consent" && !spam.inApp, `${spam.suppressed}`);
  check("no marketing email was dispatched", sentEmails.length === 0, `${sentEmails.length} captured`);

  const noRow = await prisma.notification.count({ where: { userId: noConsent.id, title: "New courses" } });
  check("a suppressed announcement is not even recorded in-app", noRow === 0, `${noRow} row(s)`);

  const afterWithdrawal = await sendNotification(
    {
      userId: withdrawn.id, kind: "announcement",
      title: "Promo", body: "Discount inside.", channels: ["EMAIL"],
    },
    drivers,
  );
  check("withdrawal blocks marketing that consent previously allowed",
    afterWithdrawal.suppressed === "no-consent", `${afterWithdrawal.suppressed}`);

  sentEmails.length = 0;
  const allowed = await sendNotification(
    {
      userId: consented.id, kind: "announcement",
      title: "Newsletter", body: "This month at CopaServe.", channels: ["EMAIL"],
    },
    drivers,
  );
  check("an announcement reaches someone who consented",
    allowed.inApp && allowed.email === "sent", `${allowed.email}`);

  // --- channel preferences ------------------------------------------------
  await updateCommunicationPrefs(consented.id, { EMAIL: false, IN_APP: true, SMS: false, PUSH: false });
  sentEmails.length = 0;
  const optedOut = await sendNotification(
    {
      userId: consented.id, kind: "certificate.issued",
      title: "Certificate", body: "Issued.", channels: ["EMAIL"],
    },
    drivers,
  );
  check("an email opt-out is respected even for transactional mail",
    optedOut.email === "opted-out", `${optedOut.email}`);
  check("but the in-app record is still written",
    optedOut.inApp && optedOut.notificationId !== null, `inApp=${optedOut.inApp}`);
  check("nothing was emailed to the opted-out user", sentEmails.length === 0, `${sentEmails.length}`);

  // --- SMS ----------------------------------------------------------------
  sentSms.length = 0;
  await sendNotification(
    {
      userId: noConsent.id, kind: "certificate.issued",
      title: "Certificate", body: "Issued.", channels: ["SMS"],
    },
    drivers,
  );
  check("SMS is sent when a phone number exists", sentSms.length === 1, `${sentSms.length} sent`);
  check("SMS body is truncated to control cost",
    sentSms[0].text.length <= 300, `${sentSms[0].text.length} chars`);

  const noPhone = await sendNotification(
    {
      userId: withdrawn.id, kind: "certificate.issued",
      title: "Certificate", body: "Issued.", channels: ["SMS"],
    },
    drivers,
  );
  check("SMS is skipped when there is no number", noPhone.sms === "skipped", `${noPhone.sms}`);

  // --- deactivated accounts ----------------------------------------------
  const toGone = await sendNotification(
    {
      userId: deactivated.id, kind: "certificate.issued",
      title: "Certificate", body: "Issued.", channels: ["EMAIL"],
    },
    drivers,
  );
  check("a deactivated account receives nothing",
    !toGone.inApp && toGone.notificationId === null, `inApp=${toGone.inApp}`);

  // --- reading ------------------------------------------------------------
  const unreadBefore = await countUnread(noConsent.id);
  check("notifications start unread", unreadBefore > 0, `${unreadBefore} unread`);

  // A stranger's id must not let anyone mark someone else's notifications read.
  const list = await getNotifications(noConsent.id);
  const crossUser = await markRead(consented.id, list[0].id);
  check("marking read is scoped to the owner", crossUser === 0, `${crossUser} row(s) affected`);

  const own = await markRead(noConsent.id, list[0].id);
  check("a person can mark their own notification read", own === 1, `${own} row(s)`);

  await markRead(noConsent.id);
  check("mark-all-read clears the count", (await countUnread(noConsent.id)) === 0, "0 unread");

  // --- broadcast ----------------------------------------------------------
  await updateCommunicationPrefs(consented.id, { EMAIL: true, IN_APP: true, SMS: false, PUSH: false });
  const result = await broadcast(
    { title: `Broadcast ${RUN}`, body: "Platform announcement." },
    consented.id,
    drivers,
  );

  check("broadcast reports what was suppressed, not just what was sent",
    result.suppressed >= 2 && result.delivered >= 1,
    `${result.delivered} delivered, ${result.suppressed} suppressed of ${result.attempted}`);

  const spammed = await prisma.notification.count({
    where: { userId: noConsent.id, title: `Broadcast ${RUN}` },
  });
  check("broadcast did not reach a non-consenting user", spammed === 0, `${spammed} row(s)`);

  const reached = await prisma.notification.count({
    where: { userId: consented.id, title: `Broadcast ${RUN}` },
  });
  check("broadcast reached the consenting user", reached === 1, `${reached} row(s)`);

  const audited = await prisma.auditLog.count({
    where: { action: "notification.broadcast", actorId: consented.id },
  });
  check("broadcast is audited", audited === 1, `${audited} entry`);

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
