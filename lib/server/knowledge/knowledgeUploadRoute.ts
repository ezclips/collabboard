import { NextResponse } from 'next/server';
import { PLANS } from '@/lib/domain/billing/plans';
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
import {
  KNOWLEDGE_UPLOADS_PER_HOUR,
  MB,
  planLimitMessage,
  tooLargeMessage,
  UPLOAD_LIMITS,
} from '@/lib/domain/storage/uploadLimits';
import type { BoardPlan } from '@/lib/server/billing/boardPlan';

/**
 * PATCH-180. At most this many Knowledge uploads per user per rolling hour.
 *
 * The same in-memory fixed-window shape the AI routes use, and for the same
 * reason: every upload starts the extraction worker, so a burst is real work,
 * not just a row. Its per-instance scope is pre-existing debt, not addressed
 * here. Kept at MODULE scope so the count survives across handler calls (the
 * route factory is invoked once per module load).
 */
const uploadRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000;

function checkUploadRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = uploadRateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > UPLOAD_RATE_WINDOW_MS) {
    uploadRateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= KNOWLEDGE_UPLOADS_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

/**
 * The size limit and label for a chosen file, decided ONCE before the bytes are
 * read. The same PDF-or-text routing the handler uses below, read here as a
 * size question rather than a validation one.
 *
 * PATCH-185. The effective limit is the PLAN's per-file size capped by the
 * server's own technical maximum: the upload passes through server memory, so
 * no plan can accept 250 MB or 1 GB yet (PATCH-186 adds direct-to-storage
 * uploads). `planIsBinding` records WHICH of the two refused the file, so the
 * message can say "on the Free plan" only when the plan is what a user must
 * change.
 */
function sizeLimitForFile(
  file: File,
  plan: BoardPlan,
): { limit: number; label: string; planIsBinding: boolean } {
  const source = { filename: file.name, mimeType: file.type };
  const technical =
    isKnowledgeDocxCandidate(source) || isKnowledgeTextCandidate(source)
      ? { limit: UPLOAD_LIMITS.knowledgeText, label: 'documents' }
      : { limit: UPLOAD_LIMITS.knowledgePdf, label: 'PDFs' };

  const planLimit = plan.limits.fileSizeBytes;
  const planIsBinding = planLimit < technical.limit;

  return {
    limit: planIsBinding ? planLimit : technical.limit,
    label: technical.label,
    planIsBinding,
  };
}

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
  /**
   * PATCH-185. The plan of the workspace that OWNS the board, plus its
   * document count. `documentCount` is null when the plan's
   * `processedDocuments` is null (unlimited), so an unlimited plan never pays
   * for a count it does not use.
   */
  resolvePlanForBoard(
    boardId: string,
  ): Promise<{ plan: BoardPlan; documentCount: number | null }>;
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

    // PATCH-180. Per USER, before the body is read: an over-quota caller cannot
    // make the server buffer a multi-megabyte upload just to be told no.
    if (!checkUploadRateLimit(userId)) {
      return NextResponse.json({ error: 'Too many uploads. Try again in a while.' }, { status: 429 });
    }

    // PATCH-180. The DECLARED size, before `formData()` reads the body into
    // memory. The +1 MB is multipart overhead, so a file that is exactly at the
    // limit is not refused for the boundary text around it. The body is not
    // parsed to check this, so the number is the client's own claim -- which is
    // why the authoritative `file.size` check below follows it.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > UPLOAD_LIMITS.knowledgePdf + MB) {
      return NextResponse.json(
        { error: 'This file is too large. The limit is 50 MB.' },
        { status: 413 },
      );
    }

    const { id: boardId } = await context.params;

    // PATCH-185 PRIVACY, ACCEPTED. The owner's plan is resolved BEFORE the
    // ingestion path checks board access, because the plan must be known before
    // the body is read. A caller without access to the board therefore learns at
    // most "this board's owner is on <plan>" from a refusal message -- no ids
    // and no amounts. The board authorization that follows is unchanged.
    let planForBoard: { plan: BoardPlan; documentCount: number | null };
    try {
      planForBoard = await deps.resolvePlanForBoard(boardId);
    } catch {
      return NextResponse.json(
        { error: 'Knowledge upload is temporarily unavailable' },
        { status: 503 },
      );
    }

    // PATCH-185. The document allowance, counted across the owner's workspace.
    // Checked BEFORE formData() so an over-quota caller cannot make the server
    // buffer an upload just to be refused.
    const documentLimit = planForBoard.plan.limits.processedDocuments;
    if (
      planForBoard.documentCount !== null &&
      documentLimit !== null &&
      planForBoard.documentCount >= documentLimit
    ) {
      const planName = PLANS[planForBoard.plan.planId].name;
      return NextResponse.json(
        {
          error: `The ${planName} plan includes ${documentLimit} documents. Upgrade to add more.`,
          code: 'plan_limit_documents',
        },
        { status: 403 },
      );
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

    // PATCH-180/185. The ACTUAL size, before `arrayBuffer()` reads the file
    // whole. The plan's own limit may be the binding one; if so, the refusal
    // names the plan and carries a `plan_limit_file_size` code the client turns
    // into an upgrade link. Otherwise it is the pre-existing technical message.
    const sizeGate = sizeLimitForFile(file, planForBoard.plan);
    if (file.size > sizeGate.limit) {
      if (sizeGate.planIsBinding) {
        const planName = PLANS[planForBoard.plan.planId].name;
        return NextResponse.json(
          {
            error: planLimitMessage(file.size, sizeGate.limit, planName),
            code: 'plan_limit_file_size',
          },
          { status: 413 },
        );
      }
      return NextResponse.json(
        { error: tooLargeMessage(file.size, sizeGate.limit, sizeGate.label) },
        { status: 413 },
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 });
    }

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
