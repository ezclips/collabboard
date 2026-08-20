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
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
} from '../../lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeExtractionRepository } from '../../lib/infra/knowledge/knowledgeExtractionAdapters';
import { extractPdfPageGeometry } from './pdfGeometry';
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

export interface KnowledgeWorkerStorage {
  download(path: string): Promise<Uint8Array>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface KnowledgePdfParser {
  run(input: OpenDataLoaderRunInput): Promise<OpenDataLoaderRunResult>;
}

export interface KnowledgePdfWorkerDependencies {
  readonly repository: KnowledgeExtractionRepository;
  readonly storage: KnowledgeWorkerStorage;
  readonly parser: KnowledgePdfParser;
  readonly geometry: (bytes: Uint8Array) => Promise<readonly KnowledgePageGeometryInput[]>;
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
  readonly failureRecorded?: boolean;
  readonly rawArtifactPath?: string;
  readonly cleanupWarning?: string;
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
  if (error instanceof KnowledgePdfWorkerError) {
    return error.diagnostics ? `${error.message}: ${error.diagnostics}` : error.message;
  }
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Extraction failed';
}

function currentStage(error: unknown, fallback: string): string {
  return error instanceof KnowledgePdfWorkerError ? error.stage : fallback;
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
      { documentId, processingLeaseToken: job.leaseToken, extraction, geometry, rawArtifactPath },
    );
    if (!completed.ok) {
      const cleanupWarning = await removeRawArtifact(deps.storage, rawUploaded ? rawArtifactPath : undefined);
      return recordFailure(deps, documentId, job.leaseToken, completed.error, stage, cleanupWarning);
    }

    return {
      status: 'ready',
      documentId,
      stage,
      pageCount: completed.value.pageCount,
      rawArtifactPath,
    };
  } catch (error: unknown) {
    const cleanupWarning = await removeRawArtifact(deps.storage, rawUploaded ? rawArtifactPath : undefined);
    if (error instanceof StaleKnowledgeLeaseError || heartbeat.lost()) {
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

class SupabaseKnowledgeWorkerStorage implements KnowledgeWorkerStorage {
  constructor(private readonly client: SupabaseClient) {}

  async download(storagePath: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) throw new Error(`Could not download source PDF: ${error?.message ?? 'no data'}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async upload(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: false });
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
