import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateSettingsRequest } from '@/lib/server/settings/settingsRequestAuth';
import { encryptAICredential } from '@/lib/server/ai/credentialCipher';
import { createAIProviderAtomicRepository } from '@/lib/infra/settings/aiProviderAtomicRepository';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import {
  AI_PROVIDER_TYPES,
  DISPLAY_NAME_MAX,
  MODEL_ID_MAX,
  aiCredentialKeyHint,
  aiProviderApiKeySchema,
} from '@/lib/domain/settings/aiProviderConnection';
import type { UserId } from '@/lib/domain/core/ids';

/**
 * BYOK provider connections -- list and create.
 *
 * Every response carries SAFE metadata only. The plaintext key exists in this
 * process for exactly as long as it takes to encrypt it, and neither it nor
 * the resulting ciphertext is ever serialized into a response or a log line.
 */

export const runtime = 'nodejs';

const createSchema = z.object({
  providerType: z.enum(AI_PROVIDER_TYPES),
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
  apiKey: aiProviderApiKeySchema,
  defaultModel: z.string().trim().min(1).max(MODEL_ID_MAX).nullish(),
});

export async function GET(request: Request) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repository = createAIProviderCredentialRepository();
  const result = await repository.listConnections(auth.userId as UserId);
  if (!result.ok) {
    return NextResponse.json({ error: 'Could not load provider connections.' }, { status: 500 });
  }

  return NextResponse.json({ providers: result.value });
}

export async function POST(request: Request) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  // The failed input is deliberately not echoed: it contains the API key.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid provider configuration.' }, { status: 400 });
  }

  const { providerType, displayName, apiKey, defaultModel } = parsed.data;

  // Encrypt BEFORE any database call: a misconfigured master key must fail
  // here, with nothing written, rather than after a row exists.
  let apiKeyEncrypted: string;
  try {
    apiKeyEncrypted = encryptAICredential(apiKey);
  } catch {
    return NextResponse.json({ error: 'Provider credentials are not configured on this server.' }, { status: 500 });
  }

  const userId = auth.userId as UserId;
  const atomic = createAIProviderAtomicRepository();
  const created = await atomic.createConnectionWithCredential(userId, {
    providerType,
    displayName,
    keyHint: aiCredentialKeyHint(apiKey),
    defaultModel: defaultModel ?? null,
    apiKeyEncrypted,
  });

  if (!created.ok) {
    if (created.error.code === 'conflict') {
      return NextResponse.json({ error: 'A provider connection with that name already exists.' }, { status: 409 });
    }
    if (created.error.code === 'validation') {
      return NextResponse.json({ error: 'Invalid provider configuration.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not create the provider connection.' }, { status: 500 });
  }

  const repository = createAIProviderCredentialRepository();
  const connection = await repository.getConnection(userId, created.value);
  if (!connection.ok || connection.value === null) {
    return NextResponse.json({ error: 'Could not load the provider connection.' }, { status: 500 });
  }

  return NextResponse.json({ provider: connection.value }, { status: 201 });
}
