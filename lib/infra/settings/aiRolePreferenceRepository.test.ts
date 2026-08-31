import { describe, expect, it } from 'vitest';
import {
  SupabaseAIRolePreferenceRepository,
  type AIRolePreferenceSupabaseClient,
} from './aiRolePreferenceRepository';
import { AI_ROLE_EDIT, AI_ROLE_SOURCE } from '../../ai/aiRoles';
import { asUserId } from '../../domain/core/ids';

const OWNER = asUserId('user-owner');
const INTRUDER = asUserId('user-intruder');
const CONNECTION_ID = 'connection-1';

interface RecordedQuery {
  readonly table: string;
  readonly op: 'select' | 'upsert';
  readonly filters: [string, unknown][];
  readonly payload?: Record<string, unknown>;
}

interface FakeOptions {
  readonly ownedConnection?: { id: string } | null;
  readonly preference?: { role: string; connection_id: string | null; model_id: string | null } | null;
}

function createRecordingClient(options: FakeOptions) {
  const queries: RecordedQuery[] = [];

  function selectBuilder(table: string) {
    const filters: [string, unknown][] = [];

    const settleList = async () => {
      queries.push({ table, op: 'select', filters });
      return { data: options.preference ? [options.preference] : [], error: null };
    };

    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      async maybeSingle() {
        queries.push({ table, op: 'select', filters });
        const data = table === 'ai_provider_connections'
          ? (options.ownedConnection ?? null)
          : (options.preference ?? null);
        return { data, error: null };
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return settleList().then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  const client = {
    from(table: string) {
      return {
        select: () => selectBuilder(table),
        upsert: async (payload: Record<string, unknown>) => {
          queries.push({ table, op: 'upsert', filters: [], payload });
          return { error: null };
        },
      };
    },
  };

  return {
    queries,
    repository: new SupabaseAIRolePreferenceRepository(
      client as unknown as AIRolePreferenceSupabaseClient,
    ),
  };
}

function filtersOf(query: RecordedQuery): Record<string, unknown> {
  return Object.fromEntries(query.filters);
}

describe('SupabaseAIRolePreferenceRepository', () => {
  it('treats a missing row as CollabBoard Default rather than an error', async () => {
    const { repository } = createRecordingClient({ preference: null });

    const result = await repository.getPreference(OWNER, AI_ROLE_SOURCE);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('treats a null connection as CollabBoard Default', async () => {
    const { repository } = createRecordingClient({
      preference: { role: AI_ROLE_SOURCE, connection_id: null, model_id: null },
    });

    const result = await repository.getPreference(OWNER, AI_ROLE_SOURCE);

    expect(result.ok && result.value?.connectionId).toBeNull();
  });

  it('scopes reads to the caller and the requested role', async () => {
    const { repository, queries } = createRecordingClient({ preference: null });

    await repository.getPreference(OWNER, AI_ROLE_EDIT);

    expect(filtersOf(queries[0])).toEqual({ user_id: OWNER, role: AI_ROLE_EDIT });
  });

  it('verifies connection ownership before assigning a role', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: { id: CONNECTION_ID } });

    const result = await repository.setPreference(OWNER, AI_ROLE_SOURCE, CONNECTION_ID, 'claude-sonnet-5');

    expect(result.ok).toBe(true);
    const ownership = queries[0];
    expect(ownership.table).toBe('ai_provider_connections');
    expect(filtersOf(ownership)).toEqual({ id: CONNECTION_ID, user_id: OWNER });

    const upsert = queries.find((query) => query.op === 'upsert');
    expect(upsert?.payload).toMatchObject({
      user_id: OWNER,
      role: AI_ROLE_SOURCE,
      connection_id: CONNECTION_ID,
      model_id: 'claude-sonnet-5',
    });
  });

  it('refuses to point a role at another user\'s connection, and writes nothing', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: null });

    const result = await repository.setPreference(INTRUDER, AI_ROLE_SOURCE, CONNECTION_ID, null);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('not_found');
    expect(queries.some((query) => query.op === 'upsert')).toBe(false);
  });

  it('needs no ownership probe to fall back to CollabBoard Default', async () => {
    const { repository, queries } = createRecordingClient({});

    const result = await repository.setPreference(OWNER, AI_ROLE_EDIT, null, null);

    expect(result.ok).toBe(true);
    expect(queries.some((query) => query.table === 'ai_provider_connections')).toBe(false);
    const upsert = queries.find((query) => query.op === 'upsert');
    expect(upsert?.payload?.connection_id).toBeNull();
  });

  it('returns preferences that carry no credential material', async () => {
    const { repository } = createRecordingClient({
      preference: { role: AI_ROLE_SOURCE, connection_id: CONNECTION_ID, model_id: 'gpt-5' },
    });

    const result = await repository.listPreferences(OWNER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value[0]).sort()).toEqual(['connectionId', 'modelId', 'role']);
  });
});
