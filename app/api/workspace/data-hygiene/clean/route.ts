import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { OrphanedRefFinding } from '@/lib/data-hygiene/orphanedReferences';
import { findOrphanedPadletReferences } from '@/lib/data-hygiene/orphanedReferences';
import { PADLET_METADATA_REF_ARRAY_KEY } from '@/lib/export/types';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';

type PadletRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

function groupByBoard(findings: OrphanedRefFinding[]) {
  const grouped = new Map<
    string,
    {
      boardId: string;
      boardTitle: string;
      findings: OrphanedRefFinding[];
    }
  >();

  for (const finding of findings) {
    const existing = grouped.get(finding.boardId);
    if (existing) {
      existing.findings.push(finding);
      continue;
    }
    grouped.set(finding.boardId, {
      boardId: finding.boardId,
      boardTitle: finding.boardTitle,
      findings: [finding],
    });
  }

  return [...grouped.values()].sort((a, b) => a.boardTitle.localeCompare(b.boardTitle));
}

function parseCleanupRequest(body: unknown): { dryRun: boolean; boardIds?: string[] } {
  if (!body || typeof body !== 'object') {
    return { dryRun: false };
  }

  const candidate = body as { dryRun?: unknown; boardIds?: unknown };
  let boardIds: string[] | undefined;
  if (candidate.boardIds !== undefined) {
    if (!Array.isArray(candidate.boardIds) || !candidate.boardIds.every((id) => typeof id === 'string')) {
      throw new Error('boardIds must be an array of strings.');
    }
    boardIds = candidate.boardIds;
  }

  return {
    dryRun: candidate.dryRun === true,
    boardIds,
  };
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: async () => cookieStore });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const workspaceContext = await resolveCurrentWorkspace(supabase, user);
    if (!workspaceContext) {
      return NextResponse.json({ error: 'No workspace found for this user.' }, { status: 404 });
    }

    const { dryRun, boardIds } = parseCleanupRequest(await request.json().catch(() => ({})));
    const findings = await findOrphanedPadletReferences({
      supabase,
      workspaceId: workspaceContext.workspaceId,
      boardIds,
    });

    if (dryRun) {
      return NextResponse.json(
        {
          workspaceName: workspaceContext.workspaceName,
          totalFindings: findings.length,
          byBoard: groupByBoard(findings),
          dryRun: true,
        },
        { status: 200 },
      );
    }

    if (findings.length === 0) {
      return NextResponse.json({ padletsUpdated: 0, findingsResolved: 0 }, { status: 200 });
    }

    const findingsByPadletId = new Map<string, OrphanedRefFinding[]>();
    for (const finding of findings) {
      const existing = findingsByPadletId.get(finding.padletId) || [];
      existing.push(finding);
      findingsByPadletId.set(finding.padletId, existing);
    }

    const padletIds = [...findingsByPadletId.keys()];
    const { data: padletRows, error: padletError } = await supabase
      .from('padlets')
      .select('id, metadata')
      .in('id', padletIds);

    if (padletError) {
      throw new Error(`Failed to load padlets for cleanup: ${padletError.message}`);
    }

    const padlets = (padletRows || []) as PadletRow[];
    let padletsUpdated = 0;
    let findingsResolved = 0;

    for (const padlet of padlets) {
      const padletFindings = findingsByPadletId.get(padlet.id);
      if (!padletFindings || padletFindings.length === 0) continue;

      const metadata = { ...((padlet.metadata || {}) as Record<string, unknown>) };
      let changed = false;

      for (const finding of padletFindings) {
        if (finding.field === PADLET_METADATA_REF_ARRAY_KEY) {
          const childIds = metadata[PADLET_METADATA_REF_ARRAY_KEY];
          if (!Array.isArray(childIds)) continue;
          const filtered = childIds.filter((childId) => childId !== finding.danglingValue);
          if (filtered.length !== childIds.length) {
            if (filtered.length > 0) {
              metadata[PADLET_METADATA_REF_ARRAY_KEY] = filtered;
            } else {
              delete metadata[PADLET_METADATA_REF_ARRAY_KEY];
            }
            changed = true;
            findingsResolved += 1;
          }
          continue;
        }

        if (metadata[finding.field] === finding.danglingValue) {
          delete metadata[finding.field];
          changed = true;
          findingsResolved += 1;
        }
      }

      if (!changed) continue;

      const { error: updateError } = await supabase
        .from('padlets')
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', padlet.id);

      if (updateError) {
        throw new Error(`Failed to update padlet ${padlet.id}: ${updateError.message}`);
      }

      padletsUpdated += 1;
    }

    return NextResponse.json({ padletsUpdated, findingsResolved }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Cleanup failed: ${message}` }, { status: 500 });
  }
}
