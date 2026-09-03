import type { DomainError } from '../../lib/domain/core/errors';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';
import type { Result } from '../../lib/domain/core/result';
import type { KnowledgePdfWorkerResult } from './processKnowledgePdfDocument';

export const DEFAULT_KNOWLEDGE_PDF_WORKER_CONCURRENCY = 2;
export const DEFAULT_KNOWLEDGE_PDF_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_KNOWLEDGE_PDF_DISCOVERY_LIMIT = 16;
export const MAX_KNOWLEDGE_PDF_WORKER_CONCURRENCY = 32;
export const MAX_KNOWLEDGE_PDF_DISCOVERY_LIMIT = 100;
export const DEFAULT_KNOWLEDGE_PDF_BACKOFF_MS = 1_000;
export const MAX_KNOWLEDGE_PDF_BACKOFF_MS = 30_000;

export interface KnowledgeProcessingCandidateRepository {
  listProcessingCandidates(limit: number): Promise<Result<readonly KnowledgeDocumentId[], DomainError>>;
}

export interface KnowledgePdfDispatcherDependencies {
  readonly discovery: KnowledgeProcessingCandidateRepository;
  readonly processDocument: (documentId: KnowledgeDocumentId) => Promise<KnowledgePdfWorkerResult>;
  /**
   * PDF-R1. One bounded derivative-render pass per dispatcher cycle.
   *
   * A SEPARATE path on purpose: it uses its own candidate RPC and its own
   * lease, so a ready document being repaired can never appear to the
   * extraction discovery above or reach claim_knowledge_extraction. Optional,
   * so a deployment that has not enabled repair behaves exactly as before.
   */
  readonly renderPass?: (limit: number) => Promise<number>;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly log?: (event: Record<string, unknown>) => void;
}

export interface KnowledgePdfDispatcherOptions {
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
  readonly discoveryLimit?: number;
  readonly backoffBaseMs?: number;
  readonly backoffMaxMs?: number;
  readonly signal?: AbortSignal;
}

export interface KnowledgePdfDispatcherSummary {
  readonly discovered: number;
  readonly started: number;
  readonly completed: number;
  readonly failed: number;
  readonly stale: number;
  readonly conflicts: number;
  readonly discoveryErrors: number;
  /** PDF-R1: documents whose page visuals this dispatcher repaired. */
  readonly rendered: number;
  readonly renderErrors: number;
  readonly stopped: boolean;
}

export interface KnowledgePdfDispatcherConfig {
  readonly concurrency: number;
  readonly pollIntervalMs: number;
  readonly discoveryLimit: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) throw new Error(`${name} must be a positive integer`);
  return resolved;
}

export function resolveKnowledgePdfDispatcherConfig(
  options: KnowledgePdfDispatcherOptions = {},
): KnowledgePdfDispatcherConfig {
  const concurrency = positiveInteger(
    options.concurrency,
    DEFAULT_KNOWLEDGE_PDF_WORKER_CONCURRENCY,
    'worker concurrency',
  );
  if (concurrency > MAX_KNOWLEDGE_PDF_WORKER_CONCURRENCY) {
    throw new Error(`worker concurrency must be <= ${MAX_KNOWLEDGE_PDF_WORKER_CONCURRENCY}`);
  }
  const pollIntervalMs = positiveInteger(
    options.pollIntervalMs,
    DEFAULT_KNOWLEDGE_PDF_POLL_INTERVAL_MS,
    'poll interval',
  );
  const discoveryLimit = positiveInteger(
    options.discoveryLimit,
    Math.min(DEFAULT_KNOWLEDGE_PDF_DISCOVERY_LIMIT, concurrency * 2),
    'discovery limit',
  );
  if (discoveryLimit > MAX_KNOWLEDGE_PDF_DISCOVERY_LIMIT) {
    throw new Error(`discovery limit must be <= ${MAX_KNOWLEDGE_PDF_DISCOVERY_LIMIT}`);
  }
  const backoffBaseMs = positiveInteger(options.backoffBaseMs, DEFAULT_KNOWLEDGE_PDF_BACKOFF_MS, 'backoff');
  const backoffMaxMs = positiveInteger(options.backoffMaxMs, MAX_KNOWLEDGE_PDF_BACKOFF_MS, 'maximum backoff');
  if (backoffMaxMs < backoffBaseMs) throw new Error('maximum backoff must be >= backoff');
  return { concurrency, pollIntervalMs, discoveryLimit, backoffBaseMs, backoffMaxMs };
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function logJobResult(
  log: (event: Record<string, unknown>) => void,
  documentId: KnowledgeDocumentId,
  result: KnowledgePdfWorkerResult,
): void {
  log({
    event: 'knowledge-pdf-job-finished',
    documentId,
    status: result.status,
    stage: result.stage,
  });
}

/**
 * Long-running database-discovery dispatcher. Discovery never claims work;
 * the P5C one-shot worker remains the ownership boundary.
 */
export async function runKnowledgePdfDispatcher(
  deps: KnowledgePdfDispatcherDependencies,
  options: KnowledgePdfDispatcherOptions = {},
): Promise<KnowledgePdfDispatcherSummary> {
  const config = resolveKnowledgePdfDispatcherConfig(options);
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.log ?? ((event) => console.log(JSON.stringify(event)));
  const signal = options.signal;
  const active = new Map<string, Promise<void>>();
  const summary = {
    discovered: 0,
    started: 0,
    completed: 0,
    failed: 0,
    stale: 0,
    conflicts: 0,
    discoveryErrors: 0,
    rendered: 0,
    renderErrors: 0,
  };
  let stopping = signal?.aborted ?? false;
  const onAbort = () => { stopping = true; };
  signal?.addEventListener('abort', onAbort, { once: true });

  const startJob = (documentId: KnowledgeDocumentId): void => {
    const key = String(documentId);
    if (active.has(key)) return;
    summary.started += 1;
    const job = Promise.resolve()
      .then(() => deps.processDocument(documentId))
      .then((result) => {
        if (result.status === 'ready') summary.completed += 1;
        else if (result.status === 'failed') summary.failed += 1;
        else if (result.status === 'stale') summary.stale += 1;
        else if (result.status === 'not_claimed') summary.conflicts += 1;
        logJobResult(log, documentId, result);
      })
      .catch((error: unknown) => {
        summary.failed += 1;
        log({
          event: 'knowledge-pdf-job-error',
          documentId,
          error: error instanceof Error ? error.message.split(/[\r\n]/, 1)[0].slice(0, 500) : 'worker error',
        });
      })
      .finally(() => { active.delete(key); });
    active.set(key, job);
  };

  try {
    let backoffMs = config.backoffBaseMs;
    while (!stopping) {
      if (active.size >= config.concurrency) {
        await Promise.race(active.values());
        continue;
      }

      const availableSlots = config.concurrency - active.size;
      const discovered = await deps.discovery.listProcessingCandidates(
        Math.min(config.discoveryLimit, availableSlots),
      );
      if (!discovered.ok) {
        summary.discoveryErrors += 1;
        log({ event: 'knowledge-pdf-discovery-error', error: discovered.error.message.split(/[\r\n]/, 1)[0].slice(0, 500) });
        await sleep(backoffMs, signal);
        backoffMs = Math.min(config.backoffMaxMs, backoffMs * 2);
        continue;
      }

      backoffMs = config.backoffBaseMs;
      summary.discovered += discovered.value.length;
      let started = 0;
      for (const documentId of discovered.value) {
        if (stopping || active.size >= config.concurrency) break;
        const before = active.size;
        startJob(documentId);
        if (active.size > before) started += 1;
      }

      if (started === 0) {
        /**
         * Only when extraction has nothing to do. Text is the product; a
         * missing picture never delays a document that has none yet, and this
         * ordering means the repair path cannot starve extraction.
         */
        if (deps.renderPass) {
          try {
            const repaired = await deps.renderPass(config.discoveryLimit);
            if (repaired > 0) {
              summary.rendered += repaired;
              log({ event: 'knowledge-pdf-render-pass', repaired });
              continue;
            }
          } catch (error: unknown) {
            // A render failure is never allowed to stop extraction dispatch.
            summary.renderErrors += 1;
            log({
              event: 'knowledge-pdf-render-pass-error',
              error: error instanceof Error ? error.message.slice(0, 200) : 'render pass failed',
            });
          }
        }
        if (active.size > 0) await Promise.race(active.values());
        else await sleep(config.pollIntervalMs, signal);
      } else if (active.size >= config.concurrency) {
        await Promise.race(active.values());
      } else {
        await sleep(config.pollIntervalMs, signal);
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await Promise.allSettled(active.values());
  }

  return { ...summary, stopped: stopping };
}
