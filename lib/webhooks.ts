import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { WebhookEvent } from "@/app/generated/prisma/enums";

/**
 * Outbound webhooks (PRD §13.3).
 *
 * Partners are told what happened rather than polling for it. Three things
 * shape the design:
 *
 * - Every delivery is signed, so a receiver can tell ours from anyone else's.
 *   An unsigned webhook is an open invitation to post fabricated events at a
 *   partner's endpoint.
 * - Every attempt is recorded. "Did you send it?" is a question that comes up
 *   in every integration, and the honest answer needs evidence.
 * - Delivery never blocks the thing that caused it. Issuing a certificate must
 *   not fail because someone's endpoint is down.
 */

export type WebhookError = "NOT_FOUND" | "INVALID";
export type Result<T> = { ok: true; data: T } | { ok: false; error: WebhookError; detail?: string };

/** Retry schedule in minutes. Spread out, and finite. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 600];
/** Consecutive failures before an endpoint is switched off. */
const FAILURE_LIMIT = 20;

export function signPayload(secret: string, timestamp: number, body: string): string {
  // The timestamp is inside the signed material, so a captured delivery cannot
  // be replayed later with a fresh header.
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Verify a signature, for the receiving side.
 *
 * Exported so partners can be pointed at a reference implementation, and so
 * the tests check the same function a receiver would use.
 */
export function verifySignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  toleranceSeconds = 300,
): boolean {
  const age = Math.abs(Date.now() / 1000 - timestamp);
  if (age > toleranceSeconds) return false;

  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function createEndpoint(
  input: { name: string; url: string; events: WebhookEvent[]; organizationId?: string | null },
  actorId: string,
): Promise<Result<{ id: string; secret: string }>> {
  const name = input.name.trim();
  const url = input.url.trim();

  if (!name) return { ok: false, error: "INVALID", detail: "An endpoint needs a name." };
  // https only: a signed payload sent in the clear is still readable by anyone
  // on the path, and these carry names and course records.
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, error: "INVALID", detail: "The URL must be https." };
  }
  if (input.events.length === 0) {
    return { ok: false, error: "INVALID", detail: "Subscribe to at least one event." };
  }

  const secret = `whsec_${randomBytes(24).toString("base64url")}`;

  const endpoint = await prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        name, url, secret,
        events: input.events,
        organizationId: input.organizationId || null,
        createdById: actorId,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "webhook.create",
        entityType: "WebhookEndpoint",
        entityId: created.id,
        // The secret is deliberately absent from the audit entry.
        after: { name, url, events: input.events },
      },
    });

    return created;
  });

  return { ok: true, data: { id: endpoint.id, secret } };
}

export async function deleteEndpoint(id: string, actorId: string): Promise<Result<null>> {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { name: true } });
  if (!endpoint) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.webhookEndpoint.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "webhook.delete",
        entityType: "WebhookEndpoint",
        entityId: id,
        after: { name: endpoint.name },
      },
    }),
  ]);

  return { ok: true, data: null };
}

export async function setEndpointActive(id: string, isActive: boolean): Promise<Result<null>> {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { id: true } });
  if (!endpoint) return { ok: false, error: "NOT_FOUND" };

  await prisma.webhookEndpoint.update({
    where: { id },
    // Re-enabling clears the failure count, or an endpoint that was fixed
    // would be disabled again by history rather than by behaviour.
    data: { isActive, ...(isActive ? { failureCount: 0 } : {}) },
  });

  return { ok: true, data: null };
}

/**
 * Queue an event for every endpoint subscribed to it.
 *
 * Queues rather than sends: the caller is usually in the middle of something
 * that matters more, and a slow endpoint must not slow it down.
 */
export async function emitEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>,
  organizationId?: string | null,
): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      isActive: true,
      events: { has: event },
      // A platform-wide endpoint hears everything; an organisation endpoint
      // hears only its own organisation's events.
      ...(organizationId ? { OR: [{ organizationId: null }, { organizationId }] } : { organizationId: null }),
    },
    select: { id: true },
  });

  if (endpoints.length === 0) return 0;

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({
      endpointId: endpoint.id,
      event,
      payload: { event, occurredAt: new Date().toISOString(), data: payload } as never,
      nextAttemptAt: new Date(),
    })),
  });

  return endpoints.length;
}

/**
 * Attempt pending deliveries.
 *
 * Called by a schedule rather than run as a worker, because there is nowhere
 * for a worker to live on serverless. Each call takes a bounded batch so it
 * finishes well inside a function's time limit.
 */
export async function processPendingDeliveries(limit = 25): Promise<{
  attempted: number;
  delivered: number;
  failed: number;
}> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: {
      id: true, event: true, payload: true, attempts: true,
      endpoint: { select: { id: true, url: true, secret: true, failureCount: true } },
    },
  });

  let delivered = 0;
  let failed = 0;

  for (const delivery of due) {
    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(delivery.endpoint.secret, timestamp, body);
    const attempts = delivery.attempts + 1;

    let responseCode: number | null = null;
    let error: string | null = null;

    try {
      const response = await fetch(delivery.endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CopaServe-Event": delivery.event,
          "X-CopaServe-Timestamp": String(timestamp),
          "X-CopaServe-Signature": signature,
          "X-CopaServe-Delivery": delivery.id,
        },
        body,
        // A partner's endpoint hanging must not hold a function open.
        signal: AbortSignal.timeout(10_000),
      });

      responseCode = response.status;
      if (!response.ok) error = `Endpoint responded ${response.status}`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }

    const succeeded = responseCode !== null && responseCode >= 200 && responseCode < 300;

    if (succeeded) {
      delivered += 1;
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "DELIVERED", attempts, responseCode,
            deliveredAt: new Date(), nextAttemptAt: null, error: null,
          },
        }),
        prisma.webhookEndpoint.update({
          where: { id: delivery.endpoint.id },
          data: { failureCount: 0, lastSuccessAt: new Date() },
        }),
      ]);
      continue;
    }

    failed += 1;
    const backoff = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
    const exhausted = attempts >= BACKOFF_MINUTES.length;
    const endpointFailures = delivery.endpoint.failureCount + 1;

    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          // Given up on rather than retried forever: an endpoint that has not
          // answered in ten hours is not about to.
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          responseCode,
          error,
          nextAttemptAt: exhausted ? null : new Date(Date.now() + backoff * 60_000),
        },
      }),
      prisma.webhookEndpoint.update({
        where: { id: delivery.endpoint.id },
        data: {
          failureCount: endpointFailures,
          // A dead endpoint is switched off, so its queue stops growing.
          ...(endpointFailures >= FAILURE_LIMIT ? { isActive: false } : {}),
        },
      }),
    ]);
  }

  return { attempted: due.length, delivered, failed };
}

export async function listEndpoints() {
  return prisma.webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, name: true, url: true, events: true, isActive: true,
      failureCount: true, lastSuccessAt: true, createdAt: true,
      organization: { select: { name: true } },
      // The secret is never selected: it is needed for signing, not for display.
      _count: { select: { deliveries: true } },
    },
  });
}

export async function listRecentDeliveries(endpointId?: string, limit = 25) {
  return prisma.webhookDelivery.findMany({
    where: endpointId ? { endpointId } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, event: true, status: true, attempts: true, responseCode: true,
      error: true, createdAt: true, deliveredAt: true, nextAttemptAt: true,
      endpoint: { select: { name: true } },
    },
  });
}
