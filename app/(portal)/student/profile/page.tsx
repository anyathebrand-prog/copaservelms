import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { listVerifiedFactors } from "@/lib/mfa";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";

export const metadata: Metadata = { title: "Profile" };

/**
 * Profile (PRD §9.8).
 *
 * Read-only for now. Editing, consent preferences, and the data-export /
 * deletion controls belong with the Privacy Center, which is its own Phase 1
 * item (§12.2) — shipping a half-wired consent toggle would be worse than
 * shipping none.
 */
export default async function ProfilePage() {
  const user = await requireUser("/student/profile");
  const factors = await listVerifiedFactors();
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: {
      firstName: true,
      lastName: true,
      displayName: true,
      bio: true,
      profession: true,
      organizationName: true,
      country: true,
      phone: true,
      xpPoints: true,
      currentStreak: true,
      longestStreak: true,
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Profile</h1>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={`${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()} />
          <Field label="Email" value={user.email} />
          <Field label="Profession" value={profile?.profession} />
          <Field label="Organisation" value={profile?.organizationName} />
          <Field label="Country" value={profile?.country} />
          <Field label="Phone" value={profile?.phone} />
          <Field label="Roles" value={user.roles.join(", ")} />
        </dl>

        {profile?.bio && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bio</p>
            <p className="mt-1 text-sm">{profile.bio}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display font-semibold">Learning stats</h2>
        <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">XP</dt>
            <dd className="font-display text-xl font-bold">{profile?.xpPoints ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current streak</dt>
            <dd className="font-display text-xl font-bold">{profile?.currentStreak ?? 0}d</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Longest streak</dt>
            <dd className="font-display text-xl font-bold">{profile?.longestStreak ?? 0}d</dd>
          </div>
        </dl>
      </section>

      <TwoFactorSetup factors={factors} />

      <p className="text-sm text-muted-foreground">
        Profile editing, consent preferences, and data export arrive with the Privacy Center.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
