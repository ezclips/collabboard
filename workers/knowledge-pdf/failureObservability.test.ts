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
// These tests pin the log CONTRACT. They assert nothing about processing,
// retries or persistence, which this patch does not touch.
import { describe, expect, it } from 'vitest';
import { asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { ok } from '../../lib/domain/core/result';
import { sanitizeKnowledgeProcessingError } from '../../lib/domain/knowledge/knowledgeExtraction';
import type { KnowledgePdfWorkerResult } from './processKnowledgePdfDocument';
import { runKnowledgePdfDispatcher } from './dispatcher';

const DOC = asKnowledgeDocumentId('bdc0dc74-b8c8-4eae-9a64-6d2bb3eca75c');

/** Runs one dispatch cycle over a single document and returns every log event. */
async function dispatchOnce(result: KnowledgePdfWorkerResult): Promise<Record<string, unknown>[]> {
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
      processDocument: async () => result,
      log: (event) => events.push(event),
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
  // The pipeline runs every message through sanitizeKnowledgeProcessingError
  // before it reaches the result, so the guarantee is asserted on that function
  // -- the one the dispatcher's `message` field carries verbatim.
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
    }));
    const [error] = errorEvents(events);
    // The lease token lives in the artifact path, so the path is never logged.
    expect(Object.keys(error).sort()).toEqual(
      ['documentId', 'event', 'failureRecorded', 'message', 'stage', 'status'].sort());
    expect(JSON.stringify(error)).not.toContain('LEASETOKEN');
  });
});
