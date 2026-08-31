import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '../ai/providers/errors';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getAIProviderAdapter: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('@/lib/server/ai/providers/registry', () => ({ getAIProviderAdapter: mocks.getAIProviderAdapter }));

let route: typeof import('../../../app/api/settings/ai-providers/[id]/test/route');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const RAW_KEY = 'FAKE-KEY-DO-NOT-LEAK-1234';
const PROVIDER_BODY = 'SECRET_PROVIDER_BODY_123';

/** Ciphertext the route will decrypt back to RAW_KEY. */
let encryptedKey: string;

const SAFE_ROW = {
  id: CONNECTION_ID,
  provider_type: 'openai',
  display_name: 'My OpenAI',
  key_hint: '1234',
  default_model: 'gpt-4o-mini',
  verified_at: null,
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

function params(id: string = CONNECTION_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body?: unknown, token: string | null = 'good-token'): Request {
  return new Request(`http://localhost/api/settings/ai-providers/${CONNECTION_ID}/test`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function configureAuth(userId: string | null) {
  mocks.createClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'bad token' },
      })),
    },
  });
}

let update: ReturnType<typeof vi.fn>;
let credentialSelect: ReturnType<typeof vi.fn>;
let generateText: ReturnType<typeof vi.fn>;

function configureAdmin(options?: { row?: unknown; credentialRow?: unknown }) {
  const connectionChain: Record<string, unknown> = {};
  connectionChain.eq = vi.fn(() => connectionChain);
  connectionChain.maybeSingle = vi.fn(async () => ({
    data: options?.row === undefined ? SAFE_ROW : options.row,
    error: null,
  }));

  const credentialChain: Record<string, unknown> = {};
  credentialChain.eq = vi.fn(() => credentialChain);
  credentialChain.maybeSingle = vi.fn(async () => ({
    data:
      options?.credentialRow === undefined
        ? { api_key_encrypted: encryptedKey }
        : options.credentialRow,
    error: null,
  }));

  const updateChain: Record<string, unknown> = {};
  updateChain.eq = vi.fn(() => updateChain);
  updateChain.select = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: { ...SAFE_ROW, verified_at: '2026-08-31T12:00:00.000Z' },
      error: null,
    })),
  }));
  update = vi.fn(() => updateChain);

  credentialSelect = vi.fn(() => credentialChain);

  mocks.getSupabaseAdmin.mockReturnValue({
    from: vi.fn((table: string) => ({
      select: table === 'ai_provider_credentials' ? credentialSelect : vi.fn(() => connectionChain),
      update,
    })),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));

  const { encryptAICredential } = await import('../ai/credentialCipher');
  encryptedKey = encryptAICredential(RAW_KEY);

  generateText = vi.fn(async () => 'OK');
  mocks.getAIProviderAdapter.mockReturnValue({ provider: 'openai', generateText });
  configureAuth(USER_ID);
  configureAdmin();
  route = await import('../../../app/api/settings/ai-providers/[id]/test/route');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/settings/ai-providers/[id]/test -- auth and ownership', () => {
  it('1. unauthenticated verification is rejected before any provider call', async () => {
    const res = await route.POST(request({}, null), params());
    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('2. the credential is read for the authenticated owner only', async () => {
    await route.POST(request({}), params());
    const eqCalls = (credentialSelect.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }).eq.mock.calls;
    expect(eqCalls).toContainEqual(['connection_id', CONNECTION_ID]);
  });

  it('3. a foreign or missing connection never reaches a provider', async () => {
    configureAdmin({ row: null });
    const res = await route.POST(request({}), params());
    expect(res.status).toBe(404);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('4. a missing stored credential is invalid_configuration, not a provider call', async () => {
    configureAdmin({ credentialRow: null });
    const res = await route.POST(request({}), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ category: 'invalid_configuration' });
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/ai-providers/[id]/test -- the verification call', () => {
  it('5. the stored key is decrypted server-side and handed to the adapter', async () => {
    await route.POST(request({}), params());
    expect(generateText.mock.calls[0][0].apiKey).toBe(RAW_KEY);
  });

  it('6. the prompt is the fixed synthetic exchange, with no user content', async () => {
    await route.POST(request({}), params());
    const input = generateText.mock.calls[0][0];
    expect(input.system).toBe('You are verifying an AI provider connection.');
    expect(input.user).toBe('Reply OK.');
    expect(input.maxTokens).toBe(2);
  });

  it('7. no board, Note or PDF context can travel with the request', async () => {
    await route.POST(request({ boardId: 'b1', note: 'secret note', pageText: 'pdf text' }), params());
    const serialized = JSON.stringify(generateText.mock.calls[0][0]);
    expect(serialized).not.toContain('secret note');
    expect(serialized).not.toContain('pdf text');
    expect(serialized).not.toContain('b1');
  });

  it('8. an explicit model overrides the connection default', async () => {
    await route.POST(request({ model: 'gpt-4.1' }), params());
    expect(generateText.mock.calls[0][0].model).toBe('gpt-4.1');
  });

  it('9. the connection default is used when no model is supplied', async () => {
    await route.POST(request({}), params());
    expect(generateText.mock.calls[0][0].model).toBe('gpt-4o-mini');
  });

  it('10. no model anywhere is invalid_configuration', async () => {
    configureAdmin({ row: { ...SAFE_ROW, default_model: null } });
    const res = await route.POST(request({}), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ category: 'invalid_configuration' });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('11. the model output is never returned', async () => {
    generateText.mockResolvedValue('THE-MODEL-SAID-THIS');
    const res = await route.POST(request({}), params());
    expect(await res.text()).not.toContain('THE-MODEL-SAID-THIS');
  });
});

describe('POST /api/settings/ai-providers/[id]/test -- verification state', () => {
  it('12. a successful test stamps verifiedAt', async () => {
    const res = await route.POST(request({}), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.verifiedAt).toBe('2026-08-31T12:00:00.000Z');
    expect((update.mock.calls[0][0] as Record<string, unknown>).verified_at).toBeTruthy();
  });

  it('13. a failed test does not stamp verifiedAt', async () => {
    generateText.mockRejectedValue(new AIProviderError('authentication_failed', { provider: 'openai', status: 401 }));
    const res = await route.POST(request({}), params());
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('14. a cancelled request neither stamps nor reports a provider verdict', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    generateText.mockRejectedValue(abort);
    const res = await route.POST(request({}), params());
    expect(res.status).toBe(499);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/ai-providers/[id]/test -- error normalization', () => {
  const cases: ReadonlyArray<[string, number]> = [
    ['authentication_failed', 400],
    ['rate_limited', 429],
    ['model_unavailable', 400],
    ['provider_unavailable', 502],
    ['invalid_configuration', 400],
    ['request_failed', 502],
  ];

  for (const [category, status] of cases) {
    it(`15. ${category} maps to ${status}`, async () => {
      generateText.mockRejectedValue(
        new AIProviderError(category as 'request_failed', { provider: 'openai' }),
      );
      const res = await route.POST(request({}), params());
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ category });
    });
  }

  it('16. no provider response body or key reaches the client', async () => {
    generateText.mockRejectedValue(new Error(`${PROVIDER_BODY} ${RAW_KEY}`));
    const res = await route.POST(request({}), params());
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain(PROVIDER_BODY);
    expect(text).not.toContain(RAW_KEY);
  });

  it('17. an unexpected throw is normalized, never leaked as a stack', async () => {
    generateText.mockRejectedValue(new TypeError('internal detail'));
    const res = await route.POST(request({}), params());
    expect(await res.text()).not.toContain('internal detail');
  });
});
