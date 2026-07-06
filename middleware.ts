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
         */
        '/((?!_next/static|_next/image|favicon.ico|api/).*)',
    ],
};
