// PDF_WORKER_FAILURE_OBSERVABILITY_2 -- the deployed worker must say WHY a job
// failed, not just that it did.
//
// Production evidence that motivated this: document
// bdc0dc74-b8c8-4eae-9a64-6d2bb3eca75c finished with
// `{event:"knowledge-pdf-job-finished", stage:"complete", status:"failed"}` and
// nothing else -- a full query of the instance for the 30 seconds before it,
// and a second query for stderr / severity>=ERROR, both returned nothing. The
// pipeline had already sanitized the reason onto its result; the dispatcher
// logged `status` and `stage` and dropped the rest one line before Cloud
// Logging saw it.
//
// The `_C1` block below is the harder half. Observability is code that runs on
// the failure path, reading values the failure chose, so it has two ways to do
// real damage: publish a credential, or replace the outcome it was supposed to
// report. Those tests drive the REAL pipeline through the REAL dispatcher --
// only the parser, storage and repository are fakes -- because the earlier
// tests asserted the shape of the event rather than the guarantee.
//
// Nothing here asserts processing, retry or persistence behaviour, which this
// patch does not touch.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { domainError } from '../../lib/domain/core/errors';
import type { DomainError } from '../../lib/domain/core/errors';
import { err, ok } from '../../lib/domain/core/result';
import type { Result } from '../../lib/domain/core/result';
import { sanitizeKnowledgeProcessingError } from '../../lib/domain/knowledge/knowledgeExtraction';
import type {
  KnowledgeExtractionCompletion,
  KnowledgeExtractionJob,
  KnowledgeExtractionRepository,
  KnowledgeProcessingLease,
} from '../../lib/domain/knowledge/knowledgeExtraction';
import basicFixture from '../../lib/infra/knowledge/fixtures/openDataLoader-basic.json';
import { processKnowledgePdfDocument } from './processKnowledgePdfDocument';
import type {
  KnowledgePdfParser,
  KnowledgePdfWorkerDependencies,
  KnowledgePdfWorkerResult,
  KnowledgeWorkerStorage,
} from './processKnowledgePdfDocument';
import { runKnowledgePdfDispatcher } from './dispatcher';

const DOC = asKnowledgeDocumentId('bdc0dc74-b8c8-4eae-9a64-6d2bb3eca75c');

/** Runs one dispatch cycle over a single document and returns every log event. */
async function dispatchOnce(
  result: KnowledgePdfWorkerResult | (() => Promise<KnowledgePdfWorkerResult>),
  log?: (event: Record<string, unknown>) => void,
): Promise<Record<string, unknown>[]> {
  const events: Record<string, unknown>[] = [];
  let listed = false;
  await runKnowledgePdfDispatcher(
    {
      discovery: {
        listProcessingCandidates: async () => {
          if (listed) return ok([]);
          listed = true;
          return ok([DOC]);
        },
      },
      processDocument: typeof result === 'function' ? result : async () => result,
      log: (event) => {
        events.push(event);
        log?.(event);
      },
    },
    { concurrency: 1, pollIntervalMs: 1, once: true },
  );
  return events;
}

const errorEvents = (events: Record<string, unknown>[]) =>
  events.filter((e) => e.event === 'knowledge-pdf-job-error');
const finishedEvents = (events: Record<string, unknown>[]) =>
  events.filter((e) => e.event === 'knowledge-pdf-job-finished');

const failedAt = (stage: string, over: Partial<KnowledgePdfWorkerResult> = {}): KnowledgePdfWorkerResult => ({
  status: 'failed',
  documentId: DOC,
  stage,
  error: 'something went wrong',
  failureRecorded: true,
  ...over,
});

describe('extraction failure observability', () => {
  it('1. a parser failure reports the document, the stage and a sanitized reason', async () => {
    const events = await dispatchOnce(failedAt('parser', {
      error: 'OpenDataLoader exited with code 1',
      errorClass: 'OpenDataLoaderProcessError',
      errorCode: 'PROCESS_ERROR',
    }));
    const [error] = errorEvents(events);
    expect(error).toBeTruthy();
    expect(error.documentId).toBe(DOC);
    expect(error.stage).toBe('parser');
    expect(error.errorClass).toBe('OpenDataLoaderProcessError');
    expect(error.errorCode).toBe('PROCESS_ERROR');
    expect(error.message).toBe('OpenDataLoader exited with code 1');
  });

  it('1b. a parser TIMEOUT is distinguishable from a non-zero exit', async () => {
    const timedOut = await dispatchOnce(failedAt('parser', {
      error: 'OpenDataLoader timed out after 120000ms',
      errorClass: 'OpenDataLoaderProcessError',
      errorCode: 'TIMEOUT',
    }));
    expect(errorEvents(timedOut)[0].errorCode).toBe('TIMEOUT');
  });

  it('2. a raw-artifact upload failure reports that stage', async () => {
    const events = await dispatchOnce(failedAt('raw-artifact-upload', {
      error: 'Storage upload rejected', errorClass: 'StorageApiError', errorCode: '413',
    }));
    expect(errorEvents(events)[0].stage).toBe('raw-artifact-upload');
    expect(errorEvents(events)[0].errorCode).toBe('413');
  });

  it('2b. every pipeline stage survives into the log verbatim', async () => {
    for (const stage of [
      'claim', 'download', 'source-hash', 'geometry', 'parser',
      'normalize', 'raw-artifact-upload', 'complete',
    ]) {
      const events = await dispatchOnce(failedAt(stage));
      expect(errorEvents(events)[0].stage, stage).toBe(stage);
    }
  });

  it('3. a ready document with a derivative problem reports the bounded reason', async () => {
    const events = await dispatchOnce({
      status: 'ready', documentId: DOC, stage: 'complete', pageCount: 7,
      derivativeWarning: 'upload_partial',
    });
    const warning = events.find((e) => e.event === 'knowledge-pdf-job-derivative-warning');
    expect(warning).toBeTruthy();
    expect(warning!.stage).toBe('page-derivatives');
    expect(warning!.reason).toBe('upload_partial');
    // Still ready: a missing picture is not a failed document.
    expect(errorEvents(events)).toHaveLength(0);
    expect(finishedEvents(events)[0].status).toBe('ready');
  });

  it('4. the terminal finished event still occurs, unchanged', async () => {
    const events = await dispatchOnce(failedAt('parser'));
    const [finished] = finishedEvents(events);
    expect(finished).toBeTruthy();
    expect(finished.status).toBe('failed');
    expect(finished.stage).toBe('parser');
    // The error event comes FIRST, so a truncated log still carries the reason.
    expect(events.indexOf(errorEvents(events)[0])).toBeLessThan(events.indexOf(finished));
  });

  it('5. a successful job emits no error event', async () => {
    const events = await dispatchOnce({
      status: 'ready', documentId: DOC, stage: 'complete', pageCount: 1,
    });
    expect(errorEvents(events)).toHaveLength(0);
    expect(events.find((e) => e.event === 'knowledge-pdf-job-derivative-warning')).toBeUndefined();
    expect(finishedEvents(events)).toHaveLength(1);
  });

  it('8. one failure produces exactly one error event, not a loop', async () => {
    const events = await dispatchOnce(failedAt('parser'));
    expect(errorEvents(events)).toHaveLength(1);
    expect(finishedEvents(events)).toHaveLength(1);
  });

  it('a stale lease is reported too, and never silently', async () => {
    const events = await dispatchOnce({
      status: 'stale', documentId: DOC, stage: 'normalize',
      error: 'Knowledge processing lease is stale',
    });
    expect(errorEvents(events)[0].status).toBe('stale');
    expect(errorEvents(events)[0].stage).toBe('normalize');
  });
});

describe('6-7. sanitization is load-bearing', () => {
  const secrets: ReadonlyArray<readonly [string, string]> = [
    ['bearer token', 'upload failed Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'],
    ['jwt-like token', 'refused eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.QsmCbQ4tUZjyRHRc3dHrmxOwqThAqAVvHRp7Kk8xYzQ'],
    ['service role assignment', 'boom SUPABASE_SERVICE_ROLE_KEY=TEST_SECRET_SENTINEL_0123456789ABCDEF0123'],
    ['api key assignment', 'apikey=abcdef0123456789abcdef0123456789abcdef01'],
  ];

  it('6. redacts bearer tokens, JWT-like values and secret assignments', () => {
    for (const [label, raw] of secrets) {
      const sanitized = sanitizeKnowledgeProcessingError(new Error(raw));
      expect(sanitized, label).not.toContain('eyJhbGciOi');
      expect(sanitized, label).not.toContain('TEST_SECRET_SENTINEL');
      expect(sanitized, label).not.toContain('abcdef0123456789abcdef0123456789abcdef01');
      expect(sanitized, label).toContain('[redacted]');
    }
  });

  it('6b. drops the stack: only the first line survives', () => {
    const error = new Error('parse failed');
    error.stack = 'Error: parse failed\n    at /app/dist/runDispatcher.mjs:1:1\n    at node:internal';
    const sanitized = sanitizeKnowledgeProcessingError(error);
    expect(sanitized).toBe('parse failed');
    expect(sanitized).not.toContain('at /app');
    expect(sanitized).not.toContain('\n');
  });

  it('7. bounds the message length', () => {
    const sanitized = sanitizeKnowledgeProcessingError(new Error('x'.repeat(10_000)));
    expect(sanitized.length).toBeLessThanOrEqual(1_000);
    expect(sanitized.length).toBeGreaterThan(0);
  });

  it('never yields an empty message', () => {
    expect(sanitizeKnowledgeProcessingError(new Error(''))).toBe('Extraction failed');
    expect(sanitizeKnowledgeProcessingError(undefined)).toBe('Extraction failed');
  });

  it('the dispatcher logs no field that could carry bytes or a path', async () => {
    const events = await dispatchOnce(failedAt('raw-artifact-upload', {
      rawArtifactPath: 'knowledge/board/doc/extraction/attempt-1-LEASETOKEN/opendataloader.json',
      errorClass: 'UnknownError',
      errorCode: 'UNKNOWN',
    }));
    const [error] = errorEvents(events);
    // The lease token lives in the artifact path, so the path is never logged.
    expect(Object.keys(error).sort()).toEqual(
      ['documentId', 'errorClass', 'errorCode', 'event', 'failureRecorded', 'message', 'stage', 'status'].sort());
    expect(JSON.stringify(error)).not.toContain('LEASETOKEN');
  });
});

// ---------------------------------------------------------------------------
// _C1 -- the reproductions. Each names a way the first version of this patch
// could hurt production, and fails against it.
// ---------------------------------------------------------------------------

const BOARD = asBoardId('00000000-0000-0000-0000-000000000201');
const SOURCE_PATH = 'knowledge/board/document/original.pdf';
const SOURCE_BYTES = new Uint8Array(Buffer.from('%PDF-1.7\nobservability\n%%EOF', 'utf8'));
const LEASE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** A signed URL and a service key, in the shapes a real failure produces them. */
const SIGNED_URL =
  'https://abcdefgh.supabase.co/storage/v1/object/sign/knowledge/original.pdf?token=SUPERSECRETTOKENVALUE&sig=b4d1c0ffee';
const SERVICE_KEY = 'TEST_SECRET_SENTINEL_0123456789ABCDEF0123';

class FakeStorage implements KnowledgeWorkerStorage {
  readonly objects = new Map<string, Uint8Array>([[SOURCE_PATH, SOURCE_BYTES]]);
  removeError?: Error;

  async download(storagePath: string): Promise<Uint8Array> {
    const bytes = this.objects.get(storagePath);
    if (!bytes) throw new Error('source object missing');
    return bytes;
  }

  async upload(storagePath: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(storagePath, bytes);
  }

  async remove(storagePath: string): Promise<void> {
    if (this.removeError) throw this.removeError;
    this.objects.delete(storagePath);
  }
}

class FakeRepository implements KnowledgeExtractionRepository {
  completeResult: Result<void, DomainError> = ok(undefined);
  readonly failures: string[] = [];

  async claim(): Promise<Result<KnowledgeExtractionJob, DomainError>> {
    return ok({
      documentId: DOC,
      boardId: BOARD,
      storagePath: SOURCE_PATH,
      contentSha256: createHash('sha256').update(SOURCE_BYTES).digest('hex'),
      leaseToken: LEASE,
      processingAttempt: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  async renew(): Promise<Result<KnowledgeProcessingLease, DomainError>> {
    return ok({
      leaseToken: LEASE,
      processingAttempt: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  async complete(_completion: KnowledgeExtractionCompletion) {
    return this.completeResult;
  }

  async fail(_documentId: typeof DOC, _leaseToken: string, message: string) {
    this.failures.push(message);
    return ok(undefined) as Result<void, DomainError>;
  }
}

function workerDeps(
  parser: KnowledgePdfParser,
  repository = new FakeRepository(),
  storage = new FakeStorage(),
): KnowledgePdfWorkerDependencies {
  return {
    repository,
    storage,
    parser,
    geometry: async () => [{ pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0 }],
    hasher: { sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex') },
    parserOptionsHash: 'options-hash',
    parserName: 'opendataloader-pdf',
    parserVersion: '2.5.0',
    rasterizePages: async () => ({ pages: [], skipped: [] }),
  };
}

/** A parser that throws whatever the test hands it, at the `parser` stage. */
const throwingParser = (thrown: unknown): KnowledgePdfParser => ({
  run: async () => { throw thrown; },
});

/** A parser that exits non-zero, so the pipeline raises its own error class. */
const exitingParser = (stderr: string): KnowledgePdfParser => ({
  run: async () => ({ exitCode: 1, signal: null, stdout: '', stderr, timedOut: false, elapsedMs: 1 }),
});

const succeedingParser = (): KnowledgePdfParser => ({
  run: async (input) => {
    await fs.writeFile(`${input.outputDir}/result.json`, JSON.stringify(basicFixture));
    return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 1 };
  },
});

/**
 * The whole path, end to end: a real pipeline failure travelling through the
 * real dispatcher into a captured logger. No result object is hand-built.
 */
async function runRealPipeline(
  deps: KnowledgePdfWorkerDependencies,
  log?: (event: Record<string, unknown>) => void,
): Promise<{ events: Record<string, unknown>[]; result?: KnowledgePdfWorkerResult }> {
  let result: KnowledgePdfWorkerResult | undefined;
  const events = await dispatchOnce(async () => {
    result = await processKnowledgePdfDocument(deps, DOC);
    return result;
  }, log);
  return { events, result };
}

describe('_C1 blocker 1 -- the sanitizer must actually redact', () => {
  it('A1. a bearer credential does not survive its own header', () => {
    // The exact reproduction: SECRET_ASSIGNMENT matched `Authorization` and
    // then only as far as `Bearer`, so the previous version published
    // `Authorization=[redacted] abc.def.ghi` -- the credential intact, one
    // token to the right of the redaction that was supposed to remove it.
    const sanitized = sanitizeKnowledgeProcessingError(
      new Error('request failed Authorization: Bearer abc.def.ghi'));
    expect(sanitized).not.toContain('abc.def.ghi');
    expect(sanitized).toContain('[redacted]');
  });

  it('A1b. every credential-header shape loses its whole value', () => {
    const cases = [
      'Authorization: Bearer abc.def.ghi',
      'authorization=Bearer shortvalue',
      'Proxy-Authorization: Basic dXNlcjpwYXNz',
      'sent with Bearer abc.def.ghi and retried',
      'Authorization: Basic dXNlcjpwYXNz',
    ];
    for (const raw of cases) {
      const sanitized = sanitizeKnowledgeProcessingError(new Error(`upload failed ${raw}`));
      expect(sanitized, raw).not.toContain('abc.def.ghi');
      expect(sanitized, raw).not.toContain('dXNlcjpwYXNz');
      expect(sanitized, raw).not.toContain('shortvalue');
    }
  });

  it('A2. a signed storage URL loses its query entirely, not just known words', () => {
    // `sig` was in nobody\'s list of sensitive words, and enumerating harder is
    // the same losing bet -- so the URL goes, whole.
    const sanitized = sanitizeKnowledgeProcessingError(
      new Error(`download failed for ${SIGNED_URL}`));
    expect(sanitized).not.toContain('SUPERSECRETTOKENVALUE');
    expect(sanitized).not.toContain('b4d1c0ffee');
    expect(sanitized).not.toContain('abcdefgh.supabase.co');
    expect(sanitized).toContain('[redacted-url]');
  });

  it('A2b. a bare query fragment with no scheme is redacted too', () => {
    const sanitized = sanitizeKnowledgeProcessingError(
      new Error('bad request /object/sign/x?sig=b4d1c0ffee&expires=99'));
    expect(sanitized).not.toContain('b4d1c0ffee');
    expect(sanitized).toContain('[redacted]');
  });

  it('A3. cookies do not survive, in either header', () => {
    for (const raw of [
      'rejected Cookie: session=THESESSIONVALUE; Path=/',
      'Set-Cookie: sb-access-token=THESESSIONVALUE; HttpOnly',
    ]) {
      const sanitized = sanitizeKnowledgeProcessingError(new Error(raw));
      expect(sanitized, raw).not.toContain('THESESSIONVALUE');
      expect(sanitized, raw).toContain('[redacted]');
    }
  });

  it('A4. the sanitizer is TOTAL: no input makes it throw', () => {
    // It runs on the failure path. A throw here does not add a problem, it
    // replaces the one being recorded.
    const hostile: unknown[] = [
      new Proxy({}, { get() { throw new Error('trap'); }, has() { throw new Error('trap'); } }),
      { get message(): string { throw new Error('getter'); } },
      { toString() { throw new Error('toString'); } },
      Object.create(null),
      Symbol('s'),
      BigInt(123),
      null,
      undefined,
    ];
    for (const value of hostile) {
      expect(() => sanitizeKnowledgeProcessingError(value)).not.toThrow();
      expect(typeof sanitizeKnowledgeProcessingError(value)).toBe('string');
      expect(sanitizeKnowledgeProcessingError(value).length).toBeGreaterThan(0);
    }
  });

  it('A5. errorClass is an allowlist, so a hostile class name cannot ride out', async () => {
    // `name` is attacker-shaped data. Filtering it to identifier characters
    // was never a safety property: a secret is made of identifier characters.
    const hostile = new Error('parser died');
    hostile.name = `SUPABASE_SERVICE_ROLE_KEY_${SERVICE_KEY.replace(/[^A-Za-z0-9]/g, '')}`;
    const { events } = await runRealPipeline(workerDeps(throwingParser(hostile)));
    const [error] = errorEvents(events);
    expect(error.errorClass).toBe('UnknownError');
    expect(JSON.stringify(events)).not.toContain('TESTSECRETSENTINEL');
  });

  it('A5b. a class the worker really understands is still named', async () => {
    // The allowlist is not a blanket refusal to say anything useful.
    const { events } = await runRealPipeline(workerDeps(exitingParser('boom')));
    const [error] = errorEvents(events);
    expect(error.errorClass).toBe('KnowledgePdfWorkerError');
    expect(error.stage).toBe('parser');
  });

  it('A6. errorCode is an allowlist, so a provider code cannot ride out', async () => {
    const hostile = Object.assign(new Error('storage refused'), { code: SERVICE_KEY });
    const { events } = await runRealPipeline(workerDeps(throwingParser(hostile)));
    expect(errorEvents(events)[0].errorCode).toBe('UNKNOWN');
    expect(JSON.stringify(events)).not.toContain('TEST_SECRET_SENTINEL');
  });

  it('A6b. understood codes and HTTP statuses still survive', async () => {
    for (const [code, expected] of [['ENOENT', 'ENOENT'], [413, '413'], ['not_found', 'not_found']] as const) {
      const { events } = await runRealPipeline(
        workerDeps(throwingParser(Object.assign(new Error('nope'), { code }))));
      expect(errorEvents(events)[0].errorCode, String(code)).toBe(expected);
    }
  });

  it('A7. a throwing name/code getter never escapes into the worker', async () => {
    // This was an unhandled rejection: the diagnostic read replaced the real
    // failure, losing the stage, the reason and the finished event together.
    const hostile = {
      message: 'parser died',
      get name(): string { throw new Error('name getter'); },
      get code(): string { throw new Error('code getter'); },
    };
    const { events, result } = await runRealPipeline(workerDeps(throwingParser(hostile)));
    expect(result?.status).toBe('failed');
    expect(result?.stage).toBe('parser');
    const [error] = errorEvents(events);
    expect(error.errorClass).toBe('UnknownError');
    expect(error.errorCode).toBe('UNKNOWN');
    expect(error.message).toBe('parser died');
    // Still terminal, which the unhandled rejection had suppressed.
    expect(finishedEvents(events)).toHaveLength(1);
  });

  it('A7b. a Proxy whose every trap throws still produces one clean failure', async () => {
    const hostile = new Proxy({}, {
      get() { throw new Error('trap'); },
      has() { throw new Error('trap'); },
      getPrototypeOf() { throw new Error('trap'); },
    });
    const { events, result } = await runRealPipeline(workerDeps(throwingParser(hostile)));
    expect(result?.status).toBe('failed');
    expect(errorEvents(events)).toHaveLength(1);
    expect(errorEvents(events)[0].message).toBe('Extraction failed');
    expect(finishedEvents(events)).toHaveLength(1);
  });
});

describe('_C1 blocker 2 -- cleanupWarning is not log-safe', () => {
  it('A8. a cleanup failure never reaches the log, however it is worded', async () => {
    // cleanupWarning is built with boundedDiagnostic, which flattens and
    // truncates but does NOT redact -- so logging it published raw secondary
    // failure text. The result still carries it for a caller inspecting one
    // job; the log carries the stage and the sanitized reason instead.
    const repository = new FakeRepository();
    repository.completeResult = err(domainError('unavailable', 'completion failed'));
    const storage = new FakeStorage();
    storage.removeError = new Error(`remove denied Authorization: Bearer ${SERVICE_KEY} at ${SIGNED_URL}`);

    const { events, result } = await runRealPipeline(
      workerDeps(succeedingParser(), repository, storage));

    expect(result?.status).toBe('failed');
    expect(result?.cleanupWarning).toBeTruthy();
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('TEST_SECRET_SENTINEL');
    expect(serialized).not.toContain('SUPERSECRETTOKENVALUE');
    expect(serialized).not.toContain('cleanupWarning');
  });

  it('A8b. no event on any path carries a cleanupWarning field', async () => {
    const events = await dispatchOnce(failedAt('complete', {
      cleanupWarning: 'failure transition error: Bearer LEAKEDVALUE',
    }));
    for (const event of events) {
      expect(Object.keys(event)).not.toContain('cleanupWarning');
    }
    expect(JSON.stringify(events)).not.toContain('LEAKEDVALUE');
  });

  it('A9. a real parser failure is reported with its reason and no credential', async () => {
    // The end-to-end shape of the production gap: OpenDataLoader\'s stderr
    // becomes the diagnostic, and stderr is exactly where a signed URL shows
    // up. The reason must arrive; the credential must not.
    const { events } = await runRealPipeline(
      workerDeps(exitingParser(`java.io.IOException: cannot read ${SIGNED_URL}`)));
    const [error] = errorEvents(events);
    expect(error.stage).toBe('parser');
    expect(String(error.message)).toContain('OpenDataLoader exited with code 1');
    expect(String(error.message)).not.toContain('SUPERSECRETTOKENVALUE');
    expect(String(error.message)).not.toContain('supabase.co');
  });
});

describe('_C1 blocker 3 -- observability must not alter worker behaviour', () => {
  /** A logger that throws on the Nth call and records what it was asked to log. */
  const failingLogger = (shouldThrow: (event: Record<string, unknown>) => boolean) => {
    const seen: Record<string, unknown>[] = [];
    return {
      seen,
      log: (event: Record<string, unknown>) => {
        seen.push(event);
        if (shouldThrow(event)) throw new Error('logging backend unavailable');
      },
    };
  };

  /** Runs a cycle with a hostile logger and returns the dispatcher summary. */
  async function dispatchWith(
    log: (event: Record<string, unknown>) => void,
    processDocument: () => Promise<KnowledgePdfWorkerResult>,
  ) {
    let listed = false;
    return runKnowledgePdfDispatcher(
      {
        discovery: {
          listProcessingCandidates: async () => {
            if (listed) return ok([]);
            listed = true;
            return ok([DOC]);
          },
        },
        processDocument,
        log,
      },
      { concurrency: 1, pollIntervalMs: 1, once: true },
    );
  }

  it('A10. a throwing logger does not count the same failure twice', async () => {
    // The mechanism: logJobResult ran inside the job\'s .then(), so a logger
    // exception rejected it, the outer .catch() added a SECOND
    // `summary.failed += 1`, and the finished event never fired. One failed
    // document was reported as two.
    const logger = failingLogger((e) => e.event === 'knowledge-pdf-job-error');
    const summary = await dispatchWith(logger.log, async () => failedAt('parser'));
    expect(summary.failed).toBe(1);
    expect(summary.started).toBe(1);
  });

  it('A11. a throwing logger does not suppress the terminal finished event', async () => {
    const logger = failingLogger((e) => e.event === 'knowledge-pdf-job-error');
    await dispatchWith(logger.log, async () => failedAt('parser'));
    expect(logger.seen.some((e) => e.event === 'knowledge-pdf-job-finished')).toBe(true);
  });

  it('A12. a logger that throws on EVERY call does not reject the worker loop', async () => {
    const logger = failingLogger(() => true);
    const summary = await dispatchWith(logger.log, async () => failedAt('parser'));
    expect(summary.failed).toBe(1);
    expect(summary.stopped).toBe(false);
    // Both emissions were attempted; both were dropped rather than rethrown.
    expect(logger.seen.map((e) => e.event)).toEqual([
      'knowledge-pdf-job-error', 'knowledge-pdf-job-finished',
    ]);
  });

  it('A12b. a successful job stays successful when its logger throws', async () => {
    const logger = failingLogger(() => true);
    const summary = await dispatchWith(logger.log, async () => ({
      status: 'ready' as const, documentId: DOC, stage: 'complete', pageCount: 1,
    }));
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it('A13. a throwing logger on the discovery and render paths does not reject the loop', async () => {
    const seen: string[] = [];
    const summary = await runKnowledgePdfDispatcher(
      {
        discovery: {
          listProcessingCandidates: async () => err(domainError('unavailable', 'pg down')),
        },
        processDocument: async () => failedAt('parser'),
        renderPass: async () => { throw new Error('render pass exploded'); },
        log: (event) => {
          seen.push(String(event.event));
          throw new Error('logging backend unavailable');
        },
      },
      { concurrency: 1, pollIntervalMs: 1, once: true },
    );
    expect(summary.discoveryErrors).toBe(1);
    expect(seen).toContain('knowledge-pdf-discovery-error');
  });

  it('A14. a throwing logger does not change the persisted outcome of a real job', async () => {
    // The strongest form: the REAL pipeline, a hostile logger, and the
    // assertion that the database write the worker made is identical either
    // way. Observability is allowed to be lost; it is not allowed to matter.
    const outcome = async (log: (event: Record<string, unknown>) => void) => {
      const repository = new FakeRepository();
      const deps = workerDeps(exitingParser('boom'), repository);
      let result: KnowledgePdfWorkerResult | undefined;
      const summary = await dispatchWith(log, async () => {
        result = await processKnowledgePdfDocument(deps, DOC);
        return result;
      });
      return { failures: repository.failures, status: result?.status, stage: result?.stage, summary };
    };

    const quiet = await outcome(() => {});
    const hostile = await outcome(() => { throw new Error('logging backend unavailable'); });

    expect(hostile.status).toBe(quiet.status);
    expect(hostile.stage).toBe(quiet.stage);
    expect(hostile.failures).toEqual(quiet.failures);
    expect(hostile.summary.failed).toBe(quiet.summary.failed);
    expect(hostile.failures).toHaveLength(1);
  });
});
