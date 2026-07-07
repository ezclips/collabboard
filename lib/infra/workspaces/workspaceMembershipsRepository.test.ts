import { describe, expect, it } from 'vitest';
import { asUserId } from '../../domain/core/ids';
import type { WorkspaceMembership } from '../../domain/workspaces/memberships';
import { SupabaseWorkspaceMembershipsRepository } from './workspaceMembershipsRepository';

const memberships: WorkspaceMembership[] = [
  {
    workspace_id: 'workspace-1',
    role: 'owner',
    workspaces: {
      id: 'workspace-1',
      name: 'Workspace One',
      logo_url: null,
    },
  },
];

function createFakeClient(response: {
  byUserIdData?: WorkspaceMembership[] | null;
  byUserIdError?: { code?: string; message?: string } | null;
  byEmailData?: WorkspaceMembership[] | null;
  byEmailError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'workspace_members') => {
      expect(table).toBe('workspace_members');
      return {
        select: (columns: string) => {
          expect(columns).toContain('workspace_id');
          expect(columns).toContain('role');
          expect(columns).toContain('workspaces:workspace_id');
          return {
            eq: (column: 'member_user_id' | 'member_email', value: string) => {
              if (column === 'member_user_id') {
                expect(value).toBe('user-1');
                return {
                  eq: async (statusColumn: 'status', statusValue: 'active') => {
                    expect(statusColumn).toBe('status');
                    expect(statusValue).toBe('active');
                    return {
                      data: response.byUserIdData ?? [],
                      error: response.byUserIdError ?? null,
                    };
                  },
                };
              }

              expect(value).toBe('user@example.com');
              return {
                eq: async (statusColumn: 'status', statusValue: 'active') => {
                  expect(statusColumn).toBe('status');
                  expect(statusValue).toBe('active');
                  return {
                    data: response.byEmailData ?? [],
                    error: response.byEmailError ?? null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('SupabaseWorkspaceMembershipsRepository', () => {
  it('lists active memberships by user id', async () => {
    const repository = new SupabaseWorkspaceMembershipsRepository(
      createFakeClient({ byUserIdData: memberships }),
    );

    const result = await repository.listActiveByUserId(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(memberships);
  });

  it('maps empty active memberships by user id to ok([])', async () => {
    const repository = new SupabaseWorkspaceMembershipsRepository(
      createFakeClient({ byUserIdData: [] }),
    );

    const result = await repository.listActiveByUserId(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([]);
  });

  it('maps user-id membership errors to unavailable', async () => {
    const repository = new SupabaseWorkspaceMembershipsRepository(
      createFakeClient({ byUserIdError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.listActiveByUserId(asUserId('user-1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('lists active memberships by email', async () => {
    const repository = new SupabaseWorkspaceMembershipsRepository(
      createFakeClient({ byEmailData: memberships }),
    );

    const result = await repository.listActiveByEmail('user@example.com');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(memberships);
  });

  it('maps empty active memberships by email to ok([])', async () => {
    const repository = new SupabaseWorkspaceMembershipsRepository(
      createFakeClient({ byEmailData: [] }),
    );

    const result = await repository.listActiveByEmail('user@example.com');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([]);
  });

  it('maps email membership errors to unavailable', async () => {
    const repository = new SupabaseWorkspaceMembershipsRepository(
      createFakeClient({ byEmailError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.listActiveByEmail('user@example.com');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});
