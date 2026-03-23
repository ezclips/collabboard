import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');
    const next = requestUrl.searchParams.get('next') || '/dashboard';

    if (error) {
        return NextResponse.redirect(new URL(`/auth?error=${error}`, requestUrl.origin));
    }

    if (code) {
        const supabase = createRouteHandlerClient({ cookies });
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) {
            console.error('Auth callback error:', sessionError);
            return NextResponse.redirect(new URL('/auth?error=callback_failed', requestUrl.origin));
        }
    }

    // URL to redirect to after sign in process completes
    return NextResponse.redirect(new URL(next, requestUrl.origin));
}
