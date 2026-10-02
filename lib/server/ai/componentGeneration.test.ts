import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-254. The seam must forward the caller's `reasoning: 'off'` to the
 * adapter, and must NOT invent a `reasoning` key for every other caller -- a
 * key the component routes' own contract test pins as absent.
 */

const mocks = vi.hoisted(() => ({
  resolveAIModelForRole: vi.fn(),
  getAIProviderAdapter: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({ getPreference: vi.fn() })),
  createAIProviderCredentialRepository: vi.fn(() => ({ getConnection: vi.fn(), loadCredential: vi.fn() })),
  checkAiActionCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
}));

vi.mock('@/lib/server/ai/resolveAIModelForRole', () => ({
  resolveAIModelForRole: mocks.resolveAIModelForRole,
}));
vi.mock('@/lib/server/ai/providers/registry', () => ({
  getAIProviderAdapter: mocks.getAIProviderAdapter,
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

import { generateComponentText, type ComponentGenerationInput } from './componentGeneration';

const BASE: ComponentGenerationInput = {
  userId: 'user-1' as never,
  system: 'Return JSON only.',
  user: 'write a card',
  maxTokens: 4000,
  temperature: 0.4,
  timeoutMs: 1000,
  canReadBoard: async () => true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.resolveAIModelForRole.mockResolvedValue({
    source: 'byok',
    provider: 'deepseek',
    model: 'deepseek-flash',
    apiKey: 'k',
    supportsImages: false,
    connectionId: 'c1',
  });
  mocks.getAIProviderAdapter.mockReturnValue({ generateText: mocks.generateText });
  mocks.generateText.mockResolvedValue('ok');
});

describe('PATCH-254 reasoning forwarding', () => {
  it("forwards the caller's reasoning: 'off' to the adapter", async () => {
    await generateComponentText({ ...BASE, reasoning: 'off' });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.generateText.mock.calls[0][0].reasoning).toBe('off');
  });

  it('omits the reasoning key entirely when the caller does not set it', async () => {
    await generateComponentText({ ...BASE });
    const call = mocks.generateText.mock.calls[0][0];
    expect(call).not.toHaveProperty('reasoning');
    // The pre-PATCH-254 key set is unchanged, so no other route gains a key.
    expect(Object.keys(call).sort()).toEqual(
      ['apiKey', 'maxTokens', 'model', 'signal', 'system', 'temperature', 'user'],
    );
  });
});
