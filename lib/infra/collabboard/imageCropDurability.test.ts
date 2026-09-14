// Crop is DURABLE IMAGE CONTENT, and the Library must show it whole.
//
// Two defects are pinned here. Crop saved through a metadata-only command, so
// the placement showed the cropped image while the linked Library row kept the
// previous raster -- the same split the Draw arm had, in the one edit path that
// had not been routed through the shared durable authority. And the Library
// tile used object-cover, re-cropping an image the user had already cropped.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveImagePostDisplaySrc } from '../../domain/canvas/imagePostDisplaySource';
import { resolveLibraryImagePreviewSrc } from '../../domain/canvas/libraryImagePreviewSource';
import {
  persistDurableImageContent,
  deriveCropOriginalImageUrl,
  hasRecoverableCropOriginal,
  buildResetCropMetadata,
  resolveCropResetSource,
} from './imageDurableContent';
import { knowledgePdfAreaImageUrl } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

const BASE = 'data:image/png;base64,ORIGINALBASE';
const ANNOTATED = 'data:image/png;base64,ANNOTATEDCOMPOSITE';
const CROPPED = 'data:image/png;base64,CROPPEDCURRENT';

function fakeClient(failOn?: string) {
  const writes: { table: string; values: Record<string, unknown>; id: string }[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        return {
          update(values: Record<string, unknown>) {
            return {
              eq: (_c: string, id: string) => {
                writes.push({ table, values, id });
                return Promise.resolve({ error: table === failOn ? { message: 'denied' } : null });
              },
            };
          },
        };
      },
    },
  };
}

/** A PDF-area Image that already carries a saved annotation. */
const annotatedPdfAreaPost = () => ({
  id: 'post-1',
  title: 'My fancy padlet-slideshow.pdf',
  width: 320,
  height: 144,
  library_item_id: 'lib-1',
  metadata: {
    imageUrl: BASE,
    drawing: ANNOTATED,
    drawingPaths: [{ strokeWidth: 4 }],
    drawingText: [{ text: 'note' }],
    cardColor: '#ffffff',
    source: {
      kind: 'knowledge-pdf-area',
      knowledgeDocumentId: 'doc-1',
      pageNumber: 4,
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    },
  },
});

/**
 * Exactly the transform the crop arm applies before handing off to the durable
 * authority. Kept beside the source pins below, which prove the arm really does
 * this rather than something that merely looks like it.
 */
const metadataAfterCrop = (post: ReturnType<typeof annotatedPdfAreaPost>) => ({
  ...post.metadata,
  imageUrl: CROPPED,
  drawing: null,
  drawingPaths: null,
  drawingText: null,
});

describe('crop writes durable Image content', () => {
  it('1. one crop updates the same post and the same Library row', async () => {
    const post = annotatedPdfAreaPost();
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: post.id, libraryItemId: post.library_item_id, imageUrl: CROPPED,
      metadata: metadataAfterCrop(post), title: post.title, width: post.width, height: post.height,
    });

    expect(writes.map((w) => w.table)).toEqual(['padlets', 'library_items']);
    expect(writes[0].id).toBe('post-1');
    expect(writes[1].id).toBe('lib-1');
    // No insert, no minted identity.
    expect(writes).toHaveLength(2);
    expect(writes.some((w) => 'id' in w.values || 'library_item_id' in w.values)).toBe(false);

    expect(writes[0].values.file_url).toBe(CROPPED);
    expect((writes[0].values.metadata as Record<string, unknown>).imageUrl).toBe(CROPPED);
    const content = writes[1].values.content as Record<string, unknown>;
    expect(content.file_url).toBe(CROPPED);
    expect(writes[1].values.thumbnail_url).toBe(CROPPED);
  });

  it('2. crop preserves PDF provenance and unrelated metadata', async () => {
    const post = annotatedPdfAreaPost();
    const before = JSON.parse(JSON.stringify(post.metadata.source));
    const { client, writes } = fakeClient();
    await persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: post.id, libraryItemId: post.library_item_id, imageUrl: CROPPED,
      metadata: metadataAfterCrop(post), title: post.title, width: post.width, height: post.height,
    });

    for (const values of [writes[0].values, writes[1].values.content as Record<string, unknown>]) {
      const metadata = values.metadata as Record<string, unknown>;
      // Cropping the derived Image does not change which PDF page it came from.
      expect(metadata.source).toEqual(before);
      expect(metadata.cardColor).toBe('#ffffff');
    }
  });

  it('3. crop starts from the CURRENT composite and bakes it in', () => {
    const post = annotatedPdfAreaPost();
    // What the crop editor is handed: the annotated composite, not the base.
    expect(resolveImagePostDisplaySrc(post as never)).toBe(ANNOTATED);
    expect(resolveImagePostDisplaySrc(post as never)).not.toBe(BASE);

    const after = metadataAfterCrop(post);
    expect(after.imageUrl).toBe(CROPPED);
    // The strokes are pixels in the cropped raster now, so the editable vectors
    // are cleared -- replaying them would paint the annotation twice.
    expect(after.drawing).toBeNull();
    expect(after.drawingPaths).toBeNull();
    expect(after.drawingText).toBeNull();
  });

  it('9. after a crop the display authority paints exactly one raster', () => {
    const post = annotatedPdfAreaPost();
    const cropped = { file_url: CROPPED, metadata: metadataAfterCrop(post) };
    // Nothing higher in the chain survives to double-paint the old annotation.
    expect(resolveImagePostDisplaySrc(cropped as never)).toBe(CROPPED);
    expect(resolveLibraryImagePreviewSrc({
      thumbnail_url: CROPPED, content: { file_url: CROPPED, metadata: cropped.metadata },
    } as never)).toBe(CROPPED);
  });

  it('4. an unlinked Image crops normally and invents no Library object', async () => {
    const { client, writes } = fakeClient();
    await expect(persistDurableImageContent(client, {
      // CORRECTION_1: the helper asks between its two writes.
      mayContinue: () => true,
      padletId: 'post-legacy', libraryItemId: null, imageUrl: CROPPED,
      metadata: { imageUrl: CROPPED, drawing: null, drawingPaths: null, drawingText: null },
      title: 'Legacy', width: 300, height: 200,
    })).resolves.toBe('complete');
    expect(writes.map((w) => w.table)).toEqual(['padlets']);
    expect(writes[0].values.file_url).toBe(CROPPED);
  });

  it('8. the Library still prefers the current composite over a stale base', () => {
    expect(resolveLibraryImagePreviewSrc({
      thumbnail_url: ANNOTATED,
      content: { file_url: ANNOTATED, metadata: { drawing: ANNOTATED, imageUrl: BASE } },
    } as never)).toBe(ANNOTATED);
  });
});

/**
 * CANVAS_IMAGE_CROP_ORIGINAL_PRESERVATION_IMPLEMENTATION_1.
 *
 * Product decisions under test: crop is placement-local (never touches the
 * linked Library row); the FIRST pre-crop durable image is preserved as an
 * immutable reset source; repeated crops keep that same first original;
 * Reset Crop restores it and clears crop/drawing-derived state.
 *
 * `simulateCrop`/`simulateReset` are exactly the composition
 * CanvasClient.tsx's crop and Reset Crop arms use -- the same pure helpers,
 * the same `persistDurableImageContent` call, the same `syncLibrary: false`
 * -- so these are real production helpers under real control, not a mock of
 * the behavior.
 */
async function simulateCrop(
  client: ReturnType<typeof fakeClient>['client'],
  padlet: { id: string; library_item_id: string | null; title: string; width: number; height: number; metadata: Record<string, unknown> },
  croppedDataUrl: string,
  mayContinue: () => boolean = () => true,
) {
  const originalImageUrl = deriveCropOriginalImageUrl(padlet.metadata);
  const metadata: Record<string, unknown> = {
    ...padlet.metadata,
    imageUrl: croppedDataUrl,
    drawing: null,
    drawingPaths: null,
    drawingText: null,
    ...(originalImageUrl ? { originalImageUrl } : {}),
  };
  const outcome = await persistDurableImageContent(client, {
    mayContinue,
    padletId: padlet.id,
    libraryItemId: padlet.library_item_id,
    syncLibrary: false,
    imageUrl: croppedDataUrl,
    metadata,
    title: padlet.title,
    width: padlet.width,
    height: padlet.height,
  });
  return { outcome, metadata };
}

async function simulateReset(
  client: ReturnType<typeof fakeClient>['client'],
  padlet: { id: string; library_item_id: string | null; title: string; width: number; height: number; metadata: Record<string, unknown> },
  original: string,
  mayContinue: () => boolean = () => true,
) {
  const metadata = buildResetCropMetadata(padlet.metadata, original);
  const outcome = await persistDurableImageContent(client, {
    mayContinue,
    padletId: padlet.id,
    libraryItemId: padlet.library_item_id,
    syncLibrary: false,
    imageUrl: original,
    metadata,
    title: padlet.title,
    width: padlet.width,
    height: padlet.height,
  });
  return { outcome, metadata };
}

describe('CROP_ORIGINAL_PRESERVATION_1: crop preserves the first original', () => {
  it('A. the first crop stores the pre-crop original (the BASE, not the annotated composite) and persists the crop', async () => {
    const p = annotatedPdfAreaPost();
    const { client, writes } = fakeClient();

    const { outcome, metadata } = await simulateCrop(client, p, CROPPED);

    expect(outcome).toBe('complete');
    expect(metadata.originalImageUrl).toBe(BASE);
    expect(metadata.originalImageUrl).not.toBe(ANNOTATED);
    expect(writes[0].values.file_url).toBe(CROPPED);
    expect((writes[0].values.metadata as Record<string, unknown>).imageUrl).toBe(CROPPED);
    expect((writes[0].values.metadata as Record<string, unknown>).originalImageUrl).toBe(BASE);
  });

  it('B. a second crop preserves the FIRST original, never the previous crop\'s own result', async () => {
    const p = annotatedPdfAreaPost();
    const { client: client1 } = fakeClient();
    const { metadata: afterFirst } = await simulateCrop(client1, p, CROPPED);

    const RECROPPED = 'data:image/png;base64,RECROPPED';
    const afterFirstCropPost = { ...p, metadata: afterFirst };
    const { client: client2, writes: writes2 } = fakeClient();
    const { metadata: afterSecond } = await simulateCrop(client2, afterFirstCropPost, RECROPPED);

    expect(afterSecond.originalImageUrl).toBe(BASE);
    expect(afterSecond.originalImageUrl).not.toBe(CROPPED);
    expect(writes2[0].values.file_url).toBe(RECROPPED);
  });

  it('C. cropping a Library-linked placement makes zero library_items updates', async () => {
    const p = annotatedPdfAreaPost();
    const { client, writes } = fakeClient();
    await simulateCrop(client, p, CROPPED);
    expect(writes.map((w) => w.table)).toEqual(['padlets']);
  });

  it('D. a second placement sharing the same library_item_id is never named at all', async () => {
    const p = annotatedPdfAreaPost();
    const { client, writes } = fakeClient();
    await simulateCrop(client, p, CROPPED);
    // Every write targets post-1; post-2 (a hypothetical second placement
    // reusing lib-1) and lib-1 itself are never addressed by any write.
    expect(writes.every((w) => w.id === 'post-1')).toBe(true);
    expect(writes.some((w) => w.id === 'post-2' || w.id === 'lib-1')).toBe(false);
  });

  it('G. initial authority denial for crop makes zero placement and Library writes', async () => {
    const p = annotatedPdfAreaPost();
    const { client, writes } = fakeClient();
    const { outcome } = await simulateCrop(client, p, CROPPED, () => false);
    expect(outcome).toBe('denied');
    expect(writes).toEqual([]);
  });

  it('L. a rejected placement write is raised, never reported as a saved crop', async () => {
    const p = annotatedPdfAreaPost();
    const placementFails = fakeClient('padlets');
    await expect(simulateCrop(placementFails.client, p, CROPPED)).rejects.toBeTruthy();
    // The write was attempted (and recorded as failed) -- nothing beyond it.
    expect(placementFails.writes.map((w) => w.table)).toEqual(['padlets']);
  });
});

describe('CROP_ORIGINAL_PRESERVATION_1: Reset Crop', () => {
  /** A placement already cropped once, per the shape `simulateCrop` produces. */
  const croppedPost = () => ({
    ...annotatedPdfAreaPost(),
    metadata: { ...annotatedPdfAreaPost().metadata, originalImageUrl: BASE, imageUrl: CROPPED, drawing: null, drawingPaths: null, drawingText: null },
  });

  it('E. reset restores the exact original and clears original/crop/drawing metadata', async () => {
    const p = croppedPost();
    const { client, writes } = fakeClient();

    const { outcome, metadata } = await simulateReset(client, p, BASE);

    expect(outcome).toBe('complete');
    expect(metadata.imageUrl).toBe(BASE);
    expect(metadata).not.toHaveProperty('originalImageUrl');
    expect(metadata).not.toHaveProperty('drawing');
    expect(metadata).not.toHaveProperty('drawingPaths');
    expect(metadata).not.toHaveProperty('drawingText');
    expect(writes[0].values.file_url).toBe(BASE);
    expect((writes[0].values.metadata as Record<string, unknown>).imageUrl).toBe(BASE);
  });

  it('F. reset makes zero library_items updates', async () => {
    const p = croppedPost();
    const { client, writes } = fakeClient();
    await simulateReset(client, p, BASE);
    expect(writes.map((w) => w.table)).toEqual(['padlets']);
  });

  it('G. initial authority denial for reset makes zero placement and Library writes', async () => {
    const p = croppedPost();
    const { client, writes } = fakeClient();
    const { outcome } = await simulateReset(client, p, BASE, () => false);
    expect(outcome).toBe('denied');
    expect(writes).toEqual([]);
  });

  it('G. live (post-write) revocation is still reported truthfully, with zero Library writes', async () => {
    const p = croppedPost();
    const { client, writes } = fakeClient();
    let calls = 0;
    const { outcome } = await simulateReset(client, p, BASE, () => { calls += 1; return calls === 1; });
    expect(outcome).toBe('placement-only');
    expect(writes.map((w) => w.table)).toEqual(['padlets']);
  });

  it('H. a record without a recoverable original does not offer a false reset', () => {
    const neverCropped = annotatedPdfAreaPost();
    expect(hasRecoverableCropOriginal(neverCropped.metadata)).toBe(false);
  });

  it('L. a rejected placement write is raised, and the reset source is not cleared', async () => {
    const p = croppedPost();
    const placementFails = fakeClient('padlets');
    await expect(simulateReset(placementFails.client, p, BASE)).rejects.toBeTruthy();
    expect(placementFails.writes.map((w) => w.table)).toEqual(['padlets']);
    // Nothing else was attempted -- the row's own originalImageUrl, which
    // only a successful write could have removed, was never touched.
    expect(placementFails.writes).toHaveLength(1);
  });
});

/**
 * CANVAS_IMAGE_CROP_ORIGINAL_PRESERVATION_CORRECTION_1 -- M2: a pre-existing
 * PDF-area crop (made before commit 4e0fb7d) has no originalImageUrl, but its
 * provenance still proves the deterministic PDF-area URL as a reset source.
 * `resolveCropResetSource` is the real function both toolbars call; every
 * case here drives it directly, not a source-regex stand-in.
 */
describe('CORRECTION_1 M2: the PDF-area provenance fallback', () => {
  const BOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const PADLET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const DOC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const DETERMINISTIC = knowledgePdfAreaImageUrl(BOARD_ID, PADLET_ID)!;

  /** A PDF-area crop made before originalImageUrl existed: valid provenance,
   *  current imageUrl already drifted from the deterministic capture. */
  const preExistingPdfAreaCrop = () => ({
    id: PADLET_ID, board_id: BOARD_ID, library_item_id: null as string | null,
    title: 'Diagram', width: 320, height: 200,
    metadata: {
      imageUrl: CROPPED,
      source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: DOC_ID, pageNumber: 3, region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
    } as Record<string, unknown>,
  });

  it('D. a normal upload -- no originalImageUrl, no PDF-area provenance -- offers no reset source', () => {
    expect(resolveCropResetSource({ imageUrl: 'https://cdn.example/photo.jpg' }, BOARD_ID, PADLET_ID)).toBeNull();
  });

  it('E. malformed or incomplete metadata.source offers no reset source and never throws', () => {
    const cases: Record<string, unknown>[] = [
      { imageUrl: CROPPED, source: { kind: 'knowledge-pdf-area' } },
      { imageUrl: CROPPED, source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: 'not-a-uuid', pageNumber: 1, region: { x: 0, y: 0, width: 1, height: 1 } } },
      { imageUrl: CROPPED, source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: DOC_ID, pageNumber: 0, region: { x: 0, y: 0, width: 1, height: 1 } } },
      { imageUrl: CROPPED, source: 'not-an-object' },
      { imageUrl: CROPPED, source: null },
      { imageUrl: CROPPED },
    ];
    for (const metadata of cases) {
      expect(() => resolveCropResetSource(metadata, BOARD_ID, PADLET_ID)).not.toThrow();
      expect(resolveCropResetSource(metadata, BOARD_ID, PADLET_ID)).toBeNull();
    }
  });

  it('F. a pre-existing PDF-area crop without originalImageUrl recovers the canonical deterministic URL', () => {
    const p = preExistingPdfAreaCrop();
    const source = resolveCropResetSource(p.metadata, p.board_id, p.id);
    expect(source).toBe(DETERMINISTIC);
    expect(source).not.toBe(CROPPED);
  });

  it('G. resetting it restores the deterministic URL, preserves provenance, clears derived fields, zero Library writes', async () => {
    const p = { ...preExistingPdfAreaCrop(), library_item_id: 'lib-9' }; // linked or not: reset never syncs
    const { client, writes } = fakeClient();
    const source = resolveCropResetSource(p.metadata, p.board_id, p.id)!;

    const { outcome, metadata } = await simulateReset(client, p, source);

    expect(outcome).toBe('complete');
    expect(metadata.imageUrl).toBe(DETERMINISTIC);
    expect(metadata.source).toEqual(p.metadata.source);
    expect(metadata).not.toHaveProperty('originalImageUrl');
    expect(metadata).not.toHaveProperty('drawing');
    expect(writes.map((w) => w.table)).toEqual(['padlets']);
  });

  it('H. after a successful PDF-area reset, the reset source disappears -- current image already equals the recovered original', async () => {
    const p = preExistingPdfAreaCrop();
    const { client } = fakeClient();
    const source = resolveCropResetSource(p.metadata, p.board_id, p.id)!;

    const { metadata: afterReset } = await simulateReset(client, p, source);

    expect(afterReset.imageUrl).toBe(DETERMINISTIC);
    expect(resolveCropResetSource(afterReset, p.board_id, p.id)).toBeNull();
  });

  it('I. missing or invalid board/padlet identity never fabricates a reset source', () => {
    const p = preExistingPdfAreaCrop();
    expect(resolveCropResetSource(p.metadata, null, p.id)).toBeNull();
    expect(resolveCropResetSource(p.metadata, undefined, p.id)).toBeNull();
    expect(resolveCropResetSource(p.metadata, p.board_id, null)).toBeNull();
    expect(resolveCropResetSource(p.metadata, 'not-a-uuid', p.id)).toBeNull();
    expect(resolveCropResetSource(p.metadata, p.board_id, 'not-a-uuid')).toBeNull();
  });

  it('C/M/N. same operation, freeform context: writes only padlets, zero Library updates, syncLibrary default untouched elsewhere', async () => {
    const p = { ...preExistingPdfAreaCrop(), library_item_id: 'lib-shared' };
    const { client, writes } = fakeClient();
    const source = resolveCropResetSource(p.metadata, p.board_id, p.id)!;
    await simulateReset(client, p, source);
    expect(writes.map((w) => w.table)).toEqual(['padlets']);
    expect(writes.every((w) => w.id === PADLET_ID)).toBe(true);
  });
});

describe('CROP_ORIGINAL_PRESERVATION_1: compatibility', () => {
  it('J. PDF-area provenance and source metadata remain intact through crop and reset', async () => {
    const p = annotatedPdfAreaPost();
    const before = JSON.parse(JSON.stringify(p.metadata.source));

    const { client: client1 } = fakeClient();
    const { metadata: afterCrop } = await simulateCrop(client1, p, CROPPED);
    expect(afterCrop.source).toEqual(before);

    const { client: client2 } = fakeClient();
    const { metadata: afterReset } = await simulateReset(
      client2, { ...p, metadata: afterCrop }, afterCrop.originalImageUrl as string,
    );
    expect(afterReset.source).toEqual(before);
  });

  it('K. duplicate/import metadata compatibility remains intact through crop and reset', async () => {
    const p = {
      ...annotatedPdfAreaPost(),
      metadata: {
        ...annotatedPdfAreaPost().metadata,
        importProvider: 'google-drive',
        importItemId: 'item-1',
        importFileName: 'photo.png',
      },
    };

    const { client: client1 } = fakeClient();
    const { metadata: afterCrop } = await simulateCrop(client1, p, CROPPED);
    expect(afterCrop.importProvider).toBe('google-drive');
    expect(afterCrop.importItemId).toBe('item-1');
    expect(afterCrop.importFileName).toBe('photo.png');

    const { client: client2 } = fakeClient();
    const { metadata: afterReset } = await simulateReset(
      client2, { ...p, metadata: afterCrop }, afterCrop.originalImageUrl as string,
    );
    expect(afterReset.importProvider).toBe('google-drive');
    expect(afterReset.importItemId).toBe('item-1');
    expect(afterReset.importFileName).toBe('photo.png');
  });

  it('I. an ordinary (non-PDF, non-linked) Image crops and resets the same way', async () => {
    const p = { id: 'post-legacy', library_item_id: null, title: 'Legacy', width: 300, height: 200, metadata: { imageUrl: BASE } };
    const { client: client1 } = fakeClient();
    const { metadata: afterCrop } = await simulateCrop(client1, p, CROPPED);
    expect(afterCrop.originalImageUrl).toBe(BASE);

    const { client: client2, writes: writes2 } = fakeClient();
    const { metadata: afterReset } = await simulateReset(client2, { ...p, metadata: afterCrop }, BASE);
    expect(afterReset.imageUrl).toBe(BASE);
    expect(writes2.map((w) => w.table)).toEqual(['padlets']);
  });
});

describe('the crop arm is wired to the durable authority', () => {
  const canvasClient = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
  const cropArm = canvasClient.slice(
    canvasClient.indexOf('<ImageCropLayer'),
    canvasClient.indexOf('/>', canvasClient.indexOf('Failed to save cropped image')));

  it('saves through persistDurableImageContent, not a metadata-only command', () => {
    expect(cropArm).toContain('persistDurableImageContent');
    expect(cropArm).toContain('libraryItemId');
    expect(cropArm).toContain('imageUrl: croppedDataUrl');
    expect(cropArm).not.toContain('updatePostMetadataBestEffort');
  });

  it('takes the current composite as its input', () => {
    expect(cropArm).toContain('resolveImagePostDisplaySrc(cropPadlet)');
  });

  it('spreads metadata and clears the baked-in vectors', () => {
    expect(cropArm).toContain('...cropPadlet.metadata');
    for (const cleared of ['drawing: null', 'drawingPaths: null', 'drawingText: null']) {
      expect(cropArm).toContain(cleared);
    }
  });

  it('leaves the Draw arm starting from the base image', () => {
    // The Draw layer's own imageUrl prop, isolated -- drawing onto a composite
    // would bake each pass in permanently, so only crop reads the composite.
    const drawStart = canvasClient.indexOf('<ImageDrawingLayer');
    const drawImageUrlProp = canvasClient.slice(
      canvasClient.indexOf('imageUrl=', drawStart),
      canvasClient.indexOf('\n', canvasClient.indexOf('imageUrl=', drawStart)));
    expect(drawImageUrlProp).toContain('drawingPadlet.metadata?.imageUrl');
    expect(drawImageUrlProp).not.toContain('resolveImagePostDisplaySrc');
  });
});

/**
 * CROP_ORIGINAL_PRESERVATION_CORRECTION_1 wiring. Supplementary to the
 * behavioral proofs above and below (which exercise the real helpers
 * directly) -- this only confirms CanvasClient.tsx's crop arm, its ONE
 * shared resetImageCrop operation, and FreeformPadletCards' live toolbar
 * all call through the same real functions rather than reimplementing.
 */
describe('the crop arm and the ONE shared Reset Crop operation are wired to placement-only persistence', () => {
  const canvasClient = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
  const freeform = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'), 'utf8');
  const cropArm = canvasClient.slice(
    canvasClient.indexOf('<ImageCropLayer'),
    canvasClient.indexOf('/>', canvasClient.indexOf('Failed to save cropped image')));
  const resetImageCropFn = canvasClient.slice(
    canvasClient.indexOf('const resetImageCrop = useCallback'),
    canvasClient.indexOf('}, [supabase, canEditBoardContentProbe, fetchData]);'));

  it('crop derives the original via the shared helper and opts out of Library sync', () => {
    expect(cropArm).toContain('deriveCropOriginalImageUrl(cropPadlet.metadata)');
    expect(cropArm).toContain('syncLibrary: false');
  });

  it('resetImageCrop -- the ONE shared operation -- resolves the shared source, builds via the shared helper, and opts out of Library sync', () => {
    expect(resetImageCropFn).toContain('resolveCropResetSource(');
    expect(resetImageCropFn).toContain('buildResetCropMetadata(');
    expect(resetImageCropFn).toContain('syncLibrary: false');
    expect(resetImageCropFn).toContain('persistDurableImageContent');
    expect(resetImageCropFn).not.toContain('updatePostMetadataBestEffort');
  });

  it('the non-freeform toolbar calls resetImageCrop -- no second inline reset implementation', () => {
    expect(canvasClient).toContain('canResetCrop={Boolean(activeImageToolbarOriginalUrl)}');
    expect(canvasClient).toContain("onResetCrop={() => resetImageCrop(activeImageToolbarPadlet)}");
    // The old inline body -- a duplicate of resetImageCrop -- must be gone.
    expect(canvasClient).not.toContain('onResetCrop={async () => {');
  });

  it('CanvasClient hands FreeformPadletCards the SAME resetImageCrop function', () => {
    expect(canvasClient).toContain('onResetImageCrop={resetImageCrop}');
  });

  it('FreeformPadletCards\' live toolbar calls the passed-in operation -- no second implementation', () => {
    expect(freeform).toContain('canResetCrop={Boolean(activeImageToolbarResetSource)}');
    expect(freeform).toContain('onResetCrop={() => onResetImageCrop?.(activeImageToolbarPadlet)}');
    expect(freeform).not.toContain('persistDurableImageContent');
    // Wired into the LIVE toolbar (the portalled overlay), not the dead,
    // permanently-disabled `{false && ...}` in-card branch -- the wiring
    // above appears exactly once.
    expect(freeform.match(/canResetCrop=\{Boolean\(activeImageToolbarResetSource\)\}/g) ?? []).toHaveLength(1);
  });

  it('both toolbars resolve the reset source through the same shared function', () => {
    expect(canvasClient).toContain('resolveCropResetSource(activeImageToolbarPadlet.metadata, activeImageToolbarPadlet.board_id, activeImageToolbarPadlet.id)');
    expect(freeform).toContain('resolveCropResetSource(activeImageToolbarPadlet.metadata, activeImageToolbarPadlet.board_id, activeImageToolbarPadlet.id)');
  });
});

describe('7. the flattened composite already carries strokes, shapes and text', () => {
  const layer = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/editors/ImageDrawingLayer.tsx'), 'utf8');

  it('composites base, strokes, rectangles and text into one raster', () => {
    expect(layer).toContain('ctx.drawImage(originalImg, 0, 0)');
    expect(layer).toContain('ctx.drawImage(strokesImg, 0, 0, canvas.width, canvas.height)');
    expect(layer).toContain('completedRects');
    expect(layer).toContain('ctx.fillText(');
    // That single raster is what the save publishes.
    expect(layer).toContain('onSave(canvas.toDataURL()');
  });
});

describe('Library tile fidelity', () => {
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/LibraryPanel.tsx'), 'utf8');

  it('5. an Image tile preserves aspect instead of re-cropping', () => {
    expect(panel).toContain("preview.type === 'image'");
    expect(panel).toContain('h-20 w-full object-contain');
  });

  it('6. every other thumbnail type keeps its existing fill', () => {
    expect(panel).toContain('h-20 w-full object-cover');
    // AI components and drawings still reach the same thumbnail slot.
    expect(panel).toContain("preview.type === 'ai-component'");
    expect(panel).toContain("preview.type === 'drawing'");
  });

  it('10. reuse still carries the durable Library identity', () => {
    expect(panel).toContain("JSON.stringify({ ...item.content, libraryItemId: item.id })");
    // Placement sizing stays board-local, from the snapshot -- untouched here.
    expect(panel).toContain('width: padletData.width || 300');
    expect(panel).toContain('height: padletData.height || 200');
  });
});
