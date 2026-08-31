import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAFE_CONNECTION_COLUMNS,
  SupabaseAIProviderCredentialRepository,
  type AIProviderSupabaseClient,
} from './aiProviderCredentialRepository';
import { aiCredentialKeyHint } from '../../domain/settings/aiProviderConnection';
import { encryptAICredential } from '../../server/ai/credentialCipher';
import { asUserId } from '../../domain/core/ids';

const MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
const OWNER = asUserId('user-owner');
const INTRUDER = asUserId('user-intruder');
const CONNECTION_ID = 'connection-1';
const RAW_KEY = 'sk-live-supersecret-98765432';

interface RecordedQuery {
  readonly table: string;
  readonly op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  readonly columns?: string;
  readonly filters: [string, unknown][];
  readonly payload?: Record<string, unknown>;
}

const connectionRow = {
  id: CONNECTION_ID,
  provider_type: 'anthropic',
  display_name: 'My Anthropic',
  key_hint: '5432',
  default_model: 'claude-sonnet-5',
  verified_at: null,
  created_at: '2026-08-31T10:00:00.000Z',
  updated_at: '2026-08-31T10:00:00.000Z',
};

interface FakeOptions {
  /** null models "not yours, or not there" -- the ownership probe finds nothing. */
  readonly ownedConnection?: typeof connectionRow | null;
  readonly credentialRow?: { api_key_encrypted: string } | null;
}

function createRecordingClient(options: FakeOptions) {
  const queries: RecordedQuery[] = [];

  function selectBuilder(table: string, columns: string) {
    const filters: [string, unknown][] = [];

    const settleList = async () => {
      queries.push({ table, op: 'select', columns, filters });
      return { data: options.ownedConnection ? [options.ownedConnection] : [], error: null };
    };

    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      order() {
        return settleList();
      },
      async maybeSingle() {
        queries.push({ table, op: 'select', columns, filters });
        const data = table === 'ai_provider_credentials'
          ? (options.credentialRow ?? null)
          : (options.ownedConnection ?? null);
        return { data, error: null };
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return settleList().then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  function mutationBuilder(table: string, op: 'update' | 'delete', payload?: Record<string, unknown>) {
    const filters: [string, unknown][] = [];

    const settle = async () => {
      queries.push({ table, op, filters, payload });
      return { error: null };
    };

    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return settle().then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  const client = {
    from(table: string) {
      return {
        select: (columns: string) => selectBuilder(table, columns),
        insert: (payload: Record<string, unknown>) => ({
          select: (columns: string) => ({
            single: async () => {
              queries.push({ table, op: 'insert', columns, filters: [], payload });
              return { data: { ...connectionRow, ...payload }, error: null };
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => mutationBuilder(table, 'update', payload),
        delete: () => mutationBuilder(table, 'delete'),
        upsert: async (payload: Record<string, unknown>) => {
          queries.push({ table, op: 'upsert', filters: [], payload });
          return { error: null };
        },
      };
    },
  };

  return {
    queries,
    repository: new SupabaseAIProviderCredentialRepository(
      client as unknown as AIProviderSupabaseClient,
    ),
  };
}

function filtersOf(query: RecordedQuery): Record<string, unknown> {
  return Object.fromEntries(query.filters);
}

beforeEach(() => {
  vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', MASTER_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SupabaseAIProviderCredentialRepository', () => {
  it('lists connections through a projection that cannot name a secret column', () => {
    expect(SAFE_CONNECTION_COLUMNS).not.toMatch(/api_key|encrypted|secret/i);
  });

  it('scopes the listing to the caller and reads only safe columns', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: connectionRow });

    const result = await repository.listConnections(OWNER);

    expect(result.ok).toBe(true);
    const [query] = queries;
    expect(query.table).toBe('ai_provider_connections');
    expect(query.columns).toBe(SAFE_CONNECTION_COLUMNS);
    expect(filtersOf(query)).toEqual({ user_id: OWNER });
  });

  it('returns a DTO that structurally cannot carry credential material', async () => {
    const { repository } = createRecordingClient({ ownedConnection: connectionRow });

    const result = await repository.listConnections(OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [connection] = result.value;
    expect(Object.keys(connection).sort()).toEqual([
      'createdAt',
      'defaultModel',
      'displayName',
      'id',
      'keyHint',
      'providerType',
      'updatedAt',
      'verifiedAt',
    ]);
    const serialized = JSON.stringify(connection);
    expect(serialized).not.toContain(RAW_KEY);
    expect(serialized).not.toContain('v1.');
  });

  it('proves ownership against the connection before touching the secret table', async () => {
    const { repository, queries } = createRecordingClient({
      ownedConnection: connectionRow,
      credentialRow: { api_key_encrypted: encryptAICredential(RAW_KEY) },
    });

    const result = await repository.loadCredential(OWNER, CONNECTION_ID);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(RAW_KEY);

    const [ownership, secret] = queries;
    expect(ownership.table).toBe('ai_provider_connections');
    expect(filtersOf(ownership)).toEqual({ id: CONNECTION_ID, user_id: OWNER });
    expect(secret.table).toBe('ai_provider_credentials');
  });

  it('never reaches the secret table for a connection the caller does not own', async () => {
    // The ownership probe finds nothing because it is filtered by user_id.
    const { repository, queries } = createRecordingClient({
      ownedConnection: null,
      credentialRow: { api_key_encrypted: encryptAICredential(RAW_KEY) },
    });

    const result = await repository.loadCredential(INTRUDER, CONNECTION_ID);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('not_found');
    expect(queries.every((query) => query.table !== 'ai_provider_credentials')).toBe(true);
  });

  it('answers identically whether a connection is missing or someone else\'s', async () => {
    const { repository } = createRecordingClient({ ownedConnection: null });

    const result = await repository.loadCredential(INTRUDER, 'does-not-exist');

    expect(!result.ok && result.error.code).toBe('not_found');
    expect(!result.ok && result.error.message).not.toContain(CONNECTION_ID);
  });

  it('encrypts before persisting, and stores no recognisable plaintext', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: connectionRow });

    const result = await repository.putCredential(OWNER, CONNECTION_ID, RAW_KEY);
    expect(result.ok).toBe(true);

    const upsert = queries.find((query) => query.op === 'upsert');
    expect(upsert?.table).toBe('ai_provider_credentials');
    const stored = String(upsert?.payload?.api_key_encrypted);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain(RAW_KEY);
    expect(JSON.stringify(upsert?.payload)).not.toContain(RAW_KEY);
  });

  it('refuses to write a credential onto a connection the caller does not own', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: null });

    const result = await repository.putCredential(INTRUDER, CONNECTION_ID, RAW_KEY);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('not_found');
    expect(queries.some((query) => query.op === 'upsert')).toBe(false);
  });

  it('fails closed without writing when the master key is unusable', async () => {
    vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', '');
    const { repository, queries } = createRecordingClient({ ownedConnection: connectionRow });

    const result = await repository.putCredential(OWNER, CONNECTION_ID, RAW_KEY);

    expect(result.ok).toBe(false);
    expect(queries.some((query) => query.op === 'upsert')).toBe(false);
  });

  it('scopes a key-hint update to the owner and stores only the masked suffix', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: connectionRow });

    await repository.updateConnectionKeyHint(OWNER, CONNECTION_ID, RAW_KEY);

    const update = queries.find((query) => query.op === 'update');
    expect(filtersOf(update as RecordedQuery)).toEqual({ id: CONNECTION_ID, user_id: OWNER });
    const hint = String(update?.payload?.key_hint);
    expect(hint).toBe('5432');
    expect(hint).toHaveLength(4);
    expect(RAW_KEY).not.toBe(hint);
    expect(RAW_KEY.startsWith(hint)).toBe(false);
  });

  it('scopes deletion to the owner', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: connectionRow });

    await repository.deleteConnection(OWNER, CONNECTION_ID);

    const remove = queries.find((query) => query.op === 'delete');
    expect(remove?.table).toBe('ai_provider_connections');
    expect(filtersOf(remove as RecordedQuery)).toEqual({ id: CONNECTION_ID, user_id: OWNER });
  });

  it('stamps the owner onto a created connection and returns safe metadata only', async () => {
    const { repository, queries } = createRecordingClient({ ownedConnection: connectionRow });

    const result = await repository.insertConnectionMetadata(
      OWNER,
      { providerType: 'anthropic', displayName: 'My Anthropic', defaultModel: null },
      aiCredentialKeyHint(RAW_KEY),
    );

    expect(result.ok).toBe(true);
    const insert = queries.find((query) => query.op === 'insert');
    expect(insert?.payload?.user_id).toBe(OWNER);
    expect(insert?.payload?.key_hint).toBe('5432');
    expect(insert?.columns).toBe(SAFE_CONNECTION_COLUMNS);
    expect(JSON.stringify(insert?.payload)).not.toContain(RAW_KEY);
  });

  it('never writes the raw key or ciphertext to the console', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    const { repository } = createRecordingClient({
      ownedConnection: connectionRow,
      credentialRow: { api_key_encrypted: encryptAICredential(RAW_KEY) },
    });

    await repository.putCredential(OWNER, CONNECTION_ID, RAW_KEY);
    await repository.loadCredential(OWNER, CONNECTION_ID);
    await repository.putCredential(INTRUDER, CONNECTION_ID, RAW_KEY);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('surfaces a decryption failure instead of returning stored ciphertext', async () => {
    const { repository } = createRecordingClient({
      ownedConnection: connectionRow,
      credentialRow: { api_key_encrypted: 'v1.aaaa.bbbb.cccc' },
    });

    const result = await repository.loadCredential(OWNER, CONNECTION_ID);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});

describe('aiCredentialKeyHint', () => {
  it('keeps only a short suffix, never the whole key', () => {
    expect(aiCredentialKeyHint(RAW_KEY)).toBe('5432');
    expect(aiCredentialKeyHint(RAW_KEY)).toHaveLength(4);
    expect(RAW_KEY).toContain(aiCredentialKeyHint(RAW_KEY));
    expect(aiCredentialKeyHint(RAW_KEY)).not.toBe(RAW_KEY);
  });

  it('does not pad a short key out to a fixed width', () => {
    expect(aiCredentialKeyHint('ab')).toBe('ab');
  });
});
