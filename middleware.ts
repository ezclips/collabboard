import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();
    const supabase = createMiddlewareClient({ req, res });

    const {
        data: { session },
    } = await supabase.auth.getSession();

    // If user is not signed in and the current path is not /
    // redirect the user to /
    // Note: we can adjust protected routes logic here as needed, 
    // but the critical part is calling getSession to sync cookies.

    return res;
}

export const config = {
    matcher: [
        /*
         * Session-sync middleware runs ONLY on page navigations.
         * Excluded: _next assets, favicon, and ALL /api routes — route handlers
         * read/refresh auth cookies themselves via createRouteHandlerClient.
         * Rationale: getSession() here can trigger a token refresh against
         * Supabase's per-IP auth rate limit; running it on every API call kept
         * that limit exhausted and blocked password sign-ins (2026-07-07).
         *
         * /auth is also excluded: loading the login page with a stale session
         * cookie made this getSession() attempt a refresh-token exchange that
         * hit 429 (over_request_rate_limit) and rate-limited the subsequent
         * password sign-in before the user could submit (2026-07-13). The
         * login page manages stale cookies itself (staleSessionCleanup), and
         * /auth/callback is a route handler that syncs its own cookies.
         *
         * The exclusion is `auth(?:/|$)` (not a bare `auth` substring) so it
         * matches exactly `/auth` and `/auth/...` and never accidentally
         * swallows an unrelated future route like `/authors` or
         * `/authenticate` (CTO review 2026-07-14). This literal must stay
         * byte-for-byte identical to MIDDLEWARE_SESSION_SYNC_MATCHER in
         * lib/infra/auth/middlewareMatcher.ts — that copy is what the
         * regression tests in middlewareMatcher.test.ts actually exercise,
         * since Next.js requires this array to be a static literal (no
         * imports) that it can analyze at build time.
         */
        '/((?!_next/static/|_next/image(?:/|$)|favicon\\.ico$|api/|auth(?:/|$)).*)',
    ],
};
