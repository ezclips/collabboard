import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { asBoardId, asUserId } from '../../domain/core/ids';
import { createKnowledgePdfUpload } from '../../domain/knowledge/knowledgeIngestion';
import type { KnowledgeIngestionDeps } from '../../domain/knowledge/knowledgeIngestion';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from './knowledgeIngestionAdapters';

/**
 * P4 integration test against a DISPOSABLE LOCAL Supabase stack.
 *
 * It is skipped unless `scripts/.tmp-p4-env.json` exists, which is written by
 * the local bootstrap that starts the stack. This keeps the suite green on
 * machines (and CI) without Docker while still letting the real happy-path
 * and rollback contracts be proven against real Postgres + real Storage.
 *
 * It NEVER touches the remote project: the URL it connects to is asserted to
 * be loopback before any write happens.
 */
const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack
  ? JSON.parse(fs.readFileSync(envPath, 'utf8'))
  : {};

function pdf(body: string): Uint8Array {
  return new Uint8Array([...Buffer.from(`%PDF-1.7\n${body}\n%%EOF`, 'utf8')]);
}

describe.skipIf(!hasLocalStack)('P4 ingestion -- local Supabase integration', () => {
  let client: SupabaseClient;

  beforeAll(() => {
    const url = new URL(env.P4_SUPABASE_URL);
    // Hard guard: refuse to run against anything that is not loopback.
    expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  function deps(overrides: Partial<KnowledgeIngestionDeps> = {}): KnowledgeIngestionDeps {
    return {
      authorizer: new SupabaseKnowledgeBoardAuthorizer(client as never),
      repository: new SupabaseKnowledgeIngestionRepository(client as never),
      storage: new SupabaseKnowledgeStorageGateway(client as never),
      hasher: new NodeKnowledgeContentHasher(),
      ids: new RandomKnowledgeDocumentIdFactory(),
      ...overrides,
    };
  }

  it('ingests a real PDF: object stored, row created, status uploaded, worker fields null', async () => {
    const bytes = pdf('happy path');
    const result = await createKnowledgePdfUpload(deps(), {
      boardId: asBoardId(env.P4_BOARD_A),
      userId: asUserId(env.P4_OWNER),
      file: { filename: 'quarterly report.pdf', mimeType: 'application/pdf', bytes },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.value;

    expect(doc.processingStatus).toBe('uploaded');
    expect(doc.kind).toBe('pdf');
    expect(doc.pageCount).toBeNull();
    expect(doc.parserName).toBeNull();
    expect(doc.parserVersion).toBeNull();
    expect(doc.parserOptionsHash).toBeNull();
    expect(doc.rawArtifactPath).toBeNull();
    expect(doc.originalFilename).toBe('quarterly report.pdf');
    expect(doc.fileSizeBytes).toBe(bytes.byteLength);
    expect(doc.contentSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(doc.storagePath).toBe(`knowledge/${env.P4_BOARD_A}/${doc.id}/original.pdf`);

    // The row really is in Postgres.
    const { data: row } = await client
      .from('knowledge_documents').select('*').eq('id', doc.id).single();
    expect(row?.processing_status).toBe('uploaded');
    expect(row?.page_count).toBeNull();

    // The object really is in Storage, byte-identical.
    const dl = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(doc.storagePath);
    expect(dl.error).toBeNull();
    const stored = new Uint8Array(await dl.data!.arrayBuffer());
    expect(createHash('sha256').update(stored).digest('hex')).toBe(doc.contentSha256);
  });

  it('the bucket holding Knowledge PDFs is NOT public', async () => {
    // The whole point of not reusing `padlet-files`: a public bucket would
    // serve board-scoped PDFs to anyone with the URL, defeating P3's RLS.
    const list = await client.storage.listBuckets();
    const bucket = list.data?.find((b) => b.name === KNOWLEDGE_STORAGE_BUCKET);
    expect(bucket).toBeDefined();
    expect(bucket?.public).toBe(false);
  });

  it('rejects a read-only (viewer) collaborator and writes nothing', async () => {
    const before = await client.from('knowledge_documents').select('id');
    const result = await createKnowledgePdfUpload(deps(), {
      boardId: asBoardId(env.P4_BOARD_A),
      userId: asUserId(env.P4_VIEWER),
      file: { filename: 'denied.pdf', mimeType: 'application/pdf', bytes: pdf('denied') },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('permission_denied');
    const after = await client.from('knowledge_documents').select('id');
    expect(after.data?.length).toBe(before.data?.length);
  });

  it('allows an editor collaborator', async () => {
    const result = await createKnowledgePdfUpload(deps(), {
      boardId: asBoardId(env.P4_BOARD_A),
      userId: asUserId(env.P4_EDITOR),
      file: { filename: 'editor.pdf', mimeType: 'application/pdf', bytes: pdf('editor') },
    });
    expect(result.ok).toBe(true);
  });

  it('rolls back the uploaded object when the DB insert fails', async () => {
    // Force the insert to fail by violating the kind CHECK, via a repository
    // that writes an invalid row -- the storage upload still happens first.
    const failingRepo = {
      insertDocument: async () => {
        const { error } = await client
          .from('knowledge_documents')
          .insert({
            board_id: env.P4_BOARD_A,
            kind: 'not-a-pdf', // violates knowledge_documents_kind_check
            original_filename: 'x.pdf',
            mime_type: 'application/pdf',
            file_size_bytes: 1,
            storage_path: 'x',
            content_sha256: 'h',
          })
          .select('*')
          .single();
        expect(error).not.toBeNull();
        return { ok: false as const, error: { code: 'unavailable' as const, message: 'insert failed' } };
      },
    };

    const fixedId = new RandomKnowledgeDocumentIdFactory().newDocumentId();
    const expectedPath = `knowledge/${env.P4_BOARD_A}/${fixedId}/original.pdf`;

    const result = await createKnowledgePdfUpload(
      deps({ repository: failingRepo, ids: { newDocumentId: () => fixedId } }),
      {
        boardId: asBoardId(env.P4_BOARD_A),
        userId: asUserId(env.P4_OWNER),
        file: { filename: 'rollback.pdf', mimeType: 'application/pdf', bytes: pdf('rollback') },
      },
    );

    expect(result.ok).toBe(false);

    // No DB row...
    const { data: rows } = await client
      .from('knowledge_documents').select('id').eq('storage_path', expectedPath);
    expect(rows ?? []).toEqual([]);

    // ...and, critically, NO ORPHAN OBJECT: the compensation deleted it.
    const dl = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(expectedPath);
    expect(dl.error).not.toBeNull();
  });

  it('allows the identical PDF (same sha256) in two different boards', async () => {
    const bytes = pdf('shared source document');
    const a = await createKnowledgePdfUpload(deps(), {
      boardId: asBoardId(env.P4_BOARD_A),
      userId: asUserId(env.P4_OWNER),
      file: { filename: 'shared.pdf', mimeType: 'application/pdf', bytes },
    });
    const b = await createKnowledgePdfUpload(deps(), {
      boardId: asBoardId(env.P4_BOARD_B),
      userId: asUserId(env.P4_OWNER),
      file: { filename: 'shared.pdf', mimeType: 'application/pdf', bytes },
    });

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.contentSha256).toBe(b.value.contentSha256);
    expect(a.value.id).not.toBe(b.value.id);
    expect(a.value.boardId).not.toBe(b.value.boardId);
    expect(a.value.storagePath).not.toBe(b.value.storagePath);
  });

  it('rejects a non-PDF before touching storage or the database', async () => {
    const before = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).list(`knowledge/${env.P4_BOARD_B}`);
    const result = await createKnowledgePdfUpload(deps(), {
      boardId: asBoardId(env.P4_BOARD_B),
      userId: asUserId(env.P4_OWNER),
      file: { filename: 'notes.txt', mimeType: 'text/plain', bytes: pdf('x') },
    });
    expect(result.ok).toBe(false);
    const after = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).list(`knowledge/${env.P4_BOARD_B}`);
    expect(after.data?.length).toBe(before.data?.length);
  });

  it('creates no Padlet and no source_reference', async () => {
    const padlets = await client.from('padlets').select('id');
    const refs = await client.from('source_references').select('id');
    expect(padlets.data ?? []).toEqual([]);
    expect(refs.data ?? []).toEqual([]);
  });
});
