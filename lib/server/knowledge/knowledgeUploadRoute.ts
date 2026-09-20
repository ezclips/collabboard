import { NextResponse } from 'next/server';
import type { DomainError } from '@/lib/domain/core/errors';
import { asBoardId, asUserId } from '@/lib/domain/core/ids';
import {
  createKnowledgePdfUpload,
  type KnowledgeIngestionDeps,
} from '@/lib/domain/knowledge/knowledgeIngestion';
import { isKnowledgeTextCandidate } from '@/lib/domain/knowledge/knowledgeTextIngestion';
import {
  extractKnowledgeDocxText,
  isKnowledgeDocxCandidate,
} from '@/lib/infra/knowledge/knowledgeDocxExtractionAdapter';
import { knowledgeExtractionNotices } from '@/lib/domain/knowledge/knowledgeExtractionNotices';
import {
  createKnowledgeTextUpload,
  type KnowledgeTextChunkHasher,
  type KnowledgeTextUploadDeps,
} from '@/lib/domain/knowledge/knowledgeTextUpload';

export interface KnowledgeUploadRouteContext {
  readonly params: Promise<{ id: string }>;
}

/**
 * The text path's collaborators, bound together.
 *
 * One factory rather than two dependencies because a text upload cannot happen
 * without a chunk hasher: separating them would make "wired, but with no way to
 * hash a chunk" a representable state of the route.
 */
export interface KnowledgeTextIngestionWiring {
  readonly deps: KnowledgeTextUploadDeps;
  readonly hashChunk: KnowledgeTextChunkHasher;
}

export interface KnowledgeUploadRouteDependencies {
  getAuthenticatedUserId(): Promise<string | null>;
  createIngestionDeps(): KnowledgeIngestionDeps;
  createTextIngestionDeps(): KnowledgeTextIngestionWiring;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    typeof value.arrayBuffer === 'function'
  );
}

function domainErrorResponse(error: DomainError): NextResponse {
  switch (error.code) {
    case 'validation':
      // The domain's own message, not a generic one. Every `validation` error
      // on both ingestion paths is authored user-facing text that says what to
      // do about it ("The selected file is empty", "...is not valid UTF-8"),
      // and the text path's refusals are worth nothing if they arrive as
      // "Invalid PDF upload". Only the message travels; never the cause.
      return NextResponse.json({ error: error.message }, { status: 400 });
    case 'permission_denied':
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    case 'not_found':
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    case 'conflict':
      return NextResponse.json({ error: 'Knowledge upload conflict' }, { status: 409 });
    case 'rate_limited':
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    case 'quota_exceeded':
      return NextResponse.json({ error: 'Knowledge upload quota exceeded' }, { status: 403 });
    case 'unavailable':
      return NextResponse.json(
        { error: 'Knowledge upload is temporarily unavailable' },
        { status: 503 },
      );
    case 'unknown':
    default:
      return NextResponse.json({ error: 'Knowledge upload failed' }, { status: 500 });
  }
}

/**
 * Thin HTTP boundary for one Knowledge PDF upload.
 *
 * Authentication is injected so the production route can use the existing
 * Supabase server session while focused tests exercise this boundary without
 * browser/session setup. Validation, authorization, hashing, Storage,
 * persistence, and compensation remain owned by createKnowledgePdfUpload().
 */
export function createKnowledgeUploadPostHandler(deps: KnowledgeUploadRouteDependencies) {
  return async function POST(
    request: Request,
    context: KnowledgeUploadRouteContext,
  ): Promise<NextResponse> {
    let userId: string | null;
    try {
      userId = await deps.getAuthenticatedUserId();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!isUploadFile(file)) {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 });
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 });
    }

    const { id: boardId } = await context.params;
    const source = { filename: file.name, mimeType: file.type, bytes };

    try {
      // WHICH PATH IS DECIDED HERE, ONCE, and both paths validate again for
      // themselves. This is a routing question, not an authorization one: a
      // file that looks like text but is not gets refused by the text
      // validator's decode, and one that claims to be a PDF but is not gets
      // refused by the signature check. Neither validator trusts this
      // predicate; it only chooses which of them answers.
      const input = { boardId: asBoardId(boardId), userId: asUserId(userId), file: source };
      let result;
      // What the extraction dropped or decided, carried back to the only
      // moment the person is still looking at the document.
      let notices: readonly string[] = [];
      if (isKnowledgeDocxCandidate(source)) {
        // EXTRACTION BEFORE CANONICALISATION. A .docx is a ZIP and would fail
        // the strict UTF-8 decode the text path opens with, so it is turned
        // into text first and the text path is handed the result. Doing it the
        // other way -- canonicalise, extract on failure -- would make a corrupt
        // .docx indistinguishable from a mis-encoded text file.
        const extracted = await extractKnowledgeDocxText(bytes);
        if (!extracted.ok) return domainErrorResponse(extracted.error);
        notices = knowledgeExtractionNotices(extracted.value);
        const text = deps.createTextIngestionDeps();
        result = await createKnowledgeTextUpload(
          text.deps,
          { ...input, file: { ...source, extraction: extracted.value } },
          text.hashChunk,
        );
      } else if (isKnowledgeTextCandidate(source)) {
        const text = deps.createTextIngestionDeps();
        result = await createKnowledgeTextUpload(text.deps, input, text.hashChunk);
      } else {
        result = await createKnowledgePdfUpload(deps.createIngestionDeps(), input);
      }

      if (!result.ok) return domainErrorResponse(result.error);

      return NextResponse.json(
        {
          id: String(result.value.id),
          boardId: String(result.value.boardId),
          originalFilename: result.value.originalFilename,
          processingStatus: result.value.processingStatus,
          // The client polls an 'uploaded' document until a worker promotes it.
          // A text source arrives 'ready' and there is nothing to poll for, so
          // the kind travels with it rather than being inferred from a status
          // that could also belong to a PDF whose extraction already finished.
          kind: result.value.kind,
          // Absent for a source that kept everything it had, rather than an
          // empty array every client has to remember to check.
          ...(notices.length > 0 ? { notices } : {}),
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        { error: 'Knowledge upload is temporarily unavailable' },
        { status: 503 },
      );
    }
  };
}
