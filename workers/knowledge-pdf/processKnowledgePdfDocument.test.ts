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
import type { KnowledgeExtractionCompletion, KnowledgeExtractionJob, KnowledgeExtractionRepository } from '../../lib/domain/knowledge/knowledgeExtraction';
import basicFixture from '../../lib/infra/knowledge/fixtures/openDataLoader-basic.json';
import {
  KNOWLEDGE_RAW_ARTIFACT_PATH,
  processKnowledgePdfDocument,
} from './processKnowledgePdfDocument';
import type {
  KnowledgePdfParser,
  KnowledgePdfWorkerDependencies,
  KnowledgeWorkerStorage,
} from './processKnowledgePdfDocument';
import type { OpenDataLoaderRunInput } from './openDataLoaderRunner';

const DOCUMENT = asKnowledgeDocumentId('00000000-0000-0000-0000-000000000101');
const BOARD = asBoardId('00000000-0000-0000-0000-000000000201');
const SOURCE_PATH = 'knowledge/board/document/original.pdf';
const SOURCE_BYTES = new Uint8Array(Buffer.from('%PDF-1.7\nworker test\n%%EOF', 'utf8'));

class FakeStorage implements KnowledgeWorkerStorage {
  readonly objects = new Map<string, Uint8Array>([[SOURCE_PATH, SOURCE_BYTES]]);
  failUpload = false;
  readonly removed: string[] = [];

  async download(storagePath: string): Promise<Uint8Array> {
    const bytes = this.objects.get(storagePath);
    if (!bytes) throw new Error('source object missing');
    return bytes;
  }

  async upload(storagePath: string, bytes: Uint8Array): Promise<void> {
    if (this.failUpload) throw new Error('artifact upload failed');
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
    };
    return ok(job);
  }

  async complete(completion: KnowledgeExtractionCompletion) {
    if (!this.completeResult.ok) return this.completeResult;
    this.completions.push(completion);
    this.status = 'ready';
    return this.completeResult;
  }

  async fail(_documentId: typeof DOCUMENT, message: string) {
    this.failures.push(message);
    if (this.failResult.ok) this.status = 'failed';
    return this.failResult;
  }
}

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
      expect(result.rawArtifactPath).toBe(KNOWLEDGE_RAW_ARTIFACT_PATH(BOARD, DOCUMENT));
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
    expect(storage.removed).toContain(KNOWLEDGE_RAW_ARTIFACT_PATH(BOARD, DOCUMENT));
    expect(repository.status).toBe('failed');
  });

  it('reports stale when completion discovers that the document was deleted', async () => {
    const repository = new FakeRepository();
    repository.completeResult = err(domainError('not_found', 'deleted'));
    repository.failResult = err(domainError('not_found', 'deleted'));
    const storage = new FakeStorage();

    const result = await processKnowledgePdfDocument(deps(repository, storage), DOCUMENT);

    expect(result.status).toBe('stale');
    expect(storage.removed).toContain(KNOWLEDGE_RAW_ARTIFACT_PATH(BOARD, DOCUMENT));
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
});
