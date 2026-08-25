import { NextResponse } from 'next/server';
import { asBoardId, asKnowledgeDocumentId, asPostId, asUserId } from '../../domain/core/ids';
import type { DomainError, DomainErrorCode } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import type { SourceReference } from '../../domain/knowledge/knowledgePersistence';
import type { CreateKnowledgeSourceReferenceInput } from '../../domain/knowledge/knowledgeSourceReferenceWrite';

export interface KnowledgeSourceReferenceRouteContext {
  readonly params: Promise<{ id: string }>;
}

/**
 * The authenticated context is deliberately narrow: an identity plus a bound
 * command. The handler therefore cannot reach a Supabase client, choose an
 * authority, or construct infrastructure of any kind — that decision belongs
 * to the app route, which is what keeps RLS in play on the final insert.
 */
export interface KnowledgeSourceReferenceSession {
  readonly userId: string;
  createSourceReference(
    input: CreateKnowledgeSourceReferenceInput,
  ): Promise<Result<SourceReference, DomainError>>;
}

export interface KnowledgeSourceReferenceRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgeSourceReferenceSession | null>;
}

interface SourceReferenceRequestBody {
  readonly targetPadletId: string;
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly selectedText: string | null;
}

const INVALID = 'Invalid source reference';
const UNAVAILABLE = 'Source references are temporarily unavailable';

const ERROR_RESPONSES: Record<DomainErrorCode, { status: number; error: string }> = {
  validation: { status: 400, error: INVALID },
  permission_denied: { status: 403, error: 'Forbidden' },
  not_found: { status: 404, error: 'Source reference target not found' },
  conflict: { status: 409, error: 'Source reference conflict' },
  rate_limited: { status: 429, error: 'Too many requests' },
  quota_exceeded: { status: 403, error: 'Forbidden' },
  unavailable: { status: 503, error: UNAVAILABLE },
  unknown: { status: 500, error: 'Could not create source reference' },
};

/**
 * Structural checks only — just enough to build the typed command input. Every
 * semantic rule (integer pages, range ordering, quote length) stays in the F4-A
 * domain command so there is exactly one place those invariants live.
 */
function parseBody(value: unknown): SourceReferenceRequestBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.targetPadletId !== 'string' || body.targetPadletId.length === 0) return null;
  if (typeof body.sourceDocumentId !== 'string' || body.sourceDocumentId.length === 0) return null;
  if (typeof body.pageStart !== 'number') return null;
  if (typeof body.pageEnd !== 'number') return null;
  if (body.quoteText !== null && typeof body.quoteText !== 'string') return null;
  // B4-B2A fields. Absent and explicit null are both "not supplied", which is
  // what keeps every pre-B4 request body valid unchanged; anything else must be
  // the right primitive, so "4", {} and [] are structural rejections.
  if (!isNullableNumber(body.charStart) || !isNullableNumber(body.charEnd)) return null;
  if (body.selectedText !== undefined && body.selectedText !== null
    && typeof body.selectedText !== 'string') return null;
  return {
    targetPadletId: body.targetPadletId,
    sourceDocumentId: body.sourceDocumentId,
    pageStart: body.pageStart,
    pageEnd: body.pageEnd,
    quoteText: body.quoteText,
    charStart: typeof body.charStart === 'number' ? body.charStart : null,
    charEnd: typeof body.charEnd === 'number' ? body.charEnd : null,
    selectedText: typeof body.selectedText === 'string' ? body.selectedText : null,
  };
}

function isNullableNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'number';
}

function publicReference(reference: SourceReference) {
  return {
    id: reference.id,
    targetPadletId: reference.targetPadletId,
    sourceDocumentId: reference.sourceDocumentId,
    pageStart: reference.pageStart,
    pageEnd: reference.pageEnd,
    quoteText: reference.quoteText,
    quoteHash: reference.quoteHash,
    charStart: reference.charStart,
    charEnd: reference.charEnd,
    locator: reference.locator,
    createdAt: reference.createdAt,
  };
}

export function createKnowledgeSourceReferencePostHandler(
  deps: KnowledgeSourceReferenceRouteDependencies,
) {
  return async function POST(
    request: Request,
    context: KnowledgeSourceReferenceRouteContext,
  ): Promise<NextResponse> {
    let session: KnowledgeSourceReferenceSession | null;
    try {
      session = await deps.getAuthenticatedSession();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: INVALID }, { status: 400 });
    }

    const body = parseBody(payload);
    if (!body) return NextResponse.json({ error: INVALID }, { status: 400 });

    const { id } = await context.params;

    let result: Result<SourceReference, DomainError>;
    try {
      // Built field by field: identity comes from the route and the session, so
      // a body carrying boardId, userId, quoteHash, a locator, an id or a
      // createdAt cannot reach the domain command at all. The char offsets and
      // selected text ARE caller input from B4-B2A on -- every semantic rule
      // about them, and the canonical quote itself, stays server-side.
      result = await session.createSourceReference({
        boardId: asBoardId(id),
        userId: asUserId(session.userId),
        targetPadletId: asPostId(body.targetPadletId),
        sourceDocumentId: asKnowledgeDocumentId(body.sourceDocumentId),
        pageStart: body.pageStart,
        pageEnd: body.pageEnd,
        quoteText: body.quoteText,
        charStart: body.charStart,
        charEnd: body.charEnd,
        selectedText: body.selectedText,
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    if (!result.ok) {
      // Stable public copy only: the domain message is developer-facing and may
      // carry provider detail in its cause.
      const mapped = ERROR_RESPONSES[result.error.code] ?? ERROR_RESPONSES.unknown;
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    return NextResponse.json({ reference: publicReference(result.value) }, { status: 201 });
  };
}
