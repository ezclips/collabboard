import type { AuthUser } from '../../domain/auth/user';
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
