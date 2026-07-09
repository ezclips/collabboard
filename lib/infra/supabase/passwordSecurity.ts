import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-020: narrow raw-passthrough wrappers for the password/passkey
 * settings page. All calls run on the STANDARD cookie/browser client -
 * never the legacy bearer client.
 *
 * DELIBERATE house-style exception (same ruling as the legacy-token
 * quarantine): these return RAW supabase shapes, not Result - the page's
 * error handling and toast texts consume { data, error } directly, and a
 * behavior-preserving extraction must not translate them. When password/MFA
 * gets a real domain command (post-023 program), these become its infra
 * edge or are replaced by it. Do not add consumers beyond the pages the
 * patches name.
 */

export function listMfaFactors() {
    return createBrowserSupabaseClient().auth.mfa.listFactors();
}

export function getAuthenticatorAssuranceLevel() {
    return createBrowserSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel();
}

export function registerWebauthnPasskey(friendlyName: string) {
    return createBrowserSupabaseClient().auth.mfa.webauthn.register({ friendlyName });
}

export function authenticateWebauthnPasskey(factorId: string) {
    return createBrowserSupabaseClient().auth.mfa.webauthn.authenticate({ factorId });
}

export function unenrollMfaFactor(factorId: string) {
    return createBrowserSupabaseClient().auth.mfa.unenroll({ factorId });
}

export function getCurrentAuthUser() {
    return createBrowserSupabaseClient().auth.getUser();
}

export function reauthenticateWithPassword(email: string, password: string) {
    return createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
}

export function updateCurrentUserPassword(password: string) {
    return createBrowserSupabaseClient().auth.updateUser({ password });
}

export function findProfileEmailById(userId: string) {
    return createBrowserSupabaseClient()
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
}
