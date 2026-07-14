/**
 * The Next.js middleware matcher pattern, as its own tested constant.
 *
 * `middleware.ts`'s `config.matcher` must be a literal Next.js can statically
 * analyze at build time (it cannot import this value), so this module is not
 * consumed at runtime — it exists so the exclusion regex has a test that
 * fails loudly if the two literals drift apart, after a substring-match bug
 * here (`auth` excluded `/authors` too) shipped without any regression test
 * to catch it (CTO review 2026-07-14). Keep this string byte-for-byte
 * identical to the one in middleware.ts's `config.matcher`.
 */
export const MIDDLEWARE_SESSION_SYNC_MATCHER =
  '/((?!_next/static|_next/image|favicon.ico|api/|auth(/.*)?$).*)';

/** True if the session-sync middleware runs on this pathname. */
export const middlewareRunsOn = (pathname: string): boolean =>
  new RegExp(`^${MIDDLEWARE_SESSION_SYNC_MATCHER}$`).test(pathname);
