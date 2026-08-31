import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getSettings } from "@/lib/settings";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** Institution branding and platform settings (PRD §13.3). */
export default async function SettingsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/settings");
  const settings = await getSettings();

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          How the institution appears on certificates and in email. These used to be deployment
          settings, so changing the name on a certificate meant a release.
        </p>
      </header>

      <form action={updateSettingsAction} className="space-y-5 rounded-2xl border border-border bg-surface p-6">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Awarding institution</span>
          <input
            name="institutionName"
            required
            defaultValue={settings.institutionName}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Printed on every certificate and shown on the public verification page.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Support email</span>
          <input
            name="supportEmail"
            type="email"
            defaultValue={settings.supportEmail ?? ""}
            placeholder="support@copaserve.ng"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Shown in the footer of notification emails.
          </span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Signatory name</span>
            <input
              name="signatoryName"
              defaultValue={settings.signatoryName ?? ""}
              placeholder="Leave blank to use the instructor"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Signatory title</span>
            <input
              name="signatoryTitle"
              defaultValue={settings.signatoryTitle ?? ""}
              placeholder="Registrar"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          A signatory here signs every certificate. Left blank, each certificate is signed by the
          instructor who taught the course.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Logo URL</span>
          <input
            name="logoUrl"
            type="url"
            defaultValue={settings.logoUrl ?? ""}
            placeholder="https://… (leave blank to use the CopaServe mark)"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Used on certificates. Must be https and reachable from the server at issuance.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Primary colour</span>
          <div className="flex items-center gap-3">
            <input
              name="primaryColor"
              defaultValue={settings.primaryColor}
              pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"
              className="w-40 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none transition focus:border-brand"
            />
            <span
              aria-hidden
              className="size-9 rounded-lg border border-border"
              style={{ backgroundColor: settings.primaryColor }}
            />
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            Used for the button in notification emails. The app&rsquo;s own theme is set in code.
          </span>
        </label>

        <SubmitButton
          pendingLabel="Saving..."
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Save settings
        </SubmitButton>
      </form>

      <p className="rounded-lg bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
        Changes apply to certificates issued from now on. Certificates already issued keep the
        details they were signed with, which is deliberate — a certificate records what was
        attested at the time, not what the institution is called today.
      </p>
    </div>
  );
}
