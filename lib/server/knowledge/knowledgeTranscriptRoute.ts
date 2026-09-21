// The HTTP boundary for one transcript import.
//
// THIN, like the upload route beside it. Validation, authorization, hashing,
// storage and persistence belong to importKnowledgeTranscript(); this parses
// a request, maps a domain error to a status, and returns what the caller
// needs to edit on.
//
// WHAT COMES BACK MATTERS AS MUCH AS WHAT GOES IN. A caller that saves and
// then edits again must carry the NEW hash and the NEW revision, or its next
// write will be refused -- or worse, will match a token the database has
// already moved past. Both are in every success response.

import { NextResponse } from 'next/server';
import type { DomainError } from '@/lib/domain/core/errors';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '@/lib/domain/core/ids';
import {
  importKnowledgeTranscript,
  KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN,
  type KnowledgeTranscriptImportDeps,
} from '@/lib/domain/knowledge/knowledgeTranscriptImport';
import type { KnowledgeTranscriptFormat } from '@/lib/domain/knowledge/knowledgeTranscriptCues';

export interface KnowledgeTranscriptRouteContext {
  readonly params: Promise<{ id: string }>;
}

export interface KnowledgeTranscriptRouteDependencies {
  getAuthenticatedUserId(): Promise<string | null>;
  createTranscriptDeps(): KnowledgeTranscriptImportDeps;
  /** Somewhere to send cleanup candidates. See the note at its call site. */
  recordCleanupCandidate?(entry: {
    readonly boardId: string;
    readonly documentId: string;
    readonly path: string;
  }): void;
}

const FORMATS: readonly KnowledgeTranscriptFormat[] = ['srt', 'vtt', 'plain'];
const TRACK_KINDS = ['human', 'machine', 'unknown'] as const;

type TrackKind = (typeof TRACK_KINDS)[number];

function isFormat(value: unknown): value is KnowledgeTranscriptFormat {
  return typeof value === 'string' && (FORMATS as readonly string[]).includes(value);
}

function isTrackKind(value: unknown): value is TrackKind {
  return typeof value === 'string' && (TRACK_KINDS as readonly string[]).includes(value);
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function domainErrorResponse(error: DomainError): NextResponse {
  const details = error.details as { code?: unknown } | undefined;

  // SAVED-STATE-UNCERTAIN IS NOT A FAILED SAVE and must not be retried
  // blindly: the write committed. 409 would invite exactly the retry that
  // overwrites somebody else's edit, so it travels as its own shape with the
  // instruction the client has to follow.
  if (details?.code === KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN) {
    return NextResponse.json(
      {
        error: error.message,
        code: KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN,
        refreshRequired: true,
        safeToRetry: false,
      },
      { status: 500 },
    );
  }

  switch (error.code) {
    case 'validation':
      // The domain's own message. Its refusals are authored user-facing text
      // that says what to do about them, and they are worth nothing if they
      // arrive as "Invalid transcript".
      return NextResponse.json({ error: error.message }, { status: 400 });
    case 'permission_denied':
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    case 'not_found':
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
    case 'conflict':
      return NextResponse.json(
        { error: error.message, refreshRequired: true, safeToRetry: true },
        { status: 409 },
      );
    case 'rate_limited':
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    case 'quota_exceeded':
      return NextResponse.json({ error: error.message }, { status: 403 });
    case 'unavailable':
      return NextResponse.json({ error: error.message }, { status: 503 });
    case 'unknown':
    default:
      return NextResponse.json({ error: 'Transcript import failed' }, { status: 500 });
  }
}

export function createKnowledgeTranscriptPostHandler(deps: KnowledgeTranscriptRouteDependencies) {
  return async function POST(
    request: Request,
    context: KnowledgeTranscriptRouteContext,
  ): Promise<NextResponse> {
    let userId: string | null;
    try {
      userId = await deps.getAuthenticatedUserId();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: boardId } = await context.params;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'A transcript is required' }, { status: 400 });
    }

    const payload = body.payload;
    if (typeof payload !== 'string' || payload.length === 0) {
      return NextResponse.json({ error: 'A transcript is required' }, { status: 400 });
    }

    // FORMAT IS DECLARED, NEVER SNIFFED, and the route does not guess on the
    // client's behalf either. Reading a nearly-SRT paste as SRT would drop the
    // lines that did not fit, and a transcript missing cues looks exactly like
    // one that never had them.
    if (!isFormat(body.format)) {
      return NextResponse.json(
        { error: 'Choose the transcript format: SRT, WebVTT, or plain text' },
        { status: 400 },
      );
    }

    const title = optionalString(body.title);
    if (title === null) {
      return NextResponse.json({ error: 'A transcript needs a name' }, { status: 400 });
    }

    const trackKind = isTrackKind(body.trackKind) ? body.trackKind : 'unknown';

    // BOTH HALVES OF THE EXPECTED VERSION, OR NEITHER. A replacement carrying
    // only the hash cannot be separated from a concurrent metadata edit, which
    // is the whole reason the revision exists -- so a half-specified
    // replacement is refused rather than quietly treated as a create.
    let replaces: { documentId: ReturnType<typeof asKnowledgeDocumentId>; expectedContentSha256: string; expectedMutationRevision: string } | null = null;
    const replacesRaw = body.replaces;
    if (replacesRaw !== null && replacesRaw !== undefined) {
      const candidate = replacesRaw as Record<string, unknown>;
      const documentId = optionalString(candidate.documentId);
      const expectedContentSha256 = optionalString(candidate.expectedContentSha256);
      const expectedMutationRevision = optionalString(candidate.expectedMutationRevision);
      if (documentId === null || expectedContentSha256 === null || expectedMutationRevision === null) {
        return NextResponse.json(
          {
            error:
              'Replacing a transcript needs the document, the version you opened, and its revision',
            refreshRequired: true,
          },
          { status: 400 },
        );
      }
      replaces = {
        documentId: asKnowledgeDocumentId(documentId),
        expectedContentSha256,
        expectedMutationRevision,
      };
    }

    const result = await importKnowledgeTranscript(deps.createTranscriptDeps(), {
      boardId: asBoardId(boardId),
      userId: asUserId(userId),
      payload,
      format: body.format,
      title,
      language: optionalString(body.language),
      trackKind,
      videoIdentity: optionalString(body.videoIdentity),
      replaces,
    });

    if (!result.ok) return domainErrorResponse(result.error);

    // CLEANUP TELEMETRY, and it is telemetry -- not garbage collection. The
    // superseded object is RETAINED so an in-flight reader of the previous
    // version can still fetch it; this only records that it is collectable.
    // Followups item 19 has what a real sweep needs.
    if (result.value.supersededCleanupCandidate !== null) {
      deps.recordCleanupCandidate?.({
        boardId,
        documentId: String(result.value.document.id),
        path: result.value.supersededCleanupCandidate,
      });
    }

    return NextResponse.json(
      {
        documentId: result.value.document.id,
        // The caller MUST carry BOTH of these into its next edit.
        mutationRevision: result.value.mutationRevision,
        contentSha256: result.value.contentSha256,
        written: result.value.written,
        metadataOnly: result.value.metadataOnly,
        metadataChanged: result.value.metadataChanged,
        supersededCleanupCandidate: result.value.supersededCleanupCandidate,
      },
      { status: result.value.written ? 201 : 200 },
    );
  };
}
