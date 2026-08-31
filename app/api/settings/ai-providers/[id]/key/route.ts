import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateSettingsRequest } from '@/lib/server/settings/settingsRequestAuth';
import { encryptAICredential } from '@/lib/server/ai/credentialCipher';
import { createAIProviderAtomicRepository } from '@/lib/infra/settings/aiProviderAtomicRepository';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import { aiCredentialKeyHint, aiProviderApiKeySchema } from '@/lib/domain/settings/aiProviderConnection';
import type { UserId } from '@/lib/domain/core/ids';

/**
 * Replace the stored API key for one owned connection.
 *
 * There is deliberately no way to read a key back, so replacement always takes
 * a complete new key. The secret and its masked hint are written in one
 * transaction and verified_at is cleared: whatever Test Connection previously
 * proved was about the key being replaced.
 */

export const runtime = 'nodejs';

const bodySchema = z.object({ apiKey: aiProviderApiKeySchema });
const idSchema = z.string().uuid();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  // Never echoed: the rejected body holds the key.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid API key.' }, { status: 400 });
  }

  const { apiKey } = parsed.data;

  let apiKeyEncrypted: string;
  try {
    apiKeyEncrypted = encryptAICredential(apiKey);
  } catch {
    return NextResponse.json({ error: 'Provider credentials are not configured on this server.' }, { status: 500 });
  }

  const userId = auth.userId as UserId;
  const atomic = createAIProviderAtomicRepository();
  const replaced = await atomic.replaceCredential(userId, id, aiCredentialKeyHint(apiKey), apiKeyEncrypted);

  if (!replaced.ok) {
    if (replaced.error.code === 'not_found') {
      return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Could not replace the provider credential.' }, { status: 500 });
  }

  const repository = createAIProviderCredentialRepository();
  const connection = await repository.getConnection(userId, id);
  if (!connection.ok || connection.value === null) {
    return NextResponse.json({ error: 'Could not load the provider connection.' }, { status: 500 });
  }

  return NextResponse.json({ provider: connection.value });
}
