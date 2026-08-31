import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Platform settings (PRD §13.3).
 *
 * The institution name, mark, and signatory used to be environment variables,
 * so changing the name printed on a certificate meant a redeploy. They are
 * content rather than configuration, and the people who own them are not the
 * people who deploy.
 *
 * Reads are memoised per request. Several things on one page want the
 * institution name — the footer, an email being composed, a certificate being
 * rendered — and each repeat would otherwise be another query.
 */

export type PlatformSettings = {
  institutionName: string;
  supportEmail: string | null;
  logoUrl: string | null;
  primaryColor: string;
  signatoryName: string | null;
  signatoryTitle: string | null;
};

const FALLBACK: PlatformSettings = {
  institutionName: "Business Intelligence Technologies Limited",
  supportEmail: null,
  logoUrl: null,
  primaryColor: "#0a510e",
  signatoryName: null,
  signatoryTitle: null,
};

export const getSettings = cache(async function getSettings(): Promise<PlatformSettings> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { id: "singleton" },
      select: {
        institutionName: true, supportEmail: true, logoUrl: true,
        primaryColor: true, signatoryName: true, signatoryTitle: true,
      },
    });

    return row ?? FALLBACK;
  } catch {
    // Settings are decoration on most pages and identity on a few. Neither is
    // worth failing a request over, so a database hiccup falls back rather
    // than taking the page down.
    return FALLBACK;
  }
});

export type SettingsError = "INVALID";
export type Result<T> = { ok: true; data: T } | { ok: false; error: SettingsError; detail: string };

/** #rgb or #rrggbb — anything else would silently break the colour it is used in. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function updateSettings(
  input: Partial<PlatformSettings>,
  actorId: string,
): Promise<Result<PlatformSettings>> {
  const institutionName = input.institutionName?.trim();
  if (institutionName !== undefined && institutionName.length === 0) {
    return { ok: false, error: "INVALID", detail: "The institution name cannot be empty — it appears on every certificate." };
  }

  const primaryColor = input.primaryColor?.trim();
  if (primaryColor && !HEX.test(primaryColor)) {
    return { ok: false, error: "INVALID", detail: "Use a hex colour such as #0a510e." };
  }

  const logoUrl = input.logoUrl?.trim() || null;
  if (logoUrl && !/^https:\/\//i.test(logoUrl)) {
    return { ok: false, error: "INVALID", detail: "The logo must be an https URL." };
  }

  const supportEmail = input.supportEmail?.trim() || null;
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    return { ok: false, error: "INVALID", detail: "That is not a valid email address." };
  }

  const data = {
    ...(institutionName !== undefined ? { institutionName } : {}),
    ...(primaryColor ? { primaryColor } : {}),
    logoUrl,
    supportEmail,
    signatoryName: input.signatoryName?.trim() || null,
    signatoryTitle: input.signatoryTitle?.trim() || null,
    updatedById: actorId,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.platformSetting.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
      select: {
        institutionName: true, supportEmail: true, logoUrl: true,
        primaryColor: true, signatoryName: true, signatoryTitle: true,
      },
    });

    // Branding appears on certificates, so a change to it is a change to what
    // the institution attests. That belongs in the audit trail (§6.2).
    await tx.auditLog.create({
      data: {
        actorId,
        action: "settings.update",
        entityType: "PlatformSetting",
        entityId: "singleton",
        after: row as never,
      },
    });

    return row;
  });

  return { ok: true, data: updated };
}

// ---------------------------------------------------------------------------
// Per-organisation branding (§13.3 white-labelling)
// ---------------------------------------------------------------------------

export type OrgBranding = { logoUrl: string | null; primaryColor: string | null };

export async function updateOrganizationBranding(
  organizationId: string,
  input: OrgBranding,
  actorId: string,
): Promise<Result<OrgBranding>> {
  if (input.primaryColor && !HEX.test(input.primaryColor)) {
    return { ok: false, error: "INVALID", detail: "Use a hex colour such as #0a510e." };
  }
  if (input.logoUrl && !/^https:\/\//i.test(input.logoUrl)) {
    return { ok: false, error: "INVALID", detail: "The logo must be an https URL." };
  }

  const branding: OrgBranding = {
    logoUrl: input.logoUrl?.trim() || null,
    primaryColor: input.primaryColor?.trim() || null,
  };

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: { logoUrl: branding.logoUrl, branding: branding as never },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "organization.branding.update",
        entityType: "Organization",
        entityId: organizationId,
        after: branding as never,
      },
    }),
  ]);

  return { ok: true, data: branding };
}

export function readOrgBranding(value: unknown): OrgBranding {
  const branding = (value ?? {}) as Partial<OrgBranding>;
  return {
    logoUrl: typeof branding.logoUrl === "string" ? branding.logoUrl : null,
    primaryColor:
      typeof branding.primaryColor === "string" && HEX.test(branding.primaryColor)
        ? branding.primaryColor
        : null,
  };
}
