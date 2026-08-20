import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../../lib/domain/core/ids';
import { createKnowledgePdfUpload } from '../../lib/domain/knowledge/knowledgeIngestion';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '../../lib/infra/knowledge/knowledgeIngestionAdapters';
import {
  createKnowledgePdfWorkerFromEnvironment,
  processKnowledgePdfDocument,
} from './processKnowledgePdfDocument';
import type { KnowledgePdfWorkerDependencies } from './processKnowledgePdfDocument';

const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack
  ? JSON.parse(fs.readFileSync(envPath, 'utf8'))
  : {};
const fixtureDir = env.P5_FIXTURE_DIR;
const resolvedFixtureDir = fixtureDir || '';
const hasWorkerRuntime = Boolean(
  fixtureDir &&
    env.P5_JAVA_BIN &&
    env.P5_JAR_PATH &&
    fs.existsSync(resolvedFixtureDir) &&
    fs.existsSync(env.P5_JAVA_BIN) &&
    fs.existsSync(env.P5_JAR_PATH),
);

const BOARD = asBoardId(env.P4_BOARD_A || '00000000-0000-0000-0000-000000002011');
const OWNER = asUserId(env.P4_OWNER || '00000000-0000-0000-0000-000000001011');

describe.skipIf(!hasLocalStack || !hasWorkerRuntime)('P5B real OpenDataLoader worker -- local integration', () => {
  let client: SupabaseClient;
  let worker: KnowledgePdfWorkerDependencies;

  beforeAll(() => {
    const url = new URL(env.P4_SUPABASE_URL);
    expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    worker = createKnowledgePdfWorkerFromEnvironment({
      SUPABASE_URL: env.P4_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.P4_SERVICE_ROLE_KEY,
      OPENDATALOADER_JAVA_BIN: env.P5_JAVA_BIN,
      OPENDATALOADER_JAR_PATH: env.P5_JAR_PATH,
    });
  });

  async function ingestFixture(name: string) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(resolvedFixtureDir, `${name}.pdf`)));
    const result = await createKnowledgePdfUpload(
      {
        authorizer: new SupabaseKnowledgeBoardAuthorizer(client as never),
        repository: new SupabaseKnowledgeIngestionRepository(client as never),
        storage: new SupabaseKnowledgeStorageGateway(client as never),
        hasher: new NodeKnowledgeContentHasher(),
        ids: new RandomKnowledgeDocumentIdFactory(),
      },
      {
        boardId: BOARD,
        userId: OWNER,
        file: { filename: `${name}.pdf`, mimeType: 'application/pdf', bytes },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    return { document: result.value, bytes };
  }

  async function documentRow(documentId: string) {
    const { data, error } = await client
      .from('knowledge_documents')
      .select('processing_status, page_count, parser_name, parser_version, parser_options_hash, raw_artifact_path, content_sha256')
      .eq('id', documentId)
      .single();
    expect(error).toBeNull();
    return data;
  }

  it.each([
    ['simple-text', 2],
    ['two-column', 1],
    ['table', 1],
    ['mixed-layout', 1],
  ])('%s: P4 ingest -> real worker -> ready pages', async (fixture, expectedPageCount) => {
    const { document, bytes } = await ingestFixture(fixture);
    const result = await processKnowledgePdfDocument(worker, document.id);

    expect(result.status).toBe('ready');
    const row = await documentRow(document.id);
    expect(row?.processing_status).toBe('ready');
    expect(row?.page_count).toBe(expectedPageCount);
    expect(row?.parser_name).toBe('opendataloader-pdf');
    expect(row?.parser_version).toBe('2.5.0');
    expect(row?.parser_options_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.raw_artifact_path).toBe(result.rawArtifactPath);

    const pages = await client
      .from('knowledge_pages')
      .select('page_number, width_points, height_points, rotation, text')
      .eq('document_id', document.id)
      .order('page_number');
    expect(pages.error).toBeNull();
    expect(pages.data).toHaveLength(expectedPageCount);
    for (const page of pages.data ?? []) {
      expect(page.width_points).toBeGreaterThan(0);
      expect(page.height_points).toBeGreaterThan(0);
      expect([0, 90, 180, 270]).toContain(page.rotation);
    }

    const raw = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(row!.raw_artifact_path!);
    expect(raw.error).toBeNull();
    expect(JSON.parse(await raw.data!.text())).toBeDefined();
    expect((await client.from('knowledge_chunks').select('id').eq('document_id', document.id)).data).toEqual([]);

    const original = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(document.storagePath);
    expect(original.error).toBeNull();
    expect(createHash('sha256').update(new Uint8Array(await original.data!.arrayBuffer())).digest('hex')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
  });

  it('failed -> retry -> ready uses the same P5A lifecycle', async () => {
    const { document } = await ingestFixture('simple-text');
    let attempts = 0;
    const flakyWorker: KnowledgePdfWorkerDependencies = {
      ...worker,
      parser: {
        run: async (input) => {
          attempts += 1;
          if (attempts === 1) throw new Error('intentional local retry failure');
          return worker.parser.run(input);
        },
      },
    };

    const first = await processKnowledgePdfDocument(flakyWorker, document.id);
    const second = await processKnowledgePdfDocument(flakyWorker, document.id);

    expect(first.status).toBe('failed');
    expect(second.status).toBe('ready');
    expect(attempts).toBe(2);
    expect((await documentRow(document.id))?.processing_status).toBe('ready');
  });
});
