import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_TYPES,
  aiCredentialKeyHint,
  aiProviderApiKeySchema,
  aiProviderConnectionInputSchema,
  isAIProviderType,
  KEY_HINT_LENGTH,
  type AIProviderConnection,
} from './aiProviderConnection';
import { AI_ROLES, AI_ROLE_EDIT, AI_ROLE_SOURCE, isAIRole } from '../../ai/aiRoles';

describe('AI provider domain contract', () => {
  it('ships exactly the four reviewed provider types, and no custom endpoint', () => {
    expect([...AI_PROVIDER_TYPES]).toEqual(['openai', 'anthropic', 'gemini', 'openrouter']);
    expect(isAIProviderType('custom')).toBe(false);
    expect(isAIProviderType('deepseek')).toBe(false);
    expect(isAIProviderType('openai')).toBe(true);
  });

  it('does not model CollabBoard Default as a provider type', () => {
    // The default is the ABSENCE of a preference, never a stored connection.
    expect(isAIProviderType('collabboard-default')).toBe(false);
    expect(isAIProviderType('default')).toBe(false);
  });

  it('keeps the client-safe connection type free of credential material', () => {
    const connection: AIProviderConnection = {
      id: 'connection-1',
      providerType: 'openai',
      displayName: 'Work key',
      keyHint: '9876',
      defaultModel: null,
      verifiedAt: null,
      createdAt: '2026-08-31T10:00:00.000Z',
      updatedAt: '2026-08-31T10:00:00.000Z',
    };

    // @ts-expect-error a credential may never be added to the client-safe DTO
    const widened: AIProviderConnection = { ...connection, apiKey: 'sk-nope' };
    expect(widened.keyHint).toBe('9876');
  });

  it('validates connection input at the boundary', () => {
    expect(
      aiProviderConnectionInputSchema.safeParse({
        providerType: 'gemini',
        displayName: 'Personal',
        defaultModel: null,
      }).success,
    ).toBe(true);

    expect(
      aiProviderConnectionInputSchema.safeParse({
        providerType: 'custom',
        displayName: 'Personal',
        defaultModel: null,
      }).success,
    ).toBe(false);

    expect(
      aiProviderConnectionInputSchema.safeParse({
        providerType: 'openai',
        displayName: '   ',
        defaultModel: null,
      }).success,
    ).toBe(false);
  });

  it('bounds an API key without assuming any provider key format', () => {
    for (const key of ['sk-abcdefghijkl', 'AIzaSyAbcdefgh', 'sk-or-v1-abcdefgh']) {
      expect(aiProviderApiKeySchema.safeParse(key).success).toBe(true);
    }
    expect(aiProviderApiKeySchema.safeParse('short').success).toBe(false);
    expect(aiProviderApiKeySchema.safeParse('x'.repeat(513)).success).toBe(false);
  });

  it('masks a key down to a suffix that cannot be used as a credential', () => {
    const hint = aiCredentialKeyHint('sk-live-abcdefgh1234');
    expect(hint).toBe('1234');
    expect(hint.length).toBeLessThanOrEqual(KEY_HINT_LENGTH);
  });
});

describe('AI roles', () => {
  it('starts with the two roles the existing AI surfaces need', () => {
    expect([...AI_ROLES]).toEqual([AI_ROLE_SOURCE, AI_ROLE_EDIT]);
    expect(AI_ROLE_SOURCE).toBe('source-ai');
    expect(AI_ROLE_EDIT).toBe('edit');
  });

  it('recognises only known roles', () => {
    expect(isAIRole('source-ai')).toBe(true);
    expect(isAIRole('edit')).toBe(true);
    expect(isAIRole('chat')).toBe(false);
    expect(isAIRole(null)).toBe(false);
  });
});
