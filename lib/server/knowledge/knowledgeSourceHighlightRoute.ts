import { NextResponse } from 'next/server';
import {
  asBoardId,
  asKnowledgeDocumentId,
  asKnowledgeSourceHighlightId,
  asSourceReferenceId,
  asUserId,
} from '../../domain/core/ids';
import type { DomainError, DomainErrorCode } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import type { KnowledgeSourceHighlight } from '../../domain/knowledge/knowledgeSourceHighlight';
import type {
  CreateKnowledgeSourceHighlightCommandInput,
  DeleteKnowledgeSourceHighlightCommandInput,
  ListKnowledgeSourceHighlightsInput,
  UpdateKnowledgeSourceHighlightColorCommandInput,
} from '../../domain/knowledge/knowledgeSourceHighlightWrite';

/**
 * PDF-R6K-H2A -- HTTP edge for standalone highlights.
 *
 * Same shape as the citation route: the session hands back an identity and
 * bound commands, never a Supabase client, so a handler here cannot choose an
 * authority or construct infrastructure. Board identity comes from the ROUTE
 * path and the user from the session; a request body that names a board, a
 * user or an author reaches nothing.
 */

export interface KnowledgeSourceHighlightRouteContext {
  readonly params: Promise<{ id: string }>;
}

export interface KnowledgeSourceHighlightItemRouteContext {
  readonly params: Promise<{ id: string; highlightId: string }>;
}

export interface KnowledgeSourceHighlightSession {
  readonly userId: string;
  listHighlights(
    input: ListKnowledgeSourceHighlightsInput,
  ): Promise<Result<readonly KnowledgeSourceHighlight[], DomainError>>;
  createHighlight(
    input: CreateKnowledgeSourceHighlightCommandInput,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>>;
  updateHighlightColor(
    input: UpdateKnowledgeSourceHighlightColorCommandInput,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>>;
  deleteHighlight(
    input: DeleteKnowledgeSourceHighlightCommandInput,
  ): Promise<Result<true, DomainError>>;
}

export interface KnowledgeSourceHighlightRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgeSourceHighlightSession | null>;
}

const INVALID = 'Invalid highlight';
const UNAVAILABLE = 'Highlights are temporarily unavailable';

const ERROR_RESPONSES: Record<DomainErrorCode, { status: number; error: string }> = {
  validation: { status: 400, error: INVALID },
  permission_denied: { status: 403, error: 'Forbidden' },
  not_found: { status: 404, error: 'Highlight target not found' },
  conflict: { status: 409, error: 'Highlight already exists' },
  rate_limited: { status: 429, error: 'Too many requests' },
  quota_exceeded: { status: 403, error: 'Forbidden' },
  unavailable: { status: 503, error: UNAVAILABLE },
  unknown: { status: 500, error: 'Could not complete highlight request' },
};

function failure(error: DomainError): NextResponse {
  // Stable public copy only: a domain message is developer-facing and its cause
  // may carry provider detail.
  const mapped = ERROR_RESPONSES[error.code] ?? ERROR_RESPONSES.unknown;
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}

function publicHighlight(highlight: KnowledgeSourceHighlight) {
  return {
    id: highlight.id,
    sourceDocumentId: highlight.sourceDocumentId,
    pageNumber: highlight.pageNumber,
    charStart: highlight.charStart,
    charEnd: highlight.charEnd,
    quoteText: highlight.quoteText,
    quoteHash: highlight.quoteHash,
    color: highlight.color,
    createdBy: highlight.createdBy,
    createdAt: highlight.createdAt,
    updatedAt: highlight.updatedAt,
    sourceReferenceId: highlight.sourceReferenceId,
  };
}

interface CreateBody {
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly quoteText: string;
  readonly color: string;
  readonly sourceReferenceId: string | null;
}

/**
 * Structural checks only, exactly as the citation route does it: enough to
 * build the typed command input. Every semantic rule -- integer pages, span
 * ordering, quote length, colour format, origin document agreement -- lives in
 * the domain so there is one place those invariants can be read.
 */
function parseCreateBody(value: unknown): CreateBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.sourceDocumentId !== 'string' || body.sourceDocumentId.length === 0) return null;
  if (typeof body.pageNumber !== 'number') return null;
  if (typeof body.charStart !== 'number' || typeof body.charEnd !== 'number') return null;
  if (typeof body.quoteText !== 'string') return null;
  if (typeof body.color !== 'string') return null;
  // Absent and explicit null both mean "no origin citation", so a plain
  // highlight needs no field at all; anything else present must be a string.
  if (body.sourceReferenceId !== undefined && body.sourceReferenceId !== null
    && typeof body.sourceReferenceId !== 'string') return null;
  return {
    // Rebuilt field by field rather than forwarded, so a body hanging a
    // boardId, createdBy, quoteHash, id or createdAt off itself cannot smuggle
    // any of them inward.
    sourceDocumentId: body.sourceDocumentId,
    pageNumber: body.pageNumber,
    charStart: body.charStart,
    charEnd: body.charEnd,
    quoteText: body.quoteText,
    color: body.color,
    sourceReferenceId: typeof body.sourceReferenceId === 'string' && body.sourceReferenceId.length > 0
      ? body.sourceReferenceId
      : null,
  };
}

/** PATCH accepts exactly one field. There is no general row patching here. */
function parseColorBody(value: unknown): { color: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.color !== 'string') return null;
  return { color: body.color };
}

async function requireSession(
  deps: KnowledgeSourceHighlightRouteDependencies,
): Promise<KnowledgeSourceHighlightSession | NextResponse> {
  let session: KnowledgeSourceHighlightSession | null;
  try {
    session = await deps.getAuthenticatedSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}

export function createKnowledgeSourceHighlightGetHandler(
  deps: KnowledgeSourceHighlightRouteDependencies,
) {
  return async function GET(
    request: Request,
    context: KnowledgeSourceHighlightRouteContext,
  ): Promise<NextResponse> {
    const session = await requireSession(deps);
    if (session instanceof NextResponse) return session;

    const { id } = await context.params;
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    if (!documentId) return NextResponse.json({ error: INVALID }, { status: 400 });

    const rawPage = url.searchParams.get('pageNumber');
    let pageNumber: number | null = null;
    if (rawPage !== null) {
      // A query string is text: a page that is not a number is a bad request,
      // never a silent "all pages".
      const parsed = Number(rawPage);
      if (!Number.isFinite(parsed)) return NextResponse.json({ error: INVALID }, { status: 400 });
      pageNumber = parsed;
    }

    let result: Result<readonly KnowledgeSourceHighlight[], DomainError>;
    try {
      result = await session.listHighlights({
        boardId: asBoardId(id),
        userId: asUserId(session.userId),
        sourceDocumentId: asKnowledgeDocumentId(documentId),
        pageNumber,
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    if (!result.ok) return failure(result.error);
    return NextResponse.json({ highlights: result.value.map(publicHighlight) }, { status: 200 });
  };
}

export function createKnowledgeSourceHighlightPostHandler(
  deps: KnowledgeSourceHighlightRouteDependencies,
) {
  return async function POST(
    request: Request,
    context: KnowledgeSourceHighlightRouteContext,
  ): Promise<NextResponse> {
    const session = await requireSession(deps);
    if (session instanceof NextResponse) return session;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: INVALID }, { status: 400 });
    }
    const body = parseCreateBody(payload);
    if (!body) return NextResponse.json({ error: INVALID }, { status: 400 });

    const { id } = await context.params;

    let result: Result<KnowledgeSourceHighlight, DomainError>;
    try {
      result = await session.createHighlight({
        boardId: asBoardId(id),
        userId: asUserId(session.userId),
        sourceDocumentId: asKnowledgeDocumentId(body.sourceDocumentId),
        pageNumber: body.pageNumber,
        charStart: body.charStart,
        charEnd: body.charEnd,
        quoteText: body.quoteText,
        color: body.color,
        sourceReferenceId: body.sourceReferenceId === null
          ? null
          : asSourceReferenceId(body.sourceReferenceId),
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    if (!result.ok) return failure(result.error);
    return NextResponse.json({ highlight: publicHighlight(result.value) }, { status: 201 });
  };
}

export function createKnowledgeSourceHighlightPatchHandler(
  deps: KnowledgeSourceHighlightRouteDependencies,
) {
  return async function PATCH(
    request: Request,
    context: KnowledgeSourceHighlightItemRouteContext,
  ): Promise<NextResponse> {
    const session = await requireSession(deps);
    if (session instanceof NextResponse) return session;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: INVALID }, { status: 400 });
    }
    const body = parseColorBody(payload);
    if (!body) return NextResponse.json({ error: INVALID }, { status: 400 });

    const { id, highlightId } = await context.params;

    let result: Result<KnowledgeSourceHighlight, DomainError>;
    try {
      result = await session.updateHighlightColor({
        boardId: asBoardId(id),
        userId: asUserId(session.userId),
        highlightId: asKnowledgeSourceHighlightId(highlightId),
        color: body.color,
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    if (!result.ok) return failure(result.error);
    return NextResponse.json({ highlight: publicHighlight(result.value) }, { status: 200 });
  };
}

export function createKnowledgeSourceHighlightDeleteHandler(
  deps: KnowledgeSourceHighlightRouteDependencies,
) {
  return async function DELETE(
    _request: Request,
    context: KnowledgeSourceHighlightItemRouteContext,
  ): Promise<NextResponse> {
    const session = await requireSession(deps);
    if (session instanceof NextResponse) return session;

    const { id, highlightId } = await context.params;

    let result: Result<true, DomainError>;
    try {
      // Deletes the highlight and nothing else. The bound command has no
      // citation, padlet or Note write available to it.
      result = await session.deleteHighlight({
        boardId: asBoardId(id),
        userId: asUserId(session.userId),
        highlightId: asKnowledgeSourceHighlightId(highlightId),
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    if (!result.ok) return failure(result.error);
    return NextResponse.json({ deleted: true }, { status: 200 });
  };
}
