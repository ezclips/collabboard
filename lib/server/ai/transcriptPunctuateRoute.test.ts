import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * READABLE TRANSCRIPT -- the batch route contract.
 *
 * The route reads nothing and stores nothing, so these tests are about its own
 * properties: the session gate, the per-USER rate limit, the request contract,
 * the Source AI role with thinking off, the one-retry-on-refusal rule, that a
 * failure is never retried, order, and the concurrency cap.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  resolveAIModelForRole: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/ai/resolveAIModelForRole', () => ({
  resolveAIModelForRole: mocks.resolveAIModelForRole,
}));
vi.mock('@/lib/server/ai/providers/registry', () => ({
  getAIProviderAdapter: () => ({
    provider: 'deepseek',
    carriesImages: false,
    generateText: mocks.generateText,
  }),
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));

const USER_ID = 'user-1';

type RouteModule = typeof import('../../../app/api/ai/transcript-punctuate/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;
let TRANSCRIPT_PUNCTUATE_INSTRUCTION: string;
let TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION: string;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/ai/transcript-punctuate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

const body = (passages: string[]) => ({ passages });

/** The faithful answer for a passage: its words unchanged. */
const faithful = (passage: string) => `${passage}.`;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockImplementation(async (input: { user: string }) => faithful(input.user));
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  ({ TRANSCRIPT_PUNCTUATE_INSTRUCTION, TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION } =
    await import('@/lib/domain/knowledge/transcriptPunctuationInstructions'));
  route = await import('../../../app/api/ai/transcript-punctuate/route');
});

describe('transcript-punctuate: auth and limits', () => {
  it('401 without a session', async () => {
    session(null);
    expect((await post(body(['one passage here']))).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('the 7th request in a minute is 429', async () => {
    for (let i = 0; i < 6; i += 1) {
      expect((await post(body(['one passage here']))).status).toBe(200);
    }
    expect((await post(body(['one passage here']))).status).toBe(429);
  });

  it('400 for zero passages', async () => {
    expect((await post(body([]))).status).toBe(400);
  });

  it('400 for 13 passages', async () => {
    expect((await post(body(Array.from({ length: 13 }, (_, i) => `p${i}`)))).status).toBe(400);
  });

  it('400 for a 1,201-character passage', async () => {
    expect((await post(body(['x'.repeat(1201)]))).status).toBe(400);
  });

  it('400 for more than 12,000 characters in total', async () => {
    const passages = Array.from({ length: 12 }, (_, i) => `${'x'.repeat(999)}${i}`);
    expect(passages.reduce((sum, p) => sum + p.length, 0)).toBeGreaterThan(12_000);
    expect((await post(body(passages))).status).toBe(400);
  });

  it('400 for an unknown top-level key', async () => {
    expect((await post({ passages: ['a'], extra: true })).status).toBe(400);
  });
});

describe('transcript-punctuate: the model call', () => {
  it('uses AI_ROLE_SOURCE, reasoning off, the instruction, and the passage as user message', async () => {
    await post(body(['hello there how are you']));
    expect(mocks.resolveAIModelForRole.mock.calls[0].slice(0, 2)).toEqual([USER_ID, 'source-ai']);
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.reasoning).toBe('off');
    expect(input.system).toBe(TRANSCRIPT_PUNCTUATE_INSTRUCTION);
    expect(input.user).toBe('hello there how are you');
    expect(input.maxTokens).toBe(1500);
  });
});

describe('transcript-punctuate: outcomes', () => {
  it('a faithful answer is projected', async () => {
    const response = await post(body(['hello there how are you']));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results).toEqual([{ status: 'projected', text: 'hello there how are you.' }]);
  });

  it('a word change, then a faithful retry, is projected after exactly 2 calls', async () => {
    // First call "corrects" night -> knight; the retry keeps the words.
    mocks.generateText
      .mockResolvedValueOnce('the knight was dark')
      .mockResolvedValueOnce('The night, was dark.');
    const response = await post(body(['the night was dark']));
    const json = await response.json();
    expect(json.results).toEqual([{ status: 'projected', text: 'The night, was dark.' }]);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect((mocks.generateText.mock.calls[1][0] as { system: string }).system)
      .toBe(TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION);
  });

  it('a word changed twice is refused, with exactly 2 calls', async () => {
    mocks.generateText.mockResolvedValue('the knight was dark');
    const response = await post(body(['the night was dark']));
    const json = await response.json();
    expect(json.results).toEqual([{ status: 'refused' }]);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('a model throw is failed, never retried, and leaves the others unaffected', async () => {
    mocks.generateText.mockImplementation(async (input: { user: string }) => {
      if (input.user === 'this one throws') throw new Error('boom');
      return faithful(input.user);
    });
    const response = await post(body(['this one throws', 'this one is fine']));
    const json = await response.json();
    expect(json.results[0]).toEqual({ status: 'failed' });
    expect(json.results[1]).toEqual({ status: 'projected', text: 'this one is fine.' });
    // The throwing passage is called once; the other once. No retry.
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('keeps order and never runs more than 4 calls at once', async () => {
    let active = 0;
    let maxActive = 0;
    mocks.generateText.mockImplementation(async (input: { user: string }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return faithful(input.user);
    });
    const passages = Array.from({ length: 12 }, (_, i) => `passage number ${i}`);
    const response = await post(body(passages));
    const json = await response.json();
    expect(json.results).toHaveLength(12);
    expect(json.results.map((r: { text: string }) => r.text))
      .toEqual(passages.map((p) => `${p}.`));
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1);
  });

  it('a provider error on EVERY passage is 200 with all failed', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited', { provider: 'deepseek' }));
    const response = await post(body(['a', 'b', 'c']));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results).toEqual([
      { status: 'failed' }, { status: 'failed' }, { status: 'failed' },
    ]);
  });
});
