export function SignOutButton() {
  // A form POST rather than a link: sign-out must not be triggerable by a
  // prefetch or a stray GET.
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white"
      >
        Sign out
      </button>
    </form>
  );
}
