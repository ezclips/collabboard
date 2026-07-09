import { describe, expect, it } from 'vitest';
import { createSaveProfilePatchCommand, type ProfilesRepository } from './profile';
import { asUserId } from '../core/ids';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const validInput = {
  email: 'user@example.com',
  patch: { display_name: 'Ada', beta_features: true },
};

function createFakeRepository() {
  const updatePatchCalls: Array<{
    userId: ReturnType<typeof asUserId>;
    email: string;
    patch: Record<string, unknown>;
    now: string;
  }> = [];
  const insertPatchCalls: Array<{
    userId: ReturnType<typeof asUserId>;
    email: string;
    patch: Record<string, unknown>;
    now: string;
  }> = [];

  let updatePatchResult: Result<boolean, DomainError> = ok(true);
  let insertPatchResult: Result<void, DomainError> = ok(undefined);

  const repository: ProfilesRepository = {
    findById: async () => ok(null),
    updatePatch: async (userId, email, patch, now) => {
      updatePatchCalls.push({ userId, email, patch, now });
      return updatePatchResult;
    },
    insertPatch: async (userId, email, patch, now) => {
      insertPatchCalls.push({ userId, email, patch, now });
      return insertPatchResult;
    },
  };

  return {
    repository,
    updatePatchCalls,
    insertPatchCalls,
    setUpdatePatchResult: (result: typeof updatePatchResult) => {
      updatePatchResult = result;
    },
    setInsertPatchResult: (result: typeof insertPatchResult) => {
      insertPatchResult = result;
    },
  };
}

describe('profile.savePatch', () => {
  it('rejects missing userId', async () => {
    const fakes = createFakeRepository();
    const command = createSaveProfilePatchCommand(fakes.repository);

    const result = await command(validInput, { userId: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('permission_denied');
    expect(fakes.updatePatchCalls).toHaveLength(0);
    expect(fakes.insertPatchCalls).toHaveLength(0);
  });

  it('does not insert when updatePatch reports an existing row', async () => {
    const fakes = createFakeRepository();
    const command = createSaveProfilePatchCommand(fakes.repository);

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result.ok).toBe(true);
    expect(fakes.updatePatchCalls).toHaveLength(1);
    expect(fakes.insertPatchCalls).toHaveLength(0);
  });

  it('inserts after updatePatch reports no matching row and reuses the same now string', async () => {
    const fakes = createFakeRepository();
    fakes.setUpdatePatchResult(ok(false));
    const command = createSaveProfilePatchCommand(fakes.repository);
    const userId = asUserId('user-1');

    const result = await command(validInput, { userId });

    expect(result.ok).toBe(true);
    expect(fakes.updatePatchCalls).toHaveLength(1);
    expect(fakes.insertPatchCalls).toEqual([
      {
        userId,
        email: 'user@example.com',
        patch: { display_name: 'Ada', beta_features: true },
        now: fakes.updatePatchCalls[0]?.now ?? '',
      },
    ]);
  });

  it('returns the same updatePatch error result and does not insert', async () => {
    const fakes = createFakeRepository();
    const failure = err(domainError('unavailable', 'Could not save profile', { cause: { code: '500' } }));
    fakes.setUpdatePatchResult(failure);
    const command = createSaveProfilePatchCommand(fakes.repository);

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result).toBe(failure);
    expect(fakes.updatePatchCalls).toHaveLength(1);
    expect(fakes.insertPatchCalls).toHaveLength(0);
  });

  it('returns the insertPatch error after a not-found update', async () => {
    const fakes = createFakeRepository();
    const failure = err(domainError('unavailable', 'Could not save profile', { cause: { code: '409' } }));
    fakes.setUpdatePatchResult(ok(false));
    fakes.setInsertPatchResult(failure);
    const command = createSaveProfilePatchCommand(fakes.repository);

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result).toBe(failure);
    expect(fakes.updatePatchCalls).toHaveLength(1);
    expect(fakes.insertPatchCalls).toHaveLength(1);
  });
});
