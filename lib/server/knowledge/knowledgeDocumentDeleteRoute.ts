import { NextResponse } from 'next/server';
import type { DomainError, DomainErrorCode } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import type { KnowledgeDeletionOutcome } from '../../domain/knowledge/knowledgeDeletion';

/**
 * Deleting ONE Knowledge document -- the HTTP edge.
 *
 * WHY IT EXISTS. `deleteKnowledgeDocument` has been implemented, tested and
 * unreachable: until this route, the only path that reached it was deleting the
 * whole BOARD. A document could be created by anyone who could upload and
 * removed by nobody, and chat upload made that worse -- a PDF added from the
 * chat drawer has no canvas card, so it had no board affordance either.
 * See `.agent/retrieval-followups.md` item 15.
 *
 * SAME SHAPE AS THE HIGHLIGHT ROUTE, deliberately. The session hands back an
 * identity and one bound command, never a Supabase client, so a handler here
 * cannot choose an authority or construct infrastructure. Board identity comes
 * from the ROUTE path and the user from the session; a request body reaches
 * nothing at all, because this handler never reads one.
 *
 * WHAT THE BOUND COMMAND CAN WRITE, stated the way the highlight route states
 * it: the document row and its Storage objects. It has no write available to
 * `board_ai_messages`, so a stored answer that cited this document keeps its
 * citations and keeps its signature. That is the decision recorded in item 15
 * -- an answer citing a document deleted later is a true statement about the
 * past, and scrubbing the citation would invalidate the provenance HMAC over
 * the very message it was trying to tidy. The two citation CONSUMERS carry a
 * defined gone state instead.
 */

export interface KnowledgeDocumentDeleteRouteContext {
  readonly params: Promise<{ id: string; documentId: string }>;
}

export interface KnowledgeDocumentDeleteSession {
  readonly userId: string;
  deleteDocument(input: {
    readonly boardId: string;
    readonly documentId: string;
    readonly userId: string;
  }): Promise<Result<KnowledgeDeletionOutcome, DomainError>>;
}

export interface KnowledgeDocumentDeleteRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgeDocumentDeleteSession | null>;
}

const UNAVAILABLE = 'Knowledge documents are temporarily unavailable';

const ERROR_RESPONSES: Record<DomainErrorCode, { status: number; error: string }> = {
  validation: { status: 400, error: 'Invalid request' },
  permission_denied: { status: 403, error: 'Forbidden' },
  not_found: { status: 404, error: 'Knowledge document was not found' },
  conflict: { status: 409, error: 'Knowledge document could not be deleted' },
  rate_limited: { status: 429, error: 'Too many requests' },
  quota_exceeded: { status: 403, error: 'Forbidden' },
  unavailable: { status: 503, error: UNAVAILABLE },
  unknown: { status: 500, error: 'Could not complete the delete request' },
};

function failure(error: DomainError): NextResponse {
  // Stable public copy only: a domain message is developer-facing and its cause
  // may carry provider detail.
  const mapped = ERROR_RESPONSES[error.code] ?? ERROR_RESPONSES.unknown;
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}

export function createKnowledgeDocumentDeleteHandler(
  deps: KnowledgeDocumentDeleteRouteDependencies,
) {
  return async function DELETE(
    _request: Request,
    context: KnowledgeDocumentDeleteRouteContext,
  ): Promise<NextResponse> {
    let session: KnowledgeDocumentDeleteSession | null;
    try {
      session = await deps.getAuthenticatedSession();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, documentId } = await context.params;

    let result: Result<KnowledgeDeletionOutcome, DomainError>;
    try {
      result = await session.deleteDocument({
        boardId: id,
        documentId,
        userId: session.userId,
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    if (!result.ok) return failure(result.error);

    // THE ROW IS GONE EITHER WAY, and the response says so plainly rather than
    // reporting a half success the caller cannot act on. Storage cleanup runs
    // AFTER the authoritative database delete and continues past an individual
    // failure, so 'partial' means the row is deleted and one or more objects
    // were left behind. A client cannot fix that and must not re-issue the
    // delete -- the document no longer exists to delete -- so this is a 200
    // carrying the fact, not an error.
    return NextResponse.json(
      {
        deleted: true,
        storageCleanup: {
          status: result.value.storageCleanup.status,
          // Counts, not paths. A storage key is infrastructure detail and a
          // browser has no use for it.
          attempted: result.value.storageCleanup.attemptedPaths.length,
          failed: result.value.storageCleanup.failedPaths.length,
        },
      },
      { status: 200 },
    );
  };
}
