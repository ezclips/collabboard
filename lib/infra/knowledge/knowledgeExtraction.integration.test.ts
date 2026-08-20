import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../../domain/core/ids';
import type { KnowledgeDocumentId } from '../../domain/core/ids';
import { createKnowledgePdfUpload } from '../../domain/knowledge/knowledgeIngestion';
import {
  claimKnowledgeDocumentForProcessing as claimKnowledgeDocumentForProcessingService,
  completeKnowledgeExtraction as completeKnowledgeExtractionService,
  failKnowledgeExtraction as failKnowledgeExtractionService,
  renewKnowledgeProcessingLease,
} from '../../domain/knowledge/knowledgeExtraction';
import type {
  CompleteKnowledgeExtractionInput,
  KnowledgeExtractionDeps,
  KnowledgePageGeometryInput,
} from '../../domain/knowledge/knowledgeExtraction';
import type { KnowledgePdfExtractionResult } from '../../domain/knowledge/pdfExtraction';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from './knowledgeIngestionAdapters';
import { SupabaseKnowledgeExtractionRepository } from './knowledgeExtractionAdapters';

/**
 * P5A integration test against a DISPOSABLE LOCAL Supabase stack, started by
 * `node scripts/db/bootstrap-local.mjs 2`, which writes the env file this
 * test keys off. Without it the suite skips, so machines without Docker stay
 * green.
 *
 * It never touches the remote project: the API host is asserted to be
 * loopback before a single write happens.
 */
const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack
  ? JSON.parse(fs.readFileSync(envPath, 'utf8'))
  : {};

const BOARD = asBoardId(env.P4_BOARD_A || '00000000-0000-0000-0000-000000002011');
const OWNER = asUserId(env.P4_OWNER || '00000000-0000-0000-0000-000000001011');

const hasher = new NodeKnowledgeContentHasher();
const leaseTokens = new Map<string, string>();
const EMPTY_LEASE_TOKEN = '00000000-0000-0000-0000-000000000000';

async function claimKnowledgeDocumentForProcessing(
  deps: Pick<KnowledgeExtractionDeps, 'repository' | 'leaseTtlSeconds'>,
  documentId: KnowledgeDocumentId,
  leaseTtlSeconds = 300,
) {
  const result = await claimKnowledgeDocumentForProcessingService({ ...deps, leaseTtlSeconds }, documentId);
  if (result.ok) leaseTokens.set(documentId, result.value.leaseToken);
  return result;
}

async function completeKnowledgeExtraction(
  deps: KnowledgeExtractionDeps,
  input: Omit<CompleteKnowledgeExtractionInput, 'processingLeaseToken'> & { processingLeaseToken?: string },
) {
  return completeKnowledgeExtractionService(deps, {
    ...input,
    processingLeaseToken: input.processingLeaseToken ?? leaseTokens.get(input.documentId) ?? EMPTY_LEASE_TOKEN,
  });
}

async function failKnowledgeExtraction(
  deps: Pick<KnowledgeExtractionDeps, 'repository'>,
  documentId: KnowledgeDocumentId,
  error: unknown,
) {
  return failKnowledgeExtractionService(deps, documentId, leaseTokens.get(documentId) ?? EMPTY_LEASE_TOKEN, error);
}

function pdf(label: string): Uint8Array {
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${label}\n%%EOF`, 'utf8'));
}

function extraction(
  contentSha256: string,
  pages: readonly { pageNumber: number; text: string }[],
  overrides: { pageCount?: number } = {},
): KnowledgePdfExtractionResult {
  return {
    parser: { name: 'opendataloader-pdf', version: '1.4.0', optionsHash: 'opts-abc' },
    document: { contentSha256, pageCount: overrides.pageCount ?? pages.length },
    pages: pages.map((page) => ({ ...page, elements: [] })),
    citationReady: true,
  };
}

function geometry(...pageNumbers: readonly number[]): KnowledgePageGeometryInput[] {
  return pageNumbers.map((pageNumber) => ({
    pageNumber,
    widthPoints: 612,
    heightPoints: 792,
    rotation: 0,
  }));
}

describe.skipIf(!hasLocalStack)('P5A extraction lifecycle -- local Postgres integration', () => {
  let client: SupabaseClient;
  let repository: SupabaseKnowledgeExtractionRepository;

  beforeAll(() => {
    const hostname = new URL(env.P4_SUPABASE_URL).hostname;
    expect(['127.0.0.1', 'localhost']).toContain(hostname);
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    repository = new SupabaseKnowledgeExtractionRepository(client as never);
  });

  /** Ingest a real PDF so the document and its Storage object genuinely exist. */
  async function ingest(label: string) {
    const bytes = pdf(label);
    const result = await createKnowledgePdfUpload(
      {
        authorizer: new SupabaseKnowledgeBoardAuthorizer(client as never),
        repository: new SupabaseKnowledgeIngestionRepository(client as never),
        storage: new SupabaseKnowledgeStorageGateway(client as never),
        hasher,
        ids: new RandomKnowledgeDocumentIdFactory(),
      },
      {
        boardId: BOARD,
        userId: OWNER,
        file: { filename: `${label}.pdf`, mimeType: 'application/pdf', bytes },
      },
    );
    if (!result.ok) throw new Error(`ingest failed: ${result.error.message}`);
    return { document: result.value, bytes };
  }

  async function statusOf(id: KnowledgeDocumentId) {
    const { data } = await client
      .from('knowledge_documents')
      .select('processing_status, processing_error, page_count, parser_name, parser_version, parser_options_hash, raw_artifact_path, content_sha256, processing_lease_token, processing_lease_expires_at, processing_attempt')
      .eq('id', id)
      .maybeSingle();
    return data;
  }

  async function pagesOf(id: KnowledgeDocumentId) {
    const { data } = await client
      .from('knowledge_pages')
      .select('page_number, width_points, height_points, rotation, text, text_hash')
      .eq('document_id', id)
      .order('page_number');
    return data ?? [];
  }

  // 1
  it('claims an uploaded document into processing', async () => {
    const { document } = await ingest('claim-uploaded');
    const claimed = await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.value).toEqual({
      documentId: document.id,
      boardId: BOARD,
      storagePath: document.storagePath,
      contentSha256: document.contentSha256,
      leaseToken: expect.any(String),
      processingAttempt: 1,
      leaseExpiresAt: expect.any(String),
    });
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
  });

  // 3 -- the race test, proven against the database rather than a mock.
  it('lets exactly one of two concurrent claims win', async () => {
    const { document } = await ingest('claim-race');

    // Two independent clients, so the two claims travel as two separate
    // sessions rather than being serialised in one connection.
    const other = new SupabaseKnowledgeExtractionRepository(
      createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as never,
    );

    const [a, b] = await Promise.all([
      claimKnowledgeDocumentForProcessing({ repository }, document.id),
      claimKnowledgeDocumentForProcessing({ repository: other }, document.id),
    ]);

    const winners = [a, b].filter((result) => result.ok);
    const losers = [a, b].filter((result) => !result.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].ok === false && losers[0].error.code).toBe('conflict');
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
  });

  it('reclaims an expired lease with a new token and fences the old attempt', async () => {
    const { document } = await ingest('lease-expiry-fence');
    const first = await claimKnowledgeDocumentForProcessing({ repository }, document.id, 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const second = await claimKnowledgeDocumentForProcessing({ repository }, document.id, 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.leaseToken).not.toBe(first.value.leaseToken);
    expect(second.value.processingAttempt).toBe(first.value.processingAttempt + 1);

    const staleCompletion = await completeKnowledgeExtractionService(
      { repository, hasher },
      {
        documentId: document.id,
        processingLeaseToken: first.value.leaseToken,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'stale A' }]),
        geometry: geometry(1),
      },
    );
    expect(!staleCompletion.ok && staleCompletion.error.code).toBe('conflict');

    const staleFailure = await failKnowledgeExtractionService(
      { repository },
      document.id,
      first.value.leaseToken,
      new Error('stale A failure'),
    );
    expect(!staleFailure.ok && staleFailure.error.code).toBe('conflict');

    const staleRenew = await renewKnowledgeProcessingLease(
      { repository, leaseTtlSeconds: 1 },
      document.id,
      first.value.leaseToken,
    );
    expect(!staleRenew.ok && staleRenew.error.code).toBe('conflict');
    expect((await statusOf(document.id))?.processing_attempt).toBe(2);
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
  });

  it('allows exactly one concurrent reclaim after expiry', async () => {
    const { document } = await ingest('lease-reclaim-race');
    const initial = await claimKnowledgeDocumentForProcessing({ repository }, document.id, 1);
    expect(initial.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const other = new SupabaseKnowledgeExtractionRepository(
      createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as never,
    );
    const [a, b] = await Promise.all([
      claimKnowledgeDocumentForProcessing({ repository }, document.id, 1),
      claimKnowledgeDocumentForProcessing({ repository: other }, document.id, 1),
    ]);
    expect([a, b].filter((result) => result.ok)).toHaveLength(1);
    expect([a, b].filter((result) => !result.ok)).toHaveLength(1);
    expect((await statusOf(document.id))?.processing_attempt).toBe(2);
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
  });

  it('keeps B authoritative when expired A resumes after B completes', async () => {
    const { document } = await ingest('lease-resumed-worker-race');
    const a = await claimKnowledgeDocumentForProcessing({ repository }, document.id, 1);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const b = await claimKnowledgeDocumentForProcessing({ repository }, document.id, 60);
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    const rawA = `knowledge/${BOARD}/${document.id}/extraction/attempt-${a.value.processingAttempt}-${a.value.leaseToken}/opendataloader-2.5.0.json`;
    const rawB = `knowledge/${BOARD}/${document.id}/extraction/attempt-${b.value.processingAttempt}-${b.value.leaseToken}/opendataloader-2.5.0.json`;
    expect(rawA).not.toBe(rawB);
    expect((await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).upload(rawA, Buffer.from('{"attempt":"A"}'), { contentType: 'application/json' })).error).toBeNull();
    expect((await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).upload(rawB, Buffer.from('{"attempt":"B"}'), { contentType: 'application/json' })).error).toBeNull();

    const bCompleted = await completeKnowledgeExtractionService(
      { repository, hasher },
      {
        documentId: document.id,
        processingLeaseToken: b.value.leaseToken,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'B wins' }]),
        geometry: geometry(1),
        rawArtifactPath: rawB,
      },
    );
    expect(bCompleted.ok).toBe(true);

    const aCompleted = await completeKnowledgeExtractionService(
      { repository, hasher },
      {
        documentId: document.id,
        processingLeaseToken: a.value.leaseToken,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'A must not win' }]),
        geometry: geometry(1),
        rawArtifactPath: rawA,
      },
    );
    expect(!aCompleted.ok && aCompleted.error.code).toBe('conflict');
    const aFailed = await failKnowledgeExtractionService({ repository }, document.id, a.value.leaseToken, new Error('stale A'));
    expect(!aFailed.ok && aFailed.error.code).toBe('conflict');

    const row = await statusOf(document.id);
    expect(row?.processing_status).toBe('ready');
    expect(row?.raw_artifact_path).toBe(rawB);
    expect((await pagesOf(document.id))[0].text).toBe('B wins');
    expect((await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove([rawA])).error).toBeNull();
    expect((await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(rawB)).error).toBeNull();
  });

  // 4
  it('refuses to reclaim a ready document', async () => {
    const { document } = await ingest('claim-ready');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'done' }]),
        geometry: geometry(1),
      },
    );

    const reclaim = await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    expect(reclaim.ok).toBe(false);
    expect(!reclaim.ok && reclaim.error.code).toBe('conflict');
    expect((await statusOf(document.id))?.processing_status).toBe('ready');
  });

  // 5
  it('commits a successful extraction: pages inserted, metadata stored, status ready', async () => {
    const { document } = await ingest('complete-success');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const result = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [
          { pageNumber: 1, text: 'page one text' },
          { pageNumber: 2, text: 'page two text' },
        ]),
        geometry: [
          { pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0 },
          { pageNumber: 2, widthPoints: 595.28, heightPoints: 841.89, rotation: 90 },
        ],
        rawArtifactPath: `knowledge/${BOARD}/${document.id}/raw.json`,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.pageCount).toBe(2);

    const row = await statusOf(document.id);
    expect(row?.processing_status).toBe('ready');
    expect(row?.page_count).toBe(2);
    expect(row?.parser_name).toBe('opendataloader-pdf');
    expect(row?.parser_version).toBe('1.4.0');
    expect(row?.parser_options_hash).toBe('opts-abc');
    expect(row?.raw_artifact_path).toBe(`knowledge/${BOARD}/${document.id}/raw.json`);
    expect(row?.processing_lease_token).toBeNull();
    expect(row?.processing_lease_expires_at).toBeNull();
    expect(row?.processing_error).toBeNull();

    const pages = await pagesOf(document.id);
    expect(pages).toHaveLength(2);
    expect(pages[0].page_number).toBe(1);
    expect(pages[0].width_points).toBe(612);
    expect(pages[0].height_points).toBe(792);
    expect(pages[0].text).toBe('page one text');
    expect(pages[0].text_hash).toBe(
      createHash('sha256').update(new TextEncoder().encode('page one text')).digest('hex'),
    );
    expect(pages[1].width_points).toBeCloseTo(595.28, 2);
    expect(pages[1].rotation).toBe(90);
  });

  // 6
  it('refuses to become ready when page geometry is incomplete', async () => {
    const { document } = await ingest('geometry-missing');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const result = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [
          { pageNumber: 1, text: 'a' },
          { pageNumber: 2, text: 'b' },
        ]),
        geometry: geometry(1),
      },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
    // No A4 default was substituted, and the document did not advance.
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
    expect(await pagesOf(document.id)).toHaveLength(0);
  });

  // 7
  it('rejects duplicate page numbers', async () => {
    const { document } = await ingest('duplicate-pages');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const result = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [
          { pageNumber: 1, text: 'a' },
          { pageNumber: 1, text: 'b' },
        ]),
        geometry: geometry(1),
      },
    );

    expect(result.ok).toBe(false);
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
    expect(await pagesOf(document.id)).toHaveLength(0);
  });

  // 8
  it('rejects a page-count mismatch', async () => {
    const { document } = await ingest('count-mismatch');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const result = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(
          document.contentSha256,
          [{ pageNumber: 1, text: 'a' }],
          { pageCount: 9 },
        ),
        geometry: geometry(1),
      },
    );

    expect(result.ok).toBe(false);
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
    expect(await pagesOf(document.id)).toHaveLength(0);
  });

  // 9 -- the transaction proof.
  it('rolls back the whole commit when persistence fails: no partial pages, not ready', async () => {
    const { document } = await ingest('commit-rollback');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    // Seed a pre-existing page so the rollback has something to preserve: the
    // function DELETEs stale pages before inserting, and that DELETE must be
    // undone too when the insert fails.
    const seeded = await client.from('knowledge_pages').insert({
      document_id: document.id,
      page_number: 1,
      width_points: 100,
      height_points: 200,
      text: 'stale page',
    });
    expect(seeded.error).toBeNull();

    // Bypass the domain and hand the function a page whose rotation cannot be
    // cast, so the INSERT raises after the DELETE has already run.
    const { data, error } = await client.rpc('complete_knowledge_extraction', {
      p_document_id: document.id,
      p_lease_token: leaseTokens.get(document.id),
      p_page_count: 2,
      p_pages: [
        { page_number: 1, width_points: 612, height_points: 792, rotation: 0, text: 'new one' },
        {
          page_number: 2,
          width_points: 612,
          height_points: 792,
          rotation: 'sideways',
          text: 'new two',
        },
      ],
      p_parser_name: 'opendataloader-pdf',
      p_parser_version: '1.4.0',
      p_parser_options_hash: null,
      p_raw_artifact_path: null,
      p_expected_content_sha256: null,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const row = await statusOf(document.id);
    expect(row?.processing_status).toBe('processing');
    expect(row?.page_count).toBeNull();
    expect(row?.parser_name).toBeNull();

    // The stale page survived: the DELETE rolled back with everything else.
    const pages = await pagesOf(document.id);
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toBe('stale page');
  });

  // 10 + 11
  it('records a failure with a sanitized, bounded message', async () => {
    const { document } = await ingest('fail-path');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const secret = 'super-secret-service-role-value';
    const result = await failKnowledgeExtraction(
      { repository },
      document.id,
      new Error(
        `Parser exited with code 1\n    at run (/srv/worker.js:9:1)\nSUPABASE_SERVICE_ROLE_KEY=${secret}`,
      ),
    );

    expect(result.ok).toBe(true);
    const row = await statusOf(document.id);
    expect(row?.processing_status).toBe('failed');
    expect(row?.processing_lease_token).toBeNull();
    expect(row?.processing_lease_expires_at).toBeNull();
    expect(row?.processing_error).toBe('Parser exited with code 1');
    expect(row?.processing_error).not.toContain(secret);
    expect(row?.processing_error).not.toContain('at run');
    expect((row?.processing_error ?? '').length).toBeLessThanOrEqual(500);
  });

  // 2 + 12
  it('retries from failed, clearing the previous error and preserving identity', async () => {
    const { document, bytes } = await ingest('retry-path');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    await failKnowledgeExtraction({ repository }, document.id, new Error('transient parser crash'));
    expect((await statusOf(document.id))?.processing_error).toBe('transient parser crash');

    const retry = await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    expect(retry.ok).toBe(true);

    const row = await statusOf(document.id);
    expect(row?.processing_status).toBe('processing');
    expect(row?.processing_error).toBeNull();
    // Document identity survives the retry.
    expect(row?.content_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));

    // And the retry can then succeed normally.
    const completed = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'recovered' }]),
        geometry: geometry(1),
      },
    );
    expect(completed.ok).toBe(true);
    expect((await statusOf(document.id))?.processing_status).toBe('ready');
  });

  // 13
  it('never touches the original PDF in Storage across the whole lifecycle', async () => {
    const { document, bytes } = await ingest('storage-untouched');
    const expected = createHash('sha256').update(bytes).digest('hex');

    await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    await failKnowledgeExtraction({ repository }, document.id, new Error('first attempt failed'));
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'ok' }]),
        geometry: geometry(1),
      },
    );

    const download = await client.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .download(document.storagePath);
    expect(download.error).toBeNull();
    const stored = new Uint8Array(await download.data!.arrayBuffer());
    expect(createHash('sha256').update(stored).digest('hex')).toBe(expected);
  });

  // Delete-during-processing.
  it('treats a document deleted mid-processing as a stale job and recreates nothing', async () => {
    const { document } = await ingest('deleted-mid-flight');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const removed = await client.from('knowledge_documents').delete().eq('id', document.id);
    expect(removed.error).toBeNull();

    const completed = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'too late' }]),
        geometry: geometry(1),
      },
    );
    expect(completed.ok).toBe(false);
    expect(!completed.ok && completed.error.code).toBe('not_found');

    const failed = await failKnowledgeExtraction({ repository }, document.id, new Error('too late'));
    expect(failed.ok).toBe(false);
    expect(!failed.ok && failed.error.code).toBe('not_found');

    // The document was not resurrected and no orphan pages exist.
    expect(await statusOf(document.id)).toBeNull();
    expect(await pagesOf(document.id)).toHaveLength(0);
  });

  it('refuses to fail a document that is not currently processing', async () => {
    const { document } = await ingest('fail-not-processing');
    const result = await failKnowledgeExtraction({ repository }, document.id, new Error('nope'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('conflict');
    expect((await statusOf(document.id))?.processing_status).toBe('uploaded');
  });

  // 14 + 15
  it('generates no chunks, no Padlets and no source references', async () => {
    const padletsBefore = await client.from('padlets').select('id');
    const { document } = await ingest('no-side-effects');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);
    await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'text' }]),
        geometry: geometry(1),
      },
    );

    const chunks = await client.from('knowledge_chunks').select('id');
    expect(chunks.data ?? []).toEqual([]);

    const refs = await client.from('source_references').select('id');
    expect(refs.data ?? []).toEqual([]);

    const padletsAfter = await client.from('padlets').select('id');
    expect(padletsAfter.data?.length).toBe(padletsBefore.data?.length);
  });

  it('refuses a commit whose content hash no longer matches the document', async () => {
    const { document } = await ingest('content-drift');
    await claimKnowledgeDocumentForProcessing({ repository }, document.id);

    const result = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction('f'.repeat(64), [{ pageNumber: 1, text: 'a' }]),
        geometry: geometry(1),
      },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('conflict');
    expect((await statusOf(document.id))?.processing_status).toBe('processing');
    expect(await pagesOf(document.id)).toHaveLength(0);
  });

  it('cannot be completed without first being claimed', async () => {
    const { document } = await ingest('unclaimed-complete');
    const result = await completeKnowledgeExtraction(
      { repository, hasher },
      {
        documentId: document.id,
        extraction: extraction(document.contentSha256, [{ pageNumber: 1, text: 'a' }]),
        geometry: geometry(1),
      },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('conflict');
    expect((await statusOf(document.id))?.processing_status).toBe('uploaded');
    expect(await pagesOf(document.id)).toHaveLength(0);
  });

  it('is not callable by a browser-facing role', async () => {
    // The RPC is revoked from PUBLIC and granted only to service_role, so an
    // anon caller must be refused by Postgres itself.
    const anon = createClient(env.P4_SUPABASE_URL, env.P4_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { document } = await ingest('anon-rpc');
    const token = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const calls = await Promise.all([
      anon.rpc('claim_knowledge_extraction', { p_document_id: document.id, p_lease_ttl_seconds: 1 }),
      anon.rpc('renew_knowledge_processing_lease', { p_document_id: document.id, p_lease_token: token, p_lease_ttl_seconds: 1 }),
      anon.rpc('complete_knowledge_extraction', {
        p_document_id: document.id,
        p_lease_token: token,
        p_page_count: 1,
        p_pages: [{ page_number: 1, width_points: 612, height_points: 792, text: 'x' }],
        p_parser_name: 'x',
        p_parser_version: '1',
        p_parser_options_hash: null,
        p_raw_artifact_path: null,
        p_expected_content_sha256: null,
      }),
      anon.rpc('fail_knowledge_extraction', { p_document_id: document.id, p_lease_token: token, p_processing_error: 'x' }),
    ]);

    expect(calls.every(({ error }) => error !== null)).toBe(true);
    expect((await statusOf(asKnowledgeDocumentId(document.id)))?.processing_status).toBe('uploaded');
  });
});
