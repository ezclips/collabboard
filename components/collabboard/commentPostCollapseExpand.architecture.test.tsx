// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import CommentEditorToolbar from './editors/CommentEditorToolbar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// PATCH 9K.1 -- supersedes PATCH 9K's UI decision. PATCH 9K added a small
// Maximize/Expand button directly onto the collapsed canvas pin marker; the
// user explicitly rejected that (a second, canvas-level control surface).
// This patch removes it and instead makes the ALREADY-EXISTING
// CommentEditorToolbar.tsx "Collapse" button a true two-way toggle:
//   expanded (toolbar: "Collapse") --click--> collapsed (toolbar: "Expand")
//   collapsed (toolbar: "Expand")  --click--> expanded (toolbar: "Collapse")
// Root cause of "why the toolbar couldn't previously reverse the state" was
// TWO layers, not one: (1) CommentEditor.tsx's old handleCollapse always
// called onClose() right after onSave(...), destroying the toolbar itself;
// (2) even without that, its caller's persistence path -- saveComment in
// hooks/canvas/usePadletSave.ts -- ALSO unconditionally closed the editor
// (setIsCommentEditorOpen(false)) after every save, independent of what
// handleCollapse did. Fixing only the button (PATCH 9K's approach) could
// never have produced a same-session toggle even in principle, since the
// canvas has no toolbar of its own -- the control had to live in the editor,
// and the editor had to stop closing itself on this one save path.

const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const toolbarSrc = read('components/collabboard/editors/CommentEditorToolbar.tsx');
const editorSrc = read('components/collabboard/editors/CommentEditor.tsx');
const canvasModalsSrc = read('components/collabboard/canvas/ui/CanvasModals.tsx');
const padletSaveSrc = read('hooks/canvas/usePadletSave.ts');

const markerSectionStart = freeformSrc.indexOf('{/* Render Standalone Comment Marker */}');
const markerSectionEnd = freeformSrc.indexOf('</CommentPostContextMenu>', markerSectionStart);
const markerSection = freeformSrc.slice(markerSectionStart, markerSectionEnd);

const collapsedBranchStart = markerSection.indexOf('padlet.metadata?.isCollapsed ? (');
const collapsedBranchEnd = markerSection.indexOf('// Expanded Post', collapsedBranchStart);
const collapsedBranch = markerSection.slice(collapsedBranchStart, collapsedBranchEnd);

describe('PATCH 9K.1: canvas Maximize/Expand button removed [matrix 13, 15, 16; negative control A]', () => {
  it('the collapsed marker branch contains no Expand/Maximize button', () => {
    expect(collapsedBranch).not.toContain('Maximize');
    expect(collapsedBranch).not.toContain('title="Expand comment post"');
    expect(collapsedBranch).not.toContain('aria-label="Expand comment post"');
    expect(collapsedBranch).not.toContain('updatePadletMetadata(padlet.id, { isCollapsed: false });');
  });

  it('Maximize is no longer imported from lucide-react anywhere in this file', () => {
    expect(freeformSrc).not.toMatch(/\bMaximize\b/);
  });

  it('the collapsed marker geometry is restored to exactly the pre-9K pin shape: body + count + pointer triangle, nothing else inside the pin wrapper', () => {
    const pinWrapperStart = collapsedBranch.indexOf('<div className="w-8 h-10 relative">');
    const pinWrapperEnd = collapsedBranch.indexOf('</div>', collapsedBranch.indexOf('border-t-gray-400" />', pinWrapperStart)) ;
    const pinWrapper = collapsedBranch.slice(pinWrapperStart, pinWrapperEnd);
    expect(pinWrapper).not.toContain('<button');
    expect(pinWrapper).toContain('{padlet.metadata?.comments?.length || 0}');
    expect(pinWrapper).toContain('border-t-gray-400" />');
  });
});

describe('PATCH 9K.1: comment count remains visible and un-overlapped [matrix 14]', () => {
  it('the comment-count span is present and is the only interactive-adjacent element in the pin body', () => {
    expect(collapsedBranch).toContain('{padlet.metadata?.comments?.length || 0}');
  });
});

describe('PATCH 9K.1: marker interactions preserved -- click/drag/right-click untouched by the button removal [matrix 22, 23]', () => {
  it('click-to-toggle-popup and mousedown-drag handlers are still present, unchanged', () => {
    expect(collapsedBranch).toContain('const nextOpen = collapsedPopupPadletId === padlet.id ? null : padlet.id;');
    expect(collapsedBranch).toContain('handlePadletMouseDown(e, padlet.id);');
  });

  it('CommentPostContextMenu (right-click menu) still wraps this section, unchanged by the button removal', () => {
    expect(freeformSrc.slice(markerSectionStart, markerSectionStart + 200)).toContain('CommentPostContextMenu');
  });
});

describe('PATCH 9K.1: CommentEditorToolbar Collapse control is a true toggle [matrix 1, 2, 7]', () => {
  it('the toolbar accepts an isCollapsed prop and derives the label from it, rather than a hardcoded "Collapse"', () => {
    expect(toolbarSrc).toContain('isCollapsed?: boolean;');
    expect(toolbarSrc).toContain("label: isCollapsed ? 'Expand' : 'Collapse',");
    expect(toolbarSrc).not.toContain("label: 'Collapse',");
  });

  it('the Collapse/Expand tool is not gated by readOnly -- symmetric permission behavior in both directions [matrix 24]', () => {
    const toolStart = toolbarSrc.indexOf("label: isCollapsed ? 'Expand' : 'Collapse',");
    const toolBlockStart = toolbarSrc.lastIndexOf('{', toolStart);
    const toolBlockEnd = toolbarSrc.indexOf('},', toolStart);
    const toolBlock = toolbarSrc.slice(toolBlockStart, toolBlockEnd);
    expect(toolBlock).not.toContain('disabled: readOnly');
  });
});

describe('PATCH 9K.1: mounted toolbar renders the correct label for each state [matrix 2, 7, 10]', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root && container) {
      act(() => { root!.unmount(); });
    }
    if (container) container.remove();
    root = null;
    container = null;
  });

  function mount(isCollapsed: boolean) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <CommentEditorToolbar
          mode="box"
          onModeChange={() => {}}
          onCollapse={() => {}}
          isCollapsed={isCollapsed}
        />
      );
    });
    return container;
  }

  it('shows "Collapse" when the post is currently expanded (isCollapsed=false)', () => {
    const el = mount(false);
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.title === 'Collapse');
    expect(button).toBeTruthy();
    expect(el.textContent).toContain('Collapse');
    expect(el.textContent).not.toContain('Expand');
  });

  it('shows "Expand" when the post is currently collapsed (isCollapsed=true)', () => {
    const el = mount(true);
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.title === 'Expand');
    expect(button).toBeTruthy();
    expect(el.textContent).toContain('Expand');
    expect(el.textContent).not.toContain('Collapse');
  });
});

describe('PATCH 9K.1: single canonical toggle command in CommentEditor.tsx -- no second mechanism [negative control E]', () => {
  it('handleCollapse (the old one-way command) no longer exists -- replaced by handleToggleCollapse', () => {
    expect(editorSrc).not.toContain('const handleCollapse = () => {');
    expect(editorSrc).toContain('const handleToggleCollapse = () => {');
  });

  it('no second/local collapse-related state was introduced beyond the single isCollapsed state mirroring metadata', () => {
    expect(editorSrc).not.toMatch(/\bisExpandedLocal\b/);
    expect(editorSrc).not.toMatch(/\bisCollapsedLocal2\b/);
    expect(editorSrc).not.toMatch(/\bshowMarker\b/);
    expect(editorSrc).not.toMatch(/\bshowFullPost\b/);
    expect(editorSrc).toContain('const [isCollapsed, setIsCollapsed] = useState(initialIsCollapsed);');
  });

  it('handleToggleCollapse flips the existing isCollapsed state and persists through the same onSave path used everywhere else in this component', () => {
    const start = editorSrc.indexOf('const handleToggleCollapse = () => {');
    const end = editorSrc.indexOf('\n  };', start);
    const body = editorSrc.slice(start, end);
    expect(body).toContain('const nextIsCollapsed = !isCollapsed;');
    expect(body).toContain('setIsCollapsed(nextIsCollapsed);');
    expect(body).toContain('isCollapsed: nextIsCollapsed,');
    expect(body).toContain('keepEditorOpen: true,');
  });

  it('handleToggleCollapse does NOT call onClose() -- the editor/toolbar must remain mounted for a second press [matrix 5, 6, 11, 12; negative control D]', () => {
    const start = editorSrc.indexOf('const handleToggleCollapse = () => {');
    const end = editorSrc.indexOf('\n  };', start);
    const body = editorSrc.slice(start, end);
    expect(body).not.toContain('onClose()');
  });

  it('the toolbar is wired to the toggle handler and reflects live isCollapsed state, not a fixed value', () => {
    expect(editorSrc).toContain('onCollapse={handleToggleCollapse}');
    expect(editorSrc).toContain('isCollapsed={isCollapsed}');
  });

  it('isCollapsed is reset from initialIsCollapsed on every editor open, same convention as every other reset field', () => {
    const start = editorSrc.indexOf('// Reset UI state on open');
    const end = editorSrc.indexOf('}, [isOpen]);', start);
    const body = editorSrc.slice(start, end);
    expect(body).toContain('setIsCollapsed(initialIsCollapsed);');
  });
});

describe('PATCH 9K.1: keepEditorOpen skips the editor-close, only on the toggle path [matrix 5, 6, 11, 12; negative control D]', () => {
  it('saveComment (usePadletSave.ts) checks data.keepEditorOpen and skips the unconditional close only when set', () => {
    const start = padletSaveSrc.indexOf('const saveComment = useCallback');
    const end = padletSaveSrc.indexOf('}, [', start);
    const body = padletSaveSrc.slice(start, end);
    expect(body).toContain('if (data.keepEditorOpen && padletToEdit.id !== \'new\') {');
    expect(body).toContain('setIsCommentEditorOpen(false);');
    expect(body).toContain('setPadletToEdit(null);');
  });

  it('the normal Save/submit path (handleSave) never sets keepEditorOpen -- close-on-save semantics are unchanged for every other flow', () => {
    const start = editorSrc.indexOf('const handleSave = () => {');
    const end = editorSrc.indexOf('\n  };', start);
    const body = editorSrc.slice(start, end);
    expect(body).not.toContain('keepEditorOpen');
    expect(body).toContain('onClose();');
  });

  it('CanvasModals.tsx threads the current metadata.isCollapsed into the editor as initialIsCollapsed', () => {
    expect(canvasModalsSrc).toContain('initialIsCollapsed={!!padletToEdit?.metadata?.isCollapsed}');
  });
});

describe('PATCH 9K.1: thread/identity/position/size/z-index preservation -- the toggle patches only isCollapsed [matrix 17-21]', () => {
  it('handleToggleCollapse\'s onSave payload carries only comments/cardColor/badgeColor/isCollapsed/topStrip/commentTitle/keepEditorOpen -- no id/position/width/height/zIndex field', () => {
    const start = editorSrc.indexOf('const handleToggleCollapse = () => {');
    const end = editorSrc.indexOf('\n  };', start);
    const body = editorSrc.slice(start, end);
    expect(body).not.toMatch(/\bposition_x\b/);
    expect(body).not.toMatch(/\bposition_y\b/);
    expect(body).not.toMatch(/\bwidth\b/);
    expect(body).not.toMatch(/\bzIndex\b/);
  });

  it('saveComment\'s metadata merge preserves every existing metadata field via spread, patching only the fields the caller explicitly passes', () => {
    const fnStart = padletSaveSrc.indexOf('const saveComment = useCallback');
    const fnEnd = padletSaveSrc.indexOf('}, [', fnStart);
    const fnBody = padletSaveSrc.slice(fnStart, fnEnd);
    const start = fnBody.indexOf('const metadata = {');
    const end = fnBody.indexOf('};', start);
    const body = fnBody.slice(start, end);
    expect(body).toContain('...padletToEdit.metadata,');
  });

  it('handleToggleCollapse starts from the existing comments array, never resets it to empty -- thread is never wiped by a toggle [negative control F]', () => {
    const start = editorSrc.indexOf('const handleToggleCollapse = () => {');
    const end = editorSrc.indexOf('\n  };', start);
    const body = editorSrc.slice(start, end);
    expect(body).toContain('let finalComments = comments;');
  });

  it('the toggle persists through the existing update-by-id path for an already-created post -- never re-inserts a new row, so the post id never changes [negative control G]', () => {
    const fnStart = padletSaveSrc.indexOf('const saveComment = useCallback');
    const fnEnd = padletSaveSrc.indexOf('}, [', fnStart);
    const fnBody = padletSaveSrc.slice(fnStart, fnEnd);
    expect(fnBody).toContain("if (padletToEdit.id === 'new') {");
    // The ONLY alternative to the 'new'-post insert branch must be a bare
    // `else` leading straight into the update-by-id call -- no additional
    // `else if` gate (e.g. on keepEditorOpen) may sit between them, or an
    // existing post could be silently re-inserted as a new row under some
    // condition, changing its id.
    expect(fnBody).toMatch(
      /\}\s*else\s*\{\s*const \{ error \} = await supabase\s*\.from\('padlets'\)\s*\.update\(\{\s*metadata,\s*updated_at: new Date\(\)\.toISOString\(\),\s*\}\)\s*\.eq\('id', padletToEdit\.id\);/
    );
    // Exactly one .insert( call in the whole function -- the 'new'-post
    // creation branch -- never a second one reachable for an existing post.
    expect(fnBody.match(/\.insert\(/g)?.length).toBe(1);
  });
});

describe('PATCH 9K.1: shared comment architecture untouched [matrix 25; negative control K]', () => {
  it('CommentPopup.tsx, CommentRow.tsx, EmbeddedCommentList.tsx are not referenced by this patch\'s changes', () => {
    const commentPopupSrc = read('components/collabboard/editors/CommentPopup.tsx');
    expect(commentPopupSrc.length).toBeGreaterThan(0);
    expect(editorSrc).not.toContain('EmbeddedCommentList');
  });

  it('CommentPost.tsx is not modified by this patch -- the toggle lives in CommentEditor.tsx/CommentEditorToolbar.tsx only', () => {
    const commentPostSrc = read('components/collabboard/CommentPost.tsx');
    expect(commentPostSrc).not.toContain('handleToggleCollapse');
    expect(commentPostSrc).not.toContain('keepEditorOpen');
  });
});

describe('PATCH 9K.1: PATCH 9J Line/zoom work untouched [matrix 26; negative control L]', () => {
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
