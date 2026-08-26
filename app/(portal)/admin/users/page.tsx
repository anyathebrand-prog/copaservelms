import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getUsers, isSuperAdmin } from "@/lib/admin";
import { setUserRoleAction, setUserStatusAction } from "../actions";
import type { RoleName, UserStatus } from "@/app/generated/prisma/enums";

export const metadata: Metadata = { title: "User management" };

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "ACTIVE", label: "Active" },
  { id: "SUSPENDED", label: "Suspended" },
];

/** User management (PRD §13.2). */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; role?: string; q?: string }>;
}) {
  const actor = await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/users");
  const { status = "ALL", role, q } = await searchParams;

  const users = await getUsers({
    status: status === "ALL" ? undefined : (status as UserStatus),
    role: role as RoleName | undefined,
    query: q,
  });

  const superAdmin = isSuperAdmin(actor.roles);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">User management</h1>
        {!superAdmin && (
          <p className="mt-1 text-sm text-muted-foreground">
            Granting Admin or Super Admin requires Super Admin.
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.id}
            href={`/admin/users?status=${filter.id}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              status === filter.id ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
            }`}
          >
            {filter.label}
          </Link>
        ))}

        <form className="ml-auto" action="/admin/users">
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by email"
            aria-label="Search users by email"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </form>
      </div>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No users match this filter.
        </p>
      ) : (
        <ul className="space-y-3">
          {users.map((user) => {
            const roles = user.roles.map((r) => r.role.name);
            const isSelf = user.id === actor.id;
            const targetIsSuper = roles.includes("SUPER_ADMIN");
            // An admin may not act on a Super Admin; only another Super Admin may.
            const canActOnUser = !isSelf && (!targetIsSuper || superAdmin);

            return (
              <li key={user.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {user.profile?.firstName} {user.profile?.lastName}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user._count.enrollments} enrolments · {user._count.coursesTaught} courses taught ·
                      joined {user.createdAt.toLocaleDateString("en-NG")}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.status === "ACTIVE"
                          ? "bg-success/10 text-success"
                          : user.status === "SUSPENDED"
                            ? "bg-danger/10 text-danger"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      {user.status.toLowerCase()}
                    </span>
                    {roles.map((roleName) => (
                      <span
                        key={roleName}
                        className="rounded-full bg-brand-pale px-2.5 py-0.5 text-xs font-semibold text-brand"
                      >
                        {roleName.toLowerCase().replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </div>

                {canActOnUser && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    {user.status !== "ACTIVE" && (
                      <StatusButton userId={user.id} status="ACTIVE" label="Activate" tone="primary" />
                    )}
                    {user.status === "ACTIVE" && (
                      <StatusButton userId={user.id} status="SUSPENDED" label="Suspend" tone="danger" />
                    )}

                    {!roles.includes("INSTRUCTOR") ? (
                      <RoleButton userId={user.id} role="INSTRUCTOR" grant label="Approve as instructor" />
                    ) : (
                      <RoleButton userId={user.id} role="INSTRUCTOR" grant={false} label="Revoke instructor" />
                    )}

                    {superAdmin &&
                      (!roles.includes("ADMIN") ? (
                        <RoleButton userId={user.id} role="ADMIN" grant label="Make admin" />
                      ) : (
                        <RoleButton userId={user.id} role="ADMIN" grant={false} label="Revoke admin" />
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusButton({
  userId,
  status,
  label,
  tone,
}: {
  userId: string;
  status: UserStatus;
  label: string;
  tone: "primary" | "danger";
}) {
  return (
    <form action={setUserStatusAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={
          tone === "primary"
            ? "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            : "rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
        }
      >
        {label}
      </button>
    </form>
  );
}

function RoleButton({
  userId,
  role,
  grant,
  label,
}: {
  userId: string;
  role: RoleName;
  grant: boolean;
  label: string;
}) {
  return (
    <form action={setUserRoleAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="grant" value={String(grant)} />
      <button
        type="submit"
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
      >
        {label}
      </button>
    </form>
  );
}
