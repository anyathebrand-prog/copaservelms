export function SignOutButton() {
  // A form POST rather than a link: sign-out must not be triggerable by a
  // prefetch or a stray GET.
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-surface-muted"
      >
        Sign out
      </button>
    </form>
  );
}
