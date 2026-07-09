import { describe, expect, it } from 'vitest';
import { SupabaseProfilesRepository } from './profilesRepository';
import { asUserId } from '../../domain/core/ids';

const row = {
  id: 'user-1',
  display_name: 'Ada',
  username: 'ada',
  about: 'Loves math',
  class_info: 'Room 3',
  language: 'en-US',
  account_type: 'Individual',
  avatar_url: 'https://example.com/avatar.png',
  beta_features: true,
};

function createFakeClient(response: {
  findData?: typeof row | null;
  findError?: { code?: string; message?: string } | null;
  updateData?: { id: string } | null;
  updateError?: { code?: string; message?: string } | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'profiles') => {
      expect(table).toBe('profiles');
      return {
        select: (columns: '*') => {
          expect(columns).toBe('*');
          return {
            eq: (column: 'id', value: ReturnType<typeof asUserId>) => {
              expect(column).toBe('id');
              expect(value).toBe(asUserId('user-1'));
              return {
                maybeSingle: async () => ({
                  data: response.findData ?? null,
                  error: response.findError ?? null,
                }),
              };
            },
          };
        },
        update: (payload: Record<string, unknown>) => {
          expect(payload).toEqual({
            email: 'user@example.com',
            display_name: 'Ada',
            beta_features: true,
            updated_at: '2026-07-09T10:00:00.000Z',
          });
          return {
            eq: (column: 'id', value: ReturnType<typeof asUserId>) => {
              expect(column).toBe('id');
              expect(value).toBe(asUserId('user-1'));
              return {
                select: (columns: 'id') => {
                  expect(columns).toBe('id');
                  return {
                    maybeSingle: async () => ({
                      data: response.updateData ?? null,
                      error: response.updateError ?? null,
                    }),
                  };
                },
              };
            },
          };
        },
        insert: async (payload: Record<string, unknown>) => {
          expect(payload).toEqual({
            id: asUserId('user-1'),
            email: 'user@example.com',
            created_at: '2026-07-09T10:00:00.000Z',
            display_name: 'Ada',
            beta_features: true,
            updated_at: '2026-07-09T10:00:00.000Z',
          });
          return { error: response.insertError ?? null };
        },
      };
    },
  };
}

describe('SupabaseProfilesRepository', () => {
  it('passes through an existing row as-is', async () => {
    const repository = new SupabaseProfilesRepository(createFakeClient({ findData: row }));

    const result = await repository.findById(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(row);
  });

  it('maps maybeSingle no-row to ok(null)', async () => {
    const repository = new SupabaseProfilesRepository(createFakeClient({}));

    const result = await repository.findById(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps load errors to err with the raw cause object', async () => {
    const failure = { code: '500', message: 'load failed' };
    const repository = new SupabaseProfilesRepository(createFakeClient({ findError: failure }));

    const result = await repository.findById(asUserId('user-1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
    expect(!result.ok && result.error.cause).toBe(failure);
  });

  it('updates with the exact payload and returns true when a row matches', async () => {
    const repository = new SupabaseProfilesRepository(
      createFakeClient({ updateData: { id: 'user-1' } }),
    );

    const result = await repository.updatePatch(
      asUserId('user-1'),
      'user@example.com',
      { display_name: 'Ada', beta_features: true },
      '2026-07-09T10:00:00.000Z',
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(true);
  });

  it('returns false when the update matches no row', async () => {
    const repository = new SupabaseProfilesRepository(createFakeClient({ updateData: null }));

    const result = await repository.updatePatch(
      asUserId('user-1'),
      'user@example.com',
      { display_name: 'Ada', beta_features: true },
      '2026-07-09T10:00:00.000Z',
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(false);
  });

  it('maps update errors to err with the raw cause object', async () => {
    const failure = { code: '409', message: 'save failed' };
    const repository = new SupabaseProfilesRepository(createFakeClient({ updateError: failure }));

    const result = await repository.updatePatch(
      asUserId('user-1'),
      'user@example.com',
      { display_name: 'Ada', beta_features: true },
      '2026-07-09T10:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
    expect(!result.ok && result.error.cause).toBe(failure);
  });

  it('inserts with the exact payload keys', async () => {
    const repository = new SupabaseProfilesRepository(createFakeClient({}));

    const result = await repository.insertPatch(
      asUserId('user-1'),
      'user@example.com',
      { display_name: 'Ada', beta_features: true },
      '2026-07-09T10:00:00.000Z',
    );

    expect(result.ok).toBe(true);
  });

  it('maps insert errors to err with the raw cause object', async () => {
    const failure = { code: '409', message: 'insert failed' };
    const repository = new SupabaseProfilesRepository(createFakeClient({ insertError: failure }));

    const result = await repository.insertPatch(
      asUserId('user-1'),
      'user@example.com',
      { display_name: 'Ada', beta_features: true },
      '2026-07-09T10:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
    expect(!result.ok && result.error.cause).toBe(failure);
  });
});
