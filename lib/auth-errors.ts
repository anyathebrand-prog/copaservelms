/**
 * Supabase auth failures, in words the person reading them can act on.
 *
 * Matched on `error.code`, which is a stable identifier, rather than on the
 * message text, which is written for developers and changes without notice.
 * Supabase's own wording reaches the screen otherwise: a learner who is told
 * "email rate limit exceeded" has been given a server's internal accounting
 * problem and no idea whether to wait, retry, or give up.
 *
 * Only failures a person can do something about are translated. Anything else
 * keeps Supabase's message, because a vague "something went wrong" is worse
 * than an odd but specific one when it reaches a support conversation.
 */
const MESSAGES: Record<string, string> = {
  // The project's mail allowance for the hour is spent. Retrying immediately
  // fails again, so the only useful advice is to wait or use another method.
  over_email_send_rate_limit:
    "We are sending more emails than usual right now, so this did not go through. Please try again in a little while, or use one of the other sign-in options.",

  // Sent while the project is still on Supabase's built-in mail service, which
  // only delivers to the project's own team.
  email_address_not_authorized:
    "We cannot send email to that address at the moment. Please use one of the other sign-in options, or contact us at info@copaserve.com.ng.",

  over_request_rate_limit:
    "Too many attempts from this device. Please wait a few minutes and try again.",
  over_sms_send_rate_limit:
    "Too many codes have been sent to that number. Please wait a few minutes and try again.",

  invalid_credentials:
    "That email and password do not match an account. If you signed up with Google, use Continue with Google instead.",
  email_not_confirmed:
    "Confirm your email address first — open the link in the message we sent you, then sign in.",
  email_provider_disabled:
    "Signing up with an email address is switched off at the moment. Please use one of the other sign-in options.",
  signup_disabled: "New accounts are closed at the moment.",

  otp_expired: "That code or link has expired. Request a new one and try again.",
  validation_failed: "Please check the details you entered and try again.",
};

/** Supabase sends `code` on current servers; older ones only set `message`. */
export function authErrorMessage(error: { code?: string; message: string } | null): string {
  if (!error) return "Something went wrong. Please try again.";

  const known = error.code ? MESSAGES[error.code] : undefined;
  if (known) return known;

  // Fallback for a server that did not send a code. Rate limiting is the one
  // case worth catching this way, because retrying is the wrong move and the
  // person needs to be told to wait.
  if (/rate limit|too many/i.test(error.message)) {
    return MESSAGES.over_request_rate_limit;
  }

  return error.message;
}
