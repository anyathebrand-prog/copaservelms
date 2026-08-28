import { AreaSwitcher } from "@/components/layout/area-switcher";
import { LogoLink } from "@/components/layout/logo";
import { requireUser } from "@/lib/roles";
import { SignOutButton } from "@/components/layout/sign-out-button";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <LogoLink height={26} />
            <AreaSwitcher roles={user.roles} />
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
