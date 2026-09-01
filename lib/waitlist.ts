import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Pre-launch waitlist (PRD §7.2).
 *
 * The wording someone agreed to is stored with their row, not referenced by a
 * version number. Under the NDPA it is not enough to assert that consent was
 * given; it has to be possible to show what the person was told. A version
 * pointer only works if the text behind it is immutable, and marketing copy
 * never is.
 *
 * Withdrawal is issued at signup rather than at send time, for the same reason:
 * withdrawing has to be as easy as consenting, and a link that only exists once
 * we have emailed someone fails that on the day they change their mind before
 * we have.
 */

/** The exact promise made on the form. Changing this changes what new signups agree to. */
export const CONSENT_TEXT =
  "I agree that CopaServe may email me once about launching, and occasionally " +
  "about courses relevant to my interests. I can unsubscribe at any time.";

export type WaitlistError = "INVALID_EMAIL" | "NOT_FOUND";
export type Result<T> = { ok: true; data: T } | { ok: false; error: WaitlistError; detail?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type JoinInput = {
  email: string;
  name?: string | null;
  organisation?: string | null;
  interest?: string | null;
  source?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Add someone, or quietly do nothing if they are already there.
 *
 * Signing up twice is not an error worth telling anyone about. Reporting "you
 * are already on the list" would also turn this public form into a way to test
 * whether a given address is on it, so both outcomes read the same from
 * outside.
 */
export async function joinWaitlist(input: JoinInput): Promise<Result<{ alreadyOn: boolean }>> {
  const email = input.email.trim().toLowerCase();

  if (!EMAIL.test(email)) {
    return { ok: false, error: "INVALID_EMAIL", detail: "That does not look like an email address." };
  }

  const existing = await prisma.waitlistEntry.findUnique({
    where: { email },
    select: { id: true, status: true },
  });

  if (existing) {
    // Someone who unsubscribed and later signs up again has changed their mind,
    // which is consent freshly given — so it is recorded again rather than
    // treated as the old withdrawal still standing.
    if (existing.status === "UNSUBSCRIBED") {
      await prisma.waitlistEntry.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          unsubscribedAt: null,
          consentText: CONSENT_TEXT,
          consentedAt: new Date(),
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    }

    return { ok: true, data: { alreadyOn: true } };
  }

  await prisma.waitlistEntry.create({
    data: {
      email,
      name: input.name?.trim() || null,
      organisation: input.organisation?.trim() || null,
      interest: input.interest?.trim() || null,
      source: input.source?.trim() || null,
      consentText: CONSENT_TEXT,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      unsubscribeToken: randomBytes(24).toString("base64url"),
    },
  });

  return { ok: true, data: { alreadyOn: false } };
}

/**
 * Withdraw, by token.
 *
 * The row is kept rather than deleted: a suppression record is what stops a
 * later import quietly re-adding someone who asked to be left alone. Their
 * name and organisation go, since neither is needed to honour the request.
 */
export async function unsubscribe(token: string): Promise<Result<{ email: string }>> {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, email: true, status: true },
  });

  if (!entry) return { ok: false, error: "NOT_FOUND" };

  if (entry.status !== "UNSUBSCRIBED") {
    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "UNSUBSCRIBED",
        unsubscribedAt: new Date(),
        name: null,
        organisation: null,
      },
    });
  }

  return { ok: true, data: { email: entry.email } };
}

/** Mark people as invited, once there is something to invite them to. */
export async function markInvited(ids: string[]): Promise<Result<{ invited: number }>> {
  const result = await prisma.waitlistEntry.updateMany({
    // Never an unsubscribed row: that is the one state this must not walk back.
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "INVITED", invitedAt: new Date() },
  });

  return { ok: true, data: { invited: result.count } };
}

export async function listWaitlist(status?: "PENDING" | "INVITED" | "JOINED" | "UNSUBSCRIBED") {
  return prisma.waitlistEntry.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, email: true, name: true, organisation: true, interest: true,
      status: true, source: true, createdAt: true, invitedAt: true,
    },
  });
}

export async function getWaitlistSummary() {
  const [pending, invited, joined, unsubscribed, thisWeek] = await Promise.all([
    prisma.waitlistEntry.count({ where: { status: "PENDING" } }),
    prisma.waitlistEntry.count({ where: { status: "INVITED" } }),
    prisma.waitlistEntry.count({ where: { status: "JOINED" } }),
    prisma.waitlistEntry.count({ where: { status: "UNSUBSCRIBED" } }),
    prisma.waitlistEntry.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  return { pending, invited, joined, unsubscribed, thisWeek, total: pending + invited + joined };
}

/**
 * CSV of everyone still willing to hear from us.
 *
 * Unsubscribed rows are excluded by construction rather than by a filter the
 * caller has to remember, because the most likely use of this file is pasting
 * addresses into something that sends mail.
 */
export async function exportWaitlistCsv(): Promise<string> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { status: { in: ["PENDING", "INVITED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      email: true, name: true, organisation: true, interest: true,
      status: true, source: true, createdAt: true, consentedAt: true,
    },
  });

  const escape = (value: string | null) =>
    value === null ? "" : `"${value.replaceAll('"', '""')}"`;

  const header = "email,name,organisation,interest,status,source,joined_list_at,consented_at";
  const lines = rows.map((row) =>
    [
      escape(row.email),
      escape(row.name),
      escape(row.organisation),
      escape(row.interest),
      escape(row.status),
      escape(row.source),
      escape(row.createdAt.toISOString()),
      escape(row.consentedAt.toISOString()),
    ].join(","),
  );

  return [header, ...lines].join("\n");
}
