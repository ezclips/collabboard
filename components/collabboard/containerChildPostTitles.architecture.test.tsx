import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('PATCH 9C.1: visibleChildPostTitleIds is a per-relationship preference on the parent Container, never on children', () => {
  it('RowColumnContainerCard and PostCardContent both derive visibility via the shared containerChildTitleVisibility helper, keyed off CONTAINER metadata', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    expect(rowColumn).toContain("import { getEffectiveVisibleChildTitleIds, resolveVisibleChildTitle } from \"@/lib/infra/collabboard/containerChildTitleVisibility\";");
    expect(rowColumn).toContain('const visibleChildTitleIds = getEffectiveVisibleChildTitleIds(containerMetadata, childPadlets);');
    expect(postCard).toContain('import { getEffectiveVisibleChildTitleIds, resolveVisibleChildTitle } from "@/lib/infra/collabboard/containerChildTitleVisibility";');
    expect(postCard).toContain('const visibleChildTitleIds = getEffectiveVisibleChildTitleIds(padlet.metadata as any, children);');
  });

  it('the visibility relationship is never stored on child.metadata -- only child IDs live on the parent Container', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    for (const src of [rowColumn, postCard, helper]) {
      expect(src).not.toMatch(/child\.metadata[^\n]*visibleChildPostTitleIds/);
      expect(src).not.toMatch(/child\.metadata[^\n]*showChildPostTitles/);
    }
  });

  it('the title source is the child\'s own live title field -- never copied/cached into Container metadata', () => {
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    expect(helper).toContain('typeof child.title === "string" ? child.title.trim() : ""');
    expect(helper).not.toMatch(/childTitles\s*:/);
    expect(helper).not.toMatch(/cachedTitles\s*:/);
  });

  it('untitled children render no title header at all (no invented "Untitled" placeholder, no type-name fallback)', () => {
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    const resolveFn = helper.slice(helper.indexOf('export function resolveVisibleChildTitle'), helper.indexOf('export function toggleChildPostTitleVisibility'));
    expect(resolveFn).not.toContain('Untitled');
    expect(resolveFn).not.toContain('getDisplayTitle');
    expect(resolveFn).not.toContain('getContainerEditTargetLabel');
  });
});

describe('PATCH 9C.1: menu label fallback (getContainerEditTargetLabel) is used ONLY for menu identification, never for canvas rendering', () => {
  it('ColumnPostContextMenu\'s Post-titles submenu reuses the Edit-post submenu\'s label resolver (resolveOpenTargetLabel / getContainerEditTargetLabel)', () => {
    const src = read('components/collabboard/menus/ColumnPostContextMenu.tsx');
    const start = src.indexOf('<ContextMenuSubTrigger>Post titles</ContextMenuSubTrigger>');
    const submenuBlock = src.slice(start, src.indexOf('</ContextMenuSub>', start));
    expect(submenuBlock).toContain('resolveOpenTargetLabel(target)');
  });

  it('the on-canvas renderers never import or call getContainerEditTargetLabel / getDisplayTitle', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    expect(rowColumn).not.toContain('getContainerEditTargetLabel');
    // PostCardContent legitimately imports getMeaningfulTitle for unrelated
    // caption/title-style rendering elsewhere in the file; only the
    // Container-child title path is asserted here.
    const containerBranch = postCard.slice(postCard.indexOf('if (type === "container")'), postCard.indexOf('// --- CARD / CLIPART TYPE ---'));
    expect(containerBranch).not.toContain('getContainerEditTargetLabel');
    expect(containerBranch).not.toContain('getDisplayTitle');
  });
});

describe('PATCH 9C.1: Post titles submenu persists via the existing Container metadata-update path (no new mechanism)', () => {
  it('FreeformPadletCards wires the per-child toggle through updatePadletMetadata, the same callback other Container settings use', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).toContain('onTogglePostTitleVisibility={canUseFreeformEditButton');
    expect(src).toContain('const nextIds = toggleChildPostTitleVisibility(padlet.metadata as any, containerChildPadlets, childId);');
    expect(src).toContain('updatePadletMetadata(padlet.id, { visibleChildPostTitleIds: nextIds, showChildPostTitles: false });');
  });

  it('the toggle is gated by the same canUseFreeformEditButton readonly convention as onEdit/onDelete for this Container menu instance', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const containerMenuStart = src.indexOf("if (padlet.type === 'container') {");
    const containerMenuEnd = src.indexOf('</ColumnPostContextMenu>', containerMenuStart);
    const block = src.slice(containerMenuStart, containerMenuEnd);
    expect(block).toContain('onEdit={canUseFreeformEditButton ?');
    expect(block).toContain('onDelete={canUseFreeformEditButton ?');
    expect(block).toContain('onTogglePostTitleVisibility={canUseFreeformEditButton');
    // disabled={!canUseFreeformEditButton} on the menu itself hides the
    // entire menu (including this submenu) for readonly users, same as
    // every other Container action.
    expect(block).toContain('disabled={!canUseFreeformEditButton}');
  });

  it('the submenu reuses the same child inventory as Edit post > (openTargets / containerChildPadlets), not a second discovery algorithm', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const containerMenuStart = src.indexOf("if (padlet.type === 'container') {");
    const containerMenuEnd = src.indexOf('</ColumnPostContextMenu>', containerMenuStart);
    const block = src.slice(containerMenuStart, containerMenuEnd);
    expect(block).toContain('openTargets={canUseFreeformEditButton ? containerChildPadlets : undefined}');
    expect(block).toContain('postTitleVisibleIds={Array.from(getEffectiveVisibleChildTitleIds(padlet.metadata as any, containerChildPadlets))}');
    // containerChildPadlets is computed exactly once for this Container
    // instance and shared by both submenus/props -- not rediscovered.
    const declarationCount = (src.match(/const containerChildPadlets: Padlet\[\] =/g) ?? []).length;
    expect(declarationCount).toBe(1);
  });
});

describe('PATCH 9C.1: the old global toggle is fully retired', () => {
  it('ColumnPostContextMenu no longer exposes onToggleChildTitles/childTitlesVisible', () => {
    const src = read('components/collabboard/menus/ColumnPostContextMenu.tsx');
    expect(src).not.toContain('onToggleChildTitles');
    expect(src).not.toContain('childTitlesVisible');
    expect(src).not.toContain('Show post titles');
    expect(src).not.toContain('Hide post titles');
  });

  it('no production file still writes the legacy showChildPostTitles as an active control path outside the documented compatibility helper', () => {
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    // The only allowed appearance is neutralizing it to false when an
    // explicit list is written (see the persistence test above).
    const matches = freeform.match(/showChildPostTitles/g) ?? [];
    expect(matches.length).toBe(1);
    expect(freeform).toContain('showChildPostTitles: false');
  });
});

describe('PATCH 9C.1: movement / grouping behavior', () => {
  it('a newly-grouped child (not yet in the explicit list) defaults hidden -- no code path adds a new child ID automatically [matrix 28]', () => {
    const attach = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(attach).not.toContain('visibleChildPostTitleIds');
    expect(attach).not.toContain('showChildPostTitles');
  });

  it('moving a child to a different Container cannot carry visibility with it -- the preference is never read from or written to child.metadata anywhere in the codebase [matrix 29]', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    for (const src of [rowColumn, postCard, freeform]) {
      expect(src).not.toMatch(/child\.metadata\.visibleChildPostTitleIds/);
    }
  });
});

describe('PATCH 9C.1: Container Editor is untouched -- its titles remain unconditional', () => {
  it('ContainerEditor.tsx still always shows child titles using the type fallback, independent of the new per-child canvas state [matrix 32, 33]', () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    expect(src).toContain('{child.title || getDisplayTitle(child.type)}');
    expect(src).not.toContain('showChildPostTitles');
    expect(src).not.toContain('visibleChildPostTitleIds');
  });
});

describe('PATCH 9C.1: prior patches remain untouched (regression guards)', () => {
  it('Group into Column (PATCH 9A) still delegates to attachPostToContainer [matrix 20, 37]', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain("import { attachPostToContainer, cleanupGraphEdgesForContainerChild } from '@/components/collabboard/canvas/hooks/attachPostToContainer';");
    expect(src).toContain('await attachPostToContainer({');
  });

  it('Replace Image (PATCH 9B) still uses createStorageGateway, not base64/openImagePostEditor [matrix 21]', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const start = src.indexOf('const replaceImage = (id: string) => {');
    const end = src.indexOf('const imageExtensionFromMimeType', start);
    const body = src.slice(start, end);
    expect(body).toContain('createStorageGateway()');
    expect(body).not.toContain('openImagePostEditor');
  });

  it('Download Original Image (PATCH 9B.1) still resolves metadata.imageUrl || file_url || metadata.fileUrl and shows a visible error on failure [matrix 21]', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain('padlet.metadata?.imageUrl || padlet.file_url || (padlet.metadata as any)?.fileUrl');
    expect(src).toContain("toast.error('This image has no downloadable source')");
  });

  it('Crop Image to Fit Dot Grid (PATCH 9B) still uses the shared grid constant, untouched by the title submenu [matrix 21]', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).toContain('IMAGE_CROP_TO_GRID_HEIGHT_PX');
    expect(src).toContain("(padlet.metadata as any)?.cropToGrid === true");
  });
});
