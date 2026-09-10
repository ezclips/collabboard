import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';
import type { DomainError } from '../../lib/domain/core/errors';
import type { Result } from '../../lib/domain/core/result';
import {
  claimKnowledgeDocumentForProcessing,
  completeKnowledgeExtraction,
  failKnowledgeExtraction,
  renewKnowledgeProcessingLease,
  sanitizeKnowledgeProcessingError,
} from '../../lib/domain/knowledge/knowledgeExtraction';
import type {
  KnowledgeExtractionJob,
  KnowledgeExtractionRepository,
  KnowledgePageGeometryInput,
} from '../../lib/domain/knowledge/knowledgeExtraction';
import { DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS } from '../../lib/domain/knowledge/knowledgeExtraction';
import { normalizeOpenDataLoaderPdf } from '../../lib/infra/knowledge/openDataLoaderPdfNormalizer';
import { buildKnowledgeChunks } from '../../lib/domain/knowledge/knowledgeChunking';
import { knowledgeMalformedPageWarnings } from '../../lib/domain/knowledge/knowledgeTextQuality';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
} from '../../lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeExtractionRepository } from '../../lib/infra/knowledge/knowledgeExtractionAdapters';
import {
  KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
  knowledgeDerivativeEligibility,
  knowledgePageDerivativePath,
} from '../../lib/domain/knowledge/knowledgePdfRenderPolicy';
import { extractPdfPageGeometry } from './pdfGeometry';
import { rasterizePdfPages } from './pdfPageRaster';
import {
  assertWorkerRuntimePath,
  boundedDiagnostic,
  DEFAULT_OPENDATALOADER_TIMEOUT_MS,
  OPENDATALOADER_PARSER_NAME,
  OPENDATALOADER_PDF_VERSION,
  openDataLoaderOptionsHash,
  OPENDATALOADER_PARSER_CONFIGURATION,
  runOpenDataLoader,
} from './openDataLoaderRunner';
import type { OpenDataLoaderRunInput, OpenDataLoaderRunResult } from './openDataLoaderRunner';

export const KNOWLEDGE_RAW_ARTIFACT_PATH = (
  boardId: string,
  documentId: string,
  processingAttempt: number,
  leaseToken: string,
): string =>
  `knowledge/${boardId}/${documentId}/extraction/attempt-${processingAttempt}-${leaseToken}/opendataloader-${OPENDATALOADER_PDF_VERSION}.json`;

const DEFAULT_MAX_PARSER_JSON_BYTES = 64 * 1024 * 1024;

export interface KnowledgeWorkerUploadOptions {
  readonly upsert?: boolean;
  readonly cacheControl?: string;
}

export interface KnowledgeWorkerStorage {
  download(path: string): Promise<Uint8Array>;
  upload(
    path: string,
    bytes: Uint8Array,
    contentType: string,
    options?: KnowledgeWorkerUploadOptions,
  ): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Derivatives are immutable for a given path, so they cache for a year. */
const KNOWLEDGE_DERIVATIVE_CACHE_CONTROL = '31536000';

/**
 * Low-cardinality derivative outcomes. Never carries document text, a path, a
 * signed URL or a stack trace -- these are counters, not diagnostics.
 */
export type KnowledgeDerivativeWarning =
  | 'text_only_ineligible' | 'raster_partial' | 'raster_failed'
  | 'upload_partial' | 'upload_failed' | 'invalid_derivative_path';

export interface KnowledgePdfParser {
  run(input: OpenDataLoaderRunInput): Promise<OpenDataLoaderRunResult>;
}

export interface KnowledgePdfWorkerDependencies {
  readonly repository: KnowledgeExtractionRepository;
  readonly storage: KnowledgeWorkerStorage;
  readonly parser: KnowledgePdfParser;
  readonly geometry: (bytes: Uint8Array) => Promise<readonly KnowledgePageGeometryInput[]>;
  /** Test seam only. Production leaves this unset and gets rasterizePdfPages. */
  readonly rasterizePages?: typeof rasterizePdfPages;
  readonly hasher: { sha256(bytes: Uint8Array): Promise<string> };
  readonly parserOptionsHash: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly leaseTtlSeconds?: number;
  readonly heartbeatIntervalMs?: number;
  readonly maxParserJsonBytes?: number;
  readonly tempRoot?: string;
}

export type KnowledgePdfWorkerStatus = 'ready' | 'failed' | 'stale' | 'not_claimed';

export interface KnowledgePdfWorkerResult {
  readonly status: KnowledgePdfWorkerStatus;
  readonly documentId: KnowledgeDocumentId;
  readonly stage: string;
  readonly pageCount?: number;
  readonly error?: string;
  /**
   * Diagnostic classification of the FIRST failure, carried out of the pipeline
   * so the dispatcher can log it.
   *
   * ALLOWLISTED, not sanitized -- see errorClassOf/errorCodeOf. A failure gets
   * to choose its own `name` and `code`, so redacting them is the wrong tool:
   * they are matched against a fixed vocabulary and collapse to
   * `UnknownError` / `UNKNOWN` otherwise. Log-safe by construction.
   */
  readonly errorClass?: string;
  readonly errorCode?: string;
  /**
   * The provider's own failure code behind an `unavailable` DomainError -- a
   * PostgREST code or a PostgreSQL SQLSTATE, matched against a closed grammar
   * (see dbErrorCodeOf) and otherwise absent. It does not replace `errorCode`;
   * it says WHICH database failure produced it.
   */
  readonly dbErrorCode?: string;
  readonly failureRecorded?: boolean;
  readonly rawArtifactPath?: string;
  /**
   * NOT log-safe: assembled from a secondary failure's raw text, which never
   * passes through sanitizeKnowledgeProcessingError. It stays a return value
   * for a caller inspecting one job in a test or a script.
   */
  readonly cleanupWarning?: string;
  readonly derivativeWarning?: KnowledgeDerivativeWarning;
}

class KnowledgePdfWorkerError extends Error {
  readonly stage: string;
  readonly diagnostics?: string;

  constructor(stage: string, message: string, diagnostics?: string) {
    super(message);
    this.name = 'KnowledgePdfWorkerError';
    this.stage = stage;
    this.diagnostics = diagnostics ? boundedDiagnostic(diagnostics) : undefined;
  }
}

class StaleKnowledgeLeaseError extends Error {
  constructor() {
    super('Knowledge processing lease is stale');
    this.name = 'StaleKnowledgeLeaseError';
  }
}

interface LeaseHeartbeat {
  readonly lost: () => boolean;
  stop(): Promise<void>;
}

function startLeaseHeartbeat(
  deps: KnowledgePdfWorkerDependencies,
  job: KnowledgeExtractionJob,
): LeaseHeartbeat {
  const leaseTtlSeconds = deps.leaseTtlSeconds ?? DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS;
  const intervalMs = deps.heartbeatIntervalMs ?? Math.max(1_000, Math.floor((leaseTtlSeconds * 1_000) / 3));
  let stopped = false;
  let leaseLost = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped || leaseLost) return;
    inFlight = (async () => {
      const renewed = await renewKnowledgeProcessingLease(
        { repository: deps.repository, leaseTtlSeconds },
        job.documentId,
        job.leaseToken,
      );
      if (!renewed.ok) leaseLost = true;
    })();
    try {
      await inFlight;
    } catch {
      leaseLost = true;
    } finally {
      inFlight = undefined;
    }
    if (!stopped && !leaseLost) timer = setTimeout(() => void tick(), intervalMs);
  };

  timer = setTimeout(() => void tick(), intervalMs);
  return {
    lost: () => leaseLost,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (inFlight) await inFlight;
    },
  };
}

function errorMessage(error: unknown): string {
  // TOTAL, for the same reason safeProperty is: `instanceof` consults the
  // prototype chain and `in` consults a `has` trap, so a Proxy can throw from
  // either. This runs while a failure is already being recorded.
  try {
    if (error instanceof KnowledgePdfWorkerError) {
      return error.diagnostics ? `${error.message}: ${error.diagnostics}` : error.message;
    }
    if (error instanceof Error) return error.message;
    const message = safeProperty(error, 'message');
    if (typeof message === 'string') return message;
  } catch {
    // Fall through to the generic reason.
  }
  return 'Extraction failed';
}

function currentStage(error: unknown, fallback: string): string {
  try {
    return error instanceof KnowledgePdfWorkerError ? error.stage : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Total, because it decides a STATE TRANSITION, not a log line.
 *
 * A value whose `getPrototypeOf` trap throws makes `instanceof` throw, and
 * this one sits in the canonical catch: an exception here escapes
 * processKnowledgePdfDocument entirely, so the document is never marked
 * failed, the lease runs to expiry and the dispatcher reports a bare worker
 * error with no stage. Unrecognisable means not-stale, which is the path that
 * records the failure.
 */
function isStaleLease(error: unknown): boolean {
  try {
    return error instanceof StaleKnowledgeLeaseError;
  } catch {
    return false;
  }
}

async function findParserJsonFile(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json') &&
        entry.name.toLowerCase() !== 'summary.json'
      ) {
        files.push(fullPath);
      }
    }
  }
  await visit(root);
  files.sort((left, right) => left.localeCompare(right));
  const selected = files[0];
  if (!selected) throw new KnowledgePdfWorkerError('parser-output', 'OpenDataLoader produced no JSON output');
  return selected;
}

async function readParserJson(outputDir: string, maxBytes: number): Promise<{ bytes: Uint8Array; value: unknown }> {
  const jsonPath = await findParserJsonFile(outputDir);
  const stat = await fs.stat(jsonPath);
  if (stat.size > maxBytes) {
    throw new KnowledgePdfWorkerError(
      'parser-output',
      `OpenDataLoader JSON output exceeds the worker diagnostic bound of ${maxBytes} bytes`,
    );
  }
  const bytes = new Uint8Array(await fs.readFile(jsonPath));
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch (error: unknown) {
    throw new KnowledgePdfWorkerError('parser-output', 'OpenDataLoader produced invalid JSON', errorMessage(error));
  }
  return { bytes, value };
}

async function removeRawArtifact(
  storage: KnowledgeWorkerStorage,
  rawArtifactPath: string | undefined,
): Promise<string | undefined> {
  if (!rawArtifactPath) return undefined;
  try {
    await storage.remove(rawArtifactPath);
    return undefined;
  } catch (error: unknown) {
    return boundedDiagnostic(errorMessage(error));
  }
}

/**
 * ALLOWLISTED diagnostics. Neither of these may carry a value the FAILURE
 * chose for us.
 *
 * Filtering an arbitrary `Error.name` down to identifier characters is not a
 * safety property: `SUPER_SECRET_TOKEN` passes such a filter unchanged, and a
 * provider `code` is provider-controlled text. So only classes this worker
 * actually understands are named, only codes it actually acts on are reported,
 * and everything else collapses to a constant. A diagnostic that cannot be
 * recognised is worth less than a leak costs.
 */
const KNOWN_ERROR_CLASSES: ReadonlySet<string> = new Set([
  'KnowledgePdfWorkerError',
  'StaleKnowledgeLeaseError',
  'OpenDataLoaderProcessError',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AbortError',
]);

/** Codes this worker raises itself, the DomainError vocabulary, and Node errno. */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  'TIMEOUT',
  'PROCESS_ERROR',
  'not_found',
  'unavailable',
  'unknown',
  'invalid',
  'conflict',
  'forbidden',
  'ENOENT',
  'EACCES',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOSPC',
  'EAI_AGAIN',
]);

/**
 * Reads one property without letting a hostile getter escape.
 *
 * Inspecting a thrown value happens ON the failure path, where a throw does
 * not surface a second problem -- it REPLACES the first one. An error whose
 * `code` getter throws used to become an unhandled rejection that lost the
 * stage, the reason and the finished event together. Diagnostics must never be
 * able to do that.
 */
function safeProperty(error: unknown, key: string): unknown {
  try {
    if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
    return (error as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function errorClassOf(error: unknown): string {
  const name = safeProperty(error, 'name');
  if (typeof name === 'string' && KNOWN_ERROR_CLASSES.has(name)) return name;
  return 'UnknownError';
}

function errorCodeOf(error: unknown): string {
  if (errorClassOf(error) === 'OpenDataLoaderProcessError') {
    // The one case worth naming explicitly: a timeout and a non-zero exit are
    // different operational problems sharing one class, and the deployed
    // worker gave us no way to tell them apart.
    return safeProperty(error, 'timedOut') === true ? 'TIMEOUT' : 'PROCESS_ERROR';
  }
  const code = safeProperty(error, 'code');
  // An HTTP-style status is a bounded number from a fixed range, not provider
  // text; it is safe, and it is the code that matters for a storage failure.
  if (typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599) {
    return String(code);
  }
  if (typeof code === 'string') {
    if (KNOWN_ERROR_CODES.has(code)) return code;
    if (/^[1-5][0-9]{2}$/.test(code)) return code;
  }
  return 'UNKNOWN';
}

/**
 * PostgREST codes, and PostgreSQL SQLSTATEs, and nothing else.
 *
 * `PGRST\d{3}` is PostgREST's own vocabulary; a SQLSTATE is exactly five
 * uppercase ASCII alphanumerics (`42703`, `23514`, `P0001`, `42P01`). Both are
 * closed, self-delimiting grammars, which is the whole reason this field can
 * be logged at all -- a value is either already one of these tokens or it is
 * dropped. Nothing is trimmed, upcased or otherwise coerced INTO the grammar,
 * because coercion is how an arbitrary provider string becomes a
 * "valid-looking" code.
 */
const DB_ERROR_CODE = /^(?:PGRST[0-9]{3}|[0-9A-Z]{5})$/;

/**
 * The provider's own failure code, recovered from the preserved cause.
 *
 * The adapter already wraps every PostgREST failure as
 * `domainError('unavailable', 'Could not commit the extraction result',
 * { cause })`, so the code that actually distinguishes a missing column
 * (42703) from a stale schema cache (PGRST202) from a check violation (23514)
 * survives -- but only `DomainError.code` was ever logged, which is the
 * constant `unavailable` for all of them. One token closes that gap.
 *
 * Deliberately NOT `instanceof`-based and total, like every other reader on
 * this path: a hostile `cause` getter, a hostile `cause.code` getter or a
 * Proxy must not be able to change what the worker does.
 */
function dbErrorCodeOf(error: unknown): string | undefined {
  const code = safeProperty(safeProperty(error, 'cause'), 'code');
  if (typeof code !== 'string') return undefined;
  return DB_ERROR_CODE.test(code) ? code : undefined;
}

async function recordFailure(
  deps: KnowledgePdfWorkerDependencies,
  documentId: KnowledgeDocumentId,
  leaseToken: string,
  error: unknown,
  stage: string,
  cleanupWarning?: string,
): Promise<KnowledgePdfWorkerResult> {
  let failure: Result<void, DomainError>;
  try {
    failure = await failKnowledgeExtraction(deps, documentId, leaseToken, error);
  } catch (failureError: unknown) {
    return {
      status: 'failed',
      documentId,
      stage,
      error: sanitizeKnowledgeProcessingError(error),
      errorClass: errorClassOf(error),
      errorCode: errorCodeOf(error),
      ...(dbErrorCodeOf(error) === undefined ? {} : { dbErrorCode: dbErrorCodeOf(error) }),
      failureRecorded: false,
      cleanupWarning: [cleanupWarning, `failure transition error: ${boundedDiagnostic(errorMessage(failureError))}`]
        .filter(Boolean)
        .join('; ') || undefined,
    };
  }
  if (!failure.ok && failure.error.code === 'not_found') {
    return {
      status: 'stale',
      documentId,
      stage,
      error: 'Knowledge document was deleted during extraction',
      cleanupWarning,
    };
  }
  return {
    status: 'failed',
    documentId,
    stage,
    error: sanitizeKnowledgeProcessingError(error),
    errorClass: errorClassOf(error),
    errorCode: errorCodeOf(error),
    ...(dbErrorCodeOf(error) === undefined ? {} : { dbErrorCode: dbErrorCodeOf(error) }),
    failureRecorded: failure.ok,
    cleanupWarning,
  };
}

function geometryRecord(geometry: readonly KnowledgePageGeometryInput[]): Readonly<Record<number, {
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly rotation?: number;
}>> {
  return Object.fromEntries(
    geometry.map((page) => [page.pageNumber, {
      widthPoints: page.widthPoints,
      heightPoints: page.heightPoints,
      rotation: page.rotation ?? undefined,
    }]),
  );
}

/**
 * Optional page derivatives, generated only after the document is already ready.
 *
 * The canonical text is committed before this runs. A `ready` row matches
 * neither list_knowledge_processing_candidates nor claim_knowledge_extraction,
 * so it cannot be rediscovered or reclaimed once complete. A `failed` row is
 * different: list_knowledge_processing_candidates does not discover it, but
 * claim_knowledge_extraction accepts it, so a retry can pick it up and re-run
 * the whole extraction. Marking a text-complete document failed for a missing
 * optional image would therefore both misreport it and expose it to being
 * re-processed, which is why every failure here becomes a warning instead.
 *
 * The caller adds a second, structural guard around this call -- see
 * processKnowledgePdfDocument.
 */
async function generatePageDerivatives(
  deps: KnowledgePdfWorkerDependencies,
  job: KnowledgeExtractionJob,
  sourceBytes: Uint8Array,
  pageCount: number,
): Promise<KnowledgeDerivativeWarning | undefined> {
  try {
    const eligibility = knowledgeDerivativeEligibility({
      sourcePdfBytes: sourceBytes.byteLength,
      pageCount,
    });
    // Oversized or over-length sources are text-only, which is a normal
    // outcome and not a failure: no render is even attempted.
    if (!eligibility.eligible) return 'text_only_ineligible';

    const raster = await (deps.rasterizePages ?? rasterizePdfPages)(sourceBytes);
    if (raster.pages.length === 0) return 'raster_failed';

    let uploaded = 0;
    let unbuildablePath = false;
    // Sequential and page-local: one failure never stops the pages after it,
    // and nothing already stored is rolled back. A later attempt overwrites
    // the same deterministic paths because derivatives upsert.
    for (const page of raster.pages) {
      const objectPath = knowledgePageDerivativePath(job.boardId, job.documentId, page.pageNumber);
      if (objectPath === null) {
        unbuildablePath = true;
        continue;
      }
      try {
        await deps.storage.upload(objectPath, page.bytes, KNOWLEDGE_DERIVATIVE_CONTENT_TYPE, {
          upsert: true,
          cacheControl: KNOWLEDGE_DERIVATIVE_CACHE_CONTROL,
        });
        uploaded += 1;
      } catch {
        // Page-local: the next page is still attempted.
      }
    }

    if (unbuildablePath) return 'invalid_derivative_path';
    if (uploaded === 0) return 'upload_failed';
    if (uploaded < raster.pages.length) return 'upload_partial';
    if (raster.skipped.length > 0) return 'raster_partial';
    return undefined;
  } catch (error: unknown) {
    console.error(JSON.stringify({
      documentId: job.documentId,
      stage: 'page-derivatives',
      error: boundedDiagnostic(errorMessage(error)),
    }));
    return 'raster_failed';
  }
}

/**
 * Process exactly one explicit Knowledge document. There is deliberately no
 * polling, queue access, scheduler, or retry loop in this operation.
 */
export async function processKnowledgePdfDocument(
  deps: KnowledgePdfWorkerDependencies,
  documentId: KnowledgeDocumentId,
): Promise<KnowledgePdfWorkerResult> {
  const leaseTtlSeconds = deps.leaseTtlSeconds ?? DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS;
  const claimed = await claimKnowledgeDocumentForProcessing(
    { repository: deps.repository, leaseTtlSeconds },
    documentId,
  );
  if (!claimed.ok) {
    return { status: 'not_claimed', documentId, stage: 'claim', error: sanitizeKnowledgeProcessingError(claimed.error) };
  }

  const job: KnowledgeExtractionJob = claimed.value;
  let stage = 'download';
  let rawArtifactPath: string | undefined;
  let rawUploaded = false;
  let tempDirectory: string | undefined;
  const heartbeat = startLeaseHeartbeat(deps, job);

  const assertLease = (): void => {
    if (heartbeat.lost()) throw new StaleKnowledgeLeaseError();
  };

  try {
    const originalBytes = await deps.storage.download(job.storagePath);
    stage = 'source-hash';
    const actualHash = await deps.hasher.sha256(originalBytes);
    if (actualHash !== job.contentSha256) {
      throw new KnowledgePdfWorkerError(
        stage,
        `Source PDF hash mismatch (expected ${job.contentSha256.slice(0, 12)}, received ${actualHash.slice(0, 12)})`,
      );
    }

    stage = 'geometry';
    const geometry = await deps.geometry(originalBytes);
    assertLease();
    tempDirectory = await fs.mkdtemp(path.join(deps.tempRoot ?? os.tmpdir(), 'collabboard-knowledge-pdf-'));
    const inputPath = path.join(tempDirectory, 'source.pdf');
    const outputDir = path.join(tempDirectory, 'output');
    await fs.mkdir(outputDir);
    await fs.writeFile(inputPath, originalBytes);

    stage = 'parser';
    const execution = await deps.parser.run({ inputPath, outputDir });
    assertLease();
    if (execution.exitCode !== 0) {
      throw new KnowledgePdfWorkerError(
        stage,
        `OpenDataLoader exited with code ${execution.exitCode ?? 'unknown'}`,
        execution.stderr || execution.stdout,
      );
    }

    stage = 'normalize';
    const parserOutput = await readParserJson(
      outputDir,
      deps.maxParserJsonBytes ?? DEFAULT_MAX_PARSER_JSON_BYTES,
    );
    const extraction = normalizeOpenDataLoaderPdf(parserOutput.value, {
      contentSha256: job.contentSha256,
      parser: {
        name: deps.parserName,
        version: deps.parserVersion,
        optionsHash: deps.parserOptionsHash,
      },
      pageGeometry: geometryRecord(geometry),
    });
    /**
     * Measured, never repaired, and never able to change what is stored.
     *
     * A page whose own font carries no Unicode for a glyph reaches this point
     * already missing that character -- the normalizer's NUL substitution is
     * the last honest thing anyone can do with it. This loop only counts what
     * was lost and says so, so a degraded page is visible instead of silently
     * slightly wrong. It reads `extraction.pages` and writes nothing.
     */
    for (const warning of knowledgeMalformedPageWarnings(extraction.pages)) {
      console.error(JSON.stringify({
        documentId: job.documentId,
        stage: 'text-quality',
        event: 'PDF_TEXT_EXTRACTION_QUALITY_WARNING',
        page: warning.pageNumber,
        invalidCharacterCount: warning.invalidCharacterCount,
        nonWhitespaceLength: warning.nonWhitespaceLength,
      }));
    }

    const chunks = buildKnowledgeChunks(extraction.pages);
    assertLease();

    stage = 'raw-artifact-upload';
    rawArtifactPath = KNOWLEDGE_RAW_ARTIFACT_PATH(
      job.boardId,
      job.documentId,
      job.processingAttempt,
      job.leaseToken,
    );
    await deps.storage.upload(rawArtifactPath, parserOutput.bytes, 'application/json');
    rawUploaded = true;
    assertLease();

    stage = 'complete';
    await heartbeat.stop();
    assertLease();
    const completed = await completeKnowledgeExtraction(
      { repository: deps.repository, hasher: deps.hasher },
      { documentId, processingLeaseToken: job.leaseToken, extraction, geometry, chunks, rawArtifactPath },
    );
    if (!completed.ok) {
      const cleanupWarning = await removeRawArtifact(deps.storage, rawUploaded ? rawArtifactPath : undefined);
      return recordFailure(deps, documentId, job.leaseToken, completed.error, stage, cleanupWarning);
    }

    // Past this point the document is ready and its text is authoritative;
    // derivatives are optional enhancement data layered on top of it.
    //
    // This catch is what makes the boundary structural rather than a property
    // of the helper: without it, anything escaping generatePageDerivatives
    // would fall into the canonical catch below and stamp an already-ready
    // document failed. The thrown value is deliberately never read -- not its
    // message, not its stack, not via String() -- because a value whose
    // accessors throw is exactly the case that defeats an inspecting handler.
    let derivativeWarning: KnowledgeDerivativeWarning | undefined;
    try {
      derivativeWarning = await generatePageDerivatives(
        deps,
        job,
        originalBytes,
        completed.value.pageCount,
      );
    } catch {
      derivativeWarning = 'raster_failed';
    }

    return {
      status: 'ready',
      documentId,
      stage,
      pageCount: completed.value.pageCount,
      rawArtifactPath,
      derivativeWarning,
    };
  } catch (error: unknown) {
    const cleanupWarning = await removeRawArtifact(deps.storage, rawUploaded ? rawArtifactPath : undefined);
    if (isStaleLease(error) || heartbeat.lost()) {
      return {
        status: 'stale',
        documentId,
        stage: currentStage(error, stage),
        error: 'Knowledge processing lease is stale',
        cleanupWarning,
      };
    }
    return recordFailure(deps, documentId, job.leaseToken, error, currentStage(error, stage), cleanupWarning);
  } finally {
    await heartbeat.stop();
    if (tempDirectory) {
      try {
        await fs.rm(tempDirectory, { recursive: true, force: true });
      } catch (cleanupError: unknown) {
        console.error(JSON.stringify({
          documentId,
          stage: 'temp-cleanup',
          error: boundedDiagnostic(errorMessage(cleanupError)),
        }));
      }
    }
  }
}

/**
 * PDF-R1. Exported so the derivative repair path can reuse the SAME Storage
 * authority rather than opening a second one: identical bucket, identical
 * credentials, identical error handling.
 */
export function createKnowledgeWorkerStorage(client: SupabaseClient): KnowledgeWorkerStorage {
  return new SupabaseKnowledgeWorkerStorage(client);
}

class SupabaseKnowledgeWorkerStorage implements KnowledgeWorkerStorage {
  constructor(private readonly client: SupabaseClient) {}

  async download(storagePath: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) throw new Error(`Could not download source PDF: ${error?.message ?? 'no data'}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async upload(
    storagePath: string,
    bytes: Uint8Array,
    contentType: string,
    options?: KnowledgeWorkerUploadOptions,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .upload(storagePath, bytes, {
        contentType,
        // Raw extraction artifacts stay non-overwritable; only derivatives opt in.
        upsert: options?.upsert ?? false,
        ...(options?.cacheControl ? { cacheControl: options.cacheControl } : {}),
      });
    if (error) throw new Error(`Could not upload extraction artifact: ${error.message}`);
  }

  async remove(storagePath: string): Promise<void> {
    const { error } = await this.client.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove([storagePath]);
    if (error) throw new Error(`Could not remove extraction artifact: ${error.message}`);
  }
}

export interface KnowledgePdfWorkerEnvironment {
  readonly [key: string]: string | undefined;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly OPENDATALOADER_JAVA_BIN?: string;
  readonly OPENDATALOADER_JAR_PATH?: string;
  readonly OPENDATALOADER_TIMEOUT_MS?: string;
  readonly KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS?: string;
  readonly KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS?: string;
}

function requiredEnvironment(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the Knowledge PDF worker`);
  return value;
}

function timeoutFromEnvironment(value: string | undefined): number {
  if (value === undefined) return DEFAULT_OPENDATALOADER_TIMEOUT_MS;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0) throw new Error('OPENDATALOADER_TIMEOUT_MS must be a positive integer');
  return timeout;
}

function positiveIntegerEnvironment(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function createKnowledgePdfWorkerFromEnvironment(
  environment: KnowledgePdfWorkerEnvironment = process.env,
): KnowledgePdfWorkerDependencies {
  const url = requiredEnvironment(environment.SUPABASE_URL, 'SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment(environment.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const javaBin = assertWorkerRuntimePath(environment.OPENDATALOADER_JAVA_BIN, 'OPENDATALOADER_JAVA_BIN');
  const jarPath = assertWorkerRuntimePath(environment.OPENDATALOADER_JAR_PATH, 'OPENDATALOADER_JAR_PATH');
  const leaseTtlSeconds = positiveIntegerEnvironment(
    environment.KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS,
    'KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS',
    DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS,
  );
  const heartbeatIntervalMs = environment.KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS
    ? positiveIntegerEnvironment(
        environment.KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS,
        'KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS',
        1_000,
      )
    : Math.max(1_000, Math.floor((leaseTtlSeconds * 1_000) / 3));
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    repository: new SupabaseKnowledgeExtractionRepository(client as never),
    storage: new SupabaseKnowledgeWorkerStorage(client),
    parser: {
      run: (input) => runOpenDataLoader({
        javaBin,
        jarPath,
        timeoutMs: timeoutFromEnvironment(environment.OPENDATALOADER_TIMEOUT_MS),
      }, input),
    },
    geometry: extractPdfPageGeometry,
    hasher: new NodeKnowledgeContentHasher(),
    parserName: OPENDATALOADER_PARSER_NAME,
    parserVersion: OPENDATALOADER_PDF_VERSION,
    parserOptionsHash: openDataLoaderOptionsHash(OPENDATALOADER_PARSER_CONFIGURATION),
    leaseTtlSeconds,
    heartbeatIntervalMs,
  };
}
