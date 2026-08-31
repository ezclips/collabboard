import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ROLE_EDIT, AI_ROLE_SOURCE } from '../../ai/aiRoles';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type { UserId } from '../../domain/core/ids';
import type { AIProviderConnection } from '../../domain/settings/aiProviderConnection';
import { resolveAIModelForRole, type AIModelResolverDeps } from './resolveAIModelForRole';

const USER = 'user-1' as UserId;
const OTHER_USER = 'user-2' as UserId;
const CONNECTION_ID = 'conn-1';
const BYOK_KEY = 'FAKE-BYOK-KEY-DO-NOT-LEAK';
const DEFAULT_KEY = 'FAKE-DEEPSEEK-ENV-KEY';

function connection(overrides: Partial<AIProviderConnection> = {}): AIProviderConnection {
  return {
    id: CONNECTION_ID,
    providerType: 'anthropic',
    displayName: 'My Claude',
    keyHint: '1234',
    defaultModel: 'claude-opus-5',
    verifiedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Builds deps whose every method is a spy, so ownership args can be asserted. */
function deps(overrides: {
  preference?: unknown;
  connectionResult?: unknown;
  credentialResult?: unknown;
} = {}) {
  // Parameters are declared (not inferred as empty) so mock.calls stays a
  // typed tuple -- the ownership assertions below read call[0].
  const getPreference = vi.fn(async (_userId: UserId, _role: string) => overrides.preference ?? ok(null));
  const getConnection = vi.fn(async (_userId: UserId, _connectionId: string) => overrides.connectionResult ?? ok(connection()));
  const loadCredential = vi.fn(async (_userId: UserId, _connectionId: string) => overrides.credentialResult ?? ok(BYOK_KEY));

  return {
    value: {
      preferences: { getPreference },
      credentials: { getConnection, loadCredential },
    } as unknown as AIModelResolverDeps,
    getPreference,
    getConnection,
    loadCredential,
  };
}

beforeEach(() => {
  vi.stubEnv('DEEPSEEK_API_KEY', DEFAULT_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolveAIModelForRole -- CollabBoard default', () => {
  it('resolves DeepSeek when the role has no preference row', async () => {
    const d = deps({ preference: ok(null) });

    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).resolves.toEqual({
      source: 'collabboard-default',
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: DEFAULT_KEY,
      connectionId: null,
    });
  });

  it('resolves DeepSeek when the preference explicitly selects the default', async () => {
    const d = deps({
      preference: ok({ role: AI_ROLE_EDIT, connectionId: null, modelId: 'ignored-model' }),
    });

    const resolved = await resolveAIModelForRole(USER, AI_ROLE_EDIT, d.value);

    expect(resolved.source).toBe('collabboard-default');
    expect(resolved.model).toBe('deepseek-chat');
  });

  it('never touches the credential table on the default path', async () => {
    const d = deps({ preference: ok(null) });

    await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value);

    expect(d.getConnection).not.toHaveBeenCalled();
    expect(d.loadCredential).not.toHaveBeenCalled();
  });

  it('fails invalid_configuration when the environment key is missing or blank', async () => {
    for (const value of ['', '   ']) {
      vi.stubEnv('DEEPSEEK_API_KEY', value);
      const d = deps({ preference: ok(null) });

      await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).rejects.toMatchObject({
        category: 'invalid_configuration',
      });
    }
  });

  it('reads the environment key lazily, per call', async () => {
    const d = deps({ preference: ok(null) });

    vi.stubEnv('DEEPSEEK_API_KEY', 'first-key');
    expect((await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).apiKey).toBe('first-key');

    vi.stubEnv('DEEPSEEK_API_KEY', 'second-key');
    expect((await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).apiKey).toBe('second-key');
  });
});

describe('resolveAIModelForRole -- BYOK', () => {
  const byokPreference = ok({ role: AI_ROLE_SOURCE, connectionId: CONNECTION_ID, modelId: null });

  it('resolves the owned connection, its provider and its decrypted credential', async () => {
    const d = deps({ preference: byokPreference });

    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).resolves.toEqual({
      source: 'byok',
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: BYOK_KEY,
      connectionId: CONNECTION_ID,
    });
  });

  it('passes the caller userId to every ownership-sensitive lookup', async () => {
    const d = deps({ preference: byokPreference });

    await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value);

    expect(d.getPreference).toHaveBeenCalledWith(USER, AI_ROLE_SOURCE);
    expect(d.getConnection).toHaveBeenCalledWith(USER, CONNECTION_ID);
    expect(d.loadCredential).toHaveBeenCalledWith(USER, CONNECTION_ID);
    // Never a lookup by connection id alone.
    for (const call of [...d.getConnection.mock.calls, ...d.loadCredential.mock.calls]) {
      expect(call[0]).toBe(USER);
      expect(call).toHaveLength(2);
    }
  });

  it('prefers the role model over the connection default', async () => {
    const d = deps({
      preference: ok({ role: AI_ROLE_SOURCE, connectionId: CONNECTION_ID, modelId: 'claude-sonnet-5' }),
    });

    expect((await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).model).toBe('claude-sonnet-5');
  });

  it('falls back to the connection default when the role model is null or blank', async () => {
    for (const modelId of [null, '   ']) {
      const d = deps({
        preference: ok({ role: AI_ROLE_SOURCE, connectionId: CONNECTION_ID, modelId }),
      });

      expect((await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).model).toBe('claude-opus-5');
    }
  });

  it('fails invalid_configuration when neither model is configured', async () => {
    const d = deps({
      preference: ok({ role: AI_ROLE_SOURCE, connectionId: CONNECTION_ID, modelId: null }),
      connectionResult: ok(connection({ defaultModel: null })),
    });

    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).rejects.toMatchObject({
      category: 'invalid_configuration',
    });
  });

  it('fails invalid_configuration when the credential row is missing', async () => {
    const d = deps({
      preference: byokPreference,
      credentialResult: err(domainError('not_found', 'No credential is stored')),
    });

    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).rejects.toMatchObject({
      category: 'invalid_configuration',
    });
  });

  it('fails invalid_configuration when the credential cannot be decrypted', async () => {
    const d = deps({
      preference: byokPreference,
      credentialResult: err(domainError('unavailable', 'Could not decrypt the provider credential')),
    });

    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).rejects.toMatchObject({
      category: 'invalid_configuration',
    });
  });

  it('fails invalid_configuration when the connection is missing or owned by someone else', async () => {
    // The repository returns null for both cases; a foreign id must not resolve.
    const d = deps({ preference: byokPreference, connectionResult: ok(null) });

    await expect(resolveAIModelForRole(OTHER_USER, AI_ROLE_SOURCE, d.value)).rejects.toMatchObject({
      category: 'invalid_configuration',
    });
    expect(d.loadCredential).not.toHaveBeenCalled();
  });

  it('fails invalid_configuration for a torn provider value', async () => {
    const d = deps({
      preference: byokPreference,
      connectionResult: ok(connection({ providerType: 'ollama' as AIProviderConnection['providerType'] })),
    });

    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).rejects.toMatchObject({
      category: 'invalid_configuration',
    });
  });

  it.each([
    ['openai', 'openai'],
    ['anthropic', 'anthropic'],
    ['gemini', 'gemini'],
    ['openrouter', 'openrouter'],
  ] as const)('maps connection provider %s to execution provider %s', async (providerType, expected) => {
    const d = deps({
      preference: byokPreference,
      connectionResult: ok(connection({ providerType })),
    });

    expect((await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)).provider).toBe(expected);
  });

  it('NEVER silently falls back to the CollabBoard DeepSeek key when BYOK is broken', async () => {
    const brokenCases = [
      deps({ preference: byokPreference, connectionResult: ok(null) }),
      deps({ preference: byokPreference, credentialResult: err(domainError('not_found', 'missing')) }),
      deps({
        preference: ok({ role: AI_ROLE_SOURCE, connectionId: CONNECTION_ID, modelId: null }),
        connectionResult: ok(connection({ defaultModel: null })),
      }),
    ];

    for (const d of brokenCases) {
      const resolved = await resolveAIModelForRole(USER, AI_ROLE_SOURCE, d.value)
        .then((value) => value)
        .catch((error: unknown) => error);

      expect(resolved).toMatchObject({ category: 'invalid_configuration' });
      // The decisive assertion: the environment key never became the answer.
      expect(resolved).not.toMatchObject({ source: 'collabboard-default' });
      expect(JSON.stringify(resolved) ?? '').not.toContain(DEFAULT_KEY);
    }
  });

  it('surfaces repository infrastructure failures as provider_unavailable, not a default', async () => {
    const preferenceFailure = deps({ preference: err(domainError('unavailable', 'db down')) });
    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, preferenceFailure.value)).rejects.toMatchObject({
      category: 'provider_unavailable',
    });

    const connectionFailure = deps({
      preference: byokPreference,
      connectionResult: err(domainError('unavailable', 'db down')),
    });
    await expect(resolveAIModelForRole(USER, AI_ROLE_SOURCE, connectionFailure.value)).rejects.toMatchObject({
      category: 'provider_unavailable',
    });
  });
});
