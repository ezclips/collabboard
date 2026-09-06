import type { DomainError } from '../../lib/domain/core/errors';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';
import type { Result } from '../../lib/domain/core/result';
import { sanitizeKnowledgeProcessingError } from '../../lib/domain/knowledge/knowledgeExtraction';
import type { KnowledgePdfWorkerResult } from './processKnowledgePdfDocument';

/**
 * How this dispatcher is allowed to spend a cycle.
 *
 * `normal` is production: extraction first, page-visual repair only when
 * extraction is idle. `render-only` exists because repairing a derived image
 * needs no parser at all -- no Java, no OpenDataLoader -- and an operator
 * recovering a missing preview should not have to provision an extraction
 * runtime to do it.
 *
 * The mode is always explicit. There is deliberately NO fallback from a
 * missing Java configuration into render-only: that would turn a broken
 * production worker into a silently degraded one that never processes text.
 */
export type KnowledgePdfDispatchMode = 'normal' | 'render-only';

export const KNOWLEDGE_PDF_DISPATCH_MODES: readonly KnowledgePdfDispatchMode[] = ['normal', 'render-only'];

/**
 * Strict: an unset value is `normal`, an exact known value is itself, and
 * anything else throws. A typo must not quietly select a mode that skips
 * extraction for an entire deployment.
 */
export function resolveKnowledgePdfDispatchMode(value: string | undefined): KnowledgePdfDispatchMode {
  if (value === undefined || value === '') return 'normal';
  if ((KNOWLEDGE_PDF_DISPATCH_MODES as readonly string[]).includes(value)) {
    return value as KnowledgePdfDispatchMode;
  }
  throw new Error(
    `KNOWLEDGE_PDF_DISPATCH_MODE must be one of ${KNOWLEDGE_PDF_DISPATCH_MODES.join(', ')}`,
  );
}

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
  /**
   * Extraction discovery and execution. Both are OPTIONAL, and omitting them
   * is how render-only mode is expressed: with no discovery there is nothing
   * to list, nothing to claim and nothing to parse, so a PDF uploaded while an
   * operator repair is running is simply left alone for the real worker.
   *
   * They travel together -- a dispatcher that could discover extraction work
   * but not process it would claim jobs it must then fail.
   */
  readonly discovery?: KnowledgeProcessingCandidateRepository;
  readonly processDocument?: (documentId: KnowledgeDocumentId) => Promise<KnowledgePdfWorkerResult>;
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
  /**
   * `unknown` rather than `void`, because a real log transport returns a
   * promise and the dispatcher must be honest that it accepts one. What it
   * does NOT do is await it -- see safeLog: the return value is assimilated
   * and its rejection absorbed, off the processing path.
   */
  readonly log?: (event: Record<string, unknown>) => unknown;
}

export interface KnowledgePdfDispatcherOptions {
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
  readonly discoveryLimit?: number;
  readonly backoffBaseMs?: number;
  readonly backoffMaxMs?: number;
  readonly signal?: AbortSignal;
  /**
   * Run exactly one cycle and return, instead of polling forever.
   *
   * For an operator draining a known queue: the run is deterministic and
   * auditable rather than depending on someone interrupting a daemon at the
   * right moment. Unset keeps the existing looping behaviour untouched.
   */
  readonly once?: boolean;
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

/**
 * Logging is BEST EFFORT and must never become the failure.
 *
 * A throwing logger used to reject the job promise, which ran the outer catch,
 * counted the same failure a SECOND time and suppressed the finished event
 * entirely -- observability silently rewriting the outcome it exists to
 * report. Every emission goes through here instead, and a logger that fails is
 * dropped: deliberately not re-reported through the same logger that just
 * failed, never retried, and never rethrown into the dispatcher loop.
 *
 * A logger fails in TWO ways, and catching only the first is not a boundary.
 * A real transport -- a Cloud Logging client, a batching shipper -- returns a
 * promise, and `catch` cannot see that promise reject: the rejection surfaces
 * later as an unhandled rejection, which on a container with the usual
 * `--unhandled-rejections=throw` kills the worker mid-queue. So the returned
 * value is assimilated and its rejection absorbed.
 *
 * NOT awaited, deliberately. Job completion must not wait on a log write:
 * awaiting would put the transport's latency, and its stalls, on the
 * processing path. The absorption is fire-and-forget.
 */
export function safeLog(
  log: (event: Record<string, unknown>) => unknown,
  event: Record<string, unknown>,
): void {
  try {
    const result: unknown = log(event);
    /**
     * Promise.resolve is the assimilation boundary. An arbitrary thenable
     * reaches this line, so `then` may be a throwing getter (Promise.resolve
     * turns that into a rejection, which the catch below absorbs) or a
     * function that throws or calls back with a rejection (same). Nothing the
     * logger returns escapes into the dispatcher's promise chain.
     */
    void Promise.resolve(result).catch(() => {
      // Nothing. The job outcome is authoritative; the log is commentary.
    });
  } catch {
    // A synchronous logger throw, or a thenable hostile enough to throw out of
    // assimilation itself.
  }
}

function logJobResult(
  log: (event: Record<string, unknown>) => void,
  documentId: KnowledgeDocumentId,
  result: KnowledgePdfWorkerResult,
): void {
  /**
   * The FIRST failing boundary, with the reason attached.
   *
   * The pipeline already computed all of this -- `stage` is the first failing
   * boundary and `error` came out of sanitizeKnowledgeProcessingError -- but
   * only `status` and `stage` were ever logged, so the deployed worker reported
   * `{stage:"complete", status:"failed"}` and nothing else, on any channel. The
   * reason existed and was thrown away one line before Cloud Logging.
   *
   * `cleanupWarning` is deliberately absent. It is built with
   * boundedDiagnostic, which flattens and truncates a secondary failure's text
   * but does NOT redact it, so logging it published whatever that failure
   * happened to say -- a signed URL, a lease token, a flattened frame. The
   * stage and the sanitized reason are what an operator needs; keep it that
   * way.
   *
   * Exactly one such event per finished job: this is the single return path,
   * and it neither retries nor re-raises.
   */
  if (result.status === 'failed' || result.status === 'stale' || result.status === 'not_claimed') {
    safeLog(log, {
      event: 'knowledge-pdf-job-error',
      documentId,
      status: result.status,
      stage: result.stage,
      ...(result.errorClass === undefined ? {} : { errorClass: result.errorClass }),
      ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
      // Present only when the provider handed us a token from the closed
      // PostgREST/SQLSTATE grammar; omitted entirely otherwise. `errorCode`
      // stays what it was -- this says WHICH database failure produced it.
      ...(result.dbErrorCode === undefined ? {} : { dbErrorCode: result.dbErrorCode }),
      // Already single-line, redacted and length-bounded by the pipeline.
      message: result.error ?? 'Extraction failed',
      ...(result.failureRecorded === undefined ? {} : { failureRecorded: result.failureRecorded }),
    });
  } else if (result.derivativeWarning !== undefined) {
    // A ready document whose pictures did not all land. Low cardinality, and
    // never a reason to call the document failed.
    safeLog(log, {
      event: 'knowledge-pdf-job-derivative-warning',
      documentId,
      stage: 'page-derivatives',
      reason: result.derivativeWarning,
    });
  }

  safeLog(log, {
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

  /**
   * Extraction runs only when BOTH halves are present. Their absence is not
   * a degraded normal mode -- it is render-only, chosen explicitly by the
   * caller, and it means this dispatcher never lists or claims an extraction
   * job. A PDF uploaded during an operator repair is simply left for the
   * real worker.
   */
  const extraction = deps.discovery !== undefined && deps.processDocument !== undefined
    ? { discovery: deps.discovery, processDocument: deps.processDocument }
    : null;
  const once = options.once === true;

  const startJob = (documentId: KnowledgeDocumentId): void => {
    const key = String(documentId);
    if (active.has(key)) return;
    summary.started += 1;
    const job = Promise.resolve()
      .then(() => extraction!.processDocument(documentId))
      .then((result) => {
        if (result.status === 'ready') summary.completed += 1;
        else if (result.status === 'failed') summary.failed += 1;
        else if (result.status === 'stale') summary.stale += 1;
        else if (result.status === 'not_claimed') summary.conflicts += 1;
        logJobResult(log, documentId, result);
      })
      .catch((error: unknown) => {
        summary.failed += 1;
        safeLog(log, {
          event: 'knowledge-pdf-job-error',
          documentId,
          status: 'failed',
          stage: 'unknown',
          errorClass: 'UnknownError',
          errorCode: 'UNKNOWN',
          // The pipeline's own total sanitizer: reading `.message` directly
          // here would let a hostile getter throw inside the catch handler and
          // reject the dispatcher loop.
          message: sanitizeKnowledgeProcessingError(error),
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

      let started = 0;
      if (extraction) {
        const availableSlots = config.concurrency - active.size;
        const discovered = await extraction.discovery.listProcessingCandidates(
          Math.min(config.discoveryLimit, availableSlots),
        );
        if (!discovered.ok) {
          summary.discoveryErrors += 1;
          safeLog(log, { event: 'knowledge-pdf-discovery-error', error: discovered.error.message.split(/[\r\n]/, 1)[0].slice(0, 500) });
          if (once) break;
          await sleep(backoffMs, signal);
          backoffMs = Math.min(config.backoffMaxMs, backoffMs * 2);
          continue;
        }

        backoffMs = config.backoffBaseMs;
        summary.discovered += discovered.value.length;
        for (const documentId of discovered.value) {
          if (stopping || active.size >= config.concurrency) break;
          const before = active.size;
          startJob(documentId);
          if (active.size > before) started += 1;
        }
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
              safeLog(log, { event: 'knowledge-pdf-render-pass', repaired });
              if (once) break;
              continue;
            }
          } catch (error: unknown) {
            // A render failure is never allowed to stop extraction dispatch.
            summary.renderErrors += 1;
            safeLog(log, {
              event: 'knowledge-pdf-render-pass-error',
              error: error instanceof Error ? error.message.slice(0, 200) : 'render pass failed',
            });
          }
        }
        if (once) break;
        if (active.size > 0) await Promise.race(active.values());
        else await sleep(config.pollIntervalMs, signal);
      } else if (once) {
        // One cycle. Jobs already started are awaited by the finally block.
        break;
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
