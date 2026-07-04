import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { findOrphanedPadletReferences } from '@/lib/data-hygiene/orphanedReferences';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';

function groupByBoard(findings: Awaited<ReturnType<typeof findOrphanedPadletReferences>>) {
  const grouped = new Map<
    string,
    {
      boardId: string;
      boardTitle: string;
      findings: typeof findings;
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

export async function GET() {
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

    const findings = await findOrphanedPadletReferences({
      supabase,
      workspaceId: workspaceContext.workspaceId,
    });

    return NextResponse.json(
      {
        workspaceName: workspaceContext.workspaceName,
        totalFindings: findings.length,
        byBoard: groupByBoard(findings),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to load report: ${message}` }, { status: 500 });
  }
}
