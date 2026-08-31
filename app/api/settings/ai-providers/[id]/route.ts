import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateSettingsRequest } from '@/lib/server/settings/settingsRequestAuth';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import { DISPLAY_NAME_MAX, MODEL_ID_MAX } from '@/lib/domain/settings/aiProviderConnection';
import type { UserId } from '@/lib/domain/core/ids';

/**
 * One BYOK provider connection -- safe metadata update and delete.
 *
 * PATCH accepts only displayName and defaultModel. providerType is immutable
 * (changing it would leave a credential minted for a different service behind
 * the same row -- delete and recreate instead), and keyHint / verifiedAt /
 * userId are server-owned: the schema below simply has no field for them, so
 * an extra body property is dropped rather than trusted.
 */

export const runtime = 'nodejs';

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
    defaultModel: z.string().trim().min(1).max(MODEL_ID_MAX).nullable().optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.defaultModel !== undefined,
    { message: 'No supported field to update.' },
  );

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid provider update.' }, { status: 400 });
  }

  const repository = createAIProviderCredentialRepository();
  const updated = await repository.updateConnectionMetadata(auth.userId as UserId, id, parsed.data);

  if (!updated.ok) {
    if (updated.error.code === 'conflict') {
      return NextResponse.json({ error: 'A provider connection with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not update the provider connection.' }, { status: 500 });
  }
  // Null covers both "deleted" and "belongs to someone else": the answer must
  // not reveal that another user owns this id.
  if (updated.value === null) {
    return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
  }

  return NextResponse.json({ provider: updated.value });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
  }

  // The credential row cascades away and any role preference pointing here is
  // reset to NULL by the schema -- both are database responsibilities, never
  // follow-up writes issued from a browser.
  const repository = createAIProviderCredentialRepository();
  const deleted = await repository.deleteConnection(auth.userId as UserId, id);
  if (!deleted.ok) {
    return NextResponse.json({ error: 'Could not delete the provider connection.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
