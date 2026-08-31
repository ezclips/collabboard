import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateSettingsRequest } from '@/lib/server/settings/settingsRequestAuth';
import { createAIRolePreferenceRepository } from '@/lib/infra/settings/aiRolePreferenceRepository';
import { AI_ROLE_EDIT, AI_ROLE_SOURCE, isAIRole } from '@/lib/ai/aiRoles';
import { MODEL_ID_MAX } from '@/lib/domain/settings/aiProviderConnection';
import type { UserId } from '@/lib/domain/core/ids';

/**
 * Role -> provider/model assignment.
 *
 * GET always answers for every known role, whether or not a row exists: a
 * missing row and an explicit null connection are the SAME state -- CollabBoard
 * Default -- and the client should not have to know which it is looking at.
 * That is also why deleting a provider needs no cleanup here: the schema resets
 * the reference to NULL and the role reads as Default again.
 */

export const runtime = 'nodejs';

const ROLES = [AI_ROLE_SOURCE, AI_ROLE_EDIT] as const;

interface RoleAssignment {
  readonly connectionId: string | null;
  readonly modelId: string | null;
}

const putSchema = z.object({
  role: z.string().refine(isAIRole, { message: 'Unsupported AI role.' }),
  connectionId: z.string().uuid().nullable(),
  modelId: z.string().trim().min(1).max(MODEL_ID_MAX).nullish(),
});

export async function GET(request: Request) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repository = createAIRolePreferenceRepository();
  const stored = await repository.listPreferences(auth.userId as UserId);
  if (!stored.ok) {
    return NextResponse.json({ error: 'Could not load AI role preferences.' }, { status: 500 });
  }

  const byRole = new Map(stored.value.map((preference) => [preference.role, preference]));
  const roles: Record<string, RoleAssignment> = {};
  for (const role of ROLES) {
    const preference = byRole.get(role);
    roles[role] = {
      connectionId: preference?.connectionId ?? null,
      modelId: preference?.modelId ?? null,
    };
  }

  return NextResponse.json({ roles });
}

export async function PUT(request: Request) {
  const auth = await authenticateSettingsRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI role preference.' }, { status: 400 });
  }

  const { role, connectionId, modelId } = parsed.data;

  // The repository refuses a connection the caller does not own before writing,
  // and the database trigger refuses it again for every writer.
  const repository = createAIRolePreferenceRepository();
  const saved = await repository.setPreference(
    auth.userId as UserId,
    role,
    connectionId,
    modelId ?? null,
  );

  if (!saved.ok) {
    if (saved.error.code === 'not_found') {
      return NextResponse.json({ error: 'Provider connection not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Could not save the AI role preference.' }, { status: 500 });
  }

  return NextResponse.json({
    role,
    assignment: { connectionId, modelId: modelId ?? null } satisfies RoleAssignment,
  });
}
