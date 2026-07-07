import { domainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import { asUserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from './browserClient';

export interface CurrentUser {
  readonly id: UserId;
  readonly email: string | null;
}

export async function getCurrentUserId(): Promise<Result<UserId | null>> {
  try {
    const {
      data: { user },
      error,
    } = await createBrowserSupabaseClient().auth.getUser();

    if (error) {
      return err(domainError('unavailable', 'Could not load current user', { cause: error }));
    }

    return ok(user ? asUserId(user.id) : null);
  } catch (cause: unknown) {
    return err(domainError('unavailable', 'Could not load current user', { cause }));
  }
}

export async function getCurrentUser(): Promise<Result<CurrentUser | null>> {
  try {
    const {
      data: { user },
      error,
    } = await createBrowserSupabaseClient().auth.getUser();

    if (error) {
      return err(domainError('unavailable', 'Could not load current user', { cause: error }));
    }

    return ok(user ? { id: asUserId(user.id), email: user.email ?? null } : null);
  } catch (cause: unknown) {
    return err(domainError('unavailable', 'Could not load current user', { cause }));
  }
}
