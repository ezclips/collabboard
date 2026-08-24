import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P6J-E2 structural guard for the document-level ranking migration.
 *
 * The behavioural proof lives in the local-Supabase integration suite, which is
 * skipped whenever the disposable stack is absent. These assertions therefore
 * carry the architectural invariants on their own: signature, security mode,
 * every candidate filter, and above all the ORDER of the pipeline stages, since
 * ranking documents after LIMIT is exactly the defect this migration fixes.
 */
const MIGRATION = path.join(process.cwd(), 'supabase/migrations/20260826_dedupe_knowledge_search_by_document.sql');
const APPLIED = path.join(process.cwd(), 'supabase/migrations/20260825_add_knowledge_chunk_embeddings.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');
const body = sql.replace(/^\s*--.*$/gm, '');

function indexOf(needle: string): number {
  const at = body.indexOf(needle);
  expect(at, `expected migration to contain ${needle}`).toBeGreaterThan(-1);
  return at;
}

describe('P6J-E2 document-level semantic search migration', () => {
  it('replaces the existing function in place with an unchanged signature', () => {
    expect(body).toContain('CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks(');
    expect(body).not.toMatch(/DROP\s+FUNCTION/i);
    for (const parameter of [
      'p_board_id uuid',
      'p_query_embedding extensions.vector',
      'p_model_id text',
      'p_limit integer DEFAULT 10',
      'p_min_similarity double precision DEFAULT NULL',
    ]) expect(body).toContain(parameter);
  });

  it('keeps the return provenance columns and adds no vector column', () => {
    const returns = body.slice(indexOf('RETURNS TABLE('), indexOf('LANGUAGE sql'));
    for (const column of [
      'chunk_id uuid',
      'document_id uuid',
      'original_filename text',
      'page_start integer',
      'page_end integer',
      'chunk_index integer',
      'text text',
      'source_locators jsonb',
      'similarity double precision',
    ]) expect(returns).toContain(column);
    expect(returns).not.toMatch(/embedding|vector/i);
  });

  it('runs as an invoker, never as definer', () => {
    expect(body).toContain('SECURITY INVOKER');
    expect(body).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(body).toContain('SET search_path = public, extensions');
    expect(body).toContain('STABLE');
  });

  it('preserves every candidate filter', () => {
    expect(body).toContain('d.board_id = p_board_id');
    expect(body).toContain("d.processing_status = 'ready'");
    expect(body).toContain('e.model_id = p_model_id');
    expect(body).toContain('e.dimensions = extensions.vector_dims(p_query_embedding)');
    expect(body).toContain('e.chunk_text_hash = c.text_hash');
  });

  it('scores by cosine distance and qualifies on the caller threshold', () => {
    expect(body).toContain('1 - (candidates.embedding <=> p_query_embedding) AS similarity');
    expect(body).toContain('p_min_similarity IS NULL');
    expect(body).toContain('scored.similarity >= p_min_similarity');
  });

  it('deduplicates on document_id using the deterministic winner rule', () => {
    expect(body).toContain('PARTITION BY qualified.document_id');
    expect(body).toContain('ORDER BY qualified.similarity DESC, qualified.chunk_index ASC, qualified.chunk_id ASC');
    expect(body).toContain('ROW_NUMBER() OVER (');
    expect(body).toContain('document_rank = 1');
    // Identity is the document, never the filename.
    expect(body).not.toMatch(/PARTITION BY[^)]*original_filename/i);
  });

  it('orders documents globally by the same deterministic rule', () => {
    expect(body).toContain(
      'ORDER BY best_per_document.similarity DESC, best_per_document.chunk_index ASC, best_per_document.chunk_id ASC',
    );
  });

  it('applies the bounded limit only after document winners are selected', () => {
    const threshold = indexOf('scored.similarity >= p_min_similarity');
    const partition = indexOf('PARTITION BY qualified.document_id');
    const winner = indexOf('document_rank = 1');
    const limit = indexOf('LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)');
    // Threshold before dedup, dedup before limit: the whole point of E2.
    expect(threshold).toBeLessThan(partition);
    expect(partition).toBeLessThan(winner);
    expect(winner).toBeLessThan(limit);
    expect(body.lastIndexOf('LIMIT ')).toBe(limit);
  });

  it('restates the service-role-only execute grant without widening it', () => {
    expect(body).toContain('REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks(uuid, extensions.vector, text, integer, double precision)');
    expect(body).toContain('FROM PUBLIC, anon, authenticated;');
    expect(body).toContain('GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks(uuid, extensions.vector, text, integer, double precision)');
    expect(body).toContain('TO service_role;');
    expect(body).not.toMatch(/GRANT[^;]*TO\s+(PUBLIC|anon|authenticated)/i);
  });

  it('documents the new per-document contract', () => {
    expect(body).toMatch(/COMMENT ON FUNCTION public\.search_board_knowledge_chunks IS/);
    expect(body).toContain('best qualifying chunk per document');
  });

  it('leaves the already-applied semantic search migration untouched', () => {
    const applied = fs.readFileSync(APPLIED, 'utf8');
    // The old body ranked chunks; it must still say so, proving E2 added a new
    // migration rather than editing history.
    expect(applied).toContain('ORDER BY similarity DESC, candidates.chunk_index ASC, candidates.chunk_id ASC');
    expect(applied).not.toContain('ROW_NUMBER()');
    expect(applied).not.toContain('document_rank');
  });
});
