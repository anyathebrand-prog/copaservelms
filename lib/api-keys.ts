import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ApiScope } from "@/app/generated/prisma/enums";

/**
 * API keys for machine access (PRD §13.3).
 *
 * Only a hash is stored. A key readable from the database is a second copy of
 * the credential, and a leak discovered late is usually a leak that sat in a
 * table someone could select from. The key is shown once, at creation, and
 * cannot be recovered afterwards — only replaced.
 *
 * Keys are matched by hash lookup rather than by scanning and comparing, so
 * verification cost does not grow with the number of issued keys.
 */

const PREFIX = "cs_live_";
/** Enough entropy that guessing is not a strategy. */
const KEY_BYTES = 24;

export type ApiKeyError = "NOT_FOUND" | "INVALID" | "FORBIDDEN";
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiKeyError; detail?: string };

export type AuthenticatedKey = {
  id: string;
  name: string;
  scopes: ApiScope[];
  organizationId: string | null;
};

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Issue a key.
 *
 * The plaintext is returned exactly once. Everything after this point works
 * from the hash.
 */
export async function createApiKey(
  input: {
    name: string;
    scopes: ApiScope[];
    organizationId?: string | null;
    expiresAt?: Date | null;
  },
  actorId: string,
): Promise<Result<{ id: string; key: string; prefix: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "INVALID", detail: "A key needs a name." };
  if (input.scopes.length === 0) {
    return { ok: false, error: "INVALID", detail: "A key with no scopes can do nothing." };
  }

  // Organisation scopes are meaningless without an organisation to scope to.
  const orgScoped = input.scopes.some((scope) => scope === "ORG_READ" || scope === "ORG_WRITE");
  if (orgScoped && !input.organizationId) {
    return { ok: false, error: "INVALID", detail: "Organisation scopes require an organisation." };
  }

  const secret = randomBytes(KEY_BYTES).toString("base64url");
  const key = `${PREFIX}${secret}`;

  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.apiKey.create({
      data: {
        name,
        hashedKey: hash(key),
        // Enough to recognise a key in a list, not enough to use it.
        prefix: key.slice(0, PREFIX.length + 6),
        scopes: input.scopes,
        organizationId: input.organizationId || null,
        createdById: actorId,
        expiresAt: input.expiresAt ?? null,
      },
      select: { id: true, prefix: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "api_key.create",
        entityType: "ApiKey",
        entityId: record.id,
        after: { name, scopes: input.scopes, organizationId: input.organizationId ?? null },
      },
    });

    return record;
  });

  return { ok: true, data: { id: created.id, key, prefix: created.prefix } };
}

/**
 * Resolve a presented key, or null.
 *
 * Returns null for absent, malformed, unknown, revoked, and expired alike: an
 * API client has no business learning which of those it is, and the difference
 * is exactly what a probe would measure.
 */
export async function authenticateApiKey(header: string | null): Promise<AuthenticatedKey | null> {
  if (!header) return null;

  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  if (!presented.startsWith(PREFIX)) return null;

  const record = await prisma.apiKey.findUnique({
    where: { hashedKey: hash(presented) },
    select: {
      id: true, name: true, scopes: true, organizationId: true,
      revokedAt: true, expiresAt: true, hashedKey: true,
    },
  });

  if (!record) return null;

  // The lookup already matched on hash; this compares in constant time so the
  // comparison itself cannot be timed even in principle.
  const expected = Buffer.from(record.hashedKey);
  const actual = Buffer.from(hash(presented));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  if (record.revokedAt !== null) return null;
  if (record.expiresAt !== null && record.expiresAt.getTime() < Date.now()) return null;

  // Recorded so an unused or compromised key can be spotted. Deliberately not
  // awaited: usage tracking should not slow or fail a request.
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    id: record.id,
    name: record.name,
    scopes: record.scopes,
    organizationId: record.organizationId,
  };
}

export function hasScope(key: AuthenticatedKey, scope: ApiScope): boolean {
  return key.scopes.includes(scope);
}

export async function revokeApiKey(id: string, actorId: string): Promise<Result<null>> {
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { id: true, name: true, revokedAt: true } });
  if (!key) return { ok: false, error: "NOT_FOUND" };

  // Revocation is permanent: a key cannot be un-leaked.
  if (key.revokedAt === null) {
    await prisma.$transaction([
      prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          actorId,
          action: "api_key.revoke",
          entityType: "ApiKey",
          entityId: id,
          after: { name: key.name },
        },
      }),
    ]);
  }

  return { ok: true, data: null };
}

export async function listApiKeys() {
  return prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, name: true, prefix: true, scopes: true, lastUsedAt: true,
      expiresAt: true, revokedAt: true, createdAt: true,
      organization: { select: { name: true } },
      createdBy: { select: { email: true } },
    },
  });
}
