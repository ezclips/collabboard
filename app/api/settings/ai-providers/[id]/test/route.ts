import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateSettingsRequest } from '@/lib/server/settings/settingsRequestAuth';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { getAIProviderAdapter } from '@/lib/server/ai/providers/registry';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import { MODEL_ID_MAX } from '@/lib/domain/settings/aiProviderConnection';
import type { UserId } from '@/lib/domain/core/ids';

/**
 * Verify one stored BYOK connection.
 *
 * The only route in this feature that reaches a provider. It sends a fixed
 * synthetic prompt -- no board, Note, PDF or account data ever travels here --
 * and it returns whether the call succeeded, never what the model said.
 * Success stamps verified_at, which has no client-writable path anywhere.
 */

export const runtime = 'nodejs';

/** Fixed verification exchange. Deliberately constant: never user content. */
const VERIFY_SYSTEM = 'You are verifying an AI provider connection.';
const VERIFY_USER = 'Reply OK.';
const VERIFY_MAX_TOKENS = 2;

const bodySchema = z.object({
  model: z.string().trim().min(1).max(MODEL_ID_MAX).nullish(),
});
const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
  }

  // An absent body is normal: "test the connection as configured".
  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid model.', category: 'invalid_configuration' }, { status: 400 });
  }

  const userId = auth.userId as UserId;
  const repository = createAIProviderCredentialRepository();

  const connection = await repository.getConnection(userId, id);
  if (!connection.ok) {
    return NextResponse.json({ error: 'Could not load the provider connection.' }, { status: 500 });
  }
  if (connection.value === null) {
    return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
  }

  const model = parsed.data.model ?? connection.value.defaultModel;
  if (model === null || model === undefined) {
    return NextResponse.json(
      { error: 'No model is configured for this provider.', category: 'invalid_configuration' },
      { status: 400 },
    );
  }

  const credential = await repository.loadCredential(userId, id);
  // A missing credential row and a decrypt failure are the same problem to the
  // user: re-enter the key.
  if (!credential.ok) {
    return NextResponse.json(
      { error: 'No usable credential is stored for this provider.', category: 'invalid_configuration' },
      { status: 400 },
    );
  }

  try {
    const adapter = getAIProviderAdapter(connection.value.providerType);
    // The result is required to be non-empty but is otherwise discarded: model
    // output is never returned to the client, and nothing about this exchange
    // is persisted.
    await adapter.generateText({
      model,
      apiKey: credential.value,
      system: VERIFY_SYSTEM,
      user: VERIFY_USER,
      maxTokens: VERIFY_MAX_TOKENS,
    });
  } catch (error) {
    // A caller cancellation is not a provider verdict, so it must not stamp or
    // clear anything.
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'The verification request was cancelled.' }, { status: 499 });
    }
    if (error instanceof AIProviderError) {
      return NextResponse.json(
        { error: error.message, category: error.category },
        { status: aiProviderErrorStatus(error.category) },
      );
    }
    return NextResponse.json({ error: 'The provider request failed.', category: 'request_failed' }, { status: 502 });
  }

  const verified = await repository.markConnectionVerified(userId, id);
  if (!verified.ok || verified.value === null) {
    return NextResponse.json({ error: 'Could not record the verification.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, verifiedAt: verified.value.verifiedAt });
}
