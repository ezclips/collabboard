import { describe, expect, it, vi } from 'vitest';
import {
  CREATE_CONNECTION_FN,
  REPLACE_CREDENTIAL_FN,
  SupabaseAIProviderAtomicRepository,
  type AIProviderRpcClient,
} from './aiProviderAtomicRepository';
import type { UserId } from '../../domain/core/ids';

const OWNER = 'user-1' as UserId;
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const CIPHERTEXT = 'v1.aaa.bbb.ccc';

function client(result: { data?: unknown; error?: unknown }) {
  // Parameters are declared so `rpc.mock.calls[n]` is a typed tuple rather
  // than an empty one.
  const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  return { rpc, repository: new SupabaseAIProviderAtomicRepository({ rpc } as unknown as AIProviderRpcClient) };
}

describe('createConnectionWithCredential', () => {
  const input = {
    providerType: 'openai' as const,
    displayName: 'My OpenAI',
    keyHint: '1234',
    defaultModel: 'gpt-4o-mini',
    apiKeyEncrypted: CIPHERTEXT,
  };

  it('calls the atomic function rather than two inserts', async () => {
    const { rpc, repository } = client({ data: CONNECTION_ID });

    await repository.createConnectionWithCredential(OWNER, input);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe(CREATE_CONNECTION_FN);
  });

  it('passes the owner id through as the ownership predicate', async () => {
    const { rpc, repository } = client({ data: CONNECTION_ID });

    await repository.createConnectionWithCredential(OWNER, input);

    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_user_id).toBe(OWNER);
  });

  it('sends ciphertext only -- there is no plaintext parameter', async () => {
    const { rpc, repository } = client({ data: CONNECTION_ID });

    await repository.createConnectionWithCredential(OWNER, input);

    const args = rpc.mock.calls[0][1];
    expect(args.p_api_key_encrypted).toBe(CIPHERTEXT);
    expect(Object.keys(args)).not.toContain('p_api_key');
    expect(Object.keys(args)).not.toContain('p_base_url');
  });

  it('returns the new connection id', async () => {
    const { repository } = client({ data: CONNECTION_ID });

    const result = await repository.createConnectionWithCredential(OWNER, input);

    expect(result.ok && result.value).toBe(CONNECTION_ID);
  });

  it('normalizes a duplicate name to a conflict', async () => {
    const { repository } = client({ error: { code: '23505' } });

    const result = await repository.createConnectionWithCredential(OWNER, input);

    expect(!result.ok && result.error.code).toBe('conflict');
  });

  it('normalizes a database CHECK rejection to validation', async () => {
    const { repository } = client({ error: { code: '23514' } });

    const result = await repository.createConnectionWithCredential(OWNER, input);

    expect(!result.ok && result.error.code).toBe('validation');
  });

  it('treats a missing returned id as a failure, not a success', async () => {
    const { repository } = client({ data: null });

    const result = await repository.createConnectionWithCredential(OWNER, input);

    expect(result.ok).toBe(false);
  });
});

describe('replaceCredential', () => {
  it('calls the atomic replace with owner, hint and ciphertext', async () => {
    const { rpc, repository } = client({ data: true });

    await repository.replaceCredential(OWNER, CONNECTION_ID, '9999', CIPHERTEXT);

    expect(rpc.mock.calls[0][0]).toBe(REPLACE_CREDENTIAL_FN);
    const args = rpc.mock.calls[0][1];
    expect(args).toMatchObject({
      p_user_id: OWNER,
      p_connection_id: CONNECTION_ID,
      p_key_hint: '9999',
      p_api_key_encrypted: CIPHERTEXT,
    });
    expect(Object.keys(args)).not.toContain('p_api_key');
  });

  it('maps a false return to not_found, never a silent success', async () => {
    const { repository } = client({ data: false });

    const result = await repository.replaceCredential(OWNER, CONNECTION_ID, '9999', CIPHERTEXT);

    expect(!result.ok && result.error.code).toBe('not_found');
  });

  it('does not distinguish a foreign connection from a missing one', async () => {
    const { repository } = client({ data: false });

    const result = await repository.replaceCredential(OWNER, CONNECTION_ID, '9999', CIPHERTEXT);

    expect(!result.ok && result.error.message).not.toMatch(/another|owner|belongs/i);
  });

  it('surfaces a transport failure as unavailable', async () => {
    const { repository } = client({ error: { message: 'boom' } });

    const result = await repository.replaceCredential(OWNER, CONNECTION_ID, '9999', CIPHERTEXT);

    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});
