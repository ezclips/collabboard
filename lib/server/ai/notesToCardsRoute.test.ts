import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-342. SUGGEST CARDS FROM NOTES WITH AI -- the route contract.
 *
 * The route stores nothing; these tests are about its own properties: the
 * session gate, the body contract (note count, lengths, unique refs, total
 * chars), credits refused passing through, that ONLY refs/titles/texts reach
 * the model, that a successful managed run is charged, and how unusable answers
 * are answered. The adapter is stubbed at the REGISTRY seam.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  resolveAIModelForRole: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
  checkAiActionCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/ai/resolveAIModelForRole', () => ({ resolveAIModelForRole: mocks.resolveAIModelForRole }));
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
vi.mock('@/lib/server/billing/aiCredits', () => ({
  checkAiActionCredits: mocks.checkAiActionCredits,
  recordBoardAiCreditUsage: mocks.recordBoardAiCreditUsage,
  allowByokFor: (d: { kind: string }) => d.kind === 'byok',
}));

const USER_ID = 'user-1';
const BOARD_ID = 'board-1';

type RouteModule = typeof import('../../../app/api/boards/[id]/ai/notes-to-cards/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(
  new NextRequest(`http://localhost/api/boards/${BOARD_ID}/ai/notes-to-cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

const base = (over: Record<string, unknown> = {}) => ({
  notes: [
    { ref: 'N1', title: 'Venue', text: 'Book the venue' },
    { ref: 'N2', title: '', text: 'Call three places' },
  ],
  ...over,
});

const VALID_ANSWER = JSON.stringify({
  cards: [{ title: 'Book the venue', description: 'Call three places.', sourceRefs: ['N1', 'N2'] }],
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockResolvedValue(VALID_ANSWER);
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.recordBoardAiCreditUsage.mockResolvedValue(undefined);
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  route = await import('../../../app/api/boards/[id]/ai/notes-to-cards/route');
});

describe('PATCH-342 notes-to-cards: auth and body contract', () => {
  it('401 without a session, and the provider is never called', async () => {
    session(null);
    expect((await post(base())).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('400 for an empty notes list or an unknown top-level key', async () => {
    expect((await post({ notes: [] })).status).toBe(400);
    expect((await post({ notes: base().notes, extra: true })).status).toBe(400);
  });

  it('400 for too-long text, a bad ref, or duplicate refs', async () => {
    expect((await post(base({ notes: [{ ref: 'N1', title: '', text: 'x'.repeat(2001) }] }))).status).toBe(400);
    expect((await post(base({ notes: [{ ref: 'X1', title: '', text: 'hi' }] }))).status).toBe(400);
    expect((await post(base({
      notes: [{ ref: 'N1', title: '', text: 'a' }, { ref: 'N1', title: '', text: 'b' }],
    }))).status).toBe(400);
  });
});

describe('PATCH-342 notes-to-cards: credits', () => {
  it('passes a refused decision through', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({
      kind: 'refused',
      status: 402,
      body: { error: 'Out of AI credits' },
    });
    const response = await post(base());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: 'Out of AI credits' });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('charges the notes_to_cards feature only on a successful managed run', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'allowed', charge: true, plan: 'pro', balance: 5 });
    await post(base());
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage.mock.calls[0][0]).toMatchObject({
      boardId: BOARD_ID,
      feature: 'notes_to_cards',
      credits: 1,
    });
  });
});

describe('PATCH-342 notes-to-cards: generation', () => {
  it('returns the parsed cards', async () => {
    const response = await post(base());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cards: [{ title: 'Book the venue', description: 'Call three places.', sourceRefs: ['N1', 'N2'] }],
    });
  });

  it('sends ONLY refs, titles and texts -- no ids, emails or board names', async () => {
    await post(base());
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    const user = String(input.user);
    expect(user).toContain('N1');
    expect(user).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(user).not.toContain('@');
    expect(user).not.toContain(BOARD_ID);
    expect(input.reasoning).toBe('off');
  });

  it('gives the answer room for a full 20-card reply', async () => {
    await post(base());
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.maxTokens as number).toBeGreaterThanOrEqual(4000);
  });

  it('an unusable answer returns { cards: null }, not an error', async () => {
    mocks.generateText.mockResolvedValue('I cannot help with that.');
    const response = await post(base());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cards: null });
  });

  it('maps a provider error to its status and charges nothing', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'allowed', charge: true, plan: 'pro', balance: 5 });
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited'));
    const response = await post(base());
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });
});
