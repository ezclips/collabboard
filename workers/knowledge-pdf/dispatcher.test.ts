import { describe, expect, it } from 'vitest';
import { asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { err, ok } from '../../lib/domain/core/result';
import type { KnowledgePdfWorkerResult } from './processKnowledgePdfDocument';
import {
  runKnowledgePdfDispatcher,
  resolveKnowledgePdfDispatcherConfig,
} from './dispatcher';

const A = asKnowledgeDocumentId('00000000-0000-0000-0000-000000000001');
const B = asKnowledgeDocumentId('00000000-0000-0000-0000-000000000002');

function ready(documentId: typeof A): KnowledgePdfWorkerResult {
  return { status: 'ready', documentId, stage: 'complete', pageCount: 1 };
}

function waitFor(predicate: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const check = () => predicate() ? resolve() : setTimeout(check, 1);
    check();
  });
}

describe('Knowledge PDF dispatcher', () => {
  it('validates bounded concurrency and operational polling configuration', () => {
    expect(resolveKnowledgePdfDispatcherConfig({ concurrency: 3, pollIntervalMs: 25 })).toMatchObject({
      concurrency: 3,
      pollIntervalMs: 25,
    });
    expect(() => resolveKnowledgePdfDispatcherConfig({ concurrency: 0 })).toThrow();
    expect(() => resolveKnowledgePdfDispatcherConfig({ concurrency: 33 })).toThrow();
  });

  it('keeps concurrency bounded, isolates one job failure, and shuts down gracefully', async () => {
    const controller = new AbortController();
    let running = 0;
    let maximum = 0;
    let calls = 0;
    const finished: string[] = [];
    const dispatcher = runKnowledgePdfDispatcher(
      {
        discovery: {
          listProcessingCandidates: async () => {
            const call = calls++;
            return call === 0 ? ok([A, B]) : call === 1 ? ok([B]) : ok([]);
          },
        },
        processDocument: async (documentId) => {
          running += 1;
          maximum = Math.max(maximum, running);
          await new Promise((resolve) => setTimeout(resolve, 10));
          running -= 1;
          finished.push(documentId);
          if (documentId === A) throw new Error('forced failure');
          return ready(documentId);
        },
        sleep: async () => controller.abort(),
      },
      { concurrency: 1, pollIntervalMs: 1, signal: controller.signal },
    );

    const summary = await dispatcher;
    expect(maximum).toBe(1);
    expect(finished).toEqual([A, B]);
    expect(summary.failed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.stopped).toBe(true);
  });

  it('backs off discovery infrastructure errors instead of terminating', async () => {
    const controller = new AbortController();
    const sleeps: number[] = [];
    let calls = 0;
    const summary = await runKnowledgePdfDispatcher(
      {
        discovery: {
          listProcessingCandidates: async () => {
            calls += 1;
            if (calls === 1) return err({ code: 'unavailable', message: 'database down' });
            controller.abort();
            return ok([]);
          },
        },
        processDocument: async () => ready(A),
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      },
      { pollIntervalMs: 50, backoffBaseMs: 3, backoffMaxMs: 12, signal: controller.signal },
    );
    expect(summary.discoveryErrors).toBe(1);
    expect(sleeps[0]).toBe(3);
  });

  it('does not start new jobs after graceful shutdown but lets active work finish', async () => {
    const controller = new AbortController();
    let started = 0;
    let finished = 0;
    const dispatcher = runKnowledgePdfDispatcher(
      {
        discovery: { listProcessingCandidates: async () => ok([A, B]) },
        processDocument: async (documentId) => {
          started += 1;
          if (documentId === A) {
            controller.abort();
            await waitFor(() => true);
          }
          finished += 1;
          return ready(documentId);
        },
      },
      { concurrency: 1, pollIntervalMs: 1, signal: controller.signal },
    );
    const summary = await dispatcher;
    expect(started).toBe(1);
    expect(finished).toBe(1);
    expect(summary.stopped).toBe(true);
  });
});
