import { createClient } from '@supabase/supabase-js';
import type { StorageGateway, StorageSupabaseClient } from './storage';
import { SupabaseStorageGateway } from './storage';

/**
 * LEGACY-TOKEN QUARANTINE (PATCH-018). This file centralizes the profile
 * page's localStorage token scavenging + bearer-token client construction
 * VERBATIM so it exists in exactly one audited place. It is scheduled for
 * removal by PATCH-023 (scavenger normalization - a functional repair:
 * cookie-session users get an empty localStorage, so these helpers fail
 * closed for them today). PATCH-019 reuses this file. Do not "improve" it;
 * do not add consumers beyond the pages the patches name.
 *
 * DELIBERATE house-style exception: the auth helpers below return RAW
 * supabase shapes (not Result) - the legacy pages' error handling and toast
 * texts consume those shapes directly, and 023 replaces the helpers anyway.
 */

// Session is in localStorage, not cookies. Read the token directly.
export const getAccessToken = (): string | null => {
    try {
        const lsKeys = Object.keys(localStorage).filter(k => k.includes('auth-token'));
        for (const key of lsKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const token = Array.isArray(parsed) ? parsed[0]?.access_token : parsed?.access_token;
            if (token) return token;
        }
    } catch { /* ignore */ }
    return null;
};

// Create a supabase client with the access token explicitly set so RLS sees auth.uid()
export const makeAuthedClient = (token: string) => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
);

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

/** Raw passthrough (quarantine ruling 2): same return shape as supabase. */
export function legacyReauthenticateWithPassword(token: string, email: string, password: string) {
    return makeAuthedClient(token).auth.signInWithPassword({ email, password });
}

/** Raw passthrough (quarantine ruling 2): same return shape as supabase. */
export function legacyRequestEmailChange(token: string, newEmail: string, emailRedirectTo: string) {
    return makeAuthedClient(token).auth.updateUser({ email: newEmail }, { emailRedirectTo });
}

/** Pattern H reuse: the PATCH-017 gateway class over the legacy client. */
export function createLegacyTokenStorageGateway(token: string): StorageGateway {
    return new SupabaseStorageGateway(
        makeAuthedClient(token) as unknown as StorageSupabaseClient,
    );
}
