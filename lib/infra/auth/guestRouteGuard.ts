/**
 * PATCH-358. Guests stay on their boards.
 *
 * A guest (a Supabase user with `is_anonymous: true`) may open a board canvas --
 * `/dashboard/canvas/<id>` and its sub-paths -- but every other `/dashboard`
 * page sends them to `/guest` instead. The decision is a pure function so the
 * middleware's one rule has a unit test; the middleware itself only calls it.
 */

/** `/dashboard/canvas/<id>` and its sub-paths. */
const CANVAS_PATH = /^\/dashboard\/canvas\/[^/]+(?:\/.*)?$/;

/**
 * The path a guest should be redirected to, or null to let the request through.
 * Non-guests and non-dashboard paths are always null.
 */
export function guestRedirectPath(pathname: string, isAnonymous: boolean): string | null {
  if (!isAnonymous) return null;
  if (pathname !== '/dashboard' && !pathname.startsWith('/dashboard/')) return null;
  if (CANVAS_PATH.test(pathname)) return null;
  return '/guest';
}
