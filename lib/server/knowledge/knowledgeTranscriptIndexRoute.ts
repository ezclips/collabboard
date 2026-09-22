// The board's transcript index, for the media cards on that board.
//
// READER PERMISSION IS SUFFICIENT, and it is the same decision the document
// list beside this one already made for the same reason: a viewer who can see
// an attached PDF must be able to see that a video on the board has a
// transcript. Requiring edit permission would show a viewer "Add transcript" on
// a card whose transcript already exists -- offering them an action they cannot
// take, for a thing that is already done.
//
// WHAT THE RESPONSE CARRIES IS DELIBERATELY NARROW: which video a transcript
// claims, whether it is usable, and what to call it. Not the cues, not the
// text. See the adapter for why.

import { NextResponse } from 'next/server';
import { asBoardId } from '../../domain/core/ids';
import type { BoardId } from '../../domain/core/ids';
import type { KnowledgeTranscriptIndexRepository } from '../../infra/knowledge/knowledgeTranscriptIndexAdapters';

export interface KnowledgeTranscriptIndexRouteContext {
  readonly params: Promise<{ id: string }>;
}

export interface KnowledgeTranscriptIndexSession {
  canViewBoard(boardId: BoardId): Promise<boolean>;
}

export interface KnowledgeTranscriptIndexRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgeTranscriptIndexSession | null>;
  createRepository(): KnowledgeTranscriptIndexRepository;
}

export function createKnowledgeTranscriptIndexGetHandler(
  deps: KnowledgeTranscriptIndexRouteDependencies,
) {
  return async function GET(
    _request: Request,
    context: KnowledgeTranscriptIndexRouteContext,
  ): Promise<NextResponse> {
    let session: KnowledgeTranscriptIndexSession | null;
    try {
      session = await deps.getAuthenticatedSession();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const boardId = asBoardId(id);

    try {
      if (!(await session.canViewBoard(boardId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      // A PERMISSION CHECK THAT THREW DID NOT SAY "NO". It said nothing, and
      // 403 would tell the reader something false about their own access.
      return NextResponse.json({ error: 'Transcripts are temporarily unavailable' }, { status: 503 });
    }

    try {
      const result = await deps.createRepository().listTranscriptsByBoardId(boardId);
      if (!result.ok) {
        return NextResponse.json(
          { error: 'Transcripts are temporarily unavailable' },
          { status: result.error.code === 'unavailable' ? 503 : 500 },
        );
      }
      return NextResponse.json({ transcripts: result.value }, { status: 200 });
    } catch {
      return NextResponse.json({ error: 'Transcripts are temporarily unavailable' }, { status: 503 });
    }
  };
}
