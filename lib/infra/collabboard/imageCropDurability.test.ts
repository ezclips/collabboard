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
import { persistDurableImageContent } from './imageDurableContent';

const BASE = 'data:image/png;base64,ORIGINALBASE';
const ANNOTATED = 'data:image/png;base64,ANNOTATEDCOMPOSITE';
const CROPPED = 'data:image/png;base64,CROPPEDCURRENT';

function fakeClient() {
  const writes: { table: string; values: Record<string, unknown>; id: string }[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        return {
          update(values: Record<string, unknown>) {
            return { eq: (_c: string, id: string) => { writes.push({ table, values, id }); return Promise.resolve({ error: null }); } };
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
      padletId: 'post-legacy', libraryItemId: null, imageUrl: CROPPED,
      metadata: { imageUrl: CROPPED, drawing: null, drawingPaths: null, drawingText: null },
      title: 'Legacy', width: 300, height: 200,
    })).resolves.toBeUndefined();
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
