import { describe, expect, it } from 'vitest';
import { asUserId } from '../../domain/core/ids';
import { SupabaseUserAchievementsRepository } from './userAchievementsRepository';

function createFakeClient(response: {
  loadData?: { points?: number | null } | null;
  loadError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'user_achievements') => {
      expect(table).toBe('user_achievements');
      return {
        select: (columns: '*') => {
          expect(columns).toBe('*');
          return {
            eq: (column: 'user_id', value: string) => {
              expect(column).toBe('user_id');
              expect(value).toBe('user-1');
              return {
                single: async () => ({
                  data: response.loadData ?? null,
                  error: response.loadError ?? null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

describe('SupabaseUserAchievementsRepository', () => {
  it('loads points from an existing row', async () => {
    const repository = new SupabaseUserAchievementsRepository(
      createFakeClient({ loadData: { points: 1234 } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ points: 1234 });
  });

  it('maps null points to zero', async () => {
    const repository = new SupabaseUserAchievementsRepository(
      createFakeClient({ loadData: { points: null } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ points: 0 });
  });

  it('maps no row to ok(null)', async () => {
    const repository = new SupabaseUserAchievementsRepository(
      createFakeClient({ loadError: { code: 'PGRST116', message: 'No rows' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps database load errors to unavailable', async () => {
    const repository = new SupabaseUserAchievementsRepository(
      createFakeClient({ loadError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});
