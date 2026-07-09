import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-024: normalized token acquisition. The session lives in the
 * auth-helpers cookie; getSession reads it and refreshSession recovers an
 * expired one. This replaces every localStorage token scavenger the
 * legacy pages used (they predate the cookie-session login and failed
 * closed for cookie users). decodeJwtPayload moved here verbatim from
 * legacyToken.ts - it decodes, it does not scavenge.
 */

export type JwtPayload = {
    sub?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
};

export const decodeJwtPayload = (token: string): JwtPayload => {
    const [, payload = ''] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as JwtPayload;
};

export async function getSessionAccessToken(): Promise<string | null> {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token) return refreshed.session.access_token;
    return null;
}
