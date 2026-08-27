import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { domainError } from '../../lib/domain/core/errors';
import type { DomainError } from '../../lib/domain/core/errors';
import { err, ok } from '../../lib/domain/core/result';
import type { Result } from '../../lib/domain/core/result';
import type { KnowledgeExtractionCompletion, KnowledgeExtractionJob, KnowledgeExtractionRepository, KnowledgeProcessingLease } from '../../lib/domain/knowledge/knowledgeExtraction';
import basicFixture from '../../lib/infra/knowledge/fixtures/openDataLoader-basic.json';
import {
  KNOWLEDGE_RAW_ARTIFACT_PATH,
  processKnowledgePdfDocument,
} from './processKnowledgePdfDocument';
import type {
  KnowledgePdfParser,
  KnowledgePdfWorkerDependencies,
  KnowledgeWorkerStorage,
  KnowledgeWorkerUploadOptions,
} from './processKnowledgePdfDocument';
import {
  KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
  knowledgePageDerivativePath,
} from '../../lib/domain/knowledge/knowledgePdfRenderPolicy';
import type { PdfRasterResult } from './pdfPageRaster';
import type { OpenDataLoaderRunInput } from './openDataLoaderRunner';

const DOCUMENT = asKnowledgeDocumentId('00000000-0000-0000-0000-000000000101');
const BOARD = asBoardId('00000000-0000-0000-0000-000000000201');
const SOURCE_PATH = 'knowledge/board/document/original.pdf';
const SOURCE_BYTES = new Uint8Array(Buffer.from('%PDF-1.7\nworker test\n%%EOF', 'utf8'));
const LEASE_TOKEN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface RecordedUpload {
  readonly path: string;
  readonly contentType: string;
  readonly options?: KnowledgeWorkerUploadOptions;
  readonly bytes: Uint8Array;
}

class FakeStorage implements KnowledgeWorkerStorage {
  readonly objects = new Map<string, Uint8Array>([[SOURCE_PATH, SOURCE_BYTES]]);
  failUpload = false;
  readonly removed: string[] = [];
  readonly uploads: RecordedUpload[] = [];
  readonly downloads: string[] = [];
  /** Paths whose upload throws, so partial-failure behaviour is observable. */
  readonly failUploadPaths = new Set<string>();

  async download(storagePath: string): Promise<Uint8Array> {
    this.downloads.push(storagePath);
    const bytes = this.objects.get(storagePath);
    if (!bytes) throw new Error('source object missing');
    return bytes;
  }

  async upload(
    storagePath: string,
    bytes: Uint8Array,
    contentType: string,
    options?: KnowledgeWorkerUploadOptions,
  ): Promise<void> {
    this.uploads.push({ path: storagePath, contentType, options, bytes });
    if (this.failUpload) throw new Error('artifact upload failed');
    if (this.failUploadPaths.has(storagePath)) throw new Error('derivative upload failed');
    this.objects.set(storagePath, bytes);
  }

  async remove(storagePath: string): Promise<void> {
    this.removed.push(storagePath);
    this.objects.delete(storagePath);
  }
}

class FakeRepository implements KnowledgeExtractionRepository {
  status: 'uploaded' | 'processing' | 'failed' | 'ready' = 'uploaded';
  completeResult: Result<void, DomainError> = ok(undefined);
  failResult: Result<void, DomainError> = ok(undefined);
  renewResult: Result<KnowledgeProcessingLease, DomainError> = ok({
    leaseToken: LEASE_TOKEN,
    processingAttempt: 1,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  readonly completions: KnowledgeExtractionCompletion[] = [];
  readonly failures: string[] = [];

  async claim(): Promise<Result<KnowledgeExtractionJob, DomainError>> {
    if (this.status !== 'uploaded' && this.status !== 'failed') {
      return err(domainError('conflict', 'not claimable'));
    }
    this.status = 'processing';
    const job: KnowledgeExtractionJob = {
      documentId: DOCUMENT,
      boardId: BOARD,
      storagePath: SOURCE_PATH,
      contentSha256: createHash('sha256').update(SOURCE_BYTES).digest('hex'),
      leaseToken: LEASE_TOKEN,
      processingAttempt: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    return ok(job);
  }

  async renew() {
    return this.renewResult;
  }

  async complete(completion: KnowledgeExtractionCompletion) {
    if (!this.completeResult.ok) return this.completeResult;
    this.completions.push(completion);
    this.status = 'ready';
    return this.completeResult;
  }

  async fail(_documentId: typeof DOCUMENT, _leaseToken: string, message: string) {
    this.failures.push(message);
    if (this.failResult.ok) this.status = 'failed';
    return this.failResult;
  }
}

const WEBP_BYTES = (pageNumber: number) => new Uint8Array([0x52, 0x49, 0x46, 0x46, pageNumber]);

const rasterPage = (pageNumber: number) => ({
  pageNumber,
  widthPx: 1191,
  heightPx: 1684,
  pixelCount: 1191 * 1684,
  bytes: WEBP_BYTES(pageNumber),
});

const derivativePath = (pageNumber: number): string => {
  const built = knowledgePageDerivativePath(BOARD, DOCUMENT, pageNumber);
  if (built === null) throw new Error('fixture ids must build a derivative path');
  return built;
};

/** Two rendered pages, matching the two-page geometry fixture. */
const twoRasterPages = async (): Promise<PdfRasterResult> => ({
  pages: [rasterPage(1), rasterPage(2)],
  skipped: [],
});

function parserFromFixture(): KnowledgePdfParser {
  return {
    async run(input: OpenDataLoaderRunInput) {
      await fs.writeFile(path.join(input.outputDir, 'result.json'), JSON.stringify(basicFixture));
      return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 1 };
    },
  };
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-pdf-worker-test-'));
}

function deps(
  repository: FakeRepository,
  storage: FakeStorage,
  parser: KnowledgePdfParser = parserFromFixture(),
  root?: string,
  rasterizePages: KnowledgePdfWorkerDependencies['rasterizePages'] = twoRasterPages,
): KnowledgePdfWorkerDependencies {
  return {
    repository,
    storage,
    parser,
    geometry: async () => [
      { pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0 },
      { pageNumber: 2, widthPoints: 612, heightPoints: 792, rotation: 0 },
    ],
    hasher: { sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex') },
    parserOptionsHash: 'options-hash',
    parserName: 'opendataloader-pdf',
    parserVersion: '2.5.0',
    tempRoot: root,
    rasterizePages,
  };
}

describe('processKnowledgePdfDocument', () => {
  it('runs one document end-to-end, preserves raw JSON, and cleans its temp directory', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const root = await tempRoot();
    try {
      const result = await processKnowledgePdfDocument(deps(repository, storage, parserFromFixture(), root), DOCUMENT);

      expect(result.status).toBe('ready');
      expect(result.rawArtifactPath).toBe(KNOWLEDGE_RAW_ARTIFACT_PATH(BOARD, DOCUMENT, 1, LEASE_TOKEN));
      expect(repository.status).toBe('ready');
      expect(repository.completions[0].parserVersion).toBe('2.5.0');
      expect(repository.completions[0].parserOptionsHash).toBe('options-hash');
      expect(storage.objects.has(SOURCE_PATH)).toBe(true);
      expect(storage.objects.has(result.rawArtifactPath!)).toBe(true);
      expect(await fs.readdir(root)).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails before parser invocation on a source hash mismatch', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    let parserCalled = false;
    const parser: KnowledgePdfParser = {
      run: async () => {
        parserCalled = true;
        throw new Error('must not run');
      },
    };
    repository.claim = async () => ok({
      documentId: DOCUMENT,
      boardId: BOARD,
      storagePath: SOURCE_PATH,
      contentSha256: 'f'.repeat(64),
      leaseToken: LEASE_TOKEN,
      processingAttempt: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const result = await processKnowledgePdfDocument(deps(repository, storage, parser), DOCUMENT);

    expect(result.status).toBe('failed');
    expect(parserCalled).toBe(false);
    expect(repository.status).toBe('failed');
    expect(storage.objects.has(SOURCE_PATH)).toBe(true);
  });

  it('records parser, timeout, invalid JSON, and raw upload failures as failed', async () => {
    const cases: Array<{ name: string; parser: KnowledgePdfParser; configure?: (storage: FakeStorage) => void }> = [
      {
        name: 'parser failure',
        parser: { run: async () => { throw new Error('parser non-zero'); } },
      },
      {
        name: 'timeout',
        parser: { run: async () => { throw new Error('OpenDataLoader timed out'); } },
      },
      {
        name: 'invalid JSON',
        parser: {
          run: async (input) => {
            await fs.writeFile(path.join(input.outputDir, 'result.json'), '{bad json');
            return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 1 };
          },
        },
      },
      {
        name: 'raw upload failure',
        parser: parserFromFixture(),
        configure: (storage) => { storage.failUpload = true; },
      },
    ];

    for (const testCase of cases) {
      const repository = new FakeRepository();
      const storage = new FakeStorage();
      testCase.configure?.(storage);
      const result = await processKnowledgePdfDocument(
        deps(repository, storage, testCase.parser),
        DOCUMENT,
      );
      expect(result.status, testCase.name).toBe('failed');
      expect(repository.status, testCase.name).toBe('failed');
    }
  });

  it('removes a new raw artifact when transactional completion fails', async () => {
    const repository = new FakeRepository();
    repository.completeResult = err(domainError('unavailable', 'completion failed'));
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(deps(repository, storage), DOCUMENT);

    expect(result.status).toBe('failed');
    expect(storage.removed).toContain(KNOWLEDGE_RAW_ARTIFACT_PATH(BOARD, DOCUMENT, 1, LEASE_TOKEN));
    expect(repository.status).toBe('failed');
  });

  it('reports stale when completion discovers that the document was deleted', async () => {
    const repository = new FakeRepository();
    repository.completeResult = err(domainError('not_found', 'deleted'));
    repository.failResult = err(domainError('not_found', 'deleted'));
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(deps(repository, storage), DOCUMENT);

    expect(result.status).toBe('stale');
    expect(storage.removed).toContain(KNOWLEDGE_RAW_ARTIFACT_PATH(BOARD, DOCUMENT, 1, LEASE_TOKEN));
  });

  it('can retry a failed document and reach ready without a second lifecycle implementation', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    let attempts = 0;
    const parser: KnowledgePdfParser = {
      run: async (input) => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient parser failure');
        await fs.writeFile(path.join(input.outputDir, 'result.json'), JSON.stringify(basicFixture));
        return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 1 };
      },
    };

    const first = await processKnowledgePdfDocument(deps(repository, storage, parser), DOCUMENT);
    const second = await processKnowledgePdfDocument(deps(repository, storage, parser), DOCUMENT);

    expect(first.status).toBe('failed');
    expect(second.status).toBe('ready');
    expect(attempts).toBe(2);
  });

  it('keeps a deliberately slow job alive with heartbeats', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const parser: KnowledgePdfParser = {
      run: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await fs.writeFile(path.join(input.outputDir, 'result.json'), JSON.stringify(basicFixture));
        return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 50 };
      },
    };

    const result = await processKnowledgePdfDocument(
      { ...deps(repository, storage, parser), leaseTtlSeconds: 1, heartbeatIntervalMs: 5 },
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(repository.completions).toHaveLength(1);
  });

  it('stops without fail/complete when the heartbeat loses the lease', async () => {
    const repository = new FakeRepository();
    repository.renewResult = err(domainError('conflict', 'stale lease'));
    const storage = new FakeStorage();
    const parser: KnowledgePdfParser = {
      run: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        await fs.writeFile(path.join(input.outputDir, 'result.json'), JSON.stringify(basicFixture));
        return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 30 };
      },
    };

    const result = await processKnowledgePdfDocument(
      { ...deps(repository, storage, parser), leaseTtlSeconds: 1, heartbeatIntervalMs: 5 },
      DOCUMENT,
    );

    expect(result.status).toBe('stale');
    expect(repository.completions).toHaveLength(0);
    expect(repository.failures).toEqual([]);
  });
});

/**
 * P6J-F9-A1c -- page derivatives are optional enhancement data layered on top
 * of an already-ready document. The invariant every test here defends is that
 * canonical text success survives every derivative outcome, because a
 * derivative-induced recordFailure would move the row to `failed`, which the
 * dispatcher and claim RPC both treat as claimable work to re-run.
 */
describe('processKnowledgePdfDocument -- optional page derivatives', () => {
  const eligible = (
    repository: FakeRepository,
    storage: FakeStorage,
    raster?: KnowledgePdfWorkerDependencies['rasterizePages'],
  ) => deps(repository, storage, parserFromFixture(), undefined, raster);

  it('A1: completes canonical text before any derivative work, and skips it when completion fails', async () => {
    const order: string[] = [];
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const originalComplete = repository.complete.bind(repository);
    repository.complete = async (completion) => {
      order.push('complete');
      return originalComplete(completion);
    };

    const ready = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => { order.push('raster'); return twoRasterPages(); }),
      DOCUMENT,
    );
    expect(ready.status).toBe('ready');
    expect(order).toEqual(['complete', 'raster']);

    // With no ready document there is nothing to enhance, so nothing renders.
    const failing = new FakeRepository();
    failing.completeResult = err(domainError('unavailable', 'completion failed'));
    let rasterCalls = 0;
    const result = await processKnowledgePdfDocument(
      eligible(failing, new FakeStorage(), async () => { rasterCalls += 1; return twoRasterPages(); }),
      DOCUMENT,
    );
    expect(result.status).toBe('failed');
    expect(rasterCalls).toBe(0);
  });

  it('A2: a source over 50 MiB stays text-only and is never rendered', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const huge = new Uint8Array(52_428_801);
    huge.set(SOURCE_BYTES);
    storage.objects.set(SOURCE_PATH, huge);
    repository.claim = async () => ok({
      documentId: DOCUMENT,
      boardId: BOARD,
      storagePath: SOURCE_PATH,
      contentSha256: createHash('sha256').update(huge).digest('hex'),
      leaseToken: LEASE_TOKEN,
      processingAttempt: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    let rasterCalls = 0;

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => { rasterCalls += 1; return twoRasterPages(); }),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('text_only_ineligible');
    expect(rasterCalls).toBe(0);
    expect(storage.uploads.filter((upload) => upload.path !== result.rawArtifactPath)).toEqual([]);
    expect(repository.failures).toEqual([]);
    expect(repository.status).toBe('ready');
  });

  it('A3: more than 200 pages stays text-only, proving completed.value.pageCount is the authority', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const pageCount = 201;
    let rasterCalls = 0;
    const parser: KnowledgePdfParser = {
      async run(input: OpenDataLoaderRunInput) {
        await fs.writeFile(path.join(input.outputDir, 'result.json'), JSON.stringify({
          'file name': 'big.pdf',
          'number of pages': pageCount,
          author: null,
          title: null,
          kids: Array.from({ length: pageCount }, (_unused, index) => ({
            type: 'paragraph',
            id: index + 1,
            'page number': index + 1,
            'bounding box': [72, 650, 500, 690],
            content: 'Page ' + String(index + 1),
          })),
        }));
        return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, elapsedMs: 1 };
      },
    };

    const result = await processKnowledgePdfDocument({
      ...eligible(repository, storage, async () => { rasterCalls += 1; return twoRasterPages(); }),
      parser,
      geometry: async () => Array.from({ length: pageCount }, (_unused, index) => ({
        pageNumber: index + 1, widthPoints: 612, heightPoints: 792, rotation: 0,
      })),
    }, DOCUMENT);

    // The source is small, so only the 201-page count can make this
    // ineligible -- which is exactly what pins the page-count authority.
    expect(result.status).toBe('ready');
    expect(result.pageCount).toBe(pageCount);
    expect(result.derivativeWarning).toBe('text_only_ineligible');
    expect(rasterCalls).toBe(0);
    expect(repository.failures).toEqual([]);
    expect(repository.status).toBe('ready');
  });

  it('A4/A13: renders once from the bytes already in memory, with no second download', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const seen: Uint8Array[] = [];

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async (bytes) => { seen.push(bytes); return twoRasterPages(); }),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(seen).toHaveLength(1);
    expect([...seen[0]]).toEqual([...SOURCE_BYTES]);
    // The source object is downloaded exactly once, for extraction.
    expect(storage.downloads).toEqual([SOURCE_PATH]);
  });

  it('A5/A6: derivatives upsert as canonical WebP while the raw artifact keeps no-overwrite', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(eligible(repository, storage), DOCUMENT);

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBeUndefined();

    const derivatives = storage.uploads.filter((upload) => upload.path !== result.rawArtifactPath);
    expect(derivatives.map((upload) => upload.path)).toEqual([derivativePath(1), derivativePath(2)]);
    for (const [index, upload] of derivatives.entries()) {
      expect(upload.contentType).toBe(KNOWLEDGE_DERIVATIVE_CONTENT_TYPE);
      expect(upload.options).toEqual({ upsert: true, cacheControl: '31536000' });
      expect([...upload.bytes]).toEqual([...WEBP_BYTES(index + 1)]);
    }
    expect(KNOWLEDGE_DERIVATIVE_CONTENT_TYPE).toBe('image/webp');

    // A6: the raw extraction artifact must not have become overwritable.
    const raw = storage.uploads.find((upload) => upload.path === result.rawArtifactPath);
    expect(raw?.contentType).toBe('application/json');
    expect(raw?.options?.upsert).toBeUndefined();
  });

  it('A7: a rasterizer that renders nothing leaves the text result untouched', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => ({
        pages: [],
        skipped: [{ pageNumber: 1, reason: 'render_failed' as const }],
      })),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.pageCount).toBe(2);
    expect(result.derivativeWarning).toBe('raster_failed');
    expect(storage.uploads.filter((upload) => upload.path !== result.rawArtifactPath)).toEqual([]);
    expect(repository.failures).toEqual([]);
    expect(repository.status).toBe('ready');
  });

  it('A8: a partial render uploads the pages that rendered and no others', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => ({
        pages: [rasterPage(2)],
        skipped: [{ pageNumber: 1, reason: 'page_too_large' as const }],
      })),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('raster_partial');
    const derivatives = storage.uploads.filter((upload) => upload.path !== result.rawArtifactPath);
    expect(derivatives.map((upload) => upload.path)).toEqual([derivativePath(2)]);
    expect(storage.objects.has(derivativePath(1))).toBe(false);
    expect(repository.failures).toEqual([]);
  });

  it('A9: one failed upload does not stop later pages, and nothing is rolled back', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    storage.failUploadPaths.add(derivativePath(2));

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => ({
        pages: [rasterPage(1), rasterPage(2), rasterPage(3)],
        skipped: [],
      })),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('upload_partial');
    // Page 3 was still attempted after page 2 threw.
    const attempted = storage.uploads
      .filter((upload) => upload.path !== result.rawArtifactPath)
      .map((upload) => upload.path);
    expect(attempted).toEqual([derivativePath(1), derivativePath(2), derivativePath(3)]);
    // Pages stored before and after the failure are kept -- no compensation.
    expect(storage.objects.has(derivativePath(1))).toBe(true);
    expect(storage.objects.has(derivativePath(3))).toBe(true);
    expect(storage.removed).toEqual([]);
    expect(repository.failures).toEqual([]);
  });

  it('A10: every derivative upload failing still leaves the document ready', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    storage.failUploadPaths.add(derivativePath(1));
    storage.failUploadPaths.add(derivativePath(2));

    const result = await processKnowledgePdfDocument(eligible(repository, storage), DOCUMENT);

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('upload_failed');
    expect(repository.status).toBe('ready');
    expect(repository.failures).toEqual([]);
  });

  it('A11: an unexpected throw from the rasterizer is contained by the optional boundary', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => { throw new Error('renderer exploded'); }),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('raster_failed');
    expect(repository.status).toBe('ready');
    expect(repository.failures).toEqual([]);
  });

  it('A12: no derivative outcome can record a failure once the document is ready', async () => {
    const rasterOutcomes: Array<[string, KnowledgePdfWorkerDependencies['rasterizePages']]> = [
      ['throws', async () => { throw new Error('renderer exploded'); }],
      ['renders nothing', async () => ({ pages: [], skipped: [] })],
      ['renders every page', twoRasterPages],
      ['unbuildable path', async () => ({ pages: [{ ...rasterPage(1), pageNumber: 0 }], skipped: [] })],
    ];

    for (const [label, raster] of rasterOutcomes) {
      for (const failEveryUpload of [false, true]) {
        const repository = new FakeRepository();
        const storage = new FakeStorage();
        if (failEveryUpload) {
          storage.failUploadPaths.add(derivativePath(1));
          storage.failUploadPaths.add(derivativePath(2));
        }

        const result = await processKnowledgePdfDocument(eligible(repository, storage, raster), DOCUMENT);

        const context = label + '/failUploads=' + String(failEveryUpload);
        expect(result.status, context).toBe('ready');
        expect(repository.failures, context).toEqual([]);
        expect(repository.status, context).toBe('ready');
      }
    }
  });

  it('contains an unbuildable derivative path instead of uploading null', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(
      // Page 0 is rejected by the canonical path helper, which returns null.
      eligible(repository, storage, async () => ({
        pages: [{ ...rasterPage(1), pageNumber: 0 }, rasterPage(2)],
        skipped: [],
      })),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('invalid_derivative_path');
    // The unbuildable page is skipped; the valid one still uploads.
    const derivatives = storage.uploads.filter((upload) => upload.path !== result.rawArtifactPath);
    expect(derivatives.map((upload) => upload.path)).toEqual([derivativePath(2)]);
    expect(repository.failures).toEqual([]);
  });

  /**
   * The canonical catch owns recordFailure, so anything escaping the derivative
   * phase turns a ready document into a failed one -- and a failed row is
   * claimable by claim_knowledge_extraction, so it can be re-extracted whole.
   * A handler that inspects the thrown value cannot close this: reading
   * .message is itself what throws here. The call-site guard must not look.
   */
  it('contains a hostile throw whose own accessors throw, without inspecting it', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    // Every accessor throws the object itself, so a handler that inspects the
    // thrown value re-throws the same hostile value and can never converge.
    // Only a catch that refuses to look at it terminates.
    const hostile = {} as { readonly message: string; readonly stack: string };
    for (const accessor of ['message', 'stack'] as const) {
      Object.defineProperty(hostile, accessor, { get: (): string => { throw hostile; } });
    }
    Object.defineProperty(hostile, 'toString', { value: (): string => { throw hostile; } });

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => { throw hostile; }),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.pageCount).toBe(2);
    expect(result.derivativeWarning).toBe('raster_failed');
    // The dangerous transition -- ready to failed -- must not have happened.
    expect(repository.failures).toEqual([]);
    expect(repository.status).toBe('ready');
    // Nothing was rendered, so nothing was uploaded and nothing re-downloaded.
    expect(storage.uploads.filter((upload) => upload.path !== result.rawArtifactPath)).toEqual([]);
    expect(storage.downloads).toEqual([SOURCE_PATH]);
  });

  it.each([
    ['a bare string', 'renderer exploded'],
    ['null', null],
    ['a number', 42],
    ['a proxy that throws on every read', new Proxy({}, { get() { throw new Error('proxy trap'); } })],
  ])('contains a non-Error throw: %s', async (_label, thrown) => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(
      eligible(repository, storage, async () => { throw thrown; }),
      DOCUMENT,
    );

    expect(result.status).toBe('ready');
    expect(result.derivativeWarning).toBe('raster_failed');
    expect(repository.failures).toEqual([]);
    expect(repository.status).toBe('ready');
  });

});
