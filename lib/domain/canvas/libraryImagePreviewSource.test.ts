// Library Image tile display source.
//
// Runtime proved the defect: after one Draw save the Library row held the
// annotated composite in `thumbnail_url`, `content.file_url` AND
// `content.metadata.drawing`, and the Personal Library tile still painted
// `content.metadata.imageUrl` -- the base crop the editor starts from, which is
// always present and therefore always won.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLibraryImagePreviewSrc } from './libraryImagePreviewSource';

/** The saved composite is a data URL; a tiny synthetic one is enough. */
const COMPOSITE = 'data:image/png;base64,AAAACOMPOSITE';
const BASE = '/api/boards/board-1/padlets/post-1/image';

describe('resolveLibraryImagePreviewSrc', () => {
  it('1. the proven runtime shape shows the annotated composite, not the base', () => {
    const item = {
      thumbnail_url: COMPOSITE,
      content: {
        file_url: COMPOSITE,
        metadata: { imageUrl: BASE, drawing: COMPOSITE },
      },
    };
    expect(resolveLibraryImagePreviewSrc(item)).toBe(COMPOSITE);
    expect(resolveLibraryImagePreviewSrc(item)).not.toBe(BASE);
  });

  it('2. the Library row\'s own thumbnail_url outranks a stale base', () => {
    expect(resolveLibraryImagePreviewSrc({
      thumbnail_url: 'current-thumbnail',
      content: { metadata: { imageUrl: 'stale-base' } },
    })).toBe('current-thumbnail');
  });

  it('3. without a thumbnail, the durable content raster still outranks the base', () => {
    expect(resolveLibraryImagePreviewSrc({
      content: { file_url: 'current-file', metadata: { imageUrl: 'old-base' } },
    })).toBe('current-file');
  });

  it('4. a saved drawing composite beats the base it was drawn on', () => {
    // Rows written before the durable fields carried the composite.
    expect(resolveLibraryImagePreviewSrc({
      content: { metadata: { drawing: 'saved-drawing', imageUrl: 'base' } },
    })).toBe('saved-drawing');
  });

  it('5. a legacy Image with only a base still renders exactly as before', () => {
    expect(resolveLibraryImagePreviewSrc({
      content: { metadata: { imageUrl: 'legacy-image' } },
    })).toBe('legacy-image');
    // The rest of the original chain is still reachable, in its original order.
    expect(resolveLibraryImagePreviewSrc({
      content: { metadata: { previewUrl: 'preview', imageUrl: 'base' } },
    })).toBe('preview');
    expect(resolveLibraryImagePreviewSrc({
      content: { metadata: { file_url: 'meta-file' } },
    })).toBe('meta-file');
    expect(resolveLibraryImagePreviewSrc({
      content: { metadata: { linkImage: 'link-image' } },
    })).toBe('link-image');
  });

  it('8. a data URL is accepted like any other representation', () => {
    expect(resolveLibraryImagePreviewSrc({ thumbnail_url: COMPOSITE })).toBe(COMPOSITE);
    expect(resolveLibraryImagePreviewSrc({ content: { file_url: COMPOSITE } })).toBe(COMPOSITE);
  });

  it('handles absent, empty and non-string fields without inventing a source', () => {
    expect(resolveLibraryImagePreviewSrc(null)).toBeNull();
    expect(resolveLibraryImagePreviewSrc(undefined)).toBeNull();
    expect(resolveLibraryImagePreviewSrc({})).toBeNull();
    expect(resolveLibraryImagePreviewSrc({ content: { metadata: null } })).toBeNull();
    // Blank and non-string values are skipped rather than painted.
    expect(resolveLibraryImagePreviewSrc({
      thumbnail_url: '   ', content: { file_url: 42 as never, metadata: { imageUrl: 'base' } },
    })).toBe('base');
  });

  it('7. the resolver is pure: it reads and returns, and mutates nothing', () => {
    const item = {
      thumbnail_url: COMPOSITE,
      content: { file_url: COMPOSITE, metadata: { imageUrl: BASE, drawing: COMPOSITE } },
    };
    const snapshot = JSON.stringify(item);
    resolveLibraryImagePreviewSrc(item);
    resolveLibraryImagePreviewSrc(item);
    expect(JSON.stringify(item)).toBe(snapshot);
  });
});

describe('the Library panel wiring', () => {
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/LibraryPanel.tsx'), 'utf8');
  const resolveBlock = panel.slice(
    panel.indexOf('function resolvePreview'), panel.indexOf('// Subtitle / snippet'));

  it('routes Image tiles through the resolver', () => {
    expect(resolveBlock).toContain('resolveLibraryImagePreviewSrc(item)');
    expect(resolveBlock).toContain("t === 'image'");
  });

  it('6. leaves every non-image preview chain exactly as it was', () => {
    // The original chain survives verbatim for links, notes, todos and the rest.
    for (const field of [
      'c.metadata?.previewUrl',
      'c.metadata?.imageUrl',
      'c.file_url',
      'c.metadata?.file_url',
      'c.metadata?.linkImage',
    ]) {
      expect(resolveBlock).toContain(field);
    }
  });

  it('7b. rendering a tile performs no write', () => {
    // A display fix must not repair data: no Supabase write reachable from the
    // preview path.
    expect(resolveBlock).not.toContain('update(');
    expect(resolveBlock).not.toContain('upsert(');
    expect(resolveBlock).not.toContain('insert(');
  });

  it('does not disturb the board/editor display authority', () => {
    const shared = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/canvas/imagePostDisplaySource.ts'), 'utf8');
    // The board still prefers the composite, and the editors still start from
    // the base -- this patch changed neither.
    expect(shared).toContain('if (usableUrl(metadata?.drawing)) return metadata.drawing;');
    expect(shared).toContain('if (usableUrl(metadata?.imageUrl)) return metadata.imageUrl;');
  });
});
