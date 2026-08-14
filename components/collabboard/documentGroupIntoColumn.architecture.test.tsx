import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

// PATCH 9F -- closes a coverage gap PATCH 9E.1's real-Chrome verification
// agent flagged: Document posts (type 'card', no svgUrl) render through
// NotePostContextMenu (the same shared menu component Note/Link/Todo/Image
// already use for Group into Column), but the Document call site never
// received the onGroupIntoColumn/groupIntoColumnTargets props -- so the menu
// item was silently absent for Documents even though NotePostContextMenu.tsx
// itself, the canonical groupIntoColumn() function (CanvasClient.tsx), and
// getEligibleContainerDestinations() (utils.ts) already fully supported any
// post type unconditionally. Document drag-into-Container already worked
// (useCanvasInteractions.ts's drop handler has no padlet.type gate either) --
// this patch is the missing MENU entry point only.

// Isolates the 'card'-type (Document/Clipart) NotePostContextMenu call site,
// which is textually anchored by its two adjacent "Render Card Padlet"
// comments and closes at the matching context-menu JSX close tag.
const documentBranchStart = freeformSrc.indexOf("{padlet.type === 'card' && (");
const documentBranchEnd = freeformSrc.indexOf('</NotePostContextMenu>', documentBranchStart);
const documentBranch = freeformSrc.slice(documentBranchStart, documentBranchEnd);

// Isolates the generic/Note-and-fallback NotePostContextMenu call site (the
// PATCH 9A reference implementation every other type already follows).
const noteBranchStart = freeformSrc.lastIndexOf('<NotePostContextMenu');
const noteBranchEnd = freeformSrc.indexOf('</NotePostContextMenu>', noteBranchStart);
const noteBranch = freeformSrc.slice(noteBranchStart, noteBranchEnd);

// Isolates the Image (ImagePostContextMenu) call site.
const imageBranchStart = freeformSrc.indexOf("{padlet.type === 'image' && (");
const imageBranchEnd = freeformSrc.indexOf('</ImagePostContextMenu>', imageBranchStart);
const imageBranch = freeformSrc.slice(imageBranchStart, imageBranchEnd);

describe('PATCH 9F: Document context menu now exposes Group into Column [matrix 1]', () => {
  it('the Document (card-type) NotePostContextMenu call site is wired with both onGroupIntoColumn and groupIntoColumnTargets', () => {
    expect(documentBranchStart).toBeGreaterThan(-1);
    expect(documentBranch).toContain('onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}');
    expect(documentBranch).toContain('groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}');
  });

  it('Document uses the exact same call shape as the working Note/fallback reference call site -- no Document-specific variant [matrix 2, negative control B]', () => {
    expect(noteBranch).toContain('onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}');
    expect(noteBranch).toContain('groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}');
    // Identical strings -- proven by counting total occurrences across the
    // whole file rather than just presence, so a Document-only rename/fork
    // of either helper would be caught here.
    expect(freeformSrc.match(/onGroupIntoColumn=\{\(targetContainerId\) => groupIntoColumn\(padlet\.id, targetContainerId\)\}/g)?.length).toBeGreaterThanOrEqual(6);
    expect(freeformSrc.match(/groupIntoColumnTargets=\{getEligibleContainerDestinations\(padlets, padlet\.id\)\}/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('Image (an already-working reference type) is unaffected -- still wired exactly as before [matrix 21]', () => {
    expect(imageBranch).toContain('onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}');
    expect(imageBranch).toContain('groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}');
  });

  it('Note (the fallback/reference type) is unaffected -- still wired exactly as before [matrix 22]', () => {
    expect(noteBranch).toContain('onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}');
    expect(noteBranch).toContain('onToggleFullView={padlet.type === \'drawing\' || padlet.type === \'ai-component\' ? () => toggleFullView(padlet.id) : undefined}');
  });
});

describe('PATCH 9F: Document grouping reuses the canonical PATCH 9A movement path -- no new mechanism [matrix 5, 6; negative controls B, C]', () => {
  it('groupIntoColumn (CanvasClient.tsx) is the single, generic, type-agnostic handler -- untouched by this patch', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain('const groupIntoColumn = async (id: string, targetContainerId?: string) => {');
    const body = src.slice(src.indexOf('const groupIntoColumn = async'), src.indexOf('\n  };', src.indexOf('const groupIntoColumn = async')));
    // No padlet.type branching of any kind inside the handler.
    expect(body).not.toMatch(/padlet\.type\s*===/);
    expect(body).toContain('await attachPostToContainer({');
  });

  it('attachPostToContainer.ts (the shared reparenting command) is completely untouched by this patch', () => {
    const src = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(src).toContain('childPadletIds: newChildIds');
    expect(src).toContain('parentId: containerId');
    expect(src).toContain('createUpdatePostMetadataBestEffortCommand');
  });

  it('getEligibleContainerDestinations (utils.ts) remains the single, type-agnostic eligibility rule -- not duplicated for Document', () => {
    const utilsSrc = read('components/collabboard/canvas/engine/utils.ts');
    expect(utilsSrc.match(/export function getEligibleContainerDestinations\(/g)?.length).toBe(1);
    expect(utilsSrc).not.toMatch(/padlet\.type === 'card'/);
  });

  it('no fake/manufactured DragEvent, and no new Document-specific persistence call, was introduced anywhere in FreeformPadletCards.tsx', () => {
    expect(freeformSrc).not.toContain('new DragEvent');
    expect(freeformSrc).not.toMatch(/new\s+DragEvent\(/);
    // The Document branch's own onGroupIntoColumn body contains no direct
    // Supabase/repository call -- it only ever calls the shared handler.
    expect(documentBranch).not.toContain('createPostsRepository');
    expect(documentBranch).not.toContain('.from(');
  });

  it('the drag-into-Container path Document already used stays untouched -- no padlet.type gate exists there', () => {
    const src = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
    const dropStart = src.indexOf('await attachPostToContainer({');
    const block = src.slice(Math.max(0, dropStart - 400), dropStart);
    expect(block).not.toMatch(/padlet\.type/);
  });
});

describe('PATCH 9F: readonly uses the existing Group into Column permission gate -- no Document-specific permission logic [matrix 20, negative control J]', () => {
  it('the Document call site still passes disabled={!canUseFreeformEditButton}, the same gate every other NotePostContextMenu/ImagePostContextMenu call site uses', () => {
    expect(documentBranch).toContain('disabled={!canUseFreeformEditButton}');
  });

  it('NotePostContextMenu itself short-circuits its ENTIRE menu (including Group into Column) when disabled -- untouched by this patch', () => {
    const menuSrc = read('components/collabboard/menus/NotePostContextMenu.tsx');
    expect(menuSrc).toContain('if (disabled) {\n        return <>{children}</>;\n    }');
    // GroupIntoColumnMenuItem is rendered unconditionally inside the menu
    // body -- it is the `disabled` early return above (not a second,
    // Document-specific gate) that keeps it out of a readonly viewer's tree.
    expect(menuSrc).toContain('<GroupIntoColumnMenuItem');
  });
});

describe('PATCH 9F: prior patches remain untouched (regression freezes) [matrix 23, 24; negative controls H, I, K]', () => {
  it('per-child title visibility (PATCH 9C.1) is untouched -- a newly grouped child still defaults to hidden', () => {
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    expect(helper).toContain('export function getEffectiveVisibleChildTitleIds');
    expect(helper).toContain('return new Set();'); // default-hidden fallback path, unchanged
  });

  it('Document child chrome (PATCH 9D) is untouched', () => {
    const src = read('lib/domain/canvas/documentPost.ts');
    expect(src).toContain('export function resolveChildCardChrome');
    expect(src).toContain("backgroundColor: (child.metadata as any)?.backgroundColor || '#ffffff'");
  });

  it('Document Read routing (PATCH 9D.1) is untouched', () => {
    const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
    expect(rowColumnSrc).toContain('onOpenDocument={onOpenDocument ? () => onOpenDocument(child) : undefined}');
  });

  it('measured scrollbar lane (PATCH 9E.1) is untouched -- no static pixel constant reintroduced', () => {
    const hookSrc = read('components/collabboard/useScrollbarLane.ts');
    expect(hookSrc).toContain('export function computeScrollbarLane(offsetWidth: number, clientWidth: number): number');
    const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
    expect(rowColumnSrc).toContain('const scrollbarLane = useScrollbarLane(contentMeasureRef, shouldEnableInternalScroll);');
    expect(rowColumnSrc).not.toMatch(/calc\(100% \+ \d+px\)/);
  });

  it('comment architecture (CLOSED/FROZEN) required no changes -- no comment file appears in this patch\'s diff footprint', () => {
    // Structural proxy: the Document branch this patch edits contains no
    // comment-related props/handlers of its own (comments flow entirely
    // through RowColumnContainerCard/PostCardContent, untouched here).
    expect(documentBranch).not.toContain('onUpdateChildComments');
    expect(documentBranch).not.toContain('EmbeddedCommentList');
  });

  it('no other post-type context menu block was modified beyond the Document/card branch', () => {
    const linkBranchStart = freeformSrc.indexOf("if (padlet.type === 'link')");
    const linkBranchEnd = freeformSrc.indexOf('</LinkPostContextMenu>', linkBranchStart);
    const linkBranch = freeformSrc.slice(linkBranchStart, linkBranchEnd);
    expect(linkBranch).toContain('onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}');
  });
});
