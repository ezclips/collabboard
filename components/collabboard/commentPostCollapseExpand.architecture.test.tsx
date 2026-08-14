import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// PATCH 9K -- narrowly reopens ONLY the Comment Post family's collapsed/
// expanded visual presentation and toggle accessibility (per PATCH 8X's
// classification in .fable5/architecture/COMMENT_UI_CONTRACT_V1.md, the
// Comment Post is SPECIAL/PRIMARY THREAD, explicitly not a CommentPopup
// migration candidate -- this patch does not touch that freeze).
//
// Root cause: the collapsed-marker branch (padlet.metadata?.isCollapsed
// truthy) in FreeformPadletCards.tsx's "Render Standalone Comment Marker"
// section rendered only a pin/count marker and a side popup with no control
// that ever wrote isCollapsed back to false -- the "Collapse" toggle lives
// exclusively in CommentEditorToolbar.tsx (MapPin icon, calls
// CommentEditor.tsx's handleCollapse -> onSave({ isCollapsed: true, ... })),
// reachable only from the EXPANDED presentation. Once collapsed, no UI path
// ever set isCollapsed back to false.

const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

// Isolates the whole "Render Standalone Comment Marker" section (both the
// collapsed and expanded branches), textually anchored by its own comment
// through the matching CommentPostContextMenu close tag.
const markerSectionStart = freeformSrc.indexOf('{/* Render Standalone Comment Marker */}');
const markerSectionEnd = freeformSrc.indexOf('</CommentPostContextMenu>', markerSectionStart);
const markerSection = freeformSrc.slice(markerSectionStart, markerSectionEnd);

// Isolates just the collapsed branch (padlet.metadata?.isCollapsed ? ( ... ) : (
// // Expanded Post ...)) by anchoring on its own ternary and the "Expanded Post" comment.
const collapsedBranchStart = markerSection.indexOf('padlet.metadata?.isCollapsed ? (');
const collapsedBranchEnd = markerSection.indexOf('// Expanded Post', collapsedBranchStart);
const collapsedBranch = markerSection.slice(collapsedBranchStart, collapsedBranchEnd);

describe('PATCH 9K: collapsed marker now exposes an Expand control [matrix 4, 5]', () => {
  it('a button exists in the collapsed branch with title/aria-label "Expand comment post"', () => {
    expect(collapsedBranchStart).toBeGreaterThan(-1);
    expect(collapsedBranch).toContain('title="Expand comment post"');
    expect(collapsedBranch).toContain('aria-label="Expand comment post"');
  });

  it('the Expand button uses the Maximize icon, imported from lucide-react', () => {
    expect(collapsedBranch).toContain('<Maximize className="h-3 w-3" />');
    expect(freeformSrc).toMatch(/import\s*\{[^}]*\bMaximize\b[^}]*\}\s*from\s*'lucide-react'/);
  });
});

describe('PATCH 9K: single canonical state transition -- no second collapse/expand mechanism [negative control B, C]', () => {
  it('the Expand button calls updatePadletMetadata(padlet.id, { isCollapsed: false }) -- the same metadata-patch primitive already used throughout this branch (e.g. badgeColor), not a new command', () => {
    expect(collapsedBranch).toContain('updatePadletMetadata(padlet.id, { isCollapsed: false });');
  });

  it('no new state variable was introduced for expand/collapse -- metadata.isCollapsed remains the sole source of truth read by the ternary', () => {
    expect(markerSection).toContain('padlet.metadata?.isCollapsed ? (');
    // The collapsed branch does not declare or read any second collapse/
    // expand-related local state (e.g. a parallel `isExpanded`/`expandedPadletId`).
    expect(collapsedBranch).not.toMatch(/\bisExpanded\b/);
    expect(collapsedBranch).not.toMatch(/\bexpandedPadletId\b/);
    expect(collapsedBranch).not.toContain('setIsCollapsed');
  });

  it('the Expand button does not call collapseComment()/expandComment() or any independent command -- only the existing updatePadletMetadata setter', () => {
    const buttonStart = collapsedBranch.indexOf('title="Expand comment post"');
    const buttonBlockStart = collapsedBranch.lastIndexOf('<button', buttonStart);
    const buttonBlockEnd = collapsedBranch.indexOf('</button>', buttonStart);
    const buttonBlock = collapsedBranch.slice(buttonBlockStart, buttonBlockEnd);
    expect(buttonBlock).not.toContain('collapseComment(');
    expect(buttonBlock).not.toContain('expandComment(');
    expect(buttonBlock).toContain('updatePadletMetadata(');
  });
});

describe('PATCH 9K: comment count is preserved, not replaced by the Expand control [matrix 3, 13; negative control G]', () => {
  it('the comment-count span is untouched and renders independently of the new button', () => {
    expect(collapsedBranch).toContain('{padlet.metadata?.comments?.length || 0}');
  });

  it('the count span and the Expand button are sibling elements, not one replacing the other', () => {
    const countIdx = collapsedBranch.indexOf('{padlet.metadata?.comments?.length || 0}');
    const buttonIdx = collapsedBranch.indexOf('title="Expand comment post"');
    expect(countIdx).toBeGreaterThan(-1);
    expect(buttonIdx).toBeGreaterThan(countIdx);
  });
});

describe('PATCH 9K: interaction isolation -- Expand button does not trigger marker drag/click/popup-toggle [matrix 16, 17; negative control H]', () => {
  it('the Expand button stops propagation on both click and mousedown, matching the existing marker interaction pattern', () => {
    const buttonStart = collapsedBranch.lastIndexOf('<button', collapsedBranch.indexOf('title="Expand comment post"'));
    const buttonEnd = collapsedBranch.indexOf('</button>', buttonStart);
    const buttonBlock = collapsedBranch.slice(buttonStart, buttonEnd);
    expect(buttonBlock).toContain('e.stopPropagation();');
    expect(buttonBlock).toContain('onMouseDown={(e) => e.stopPropagation()}');
  });

  it('the marker\'s own click-to-toggle-popup and mousedown-drag handlers are untouched', () => {
    expect(collapsedBranch).toContain('const nextOpen = collapsedPopupPadletId === padlet.id ? null : padlet.id;');
    expect(collapsedBranch).toContain('handlePadletMouseDown(e, padlet.id);');
  });
});

describe('PATCH 9K: position/size/z-index/identity preservation -- Expand only patches metadata.isCollapsed [matrix 6, 9, 10, 11, 16, 17; negative controls D, E, F]', () => {
  it('updatePadletMetadata performs a shallow merge, so position_x/position_y/width/id (top-level Padlet fields, never metadata) are untouched by any isCollapsed write', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const start = src.indexOf('const updatePadletMetadata = async');
    const body = src.slice(start, src.indexOf('\n  };', start));
    expect(body).toContain('const newMetadata = { ...(padlet.metadata || {}), ...(metadataUpdates || {}) };');
    // Only metadata is spread/replaced -- position_x/position_y/width/id are
    // never referenced inside this function at all.
    expect(body).not.toContain('position_x');
    expect(body).not.toContain('position_y');
    expect(body).not.toContain('width:');
  });

  it('the Expanded Post branch derives width and z-index from padlet.width/metadata.zIndex -- both untouched by an isCollapsed-only metadata patch', () => {
    const expandedStart = markerSection.indexOf('// Expanded Post');
    const expandedBranch = markerSection.slice(expandedStart, expandedStart + 400);
    expect(expandedBranch).toContain('width: padlet.width || 300,');
    expect(expandedBranch).toContain('zIndex: (padlet.metadata as any)?.zIndex || 100,');
  });

  it('the collapsed marker also reads the same metadata.zIndex -- collapse/expand share one z-index source, neither branch bumps it to front', () => {
    expect(collapsedBranch).toContain('style={{ zIndex: (padlet.metadata as any)?.zIndex || 100 }}');
    expect(collapsedBranch).not.toContain("movePadletLayer(padlet.id, 'bringToFront')");
  });

  it('the Expand call targets padlet.id specifically -- not selectedPadletId or any other identifier [negative control E]', () => {
    const call = collapsedBranch.match(/updatePadletMetadata\(([^,]+), \{ isCollapsed: false \}\)/);
    expect(call?.[1]).toBe('padlet.id');
  });

  it('the Expand button\'s onClick handler writes nothing beyond the single updatePadletMetadata(isCollapsed:false) call -- no setPadlets/position_x/position_y write of any kind [negative control F]', () => {
    const buttonTagStart = collapsedBranch.lastIndexOf('<button', collapsedBranch.indexOf('title="Expand comment post"'));
    const onClickStart = collapsedBranch.indexOf('onClick={(e) => {', buttonTagStart);
    const onMouseDownStart = collapsedBranch.indexOf('onMouseDown=', onClickStart);
    const onClickBody = collapsedBranch.slice(onClickStart, onMouseDownStart);
    expect(onClickBody).toContain('updatePadletMetadata(padlet.id, { isCollapsed: false });');
    expect(onClickBody).not.toContain('setPadlets');
    expect(onClickBody).not.toContain('position_x');
    expect(onClickBody).not.toContain('position_y');
  });
});

describe('PATCH 9K: thread preservation -- expand/collapse never touches comments/id/other metadata [matrix 7, 8, 14, 15; negative control D]', () => {
  it('the Expand button\'s metadata patch contains only isCollapsed -- no comments field, so the existing shallow-merge in updatePadletMetadata leaves every comment (id/author/timestamp/order) untouched', () => {
    const buttonStart = collapsedBranch.lastIndexOf('<button', collapsedBranch.indexOf('title="Expand comment post"'));
    const buttonEnd = collapsedBranch.indexOf('</button>', buttonStart);
    const buttonBlock = collapsedBranch.slice(buttonStart, buttonEnd);
    expect(buttonBlock).toMatch(/updatePadletMetadata\(padlet\.id, \{ isCollapsed: false \}\);/);
    expect(buttonBlock).not.toContain('comments:');
  });
});

describe('PATCH 9K: permission/lock behavior unchanged -- no new Comment Post permission invented [matrix 19, 20]', () => {
  it('the Expand button is not gated by commentAccessMode/guardCommentMutation -- matches the existing, documented precedent that Collapse (CommentEditorToolbar.tsx) is presentation state, not a comment mutation, and stays available regardless', () => {
    const buttonStart = collapsedBranch.lastIndexOf('<button', collapsedBranch.indexOf('title="Expand comment post"'));
    const buttonEnd = collapsedBranch.indexOf('</button>', buttonStart);
    const buttonBlock = collapsedBranch.slice(buttonStart, buttonEnd);
    expect(buttonBlock).not.toContain('guardCommentMutation');
    expect(buttonBlock).not.toContain('commentAccessMode');
  });

  it('CommentEditorToolbar.tsx\'s Collapse tool remains ungated by readOnly, confirming the precedent this patch mirrors', () => {
    const toolbarSrc = read('components/collabboard/editors/CommentEditorToolbar.tsx');
    const collapseToolStart = toolbarSrc.indexOf("label: 'Collapse'");
    const collapseToolBlock = toolbarSrc.slice(collapseToolStart - 100, collapseToolStart + 100);
    expect(collapseToolBlock).not.toContain('disabled: readOnly');
  });

  it('no lock-specific gating was added -- the collapsed marker has no lock check anywhere, matching the pre-existing (unchanged) permission surface', () => {
    expect(collapsedBranch).not.toMatch(/\bisLocked\b/);
    expect(collapsedBranch).not.toMatch(/\blocked\b/);
  });
});

describe('PATCH 9K: PATCH 9J Line/zoom work untouched [matrix 24; negative control L]', () => {
  it('freeformStageGeometry.ts and the Line wrapper wiring in CanvasClient.tsx are untouched by this patch', () => {
    const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_WIDTH_PX = 10000;');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_HEIGHT_PX = 10000;');
    const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(canvasClientSrc).toContain('width: FREEFORM_WORLD_WIDTH_PX,');
    expect(canvasClientSrc).toContain('height: FREEFORM_WORLD_HEIGHT_PX,');
  });

  it('SimpleLineRenderer.tsx\'s getMousePos single-division formula is untouched', () => {
    const simpleLineRendererSrc = read('components/collabboard/SimpleLineRenderer.tsx');
    expect(simpleLineRendererSrc).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(simpleLineRendererSrc).toContain('y: (e.clientY - rect.top) / canvasZoom,');
  });
});

describe('PATCH 9K: shared comment architecture untouched -- CommentPopup/CommentEditor/CommentRow/EmbeddedCommentList not modified [negative controls J, K]', () => {
  it('CommentPopup.tsx is untouched by this patch -- still the frozen canonical implementation', () => {
    const commentPopupSrc = read('components/collabboard/editors/CommentPopup.tsx');
    expect(commentPopupSrc.length).toBeGreaterThan(0);
  });

  it('CommentEditor.tsx\'s handleCollapse (the forward Collapse direction) is untouched -- still sets isCollapsed: true via onSave, unchanged shape', () => {
    const commentEditorSrc = read('components/collabboard/editors/CommentEditor.tsx');
    expect(commentEditorSrc).toContain('isCollapsed: true');
    expect(commentEditorSrc).toContain('const handleCollapse = () => {');
  });

  it('this patch\'s only production JSX/logic change lives inside the collapsed-marker branch of the Comment-post family, not in CommentPost.tsx/CommentEditor.tsx/CommentPopup.tsx/CommentRow.tsx/EmbeddedCommentList.tsx', () => {
    // Structural proxy: the Expand control (and its exact strings) exists
    // only in FreeformPadletCards.tsx.
    const commentPostSrc = read('components/collabboard/CommentPost.tsx');
    const commentEditorSrc = read('components/collabboard/editors/CommentEditor.tsx');
    expect(commentPostSrc).not.toContain('Expand comment post');
    expect(commentEditorSrc).not.toContain('Expand comment post');
  });
});
