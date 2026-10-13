import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-356. BOARD SETUP ASSISTANT -- the board-setup route contract.
 *
 * The route stores nothing; these tests are its own properties: the session
 * gate, the body contract (preset/description, at least one, length, unknown
 * keys), the credit decisions passing through, that ONLY the preset and the
 * description reach the model, that a successful managed run is charged, and
 * how unusable answers are answered. The adapter is stubbed at the REGISTRY
 * seam -- the same style as notesActionsRoute.test.ts.
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

type RouteModule = typeof import('../../../app/api/boards/[id]/ai/board-setup/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(
  new NextRequest(`http://localhost/api/boards/${BOARD_ID}/ai/board-setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

const VALID = JSON.stringify({
  title: 'Retro',
  intro: 'A short retro board.',
  columns: [{ title: 'Went well', items: [{ type: 'note', title: 'Wins', text: 'What worked?' }] }],
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockResolvedValue(VALID);
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.recordBoardAiCreditUsage.mockResolvedValue(undefined);
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  route = await import('../../../app/api/boards/[id]/ai/board-setup/route');
});

describe('PATCH-356 board-setup: auth and body contract', () => {
  it('401 without a session, and the provider is never called', async () => {
    session(null);
    expect((await post({ preset: 'retrospective' })).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('400 when neither a preset nor a description is given', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ description: '   ' })).status).toBe(400);
    expect((await post({ preset: '' })).status).toBe(400);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('400 for a description over 500 characters or an unknown preset', async () => {
    expect((await post({ description: 'x'.repeat(501) })).status).toBe(400);
    expect((await post({ preset: 'nope' })).status).toBe(400);
  });

  it('400 for an unknown top-level key', async () => {
    expect((await post({ preset: 'retrospective', extra: true })).status).toBe(400);
  });
});

describe('PATCH-356 board-setup: credits', () => {
  it('passes a forbidden decision through as 403', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'forbidden' });
    const response = await post({ preset: 'retrospective' });
    expect(response.status).toBe(403);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('passes a refused decision through', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({
      kind: 'refused', status: 402, body: { error: 'Out of AI credits' },
    });
    const response = await post({ preset: 'retrospective' });
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: 'Out of AI credits' });
  });

  it('charges the board_setup feature only on a successful managed run', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'allowed', charge: true, plan: 'pro', balance: 5 });
    await post({ preset: 'retrospective' });
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage.mock.calls[0][0]).toMatchObject({
      boardId: BOARD_ID, feature: 'board_setup', credits: 1,
    });
  });

  it('a byok run records nothing', async () => {
    await post({ preset: 'retrospective' });
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });
});

describe('PATCH-356 board-setup: generation', () => {
  it('returns the parsed result', async () => {
    const response = await post({ preset: 'retrospective' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      result: {
        title: 'Retro',
        intro: 'A short retro board.',
        columns: [{ title: 'Went well', items: [{ type: 'note', title: 'Wins', text: 'What worked?' }] }],
      },
    });
  });

  it('sends ONLY the preset and the description, with the fixed caps', async () => {
    await post({ preset: 'retrospective', description: 'A German team retro' });
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.maxTokens).toBe(4_096);
    expect(input.reasoning).toBe('off');
    const user = String(input.user);
    expect(user).toContain('retrospective');
    expect(user).toContain('A German team retro');
    expect(user).not.toContain('@');
    expect(user).not.toContain(BOARD_ID);
    expect(user).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // The preset's own prompt is the system message.
    expect(String(input.system)).toContain('Retrospective');
    expect(String(input.system)).toContain('ONLY JSON');
  });

  it('an unusable answer returns { result: null }, not an error', async () => {
    mocks.generateText.mockResolvedValue('I cannot help with that.');
    const response = await post({ preset: 'retrospective' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: null });
  });

  it('maps a provider error to its status and charges nothing', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'allowed', charge: true, plan: 'pro', balance: 5 });
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited'));
    const response = await post({ preset: 'retrospective' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });
});
