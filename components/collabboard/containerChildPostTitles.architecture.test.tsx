import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('PATCH 9C: showChildPostTitles is a single preference on the parent Container, not on children', () => {
  it('RowColumnContainerCard reads the flag off the CONTAINER padlet metadata, keyed once, not per-child', () => {
    const src = read('components/collabboard/RowColumnContainerCard.tsx');
    expect(src).toContain('const showChildPostTitles = containerMetadata.showChildPostTitles === true;');
    // Exactly one flag read for the whole card -- not re-derived per child.
    expect(src.match(/showChildPostTitles === true/g)?.length).toBe(1);
  });

  it('PostCardContent (nested-Container-as-child render path) reads its OWN metadata flag independently', () => {
    const src = read('components/collabboard/PostCardContent.tsx');
    expect(src).toContain("const showChildPostTitles = (padlet.metadata as any)?.showChildPostTitles === true;");
  });

  it('the title source is the child\'s own live title field -- never copied/cached into Container metadata', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    // Reads child.title directly at render time.
    expect(rowColumn).toContain("typeof child.title === 'string' ? child.title.trim() : ''");
    expect(postCard).toContain("typeof child.title === 'string' ? child.title.trim() : ''");
    // No cached/duplicated title field is ever written onto Container metadata.
    expect(rowColumn).not.toMatch(/childTitles\s*:/);
    expect(rowColumn).not.toMatch(/cachedTitles\s*:/);
    expect(postCard).not.toMatch(/childTitles\s*:/);
  });

  it('untitled children render no title header at all (no invented "Untitled" placeholder)', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    const rowColumnRenderChildTitle = rowColumn.slice(
      rowColumn.indexOf('const renderChildTitle'),
      rowColumn.indexOf('const childIds'),
    );
    const postCardRenderChildTitle = postCard.slice(
      postCard.indexOf('const renderChildTitle'),
      postCard.indexOf('return (', postCard.indexOf('const renderChildTitle')),
    );
    expect(rowColumnRenderChildTitle).not.toContain('Untitled');
    expect(postCardRenderChildTitle).not.toContain('Untitled');
  });
});

describe('PATCH 9C: menu toggle persists via the existing Container metadata-update path (no new mechanism)', () => {
  it('FreeformPadletCards wires the toggle through updatePadletMetadata, the same callback other Container settings use', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).toContain('onToggleChildTitles={canUseFreeformEditButton');
    expect(src).toContain("updatePadletMetadata(padlet.id, { showChildPostTitles: !(padlet.metadata as any)?.showChildPostTitles })");
  });

  it('the toggle is gated by the same canUseFreeformEditButton readonly convention as onEdit/onDelete for this Container menu instance', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const containerMenuStart = src.indexOf("if (padlet.type === 'container') {");
    const containerMenuEnd = src.indexOf('</ColumnPostContextMenu>', containerMenuStart);
    const block = src.slice(containerMenuStart, containerMenuEnd);
    expect(block).toContain('onEdit={canUseFreeformEditButton ?');
    expect(block).toContain('onDelete={canUseFreeformEditButton ?');
    expect(block).toContain('onToggleChildTitles={canUseFreeformEditButton');
    // disabled={!canUseFreeformEditButton} on the menu itself hides the
    // entire menu (including this item) for readonly users, same as every
    // other Container action.
    expect(block).toContain('disabled={!canUseFreeformEditButton}');
  });
});

describe('PATCH 9C: Container Editor is untouched -- its titles remain unconditional', () => {
  it('ContainerEditor.tsx still always shows child titles, independent of the new canvas-only flag', () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    expect(src).toContain('{child.title || getDisplayTitle(child.type)}');
    expect(src).not.toContain('showChildPostTitles');
  });
});

describe('PATCH 9C: prior patches remain untouched (regression guards)', () => {
  it('Group into Column (PATCH 9A) still delegates to attachPostToContainer', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain("import { attachPostToContainer } from '@/components/collabboard/canvas/hooks/attachPostToContainer';");
    expect(src).toContain('await attachPostToContainer({');
  });

  it('Replace Image (PATCH 9B) still uses createStorageGateway, not base64/openImagePostEditor', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const start = src.indexOf('const replaceImage = (id: string) => {');
    const end = src.indexOf('const imageExtensionFromMimeType', start);
    const body = src.slice(start, end);
    expect(body).toContain('createStorageGateway()');
    expect(body).not.toContain('openImagePostEditor');
  });

  it('Download Original Image (PATCH 9B.1) still resolves metadata.imageUrl || file_url || metadata.fileUrl and shows a visible error on failure', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain('padlet.metadata?.imageUrl || padlet.file_url || (padlet.metadata as any)?.fileUrl');
    expect(src).toContain("toast.error('This image has no downloadable source')");
  });

  it('Crop Image to Fit Dot Grid (PATCH 9B) still uses the shared grid constant, untouched by the title toggle', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).toContain('IMAGE_CROP_TO_GRID_HEIGHT_PX');
    expect(src).toContain("(padlet.metadata as any)?.cropToGrid === true");
  });
});
