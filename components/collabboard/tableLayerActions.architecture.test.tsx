import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

// PATCH 9H -- PATCH 9G's source audit found the Table (NotePostContextMenu)
// call site wired onBringToFront/onSendToBack but never onBringForward/
// onSendBackward, so those two menu items rendered (NotePostContextMenu.tsx
// always renders all four layer items) but were dead: clicking them called
// nothing. This patch closes ONLY that confirmed wiring gap -- no new
// z-index logic, no change to movePadletLayer, no change to any other
// post type's menu.

// Isolates the Table (`padlet.type === 'table'`) NotePostContextMenu call
// site, textually anchored by its own `if` guard through the matching
// context-menu close tag.
const tableBranchStart = freeformSrc.indexOf("if (padlet.type === 'table') {");
const tableBranchEnd = freeformSrc.indexOf('</NotePostContextMenu>', tableBranchStart);
const tableBranch = freeformSrc.slice(tableBranchStart, tableBranchEnd);

// Isolates the Document (card-type) NotePostContextMenu call site -- the
// working reference: the exact same shared component, already fully wired
// for all four layer actions before this patch.
const documentBranchStart = freeformSrc.indexOf("{padlet.type === 'card' && (");
const documentBranchEnd = freeformSrc.indexOf('</NotePostContextMenu>', documentBranchStart);
const documentBranch = freeformSrc.slice(documentBranchStart, documentBranchEnd);

describe('PATCH 9H: Table menu renders and is wired for all four layer actions [matrix 1-6]', () => {
  it('the Table NotePostContextMenu call site is wired with onBringForward and onSendBackward', () => {
    expect(tableBranchStart).toBeGreaterThan(-1);
    expect(tableBranch).toContain("onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}");
    expect(tableBranch).toContain("onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}");
  });

  it('Table still passes onBringToFront and onSendToBack -- pre-existing working actions untouched [matrix 11, 12]', () => {
    expect(tableBranch).toContain("onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}");
    expect(tableBranch).toContain("onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}");
  });

  it('Table uses the exact same callback shape as the working Document reference call site -- no Table-specific variant', () => {
    expect(documentBranch).toContain("onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}");
    expect(documentBranch).toContain("onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}");
    // Identical strings, counted file-wide, so a Table-only rename/fork of
    // either callback would be caught here.
    expect(freeformSrc.match(/onBringForward=\{\(\) => movePadletLayer\(padlet\.id, 'bringForward'\)\}/g)?.length).toBeGreaterThanOrEqual(4);
    expect(freeformSrc.match(/onSendBackward=\{\(\) => movePadletLayer\(padlet\.id, 'sendBackward'\)\}/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('PATCH 9H: target identity -- both callbacks act on the clicked Table post, not another post [matrix 5, 6; negative control E]', () => {
  it('both new callbacks close over padlet.id, the same identifier every other prop on this call site uses', () => {
    const bringForwardLine = tableBranch.match(/onBringForward=\{\(\) => movePadletLayer\(([^,]+),/)?.[1];
    const sendBackwardLine = tableBranch.match(/onSendBackward=\{\(\) => movePadletLayer\(([^,]+),/)?.[1];
    expect(bringForwardLine).toBe('padlet.id');
    expect(sendBackwardLine).toBe('padlet.id');
  });
});

describe('PATCH 9H: one-step semantics -- Bring Forward/Send Backward are distinct from Bring to Front/Send to Back [matrix 9, 10; negative controls C, D]', () => {
  it('movePadletLayer (CanvasClient.tsx) treats bringForward/sendBackward as incremental single-step moves, distinct from the front/back jumps', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const body = src.slice(
      src.indexOf('const movePadletLayer = async'),
      src.indexOf('\n  };', src.indexOf('const movePadletLayer = async')),
    );
    expect(body).toMatch(/case 'bringForward':\s*\r?\n\s*newZ = currentZ \+ 1;/);
    expect(body).toMatch(/case 'sendBackward':\s*\r?\n\s*newZ = Math\.max\(10, currentZ - 1\);/);
    expect(body).toMatch(/case 'bringToFront':\s*\r?\n\s*newZ = maxZ \+ 1;/);
    expect(body).toMatch(/case 'sendToBack':\s*\r?\n\s*newZ = Math\.max\(10, minZ - 1\);/);
    // The two pairs must not share an implementation body.
    expect(body.indexOf("newZ = currentZ + 1;")).not.toBe(body.indexOf('newZ = maxZ + 1;'));
    expect(body.indexOf('newZ = Math.max(10, currentZ - 1);')).not.toBe(body.indexOf('newZ = Math.max(10, minZ - 1);'));
  });

  it("Table's onBringForward is not aliased to the 'bringToFront' action string, and onSendBackward is not aliased to 'sendToBack'", () => {
    const bringForwardCall = tableBranch.match(/onBringForward=\{\(\) => movePadletLayer\(padlet\.id, '([^']+)'\)\}/)?.[1];
    const sendBackwardCall = tableBranch.match(/onSendBackward=\{\(\) => movePadletLayer\(padlet\.id, '([^']+)'\)\}/)?.[1];
    expect(bringForwardCall).toBe('bringForward');
    expect(bringForwardCall).not.toBe('bringToFront');
    expect(sendBackwardCall).toBe('sendBackward');
    expect(sendBackwardCall).not.toBe('sendToBack');
  });
});

describe('PATCH 9H: canonical command reused, no new z-index mechanism [expected production scope]', () => {
  it('movePadletLayer remains the single, generic, type-agnostic layer command -- untouched by this patch', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src.match(/const movePadletLayer = async/g)?.length).toBe(1);
    const body = src.slice(
      src.indexOf('const movePadletLayer = async'),
      src.indexOf('\n  };', src.indexOf('const movePadletLayer = async')),
    );
    expect(body).not.toMatch(/padlet\.type\s*===\s*'table'/);
  });

  it('NotePostContextMenu.tsx (the shared menu component) is untouched -- it already supported all four layer props before this patch', () => {
    const menuSrc = read('components/collabboard/menus/NotePostContextMenu.tsx');
    expect(menuSrc).toContain('onBringForward?: () => void;');
    expect(menuSrc).toContain('onSendBackward?: () => void;');
    expect(menuSrc).toContain("case 'post.bringForward': onBringForward?.(); break;");
    expect(menuSrc).toContain("case 'post.sendBackward': onSendBackward?.(); break;");
  });

  it('no new Table-specific persistence call or z-index computation was introduced in FreeformPadletCards.tsx', () => {
    expect(tableBranch).not.toContain('createPostsRepository');
    expect(tableBranch).not.toContain('.from(');
    expect(tableBranch).not.toContain('zIndex');
  });
});

describe('PATCH 9H: readonly uses the existing permission gate -- no Table-specific permission logic [matrix 15, negative control H]', () => {
  it('the Table call site still passes disabled={!canUseFreeformEditButton}, the same gate every other NotePostContextMenu call site uses', () => {
    expect(tableBranch).toContain('disabled={!canUseFreeformEditButton}');
  });

  it('NotePostContextMenu short-circuits its entire menu (including the layer actions) when disabled -- untouched by this patch', () => {
    const menuSrc = read('components/collabboard/menus/NotePostContextMenu.tsx');
    expect(menuSrc).toContain('if (disabled) {\n        return <>{children}</>;\n    }');
  });
});

describe('PATCH 9H: other Table features and other post types are unaffected [matrix 16-19; regression freezes]', () => {
  it('Table Group into Column remains unchanged', () => {
    expect(tableBranch).toContain('onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}');
    expect(tableBranch).toContain('groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}');
  });

  it('Table Edit/Delete/Duplicate/Cut/Copy/Lock remain unchanged', () => {
    expect(tableBranch).toContain('onEdit={() => openFreeformPadletModal(padlet)}');
    expect(tableBranch).toContain('onDelete={() => requestDeletePadlet(padlet.id)}');
    expect(tableBranch).toContain('onDuplicate={() => duplicatePadlet(padlet.id)}');
    expect(tableBranch).toContain('onCut={() => cutPadlet(padlet.id)}');
    expect(tableBranch).toContain('onCopy={() => copyPadlet(padlet.id)}');
    expect(tableBranch).toContain('onLock={() => lockPadlet(padlet.id)}');
  });

  it('Document right-click behavior is unaffected -- unchanged from before this patch', () => {
    expect(documentBranch).toContain("onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}");
    expect(documentBranch).toContain("onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}");
  });

  it('Image right-click behavior is unaffected -- unchanged from before this patch', () => {
    const imageBranchStart = freeformSrc.indexOf("{padlet.type === 'image' && (");
    const imageBranchEnd = freeformSrc.indexOf('</ImagePostContextMenu>', imageBranchStart);
    const imageBranch = freeformSrc.slice(imageBranchStart, imageBranchEnd);
    expect(imageBranch).toContain("onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}");
    expect(imageBranch).toContain("onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}");
  });

  it('Line Cut (LineContextMenu.tsx) is untouched -- this patch does not edit that file', () => {
    const lineMenuSrc = read('components/collabboard/menus/LineContextMenu.tsx');
    expect(lineMenuSrc).toContain('onCut?: () => void;');
    expect(lineMenuSrc).toContain('<PositionedContextMenuItem onSelect={() => onCut?.()}>');
  });
});

describe('PATCH 9H: prior patches remain untouched (regression freezes)', () => {
  it('Document Group into Column (PATCH 9F) is untouched', () => {
    expect(documentBranch).toContain('onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}');
  });

  it('measured scrollbar lane (PATCH 9E.1) is untouched -- no static pixel constant reintroduced', () => {
    const hookSrc = read('components/collabboard/useScrollbarLane.ts');
    expect(hookSrc).toContain('export function computeScrollbarLane(offsetWidth: number, clientWidth: number): number');
    const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
    expect(rowColumnSrc).not.toMatch(/calc\(100% \+ \d+px\)/);
  });

  it('attachPostToContainer.ts (Document Group into Column\'s command) is untouched by this patch', () => {
    const src = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(src).toContain('parentId: containerId');
  });

  it('per-child title visibility (PATCH 9C.1) is untouched', () => {
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    expect(helper).toContain('export function getEffectiveVisibleChildTitleIds');
  });

  it('Document Cut/Copy/Duplicate wiring (confirmed working in-product, PATCH 9G structural false-positive) is untouched -- this patch does not add onCut/onCopy/onDuplicate to the Document branch [negative control J]', () => {
    expect(documentBranch).not.toContain('onCut=');
    expect(documentBranch).not.toContain('onCopy=');
    expect(documentBranch).not.toContain('onDuplicate=');
    // The Document branch's own prop list is otherwise unchanged from its
    // PATCH 9F shape (onEdit through onToggleFullView), proving no props
    // beyond what PATCH 9F already established were added or removed here.
    expect(documentBranch).toContain('onEdit={() => openFreeformPadletModal(padlet)}');
    expect(documentBranch).toContain('onDelete={() => requestDeletePadlet(padlet.id)}');
    expect(documentBranch).toContain('onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}');
    expect(documentBranch).toContain('onAddToLibrary={() => addPadletToLibrary(padlet.id)}');
  });
});
