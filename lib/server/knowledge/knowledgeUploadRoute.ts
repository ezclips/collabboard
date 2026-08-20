import { NextResponse } from 'next/server';
import type { DomainError } from '@/lib/domain/core/errors';
import { asBoardId, asUserId } from '@/lib/domain/core/ids';
import {
  createKnowledgePdfUpload,
  type KnowledgeIngestionDeps,
} from '@/lib/domain/knowledge/knowledgeIngestion';

export interface KnowledgeUploadRouteContext {
  readonly params: Promise<{ id: string }>;
}

export interface KnowledgeUploadRouteDependencies {
  getAuthenticatedUserId(): Promise<string | null>;
  createIngestionDeps(): KnowledgeIngestionDeps;
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
      return NextResponse.json({ error: 'Invalid PDF upload' }, { status: 400 });
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
      return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!isUploadFile(file)) {
      return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 });
    }

    const { id: boardId } = await context.params;

    try {
      const result = await createKnowledgePdfUpload(deps.createIngestionDeps(), {
        boardId: asBoardId(boardId),
        userId: asUserId(userId),
        file: {
          filename: file.name,
          mimeType: file.type,
          bytes,
        },
      });

      if (!result.ok) return domainErrorResponse(result.error);

      return NextResponse.json(
        {
          id: String(result.value.id),
          boardId: String(result.value.boardId),
          originalFilename: result.value.originalFilename,
          processingStatus: result.value.processingStatus,
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
