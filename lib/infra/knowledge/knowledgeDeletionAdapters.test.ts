import { describe, expect, it, vi } from 'vitest';
import { asBoardId, asKnowledgeDocumentId } from '../../domain/core/ids';
import { SupabaseKnowledgeDeletionRepository } from './knowledgeDeletionAdapters';

/**
 * P6J-F9-A0. The deletion reads must carry document identity and page count:
 * the domain enumerates page derivatives from them, so if either column stops
 * being selected, cleanup silently orphans every page image. The selected
 * columns are therefore asserted, not just the mapped result.
 */
const BOARD = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';

const ROW = {
  id: DOCUMENT,
  board_id: BOARD,
  storage_path: `knowledge/${BOARD}/${DOCUMENT}/original.pdf`,
  raw_artifact_path: null,
  page_count: 3,
};

function client(result: { data: unknown; error: unknown }) {
  const selected: string[] = [];
  const builder: Record<string, unknown> = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (onfulfilled: (value: unknown) => unknown) => Promise.resolve(result).then(onfulfilled),
  };
  const table = { select: vi.fn((columns: string) => { selected.push(columns); return builder; }) };
  return { selected, from: vi.fn(() => table) };
}

describe('Knowledge deletion adapter artifact capture', () => {
  it('selects identity and page count for a single document', async () => {
    const supabase = client({ data: ROW, error: null });
    const repository = new SupabaseKnowledgeDeletionRepository(supabase as never);

    const found = await repository.findDocumentArtifactPaths(asKnowledgeDocumentId(DOCUMENT));

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toEqual({
      boardId: BOARD,
      documentId: DOCUMENT,
      storagePath: ROW.storage_path,
      rawArtifactPath: null,
      pageCount: 3,
    });
    for (const column of ['id', 'board_id', 'storage_path', 'raw_artifact_path', 'page_count']) {
      expect(supabase.selected[0], `must select ${column}`).toContain(column);
    }
  });

  it('selects identity and page count for every document on a board', async () => {
    const supabase = client({ data: [ROW, { ...ROW, page_count: null }], error: null });
    const repository = new SupabaseKnowledgeDeletionRepository(supabase as never);

    const found = await repository.listDocumentArtifactPathsByBoardId(asBoardId(BOARD));

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toHaveLength(2);
    expect(found.value[0]).toMatchObject({ boardId: BOARD, documentId: DOCUMENT, pageCount: 3 });
    // Null stays null; the domain turns that into "no derivative paths".
    expect(found.value[1]).toMatchObject({ pageCount: null });
    expect(supabase.selected[0]).toContain('page_count');
  });

  it('distinguishes a missing document from a failed capture', async () => {
    const missing = new SupabaseKnowledgeDeletionRepository(client({ data: null, error: null }) as never);
    expect(await missing.findDocumentArtifactPaths(asKnowledgeDocumentId(DOCUMENT)))
      .toEqual({ ok: true, value: null });

    // A failed read must never be read as "this document has no artifacts".
    const broken = new SupabaseKnowledgeDeletionRepository(client({ data: null, error: { message: 'boom' } }) as never);
    expect((await broken.findDocumentArtifactPaths(asKnowledgeDocumentId(DOCUMENT))).ok).toBe(false);
    expect((await broken.listDocumentArtifactPathsByBoardId(asBoardId(BOARD))).ok).toBe(false);
  });
});
