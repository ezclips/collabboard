import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

/**
 * P6I-A SQL integration against the disposable local Supabase stack. The
 * repository-standard env-file gate prevents execution without the disposable
 * stack. The former P6I_RUN_LOCAL_INTEGRATION gate is intentionally removed.
 * Never point this at production.
 */
const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : {};
const enabled = hasLocalStack;

describe.skipIf(!enabled)('P6I-A search RPC -- local Supabase integration', () => {
  let client: SupabaseClient;
  const boardIds: string[] = [];
  const documentIds: string[] = [];
  const chunkIds = { dimension3: '', dimension2: '', stale: '', nonReady: '', otherModel: '', dissimilar: '' };
  /**
   * P6J-E2 starvation fixture: four further ready board-A documents whose single
   * chunk scores below document A's 55 identical [1,0,0] winners but well above
   * the 0.35 production threshold. Cosine against [1,0,0] is x/sqrt(x^2+y^2), so
   * these are deterministic and strictly descending.
   */
  const rankedDocuments = [
    { id: '', chunkId: '', filename: 'ranked-1.pdf', embedding: '[4,1,0]', similarity: 4 / Math.sqrt(17) },
    { id: '', chunkId: '', filename: 'ranked-2.pdf', embedding: '[3,1,0]', similarity: 3 / Math.sqrt(10) },
    { id: '', chunkId: '', filename: 'ranked-3.pdf', embedding: '[2,1,0]', similarity: 2 / Math.sqrt(5) },
    { id: '', chunkId: '', filename: 'ranked-4.pdf', embedding: '[1,1,0]', similarity: 1 / Math.sqrt(2) },
  ];

  async function search(boardId: string, vector: string, limit: number, minSimilarity: number | null = null) {
    const result = await client.rpc('search_board_knowledge_chunks', {
      p_board_id: boardId,
      p_query_embedding: vector,
      p_model_id: 'test:integration',
      p_limit: limit,
      p_min_similarity: minSimilarity,
    });
    expect(result.error).toBeNull();
    return (result.data ?? []) as Array<Record<string, unknown>>;
  }

  beforeAll(async () => {
    const hostname = new URL(env.P4_SUPABASE_URL).hostname;
    expect(['127.0.0.1', 'localhost']).toContain(hostname);
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const boardA = randomUUID();
    const boardB = randomUUID();
    boardIds.push(boardA, boardB);
    const boards = await client.from('boards').insert([
      { id: boardA, user_id: env.P4_OWNER, title: 'P6I integration A' },
      { id: boardB, user_id: env.P4_OWNER, title: 'P6I integration B' },
    ]);
    expect(boards.error).toBeNull();

    const documentA = randomUUID();
    const documentB = randomUUID();
    const mixedDocument = randomUUID();
    const staleDocument = randomUUID();
    const nonReadyDocument = randomUUID();
    const otherModelDocument = randomUUID();
    const dissimilarDocument = randomUUID();
    documentIds.push(documentA, documentB, mixedDocument, staleDocument, nonReadyDocument, otherModelDocument, dissimilarDocument);
    for (const ranked of rankedDocuments) {
      ranked.id = randomUUID();
      ranked.chunkId = randomUUID();
      documentIds.push(ranked.id);
    }
    const documents = await client.from('knowledge_documents').insert([
      { id: documentA, board_id: boardA, original_filename: 'a.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${documentA}.pdf`, content_sha256: 'a'.repeat(64), processing_status: 'ready', page_count: 1 },
      { id: documentB, board_id: boardB, original_filename: 'b.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${documentB}.pdf`, content_sha256: 'b'.repeat(64), processing_status: 'ready', page_count: 1 },
      { id: mixedDocument, board_id: boardA, original_filename: 'mixed.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${mixedDocument}.pdf`, content_sha256: 'c'.repeat(64), processing_status: 'ready', page_count: 1 },
      { id: staleDocument, board_id: boardA, original_filename: 'stale.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${staleDocument}.pdf`, content_sha256: 'd'.repeat(64), processing_status: 'ready', page_count: 1 },
      { id: nonReadyDocument, board_id: boardA, original_filename: 'processing.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${nonReadyDocument}.pdf`, content_sha256: 'e'.repeat(64), processing_status: 'processing', page_count: 1 },
      { id: otherModelDocument, board_id: boardA, original_filename: 'other-model.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${otherModelDocument}.pdf`, content_sha256: 'f'.repeat(64), processing_status: 'ready', page_count: 1 },
      { id: dissimilarDocument, board_id: boardA, original_filename: 'dissimilar.pdf', mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `p6i/${dissimilarDocument}.pdf`, content_sha256: '0'.repeat(64), processing_status: 'ready', page_count: 1 },
      ...rankedDocuments.map((ranked, index) => ({
        id: ranked.id, board_id: boardA, original_filename: ranked.filename, mime_type: 'application/pdf', file_size_bytes: 0,
        storage_path: `p6i/${ranked.id}.pdf`, content_sha256: String(index + 1).repeat(64), processing_status: 'ready', page_count: 1,
      })),
    ]);
    expect(documents.error).toBeNull();

    const bulkChunks = Array.from({ length: 55 }, (_, index) => ({
      id: randomUUID(), document_id: documentA, page_start: 1, page_end: 1,
      text: `board A chunk ${index}`, text_hash: `hash-a-${index}`, chunk_index: index, source_locators: [],
    }));
    chunkIds.dimension3 = bulkChunks[0].id;
    chunkIds.dimension2 = randomUUID();
    chunkIds.stale = randomUUID();
    chunkIds.nonReady = randomUUID();
    chunkIds.otherModel = randomUUID();
    chunkIds.dissimilar = randomUUID();
    const chunks = await client.from('knowledge_chunks').insert([
      ...bulkChunks,
      { id: randomUUID(), document_id: documentB, page_start: 1, page_end: 1, text: 'board B chunk', text_hash: 'hash-b', chunk_index: 0, source_locators: [] },
      { id: chunkIds.dimension2, document_id: mixedDocument, page_start: 1, page_end: 1, text: 'wrong dimension', text_hash: 'hash-dim2', chunk_index: 0, source_locators: [] },
      { id: chunkIds.stale, document_id: staleDocument, page_start: 1, page_end: 1, text: 'stale chunk', text_hash: 'current-hash', chunk_index: 0, source_locators: [] },
      { id: chunkIds.nonReady, document_id: nonReadyDocument, page_start: 1, page_end: 1, text: 'processing chunk', text_hash: 'hash-processing', chunk_index: 0, source_locators: [] },
      { id: chunkIds.otherModel, document_id: otherModelDocument, page_start: 1, page_end: 1, text: 'other model chunk', text_hash: 'hash-other-model', chunk_index: 0, source_locators: [] },
      { id: chunkIds.dissimilar, document_id: dissimilarDocument, page_start: 1, page_end: 1, text: 'dissimilar chunk', text_hash: 'hash-dissimilar', chunk_index: 0, source_locators: [] },
      ...rankedDocuments.map((ranked, index) => ({
        id: ranked.chunkId, document_id: ranked.id, page_start: 1, page_end: 1,
        text: `ranked chunk ${index}`, text_hash: `hash-ranked-${index}`, chunk_index: 0, source_locators: [],
      })),
    ]);
    expect(chunks.error).toBeNull();
    const embeddings = await client.from('knowledge_chunk_embeddings').insert([
      ...bulkChunks.map((chunk) => ({ chunk_id: chunk.id, model_id: 'test:integration', dimensions: 3, embedding: '[1,0,0]', chunk_text_hash: chunk.text_hash })),
      { chunk_id: chunkIds.dimension2, model_id: 'test:integration', dimensions: 2, embedding: '[1,0]', chunk_text_hash: 'hash-dim2' },
      { chunk_id: chunkIds.stale, model_id: 'test:integration', dimensions: 3, embedding: '[1,0,0]', chunk_text_hash: 'old-hash' },
      { chunk_id: chunkIds.nonReady, model_id: 'test:integration', dimensions: 3, embedding: '[1,0,0]', chunk_text_hash: 'hash-processing' },
      { chunk_id: chunkIds.otherModel, model_id: 'other:integration', dimensions: 3, embedding: '[1,0,0]', chunk_text_hash: 'hash-other-model' },
      { chunk_id: chunkIds.dissimilar, model_id: 'test:integration', dimensions: 3, embedding: '[0,1,0]', chunk_text_hash: 'hash-dissimilar' },
      ...rankedDocuments.map((ranked, index) => ({
        chunk_id: ranked.chunkId, model_id: 'test:integration', dimensions: 3,
        embedding: ranked.embedding, chunk_text_hash: `hash-ranked-${index}`,
      })),
    ]);
    expect(embeddings.error).toBeNull();
  });

  afterAll(async () => {
    if (!client) return;
    await client.from('knowledge_documents').delete().in('id', documentIds);
    await client.from('boards').delete().in('id', boardIds);
  });

  it('isolates boards and never returns vectors', async () => {
    const rows = await search(boardIds[0], '[1,0,0]', 10);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.document_id !== documentIds[1])).toBe(true);
    expect(rows.every((row) => !('embedding' in row))).toBe(true);
    expect(rows.every((row) => 'source_locators' in row)).toBe(true);
  });

  it('safely excludes mixed dimensions and stale hashes', async () => {
    const rows = await search(boardIds[0], '[1,0,0]', 50);
    expect(rows.some((row) => row.chunk_id === chunkIds.dimension3)).toBe(true);
    expect(rows.some((row) => row.chunk_id === chunkIds.dimension2)).toBe(false);
    expect(rows.some((row) => row.chunk_id === chunkIds.stale)).toBe(false);
  });

  it('clamps the search limit to one through fifty', async () => {
    expect(await search(boardIds[0], '[1,0,0]', 0)).toHaveLength(1);
    expect((await search(boardIds[0], '[1,0,0]', 999)).length).toBeLessThanOrEqual(50);
  });

  it('excludes non-ready documents, other models, and below-threshold similarity', async () => {
    const rows = await search(boardIds[0], '[1,0,0]', 50);
    expect(rows.some((row) => row.chunk_id === chunkIds.nonReady)).toBe(false);
    expect(rows.some((row) => row.chunk_id === chunkIds.otherModel)).toBe(false);
    const thresholdRows = await search(boardIds[0], '[1,0,0]', 50, 0.5);
    expect(thresholdRows.some((row) => row.chunk_id === chunkIds.dissimilar)).toBe(false);
  });

  // P6J-E2. Document A owns 55 chunks that all score 1.0 against this query. Under
  // chunk-level ranking it consumed every slot, so the four lower-ranked documents
  // were unreachable no matter what any downstream layer did.
  it('returns one result per document so a 55-chunk document cannot starve the rest', async () => {
    const rows = await search(boardIds[0], '[1,0,0]', 5, 0.35);

    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.document_id)).size).toBe(5);
    expect(rows.filter((row) => row.document_id === documentIds[0])).toHaveLength(1);
    // Document A's representative is its deterministic tie winner: lowest chunk_index.
    expect(rows.find((row) => row.document_id === documentIds[0])?.chunk_id).toBe(chunkIds.dimension3);
    expect(rows.find((row) => row.document_id === documentIds[0])?.chunk_index).toBe(0);
    for (const ranked of rankedDocuments) {
      expect(rows.some((row) => row.document_id === ranked.id)).toBe(true);
    }
  });

  it('orders documents by their best qualifying chunk', async () => {
    const rows = await search(boardIds[0], '[1,0,0]', 5, 0.35);

    expect(rows.map((row) => row.document_id)).toEqual([documentIds[0], ...rankedDocuments.map((ranked) => ranked.id)]);
    const similarities = rows.map((row) => Number(row.similarity));
    expect(similarities).toEqual([...similarities].sort((left, right) => right - left));
    expect(similarities[0]).toBeCloseTo(1, 6);
    rankedDocuments.forEach((ranked, index) => {
      expect(similarities[index + 1]).toBeCloseTo(ranked.similarity, 6);
    });
  });

  it('omits a document whose only chunk falls below the threshold', async () => {
    const qualifying = await search(boardIds[0], '[1,0,0]', 50, 0.35);
    expect(qualifying.some((row) => row.document_id === documentIds[6])).toBe(false);
    // The same document is reachable once the threshold admits its chunk.
    const unfiltered = await search(boardIds[0], '[1,0,0]', 50);
    expect(unfiltered.some((row) => row.document_id === documentIds[6])).toBe(true);
    expect(unfiltered.filter((row) => row.document_id === documentIds[6])).toHaveLength(1);
  });
});
