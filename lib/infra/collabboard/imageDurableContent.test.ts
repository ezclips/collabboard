// IMAGE-LIBRARY durable ownership for Image edits.
//
// Runtime proved the defect this pins: on a linked PDF-area Image, the normal
// Freeform "Draw on image" -> Pencil -> Save wrote `PATCH padlets` with
// `metadata` + `updated_at` only. No file_url, no library_items write at all.
// After a hard reload the board showed the stroke and the Personal Library
// showed the original unannotated crop -- the placement had been edited, the
// durable object it references had not.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveImagePostDisplaySrc } from '../../domain/canvas/imagePostDisplaySource';
import { persistDurableImageContent } from './imageDurableContent';

interface RecordedWrite {
  readonly table: string;
  readonly values: Record<string, unknown>;
  readonly column: string;
  readonly id: string;
}

/** Records every write and can fail a chosen table, like a rejected update. */
function fakeClient(failOn?: string) {
  const writes: RecordedWrite[] = [];
  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, id: string) {
              writes.push({ table, values, column, id });
              return Promise.resolve({ error: table === failOn ? { message: 'denied' } : null });
            },
          };
        },
      };
    },
  };
  return { client, writes };
}

const COMPOSITE = 'data:image/png;base64,COMPOSITEWITHSTROKE';
const ORIGINAL = '/api/boards/board-1/padlets/post-1/image';

/** A PDF-area Image exactly as the area-image route creates it. */
const pdfAreaMetadata = () => ({
  imageUrl: ORIGINAL,
  cardColor: '#ffffff',
  caption: 'a caption nobody touched',
  source: {
    kind: 'knowledge-pdf-area',
    knowledgeDocumentId: 'doc-1',
    pageNumber: 1,
    region: { x: 0.15, y: 0.68, width: 0.36, height: 0.23 },
  },
});

/** What the Draw arm now hands the helper: spread, never rebuilt. */
const metadataAfterDraw = (base: Record<string, unknown>) => ({
  ...base,
  drawing: COMPOSITE,
  drawingPaths: [{ strokeWidth: 4 }],
  drawingText: [],
});

describe('persistDurableImageContent', () => {
  it('1. keeps the same placement and the same Library identity', async () => {
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-1',
      libraryItemId: 'lib-1',
      imageUrl: COMPOSITE,
      metadata: metadataAfterDraw(pdfAreaMetadata()),
      title: 'My fancy padlet-slideshow.pdf',
      width: 320,
      height: 144,
    });

    expect(writes.map((w) => w.table)).toEqual(['padlets', 'library_items']);
    expect(writes[0]).toMatchObject({ column: 'id', id: 'post-1' });
    expect(writes[1]).toMatchObject({ column: 'id', id: 'lib-1' });
    // No insert, no RPC, no second object of either kind.
    expect(writes).toHaveLength(2);
    expect(writes.some((w) => 'id' in w.values)).toBe(false);
    expect(writes.some((w) => 'library_item_id' in w.values)).toBe(false);
  });

  it('2. writes the composite as durable content, not metadata alone', async () => {
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-1', libraryItemId: 'lib-1', imageUrl: COMPOSITE,
      metadata: metadataAfterDraw(pdfAreaMetadata()),
      title: 'Slide', width: 320, height: 144,
    });

    const [placement, durable] = writes;
    // The exact field the defect was missing.
    expect(placement.values.file_url).toBe(COMPOSITE);
    const content = durable.values.content as Record<string, unknown>;
    expect(content.file_url).toBe(COMPOSITE);
    expect(durable.values.thumbnail_url).toBe(COMPOSITE);
    // The Library snapshot mirrors the creation RPC's shape.
    expect(content).toMatchObject({ type: 'image', content: '', title: 'Slide', width: 320, height: 144 });
    expect(placement.values.updated_at).toBe(durable.values.updated_at);
  });

  it('3. carries PDF-area provenance and unrelated metadata through untouched', async () => {
    const before = pdfAreaMetadata();
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-1', libraryItemId: 'lib-1', imageUrl: COMPOSITE,
      metadata: metadataAfterDraw(before), title: 'Slide', width: 320, height: 144,
    });

    for (const values of [writes[0].values, (writes[1].values.content as Record<string, unknown>)]) {
      const metadata = values.metadata as Record<string, unknown>;
      // The whole source object, byte for byte -- not reconstructed.
      expect(metadata.source).toEqual(before.source);
      expect(metadata.caption).toBe('a caption nobody touched');
      expect(metadata.cardColor).toBe('#ffffff');
      expect(metadata.drawing).toBe(COMPOSITE);
    }
    // The caller's object is not mutated in place.
    expect(before.source).toEqual(pdfAreaMetadata().source);
  });

  it('4. the saved composite renders exactly once', async () => {
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-1', libraryItemId: 'lib-1', imageUrl: COMPOSITE,
      metadata: metadataAfterDraw(pdfAreaMetadata()), title: 'Slide', width: 320, height: 144,
    });

    // The post as it now exists, fed to the one shared display authority.
    const saved = {
      file_url: writes[0].values.file_url as string,
      metadata: writes[0].values.metadata as Record<string, unknown>,
    };
    // resolveImagePostDisplaySrc CHOOSES a src; it does not layer one over
    // another, so the flattened stroke is painted once even though the
    // editable strokes are still stored for reopening the editor.
    expect(resolveImagePostDisplaySrc(saved as never)).toBe(COMPOSITE);
    expect(saved.file_url).toBe(COMPOSITE);
    expect(saved.metadata.drawingPaths).toBeTruthy();
    // Nothing still points at the pre-annotation asset as the thing to render.
    expect(resolveImagePostDisplaySrc(saved as never)).not.toBe(ORIGINAL);
  });

  it('5. an unlinked Image still saves, and no Library object is invented', async () => {
    for (const libraryItemId of [null, undefined]) {
      const { client, writes } = fakeClient();
      await expect(persistDurableImageContent(client, {
        // CORRECTION_1: the helper asks between its two writes.
        mayContinue: () => true,
        padletId: 'post-legacy', libraryItemId, imageUrl: COMPOSITE,
        metadata: metadataAfterDraw({ imageUrl: ORIGINAL }),
        title: 'Legacy', width: 300, height: 200,
      })).resolves.toBe('complete');

      expect(writes.map((w) => w.table)).toEqual(['padlets']);
      expect(writes[0].values.file_url).toBe(COMPOSITE);
    }
  });

  it('6. an ordinary linked Image gets the same durable treatment', async () => {
    // No PDF provenance at all: the rule is about linked Images, not PDFs.
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-2', libraryItemId: 'lib-2', imageUrl: COMPOSITE,
      metadata: metadataAfterDraw({ imageUrl: 'https://cdn.example/photo.jpg', source: 'unsplash' }),
      title: 'Photo', width: 300, height: 200,
    });

    expect(writes.map((w) => w.table)).toEqual(['padlets', 'library_items']);
    expect((writes[1].values.content as Record<string, unknown>).file_url).toBe(COMPOSITE);
    expect(writes[1].values.thumbnail_url).toBe(COMPOSITE);
    // A string `source` is metadata like any other and survives unchanged.
    expect((writes[0].values.metadata as Record<string, unknown>).source).toBe('unsplash');
  });

  it('7. a rejected write is raised, never reported as a save', async () => {
    const placementFails = fakeClient('padlets');
    await expect(persistDurableImageContent(placementFails.client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-1', libraryItemId: 'lib-1', imageUrl: COMPOSITE,
      metadata: metadataAfterDraw(pdfAreaMetadata()), title: 'Slide', width: 320, height: 144,
    })).rejects.toBeTruthy();
    // The durable write is not attempted once the placement failed.
    expect(placementFails.writes.map((w) => w.table)).toEqual(['padlets']);

    const durableFails = fakeClient('library_items');
    await expect(persistDurableImageContent(durableFails.client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-1', libraryItemId: 'lib-1', imageUrl: COMPOSITE,
      metadata: metadataAfterDraw(pdfAreaMetadata()), title: 'Slide', width: 320, height: 144,
    })).rejects.toBeTruthy();
    // A half-applied edit surfaces rather than silently claiming success.
    expect(durableFails.writes.map((w) => w.table)).toEqual(['padlets', 'library_items']);
  });
});

describe('the Freeform Draw arm is wired to the shared authority', () => {
  const canvasClient = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
  const drawArm = canvasClient.slice(
    canvasClient.indexOf('<ImageDrawingLayer'),
    canvasClient.indexOf('onChangeColor', canvasClient.indexOf('<ImageDrawingLayer')));

  it('8. saves through persistDurableImageContent, not a metadata-only write', () => {
    expect(drawArm).toContain('persistDurableImageContent');
    expect(drawArm).toContain('libraryItemId');
    expect(drawArm).toContain('imageUrl: dataUrl');
    // The defect: the drawing arm's own metadata-only command.
    expect(drawArm).not.toContain('updatePostMetadataBestEffort');
  });

  it('9. spreads existing metadata rather than rebuilding it', () => {
    // Rebuilding is how `source` was lost elsewhere; provenance survives only
    // because this arm spreads.
    expect(drawArm).toContain('...drawingPadlet.metadata');
    expect(drawArm).not.toMatch(/source:\s*data\.source/);
  });

  it('10. the image editor arm uses the same authority, so neither can drift', () => {
    const savePath = fs.readFileSync(
      path.join(process.cwd(), 'hooks/canvas/usePadletSave.ts'), 'utf8');
    expect(savePath).toContain('persistDurableImageContent');
    // No second inline copy of the library_items ownership write.
    expect(savePath).not.toContain("from('library_items')");
  });
});

/**
 * CANVAS_BOARD_EDIT_COMMAND_LAYER_AUTHORITY_CORRECTION_2.
 *
 * This helper is the choke point every durable image edit goes through, so it
 * answers for itself at BOTH phases: before the placement write, and again
 * before the linked Library write. The three outcomes are distinguishable
 * because a caller must be able to tell an untouched board from a half-written
 * one.
 */
describe('persistDurableImageContent authority lifecycle', () => {
  function recordingClient() {
    const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
    const client = {
      from(table: string) {
        return {
          update(values: Record<string, unknown>) {
            writes.push({ table, values });
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
    return { client, writes };
  }

  const input = (mayContinue: () => boolean) => ({
    mayContinue,
    padletId: 'padlet-1',
    libraryItemId: 'library-1',
    imageUrl: 'https://img/new.png',
    metadata: { drawing: 'data:image/png;base64,AAA' },
    title: 'Image',
    width: 300,
    height: 200,
  });

  it('A. denied before the primary write: nothing is written at all', async () => {
    const { client, writes } = recordingClient();

    const outcome = await persistDurableImageContent(client as never, input(() => false));

    expect(outcome, 'the caller can tell nothing was persisted').toBe('denied');
    expect(writes, 'zero padlet update and zero Library update').toEqual([]);
  });

  it('B. revoked after the primary write: placement stands, Library is skipped', async () => {
    const { client, writes } = recordingClient();
    // True for the pre-write probe, false for the post-write one -- the exact
    // transition a revocation during the placement request produces.
    let calls = 0;
    const outcome = await persistDurableImageContent(
      client as never,
      input(() => { calls += 1; return calls === 1; }),
    );

    expect(outcome).toBe('placement-only');
    expect(writes.map((w) => w.table), 'the placement landed, the Library row did not')
      .toEqual(['padlets']);
  });

  it('C. authorized: both writes land and the outcome is complete', async () => {
    const { client, writes } = recordingClient();

    const outcome = await persistDurableImageContent(client as never, input(() => true));

    expect(outcome).toBe('complete');
    expect(writes.map((w) => w.table)).toEqual(['padlets', 'library_items']);
  });

  it('F. guard-to-helper race: a caller that passed its own check still writes nothing', async () => {
    const { client, writes } = recordingClient();
    // The consumer's entry guard saw `true`; the authority then went away before
    // this helper was reached. The pre-write probe is what catches that.
    let live = true;
    const entryGuardSaw = live;
    live = false;

    const outcome = await persistDurableImageContent(client as never, input(() => live));

    expect(entryGuardSaw, 'the caller was authorized when it decided to proceed').toBe(true);
    expect(outcome, 'the helper refuses independently').toBe('denied');
    expect(writes, 'zero primary write').toEqual([]);
  });
});
