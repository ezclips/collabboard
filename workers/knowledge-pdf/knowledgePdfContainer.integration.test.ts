import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../../lib/domain/core/ids';
import { claimKnowledgeDocumentForProcessing } from '../../lib/domain/knowledge/knowledgeExtraction';
import { createKnowledgePdfUpload } from '../../lib/domain/knowledge/knowledgeIngestion';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '../../lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeExtractionRepository } from '../../lib/infra/knowledge/knowledgeExtractionAdapters';

const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : {};
const image = env.P5E_CONTAINER_IMAGE;
const fixtureDir = env.P5_FIXTURE_DIR || '';
const hasRuntime = Boolean(env.P5_JAVA_BIN && env.P5_JAR_PATH && fs.existsSync(fixtureDir));
const BOARD = asBoardId(env.P4_BOARD_A || '00000000-0000-0000-0000-000000002011');
const OWNER = asUserId(env.P4_OWNER || '00000000-0000-0000-0000-000000001011');

function docker(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`docker ${args[0] ?? 'command'} failed`);
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function containerName(label: string): string {
  return `collabboard-p5e-${label}-${Math.random().toString(16).slice(2, 10)}`;
}

describe.skipIf(!hasLocalStack || !image || !hasRuntime)('P5E built worker image -- local container integration', () => {
  let client: SupabaseClient;
  let containerSupabaseUrl: string;

  beforeAll(() => {
    const localUrl = new URL(env.P4_SUPABASE_URL);
    expect(['127.0.0.1', 'localhost']).toContain(localUrl.hostname);
    containerSupabaseUrl = `http://host.docker.internal:${localUrl.port}`;
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    docker(['image', 'inspect', image!]);
  });

  async function ingest(label: string, fixture = 'simple-text') {
    const bytes = new Uint8Array(fs.readFileSync(path.join(fixtureDir, `${fixture}.pdf`)));
    const result = await createKnowledgePdfUpload(
      {
        authorizer: new SupabaseKnowledgeBoardAuthorizer(client as never),
        repository: new SupabaseKnowledgeIngestionRepository(client as never),
        storage: new SupabaseKnowledgeStorageGateway(client as never),
        hasher: new NodeKnowledgeContentHasher(),
        ids: new RandomKnowledgeDocumentIdFactory(),
      },
      { boardId: BOARD, userId: OWNER, file: { filename: `${label}.pdf`, mimeType: 'application/pdf', bytes } },
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

  function start(name: string, concurrency = 2): string {
    const id = containerName(name);
    docker([
      'run', '-d', '--name', id,
      '--add-host', 'host.docker.internal:host-gateway',
      '-e', `SUPABASE_URL=${containerSupabaseUrl}`,
      '-e', `SUPABASE_SERVICE_ROLE_KEY=${env.P4_SERVICE_ROLE_KEY}`,
      '-e', 'KNOWLEDGE_PDF_POLL_INTERVAL_MS=100',
      '-e', `KNOWLEDGE_PDF_WORKER_CONCURRENCY=${concurrency}`,
      '-e', 'KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS=10',
      '-e', 'KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS=2000',
      image!,
    ]);
    return id;
  }

  function stop(name: string, force = false): void {
    try {
      docker([force ? 'kill' : 'stop', name]);
    } finally {
      try { docker(['rm', '-f', name]); } catch { /* already removed */ }
    }
  }

  async function waitFor(id: string, desired: 'ready' | 'failed' | 'processing', timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await status(id);
      if (row?.processing_status === desired) return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${id} -> ${desired}`);
  }

  it('runs the built image end-to-end with Node, Java 17, OpenDataLoader and PDF.js', async () => {
    const document = await ingest('container-single', 'mixed-layout');
    const name = start('single');
    try {
      const row = await waitFor(String(document.id), 'ready');
      expect(row.processing_attempt).toBe(1);
      expect(row.raw_artifact_path).toContain('/attempt-1-');
      expect(row.raw_artifact_path).toContain('opendataloader-2.5.0.json');
      expect((await client.from('knowledge_pages').select('id').eq('document_id', document.id)).data?.length).toBeGreaterThan(0);
    } finally {
      stop(name);
    }
  }, 120_000);

  it('runs two instances of the same image against multiple documents', async () => {
    const documents = await Promise.all([
      ingest('container-multi-a', 'simple-text'),
      ingest('container-multi-b', 'table'),
    ]);
    const first = start('multi-a', 1);
    const second = start('multi-b', 1);
    try {
      for (const document of documents) await waitFor(String(document.id), 'ready');
      const rows = await Promise.all(documents.map((document) => status(String(document.id))));
      expect(rows.every((row) => row?.processing_status === 'ready')).toBe(true);
      expect(rows[0]?.raw_artifact_path).not.toBe(rows[1]?.raw_artifact_path);
    } finally {
      stop(first);
      stop(second);
    }
  }, 120_000);

  it('recovers a document after a container hard-stop with no manual reset', async () => {
    const document = await ingest('container-restart');
    const claimed = await claimKnowledgeDocumentForProcessing(
      { repository: new SupabaseKnowledgeExtractionRepository(client as never), leaseTtlSeconds: 2 },
      asKnowledgeDocumentId(document.id),
    );
    expect(claimed.ok).toBe(true);
    const first = start('crash', 1);
    stop(first, true);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const second = start('recovery', 1);
    try {
      const row = await waitFor(String(document.id), 'ready');
      expect(row.processing_attempt).toBe(2);
    } finally {
      stop(second);
    }
  }, 120_000);

  it('gracefully stops a running image without requiring a forced kill', async () => {
    const document = await ingest('container-graceful-stop');
    const name = start('graceful', 1);
    try {
      await waitFor(String(document.id), 'processing');
      docker(['stop', '--time', '30', name]);
      const row = await waitFor(String(document.id), 'ready');
      expect(row.processing_status).toBe('ready');
    } finally {
      try { docker(['rm', '-f', name]); } catch { /* already stopped */ }
    }
  }, 120_000);
});
