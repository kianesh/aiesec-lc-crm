// A message explaining why a sign-in that Supabase accepted was undone.
//
// Rejecting an account happens *after* `setSession`, so the auth listener has
// already routed away from /sign-in and unmounted it. Component state can't
// survive that, and the screen that remounts a moment later would otherwise be
// blank with no hint about what went wrong.

let notice: string | null = null;

export function setAuthNotice(message: string) {
  notice = message;
}

/** Reads the pending notice and clears it, so it shows exactly once. */
export function takeAuthNotice() {
  const pending = notice;
  notice = null;
  return pending;
}
