# PATCH-327 — Link preview: re-check every redirect (SSRF)

## Why
Found while building PATCH-326. `app/api/link-preview/route.ts` checks the
pasted URL's host (blocklist + DNS) and then calls `fetch(url)` with the
default `redirect: 'follow'`. A public page that answers `302 Location:
http://169.254.169.254/…` (or any internal host) is followed without a check,
so the server can be steered to internal addresses. Owner approved the fix
2026-10-08.

## Design
1. `lib/server/net/publicUrlGuard.ts`: add a general
   `fetchPublicText(url, { maxBytes, accept, userAgent, timeoutMs,
   fetchImpl, lookup })` holding the existing redirect loop (manual
   redirects, `assertPublicUrl` on EVERY hop, at most 3, timeout, bounded
   read). Upstream non-2xx must be distinguishable by callers (keep
   `PublicUrlError` reason `upstream_error` + `status`). `fetchIcsText`
   becomes a thin wrapper with today's values — its behaviour and tests stay
   exactly the same.
2. `app/api/link-preview/route.ts`:
   - Keep auth and the `http:`/`https:`-only check (do NOT accept webcal
     here — check the scheme before calling the guard).
   - Replace the inline blocklist + DNS check + `fetch` with
     `fetchPublicText(url, { maxBytes: 2 MB, accept: 'text/html,*/*',
     userAgent: <the current LinkPreviewBot UA>, timeoutMs: 10 s })`.
   - Same responses as today: `blocked_host`/`invalid_url` → 400
     "URL host is not allowed" / "Invalid URL"; `dns_failed` → 400 "Could not
     resolve hostname"; `upstream_error` → today's fallback JSON (url, domain,
     favicon, empty title/description/image); `too_large`, `network_error`,
     `too_many_redirects` → the same fallback JSON (a preview without
     metadata, not an error). Everything after the HTML is read (meta
     parsing, YouTube thumbnail) unchanged.

## Tests
- New `app/api/link-preview/route.test.ts` (or under lib/server): 401;
  non-http scheme → 400; private literal host → 400; a public page that
  redirects to `http://169.254.169.254/` → refused (fetch never called for
  the private hop); normal page → title/description parsed as before;
  upstream 404 → fallback JSON.
- Guard: `fetchPublicText` passes the given accept/user-agent; existing
  `fetchIcsText` tests unchanged and green.

## Verification
Focused tests; full vitest gate; `npx tsc --noEmit`. I verify live: a link
post preview for a normal site still shows title and image.

## Allowed files
lib/server/net/publicUrlGuard.ts (+ its test), app/api/link-preview/route.ts,
a new test for it. No git writes, no database.
