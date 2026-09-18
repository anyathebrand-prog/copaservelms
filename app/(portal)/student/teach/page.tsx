import { permanentRedirect } from "next/navigation";

/**
 * Moved to /teach.
 *
 * Kept as a redirect rather than deleted: notifications already sent about an
 * application link here, and they sit in people's inboxes and notification
 * lists with no way to update them.
 */
export default function MovedTeachPage() {
  permanentRedirect("/teach");
}
