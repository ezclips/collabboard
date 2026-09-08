import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  readKnowledgePdfAreaLibraryPlacement,
  requestKnowledgePdfAreaLibraryPlacement,
} from '@/lib/infra/knowledge/knowledgePdfAreaLibraryReuseClient';
import { buildKnowledgePdfAreaProvenance } from '@/lib/domain/knowledge/knowledgePdfAreaImagePolicy';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE -- the REAL event path, end to end.
 *
 * Review found the first fix wired the wrong handler. `handleFreeformLibraryDrop`
 * is only reached from the CanvasViewport drop, and that handler returns early
 * unless the drag carries `text/padlet-id` -- which a LibraryPanel drag never
 * sets. So the secured branch was unreachable, and the drop actually landed in
 * PadletLayer's own onDrop, which inserted an ordinary padlet from the browser
 * and re-created the broken card.
 *
 * These tests follow the chain that actually happens:
 *
 *   LibraryPanel drag  ->  application/collabboard-library payload
 *   PadletLayer onDrop ->  CanvasClient's library branch
 *   every insert       ->  useCanvasData, the one owner of board writes
 *
 * and pin that a durable PDF-area Library Image cannot terminate in an
 * ordinary browser INSERT anywhere along it, while every other Library item is
 * untouched.
 */

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

/** Line comments only -- a block strip would swallow JSX and fake passes. */
const sourceOf = (relativePath: string) => read(relativePath).replace(/^\s*\/\/.*$/gm, '');

const libraryPanel = sourceOf('components/collabboard/LibraryPanel.tsx');
const padletLayer = sourceOf('components/collabboard/canvas/ui/PadletLayer.tsx');
const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const canvasData = sourceOf('components/collabboard/canvas/hooks/useCanvasData.ts');

const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const LIBRARY_ID = '66666666-6666-4666-8666-666666666666';
const DOC_ID = '55555555-5555-4555-8555-555555555555';
const PROVENANCE = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });

/**
 * EXACTLY what LibraryPanel puts on the DataTransfer:
 * `JSON.stringify({ ...item.content, libraryItemId: item.id })`.
 * Nothing is invented here -- the shape is asserted against the source below.
 */
const libraryDragPayload = (overrides: Record<string, unknown> = {}) => ({
  title: 'EMG page 3 area',
  content: '',
  type: 'image',
  width: 320,
  height: 240,
  file_url: `/api/library/items/${LIBRARY_ID}/image`,
  metadata: {
    imageUrl: '/api/boards/99999999-9999-4999-8999-999999999999/padlets/88888888-8888-4888-8888-888888888888/image',
    source: PROVENANCE,
  },
  libraryItemId: LIBRARY_ID,
  ...overrides,
});

/** The row shape the canvas branches hand to the classifier at drop time. */
const droppedRow = (payload: Record<string, unknown>, boardId = BOARD_A) => ({
  board_id: boardId,
  type: payload.type,
  library_item_id: payload.libraryItemId ?? null,
  metadata: payload.metadata,
  position_x: 120,
  position_y: 340,
});

describe('E1-E3: the payload the panel really emits, through the layer that really receives it', () => {
  it('E1: LibraryPanel emits the snapshot plus the durable id, on the library MIME', () => {
    expect(libraryPanel).toContain("'application/collabboard-library'");
    expect(libraryPanel).toContain('JSON.stringify({ ...item.content, libraryItemId: item.id })');
    // It does NOT set text/padlet-id, which is why the CanvasViewport drop
    // handler returns before ever reaching its library branch. Nothing may
    // depend on that field for a Library drag again.
    expect(libraryPanel).not.toContain('text/padlet-id');
  });

  it('E2: PadletLayer is a pass-through, so its onDrop IS the CanvasClient branch', () => {
    expect(padletLayer).toContain('onDrop={onDrop}');
    // It owns no insert of its own; the decision must therefore live in the
    // handler CanvasClient passes down.
    for (const forbidden of ['createPostsRepository', 'from(', 'insert(', 'library']) {
      expect(padletLayer, forbidden).not.toContain(forbidden);
    }
  });

  it('E3: the PadletLayer library branch asks the trusted path BEFORE any insert', () => {
    const branch = canvasClient.slice(
      canvasClient.indexOf("const libraryData = e.dataTransfer.getData('application/collabboard-library');"),
    );
    expect(branch.length).toBeGreaterThan(0);
    const decide = branch.indexOf('await placeDurablePdfAreaLibraryImage({');
    const drawingInsert = branch.indexOf('handleDrawingLayoutAddPadletWithContainerCheck(draftPayload)');
    const browserInsert = branch.indexOf('createCreatePostCommand(createPostsRepository())');
    expect(decide).toBeGreaterThan(-1);
    expect(drawingInsert).toBeGreaterThan(decide);
    expect(browserInsert).toBeGreaterThan(decide);
    // And a durable image never falls through to them.
    expect(branch.slice(decide, decide + 400)).toContain("if (durable !== 'not-applicable') return;");
  });
});

describe('E4-E6: one classifier, and it only fires for a durable PDF-area image', () => {
  it('E4: the real drag payload is recognised, and yields a position-only intent', () => {
    const intent = readKnowledgePdfAreaLibraryPlacement(droppedRow(libraryDragPayload()));
    expect(intent).toEqual({
      boardId: BOARD_A,
      libraryItemId: LIBRARY_ID,
      positionX: 120,
      positionY: 340,
    });
  });

  it('E5 (B): ordinary Library items are NOT claimed, at any boundary', () => {
    const ordinary = [
      // A plain image saved to the library: no PDF provenance.
      droppedRow(libraryDragPayload({ metadata: { imageUrl: 'https://cdn.test/plain.png' } })),
      // A note, a link, a card: not images.
      droppedRow(libraryDragPayload({ type: 'note' })),
      droppedRow(libraryDragPayload({ type: 'text' })),
      droppedRow(libraryDragPayload({ type: 'link' })),
      // An image with provenance but no durable identity (a hand-built drag).
      droppedRow(libraryDragPayload({ libraryItemId: undefined })),
      // Provenance that does not parse.
      droppedRow(libraryDragPayload({ metadata: { source: { kind: 'knowledge-pdf-area' } } })),
      droppedRow(libraryDragPayload({ metadata: null })),
      // A fresh card that never came from the library at all.
      { board_id: BOARD_A, type: 'image', metadata: { imageUrl: 'https://cdn.test/x.png' } },
    ];
    for (const row of ordinary) {
      expect(readKnowledgePdfAreaLibraryPlacement(row), JSON.stringify(row).slice(0, 90)).toBeNull();
    }
  });

  it('E6: identity is never inferred from a title, an extension or a URL', () => {
    const disguised = droppedRow(libraryDragPayload({
      title: 'knowledge-pdf-area.webp',
      file_url: '/api/boards/x/padlets/y/image',
      metadata: { imageUrl: 'board-derived/x/pdf-areas/y.webp' },
    }));
    expect(readKnowledgePdfAreaLibraryPlacement(disguised)).toBeNull();
  });
});

describe('E7-E9: the request, and the two boards it can be made for', () => {
  const okResponse = (padlet: Record<string, unknown>) => ({
    ok: true,
    status: 201,
    json: async () => ({ padlet }),
  }) as unknown as Response;

  it('E7 (A): a recognised drop becomes ONE trusted request carrying only a position', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => okResponse({ id: 'p1', board_id: BOARD_A }));
    const intent = readKnowledgePdfAreaLibraryPlacement(droppedRow(libraryDragPayload()))!;
    const result = await requestKnowledgePdfAreaLibraryPlacement(intent, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, padlet: { id: 'p1', board_id: BOARD_A } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init).toBeDefined();
    expect(url).toBe(`/api/boards/${BOARD_A}/library-items/${LIBRARY_ID}/image-placement`);
    expect(init!.method).toBe('POST');
    expect(JSON.parse(String(init!.body))).toEqual({ positionX: 120, positionY: 340 });
    // Nothing an attacker would want to supply is in the body.
    for (const forbidden of ['storage', 'path', 'metadata', 'source', 'library']) {
      expect(String(init!.body).toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });

  it('E8 (D): the SAME Library object placed on a second board is a second trusted request', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => okResponse({ id: 'p2', board_id: BOARD_B }));
    const onA = readKnowledgePdfAreaLibraryPlacement(droppedRow(libraryDragPayload(), BOARD_A))!;
    const onB = readKnowledgePdfAreaLibraryPlacement(droppedRow(libraryDragPayload(), BOARD_B))!;
    await requestKnowledgePdfAreaLibraryPlacement(onA, fetchImpl as unknown as typeof fetch);
    await requestKnowledgePdfAreaLibraryPlacement(onB, fetchImpl as unknown as typeof fetch);

    // Two boards, two placements, ONE durable Library object -- no copy of
    // anything, and no origin board in either request.
    expect(onA.libraryItemId).toBe(onB.libraryItemId);
    expect(onA.boardId).not.toBe(onB.boardId);
    const urls = fetchImpl.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      `/api/boards/${BOARD_A}/library-items/${LIBRARY_ID}/image-placement`,
      `/api/boards/${BOARD_B}/library-items/${LIBRARY_ID}/image-placement`,
    ]);
  });

  it('E9: a refused request never turns into a browser insert', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: false, status: 403 }) as unknown as Response);
    const intent = readKnowledgePdfAreaLibraryPlacement(droppedRow(libraryDragPayload()))!;
    expect(await requestKnowledgePdfAreaLibraryPlacement(intent, fetchImpl as unknown as typeof fetch))
      .toEqual({ ok: false, status: 403 });
    // The canvas branch and the hook both treat a refusal as final.
    expect(canvasClient).toContain("if (durable !== 'not-applicable') return;");
    expect(canvasData).toContain('if (!durable.ok) throw durablePlacementError(durable.status);');
  });
});

describe('E10-E11: the choke point -- no board insert escapes the question', () => {
  /** Every function in the hook that reaches a create/insert command. */
  const insertFunctions = [
    'addPadletFromLibraryItem',
    'addFreeformCardPadlet',
    'addDrawingLayoutPadlet',
    'insertPostOrThrow',
    'insertPostPreservingFailureChannels',
    'insertPostAndSelectOrThrow',
    'dropDraftIntoContainerOrThrow',
  ] as const;

  it('E10: every insert path in useCanvasData asks the classifier first', () => {
    for (const name of insertFunctions) {
      const at = canvasData.indexOf(`const ${name} = useCallback(`);
      expect(at, name).toBeGreaterThan(-1);
      const body = canvasData.slice(at, at + 1400);
      const guard = body.indexOf('await placeDurablePdfAreaLibraryImage(');
      const create = body.search(/create(CreatePost|CreatePostAndSelect|CreatePostBestEffort|DropDraftIntoContainer)Command\(/);
      expect(guard, `${name} must consult the classifier`).toBeGreaterThan(-1);
      expect(create, `${name} must still have its own insert`).toBeGreaterThan(-1);
      expect(guard, `${name} must ask BEFORE inserting`).toBeLessThan(create);
    }
  });

  it('E11: the hook and the canvas share ONE detection rule, imported not restated', () => {
    for (const [name, source] of [['hook', canvasData], ['canvas', canvasClient]] as const) {
      expect(source, name).toContain('readKnowledgePdfAreaLibraryPlacement');
      expect(source, name).toContain('requestKnowledgePdfAreaLibraryPlacement');
      // No second, slightly different rule anywhere on the client.
      expect(source, name).not.toContain('parseKnowledgePdfAreaProvenance(');
    }
  });
});
