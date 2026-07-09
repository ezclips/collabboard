import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

/**
 * Mirrors the nine columns the profile page consumes today (select('*'),
 * consumption census PATCH-018). Loose by design; snake_case kept
 * deliberately - the page maps these fields into its own state shape.
 */
export interface ProfileRow {
  readonly id: string;
  readonly display_name: string | null;
  readonly username: string | null;
  readonly about: string | null;
  readonly class_info: string | null;
  readonly language: string | null;
  readonly account_type: string | null;
  readonly avatar_url: string | null;
  readonly beta_features: boolean | null;
}

export interface ProfilesRepository {
  /** null = no profiles row yet (maybeSingle semantics, not an error). */
  findById(userId: UserId): Promise<Result<ProfileRow | null, DomainError>>;
  /** true = an existing row was updated; false = no row matched. */
  updatePatch(
    userId: UserId,
    email: string,
    patch: Record<string, unknown>,
    now: string,
  ): Promise<Result<boolean, DomainError>>;
  insertPatch(
    userId: UserId,
    email: string,
    patch: Record<string, unknown>,
    now: string,
  ): Promise<Result<void, DomainError>>;
}

/** Dynamic by design - the legacy page sends arbitrary field patches. */
export const saveProfilePatchSchema = z.object({
  email: z.string(),
  patch: z.record(z.string(), z.unknown()),
});

export const createSaveProfilePatchCommand = (repository: ProfilesRepository) =>
  defineCommand({
    name: 'profile.savePatch',
    input: saveProfilePatchSchema,
    execute: async (input, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save the profile'),
        );
      }
      // ONE timestamp - the legacy page used a single `now` for update AND
      // for insert's created_at + updated_at.
      const now = new Date().toISOString();
      // Legacy control flow preserved (PATCH-018): update first; only when
      // NO row matched, insert. Errors pass through untouched so the raw
      // supabase error stays available as `cause` for the page's toasts.
      const updated = await repository.updatePatch(ctx.userId, input.email, input.patch, now);
      if (!updated.ok) return updated;
      if (updated.value) return ok(undefined);
      return repository.insertPatch(ctx.userId, input.email, input.patch, now);
    },
  });
