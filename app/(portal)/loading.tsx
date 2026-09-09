import { LoadingPanel } from "@/components/brand/mark-loader";

/**
 * Shown while a portal page's data is on its way.
 *
 * Portal routes are dynamic and every one of them queries the database, so
 * there is a real gap between the click and the page. This fills it inside the
 * existing chrome — the header and navigation stay put and only the canvas
 * waits, which is the difference between "loading" and "gone".
 */
export default function PortalLoading() {
  return <LoadingPanel label="Loading your page" />;
}
