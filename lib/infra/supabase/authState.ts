import type { AuthSession, AuthUser } from '../../domain/auth/user';
import { domainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from './browserClient';

/** Session read (no network validation - mirrors auth.getSession semantics). */
export async function getSessionUser(): Promise<Result<AuthUser | null>> {
  try {
    const {
      data: { session },
      error,
    } = await createBrowserSupabaseClient().auth.getSession();

    if (error) {
      return err(domainError('unavailable', 'Could not read auth session', { cause: error }));
    }

    return ok(session?.user ?? null);
  } catch (cause: unknown) {
    return err(domainError('unavailable', 'Could not read auth session', { cause }));
  }
}

/**
 * Server-VALIDATED user read (PATCH-037) - mirrors auth.getUser semantics
 * (the getSession sibling above reads the local session WITHOUT
 * validation; the two are not interchangeable). DELIBERATE no-catch,
 * unlike the siblings in this file: the one consumer (CanvasClient's
 * mount fetch) collapses a resolved error to null AT THE CALL SITE (its
 * legacy destructure never read the error - an auth service failure
 * renders as signed-out), while a THROWN failure must keep rejecting
 * through the un-awaited caller exactly as the raw call did (leaving
 * sessionReady false - an observably different channel).
 */
export async function getVerifiedAuthUser(): Promise<Result<AuthUser | null>> {
  const {
    data: { user },
    error,
  } = await createBrowserSupabaseClient().auth.getUser();

  if (error) {
    return err(domainError('unavailable', 'Could not load the signed-in user', { cause: error }));
  }

  return ok(user);
}

/**
 * Subscribe to auth state changes. Returns the unsubscribe function.
 * `event` passes through Supabase's event names ('SIGNED_IN', 'SIGNED_OUT', ...).
 */
export function onAuthUserChanged(
  callback: (event: string, user: AuthUser | null) => void,
): () => void {
  const {
    data: { subscription },
  } = createBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
    callback(event, session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}

/**
 * Subscribe to auth state changes, delivering the SESSION object (the
 * onAuthUserChanged sibling above maps to the user only - PATCH-037's
 * consumer stores the session itself). Returns the unsubscribe function.
 */
export function onAuthSessionChanged(
  callback: (event: string, session: AuthSession | null) => void,
): () => void {
  const {
    data: { subscription },
  } = createBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => subscription.unsubscribe();
}

export async function signOutCurrentUser(): Promise<Result<void>> {
  try {
    const { error } = await createBrowserSupabaseClient().auth.signOut();
    if (error) {
      return err(domainError('unavailable', 'Could not sign out', { cause: error }));
    }
    return ok(undefined);
  } catch (cause: unknown) {
    return err(domainError('unavailable', 'Could not sign out', { cause }));
  }
}

/**
 * Auth user_metadata write (PATCH-037). DELIBERATE no-catch: the one
 * consumer fires it void-discarded (fire-and-forget) - a resolved error
 * must stay silently discardable, and a THROWN network failure must keep
 * surfacing as the same unhandled rejection the raw call produced. NOT
 * the password wrapper: passwordSecurity.updateCurrentUserPassword sends
 * the { password } attribute family and is fenced to the password page;
 * this sends ONLY { data } (user_metadata).
 */
export async function updateCurrentUserMetadata(
  metadata: Record<string, unknown>,
): Promise<Result<void>> {
  const { error } = await createBrowserSupabaseClient().auth.updateUser({
    data: metadata,
  });

  if (error) {
    return err(domainError('unavailable', 'Could not save user preferences', { cause: error }));
  }

  return ok(undefined);
}
