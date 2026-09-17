import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Corporate enquiries from the public site.
 *
 * This exists because the alternative was worse. "Talk to us" was a mailto
 * against a setting nobody had filled in, so it fell back to a link that could
 * not answer an enquiry — first the waitlist, then signup. A published address
 * is also scraped within days of going up, and the person it belongs to then
 * spends their week deleting things.
 *
 * No account required, and deliberately so: somebody evaluating training for
 * two hundred staff will not create a login to ask a question, and asking them
 * to is how an enquiry becomes a bounce.
 *
 * Unauthenticated means hostile input. Everything is length-capped before it
 * reaches the database, the submitter is rate limited by address, and nothing
 * typed here is ever echoed back into a page as markup.
 *
 * What this is NOT is a marketing list. There is no consent box because none is
 * being asked for: replying to somebody who wrote to you is correspondence, and
 * adding them to a campaign would be a separate purpose needing a separate
 * permission. The distinction matters on a platform that teaches the NDPA.
 */

export type EnquiryError = "INVALID" | "TOO_MANY";
export type Result<T> = { ok: true; data: T } | { ok: false; error: EnquiryError; detail: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Caps, applied before anything is written. */
const LIMITS = {
  name: 120,
  email: 200,
  organisation: 160,
  phone: 40,
  staffCount: 40,
  message: 4000,
  source: 80,
} as const;

/** Three enquiries an hour from one address is already generous for a real one. */
const SUBMIT_LIMIT = 3;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

export type EnquiryInput = {
  name: string;
  email: string;
  organisation?: string | null;
  phone?: string | null;
  staffCount?: string | null;
  message: string;
  source?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function clean(value: string | null | undefined, limit: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

export async function submitEnquiry(input: EnquiryInput): Promise<Result<{ id: string }>> {
  const name = clean(input.name, LIMITS.name);
  const email = clean(input.email, LIMITS.email)?.toLowerCase() ?? null;
  const message = clean(input.message, LIMITS.message);

  if (!name) return { ok: false, error: "INVALID", detail: "Please tell us your name." };
  if (!email || !EMAIL.test(email)) {
    return { ok: false, error: "INVALID", detail: "That does not look like an email address." };
  }
  if (!message || message.length < 10) {
    return {
      ok: false,
      error: "INVALID",
      detail: "Please say a little about what you need, so we can reply usefully.",
    };
  }

  // Keyed on the address rather than the IP: a whole organisation can share one
  // address at the edge, and locking out a company because a colleague wrote
  // first would defeat the point of the form.
  const limit = rateLimit(`enquiry:${email}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS);
  if (!limit.ok) {
    return {
      ok: false,
      error: "TOO_MANY",
      detail: "We already have your message and will reply shortly.",
    };
  }

  const enquiry = await prisma.enquiry.create({
    data: {
      name,
      email,
      organisation: clean(input.organisation, LIMITS.organisation),
      phone: clean(input.phone, LIMITS.phone),
      staffCount: clean(input.staffCount, LIMITS.staffCount),
      message,
      source: clean(input.source, LIMITS.source),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });

  await notifyAdmins(enquiry.id, name, clean(input.organisation, LIMITS.organisation));

  return { ok: true, data: { id: enquiry.id } };
}

/**
 * Tell the people who can answer it.
 *
 * Never throws: an enquiry that is saved but not announced is recoverable from
 * the admin page, where an enquiry lost because the notification failed is not.
 * Imported lazily so the public form does not drag the email and SMS drivers
 * into its module graph.
 */
async function notifyAdmins(
  enquiryId: string,
  name: string,
  organisation: string | null,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } } } },
      },
      select: { id: true },
      take: 20,
    });

    if (admins.length === 0) return;

    const { sendNotification } = await import("@/lib/notifications");

    await Promise.all(
      admins.map((admin) =>
        sendNotification({
          userId: admin.id,
          kind: "enquiry.received",
          title: "New corporate enquiry",
          body: `${name}${organisation ? ` from ${organisation}` : ""} has asked about CopaServe for their organisation.`,
          actionUrl: "/admin/enquiries",
          channels: ["EMAIL"],
          metadata: { enquiryId },
        }),
      ),
    );
  } catch (cause) {
    console.error("[enquiries] could not announce enquiry", enquiryId, cause);
  }
}

// --- reading, for the people who answer them --------------------------------

export async function listEnquiries(status?: "NEW" | "IN_PROGRESS" | "CLOSED") {
  return prisma.enquiry.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      organisation: true,
      phone: true,
      staffCount: true,
      message: true,
      status: true,
      source: true,
      notes: true,
      handledAt: true,
      createdAt: true,
      handledBy: { select: { profile: { select: { displayName: true, firstName: true } } } },
    },
  });
}

export async function getEnquirySummary() {
  const grouped = await prisma.enquiry.groupBy({ by: ["status"], _count: true });
  const counts = { NEW: 0, IN_PROGRESS: 0, CLOSED: 0, total: 0 };

  for (const row of grouped) {
    counts[row.status] = row._count;
    counts.total += row._count;
  }

  return counts;
}

/**
 * Move an enquiry along.
 *
 * Records who did it, because "has anyone replied to this?" is the question an
 * inbox shared by four people cannot answer and the reason enquiries get
 * answered twice or not at all.
 */
export async function setEnquiryStatus(
  enquiryId: string,
  status: "NEW" | "IN_PROGRESS" | "CLOSED",
  actorId: string,
  notes?: string | null,
): Promise<Result<{ id: string }>> {
  const existing = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true },
  });

  if (!existing) return { ok: false, error: "INVALID", detail: "That enquiry no longer exists." };

  await prisma.enquiry.update({
    where: { id: enquiryId },
    data: {
      status,
      handledById: actorId,
      handledAt: new Date(),
      ...(notes !== undefined ? { notes: clean(notes, 2000) } : {}),
    },
  });

  return { ok: true, data: { id: enquiryId } };
}
