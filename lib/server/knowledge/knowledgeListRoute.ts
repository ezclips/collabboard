import { NextResponse } from 'next/server';
import { asBoardId } from '../../domain/core/ids';
import type { BoardId } from '../../domain/core/ids';
import type { KnowledgeDocumentReadRepository } from '../../infra/knowledge/knowledgeReadAdapters';

export interface KnowledgeListRouteContext {
  readonly params: Promise<{ id: string }>;
}

export interface KnowledgeReadSession {
  canViewBoard(boardId: BoardId): Promise<boolean>;
}

export interface KnowledgeListRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgeReadSession | null>;
  createRepository(): KnowledgeDocumentReadRepository;
}

/**
 * Authenticated, read-only Knowledge document list for one board.
 * Reader permission is sufficient; mutation permissions are intentionally not
 * reused because viewers need to see already-attached PDFs.
 */
export function createKnowledgeListGetHandler(deps: KnowledgeListRouteDependencies) {
  return async function GET(
    _request: Request,
    context: KnowledgeListRouteContext,
  ): Promise<NextResponse> {
    let session: KnowledgeReadSession | null;
    try {
      session = await deps.getAuthenticatedSession();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const boardId = asBoardId(id);

    try {
      if (!(await session.canViewBoard(boardId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      return NextResponse.json(
        { error: 'Knowledge documents are temporarily unavailable' },
        { status: 503 },
      );
    }

    try {
      const result = await deps.createRepository().listDocumentsByBoardId(boardId);
      if (!result.ok) {
        return NextResponse.json(
          { error: 'Knowledge documents are temporarily unavailable' },
          { status: result.error.code === 'unavailable' ? 503 : 500 },
        );
      }

      return NextResponse.json({ documents: result.value }, { status: 200 });
    } catch {
      return NextResponse.json(
        { error: 'Knowledge documents are temporarily unavailable' },
        { status: 503 },
      );
    }
  };
}
