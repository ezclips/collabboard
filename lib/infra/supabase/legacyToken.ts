import { createClient } from '@supabase/supabase-js';
import type { StorageGateway, StorageSupabaseClient } from './storage';
import { SupabaseStorageGateway } from './storage';

/**
 * LEGACY BEARER-CLIENT MACHINERY (post-PATCH-024). The localStorage token
 * scavengers that used to live here were REMOVED by PATCH-024 (scavenger
 * normalization - tokens now come from the real cookie session via
 * sessionToken.ts). What remains is the per-call bearer-client
 * construction and the raw auth passthroughs the profile page still
 * consumes; they take a session token as an ARGUMENT and make no
 * assumption about where it came from. Scheduled for replacement when
 * profile auth gets a real domain command (post-canvas program); until
 * then do not "improve" these, and do not add consumers beyond the pages
 * the patches name.
 *
 * (This header once said "PATCH-023 removes this file" - the plan was
 * renumbered on 2026-07-09: 023 became the v1-vertical deletion and the
 * normalization patch is PATCH-024, this one.)
 *
 * DELIBERATE house-style exception: the auth helpers below return RAW
 * supabase shapes (not Result) - the legacy pages' error handling and
 * toast texts consume those shapes directly.
 */

// Create a supabase client with the access token explicitly set so RLS sees auth.uid()
export const makeAuthedClient = (token: string) => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
);

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
