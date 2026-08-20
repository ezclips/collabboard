import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../../lib/domain/core/ids';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';
import { claimKnowledgeDocumentForProcessing, completeKnowledgeExtraction, failKnowledgeExtraction } from '../../lib/domain/knowledge/knowledgeExtraction';
import type { KnowledgePdfExtractionResult } from '../../lib/domain/knowledge/pdfExtraction';
import { createKnowledgePdfUpload } from '../../lib/domain/knowledge/knowledgeIngestion';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '../../lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeExtractionRepository } from '../../lib/infra/knowledge/knowledgeExtractionAdapters';
import { createKnowledgePdfWorkerFromEnvironment, processKnowledgePdfDocument } from './processKnowledgePdfDocument';
import type { KnowledgePdfWorkerDependencies } from './processKnowledgePdfDocument';
import { runKnowledgePdfDispatcher } from './dispatcher';
import type { KnowledgeProcessingCandidateRepository } from './dispatcher';

const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : {};
const fixtureDir = env.P5_FIXTURE_DIR || '';
const hasWorkerRuntime = Boolean(env.P5_JAVA_BIN && env.P5_JAR_PATH && fs.existsSync(fixtureDir));
const BOARD = asBoardId(env.P4_BOARD_A || '00000000-0000-0000-0000-000000002011');
const OWNER = asUserId(env.P4_OWNER || '00000000-0000-0000-0000-000000001011');

function pdfExtraction(sha: string, text: string): KnowledgePdfExtractionResult {
  return {
    parser: { name: 'dispatcher-test', version: '1', optionsHash: 'dispatcher-test' },
    document: { contentSha256: sha, pageCount: 1 },
    pages: [{ pageNumber: 1, text, elements: [] }],
    citationReady: false,
  };
}

describe.skipIf(!hasLocalStack || !hasWorkerRuntime)('P5D dispatcher -- local discovery and dispatch integration', () => {
  let client: SupabaseClient;
  let repository: SupabaseKnowledgeExtractionRepository;
  let worker: KnowledgePdfWorkerDependencies;

  beforeAll(() => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(env.P4_SUPABASE_URL).hostname);
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    repository = new SupabaseKnowledgeExtractionRepository(client as never);
    worker = createKnowledgePdfWorkerFromEnvironment({
      SUPABASE_URL: env.P4_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.P4_SERVICE_ROLE_KEY,
      OPENDATALOADER_JAVA_BIN: env.P5_JAVA_BIN,
      OPENDATALOADER_JAR_PATH: env.P5_JAR_PATH,
    });
  });

  async function ingest(name: string, fixtureName = 'simple-text') {
    const bytes = new Uint8Array(fs.readFileSync(path.join(fixtureDir, `${fixtureName}.pdf`)));
    const result = await createKnowledgePdfUpload(
      {
        authorizer: new SupabaseKnowledgeBoardAuthorizer(client as never),
        repository: new SupabaseKnowledgeIngestionRepository(client as never),
        storage: new SupabaseKnowledgeStorageGateway(client as never),
        hasher: new NodeKnowledgeContentHasher(),
        ids: new RandomKnowledgeDocumentIdFactory(),
      },
      { boardId: BOARD, userId: OWNER, file: { filename: `${name}.pdf`, mimeType: 'application/pdf', bytes } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }

  async function status(id: string) {
    const { data } = await client.from('knowledge_documents')
      .select('processing_status, processing_attempt, raw_artifact_path')
      .eq('id', id)
      .single();
    return data;
  }

  function filteredDiscovery(ids: Set<string>): KnowledgeProcessingCandidateRepository {
    return {
      listProcessingCandidates: async () => {
        // Filter after a broad real database discovery so unrelated fixtures
        // cannot consume the dispatcher’s bounded SQL result before the
        // target document is reached.
        const result = await repository.listProcessingCandidates(100);
        if (!result.ok) return result;
        return { ok: true, value: result.value.filter((id) => ids.has(String(id))) };
      },
    };
  }

  async function runUntilReady(
    ids: readonly string[],
    concurrency = 2,
    process = (id: KnowledgeDocumentId) => processKnowledgePdfDocument(worker, id),
  ) {
    const controller = new AbortController();
    const idSet = new Set(ids);
    const dispatcher = runKnowledgePdfDispatcher(
      { discovery: filteredDiscovery(idSet), processDocument: process },
      { concurrency, pollIntervalMs: 25, discoveryLimit: 100, signal: controller.signal },
    );
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const rows = await Promise.all(ids.map((id) => status(id)));
      if (rows.every((row) => row?.processing_status === 'ready' || row?.processing_status === 'failed')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    controller.abort();
    return dispatcher;
  }

  it('discovers uploaded documents, expired processing, and excludes active/failed/ready', async () => {
    const uploaded = await ingest('dispatcher-uploaded');
    const active = await ingest('dispatcher-active');
    const activeClaim = await claimKnowledgeDocumentForProcessing({ repository, leaseTtlSeconds: 60 }, active.id);
    expect(activeClaim.ok).toBe(true);
    const expired = await ingest('dispatcher-expired');
    const expiredClaim = await claimKnowledgeDocumentForProcessing({ repository, leaseTtlSeconds: 1 }, expired.id);
    expect(expiredClaim.ok).toBe(true);
    const failed = await ingest('dispatcher-failed');
    const failedClaim = await claimKnowledgeDocumentForProcessing({ repository, leaseTtlSeconds: 60 }, failed.id);
    expect(failedClaim.ok).toBe(true);
    if (failedClaim.ok) await failKnowledgeExtraction({ repository }, failed.id, failedClaim.value.leaseToken, new Error('manual failure'));
    const ready = await ingest('dispatcher-ready');
    await processKnowledgePdfDocument(worker, ready.id);
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const candidates = await repository.listProcessingCandidates(100);
    expect(candidates.ok).toBe(true);
    if (!candidates.ok) return;
    const candidateIds = new Set(candidates.value.map(String));
    expect(candidateIds.has(String(uploaded.id))).toBe(true);
    expect(candidateIds.has(String(expired.id))).toBe(true);
    expect(candidateIds.has(String(active.id))).toBe(false);
    expect(candidateIds.has(String(failed.id))).toBe(false);
    expect(candidateIds.has(String(ready.id))).toBe(false);
  }, 30_000);

  it('dispatches three documents with bounded concurrency to ready', async () => {
    const documents = await Promise.all([
      ingest('dispatcher-three-a', 'simple-text'),
      ingest('dispatcher-three-b', 'two-column'),
      ingest('dispatcher-three-c', 'table'),
    ]);
    await runUntilReady(documents.map((document) => String(document.id)), 2);
    for (const document of documents) {
      expect((await status(String(document.id)))?.processing_status).toBe('ready');
    }
  }, 30_000);

  it('supports two dispatchers discovering the same document safely', async () => {
    const document = await ingest('dispatcher-two-processes');
    const ids = new Set([String(document.id)]);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = runKnowledgePdfDispatcher(
      { discovery: filteredDiscovery(ids), processDocument: (id) => processKnowledgePdfDocument(worker, id) },
      { concurrency: 1, pollIntervalMs: 25, signal: firstController.signal },
    );
    const second = runKnowledgePdfDispatcher(
      { discovery: filteredDiscovery(ids), processDocument: (id) => processKnowledgePdfDocument(worker, id) },
      { concurrency: 1, pollIntervalMs: 25, signal: secondController.signal },
    );
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await status(String(document.id)))?.processing_status === 'ready') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    firstController.abort();
    secondController.abort();
    await Promise.all([first, second]);
    expect((await status(String(document.id)))?.processing_status).toBe('ready');
    expect((await status(String(document.id)))?.processing_attempt).toBe(1);
  }, 30_000);

  it('recovers a crashed claim after lease expiry through normal discovery', async () => {
    const document = await ingest('dispatcher-crash-recovery');
    const claimed = await claimKnowledgeDocumentForProcessing({ repository, leaseTtlSeconds: 1 }, document.id);
    expect(claimed.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await runUntilReady([String(document.id)], 1);
    const row = await status(String(document.id));
    expect(row?.processing_status).toBe('ready');
    expect(row?.processing_attempt).toBe(2);
  }, 30_000);

  it('does not automatically retry failed documents', async () => {
    const document = await ingest('dispatcher-no-failed-retry');
    const claimed = await claimKnowledgeDocumentForProcessing({ repository, leaseTtlSeconds: 60 }, document.id);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    await failKnowledgeExtraction({ repository }, document.id, claimed.value.leaseToken, new Error('explicit failure'));
    const controller = new AbortController();
    let processed = 0;
    const dispatcher = runKnowledgePdfDispatcher(
      { discovery: filteredDiscovery(new Set([String(document.id)])), processDocument: async () => { processed += 1; return { status: 'ready', documentId: document.id, stage: 'complete', pageCount: 1 }; } },
      { concurrency: 1, pollIntervalMs: 20, signal: controller.signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await dispatcher;
    expect(processed).toBe(0);
    expect((await status(String(document.id)))?.processing_status).toBe('failed');
  }, 30_000);

  it('isolates one parser failure while another document reaches ready', async () => {
    const bad = await ingest('dispatcher-bad');
    const good = await ingest('dispatcher-good');
    const badWorker: KnowledgePdfWorkerDependencies = {
      ...worker,
      parser: { run: async () => { throw new Error('forced parser failure'); } },
    };
    await runUntilReady(
      [String(bad.id), String(good.id)],
      2,
      (id) => processKnowledgePdfDocument(id === bad.id ? badWorker : worker, id),
    );
    expect((await status(String(bad.id)))?.processing_status).toBe('failed');
    expect((await status(String(good.id)))?.processing_status).toBe('ready');
  }, 30_000);
});
