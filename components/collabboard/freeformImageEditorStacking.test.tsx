// @vitest-environment jsdom
//
// R6C -- the freeform image editor's three acceptance defects.
//
// The premise R6C started from was wrong in a way worth recording: opening an
// EXISTING image post never goes near ImageEditor.tsx. openFreeformImageEditModal
// explicitly calls setIsImageEditorOpen(false) and raises imageToolbarPadletId,
// which drives a self-contained overlay rendered inside FreeformPadletCards --
// i.e. inside CanvasViewport's `isolation: isolate` boundary (PATCH 9M). That
// is why a z-[60000] overlay still painted UNDER a z-[1200] reader, and why the
// reader never yielded: nothing told it an editor was open.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBackdropDismiss } from '@/components/collabboard/editors/PostEditorShell';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const readerDrawer = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const shell = read('components/collabboard/editors/PostEditorShell.tsx');

/** Everything between an anchor and the next `count` characters of source. */
function after(source: string, anchor: string, count = 1400): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

const PORTAL_ANCHOR = '{imageToolbarPadletId && createPortal(';

/** The overlay's opening tags -- backdrop through the grid track declarations. */
const overlay = () => after(freeform, PORTAL_ANCHOR, 3200);

/** The WHOLE portalled subtree, anchor through its `document.body,` argument. */
function portalledSubtree(): string {
  const start = freeform.indexOf(PORTAL_ANCHOR);
  expect(start, 'portal anchor not found').toBeGreaterThan(-1);
  const end = freeform.indexOf('document.body,', start);
  expect(end, 'portal target not found after the anchor').toBeGreaterThan(start);
  return freeform.slice(start, end);
}

describe('T1-T6: the image editor is a blocking editor, above the reader', () => {
  it('T1: the overlay escapes the isolated canvas subtree by portalling to <body>', () => {
    // The z-index is NOT the fix and must not be treated as one: inside
    // `isolation: isolate` the whole canvas subtree paints as one atomic layer
    // at z-index:auto, so 60000 loses to any root-level sibling with a
    // positive z-index. Only leaving that subtree can win.
    expect(freeform).toContain(PORTAL_ANCHOR);
    expect(overlay()).toContain('className="fixed inset-0 z-[60000]');
    // The portal target is <body> -- the root stacking context.
    expect(portalledSubtree().length).toBeGreaterThan(0);
    expect(freeform).toContain("import { createPortal } from 'react-dom';");
  });

  it('T2: PATCH 9M\'s isolation boundary itself is untouched', () => {
    // A modal is not a canvas object. Portalling one out does not weaken the
    // guarantee that canvas objects stay contained -- and that guarantee must
    // still be expressed exactly where PATCH 9M put it.
    expect(canvasClient).toContain("isolation: 'isolate',");
    const viewportOpen = after(canvasClient, '<CanvasViewport', 2000);
    expect(viewportOpen).toContain("isolation: 'isolate',");
  });

  it('T3: opening an image post registers as a blocking editor', () => {
    const memo = after(canvasClient, 'const isBlockingEditorModalOpen = useMemo(', 1600);
    expect(memo).toContain('imageToolbarPadletId !== null');
    // And it is a real dependency, so the memo actually recomputes.
    expect(memo).toContain('isClipartDraftModalOpen, imageToolbarPadletId,');
  });

  it('T4: the reader yields to that flag through the SAME shared authority', () => {
    // No second ladder, no isImageEditorOpen special case inside the reader.
    expect(canvasClient).toContain('blockingEditorOpen={isBlockingEditorModalOpen}');
    expect(readerDrawer).toContain('const sidePanelBelowEditor = !isWorkspace && blockingEditorOpen;');
    expect(readerDrawer).toContain('style={sidePanelBelowEditor ? { zIndex: 900 } : undefined}');
    for (const forbidden of ['imageToolbarPadletId', 'isImageEditorOpen']) {
      expect(readerDrawer, forbidden).not.toContain(forbidden);
    }
  });

  it('T5: closing the editor restores the reader, because the flag is derived', () => {
    // imageToolbarPadletId returns to null on close, so nothing is "restored"
    // by hand -- the yield is a pure function of the open state.
    expect(freeform).toContain('setImageToolbarPadletId(null)');
    expect(readerDrawer).toContain("data-knowledge-reader-below-editor={sidePanelBelowEditor ? 'true' : 'false'}");
  });

  it('T6: the workspace reader keeps its own unchanged yield behaviour', () => {
    expect(readerDrawer).toContain('const yieldsToEditor = isWorkspace && blockingEditorOpen;');
  });
});

describe('T7-T13: the comment panel sits beside the editor, not at the viewport edge', () => {
  it('T7,T8: it lives in the grid track immediately right of the card', () => {
    const grid = overlay();
    // Three tracks: toolbar | card | panel. The flanking tracks are equal so
    // the card never shifts when a panel opens.
    expect(grid).toContain("gridTemplateColumns: '1fr auto 1fr'");
    expect(grid).toContain('className="relative grid items-start gap-6"');
    // The right track starts its content AT the card edge -- justify-start is
    // what keeps it beside the card instead of at the far viewport edge.
    expect(freeform).toContain('<div className="flex items-start justify-start" style={{ pointerEvents: \'none\' }}>');
    // ...and the left (toolbar) track mirrors it.
    expect(freeform).toContain('<div className="flex items-start justify-end" style={{ pointerEvents: \'none\' }}>');
  });

  it('T9: the panel cannot overlap the card -- they are separate grid tracks with a gap', () => {
    const grid = overlay();
    expect(grid).toContain('gap-6');
    // Not absolute/viewport-anchored positioning, which is what "far right"
    // would look like.
    expect(grid).not.toContain('right-0');
    expect(grid).not.toContain('position: fixed');
  });

  it('T12: the whole comment system rides above the reader with the editor', () => {
    // It is inside the portalled overlay, so it inherits the escape rather
    // than needing a z-index of its own.
    expect(portalledSubtree()).toContain('<CommentPopup');
  });

  it('T13: closing the comment panel does not close the editor', () => {
    // This overlay's OWN CommentPopup -- identified by the padlet it reads --
    // clears only the comment popup id. The editor is separate state.
    const subtree = portalledSubtree();
    const popup = subtree.slice(subtree.indexOf('<CommentPopup'));
    const close = popup.slice(popup.indexOf('onOpenChange={(open) => {'), popup.indexOf('commentTitle='));
    expect(close).toContain('setCardCommentPopupPadletId(null)');
    expect(close).not.toContain('setImageToolbarPadletId(null)');
  });
});

// --- T14-T20: the first title interaction must not dismiss the editor -------

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

/** The overlay's real shape: a backdrop with an inner panel that reflows. */
function Harness({ onDismiss }: { onDismiss: () => void }) {
  const dismiss = useBackdropDismiss(onDismiss);
  const [wide, setWide] = React.useState(false);
  return (
    <div data-testid="backdrop" {...dismiss} style={{ position: 'fixed', inset: 0 }}>
      <div data-testid="panel" onClick={(e) => e.stopPropagation()}>
        <input
          data-testid="title"
          // Exactly what the real Title does: focusing it re-targets the style
          // panel, which reflows the centred grid under the pointer.
          onFocus={() => setWide(true)}
          style={{ width: wide ? 400 : 200 }}
        />
      </div>
    </div>
  );
}

function mountHarness() {
  const onDismiss = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<Harness onDismiss={onDismiss} />); });
  const q = (id: string) => host!.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  return { onDismiss, backdrop: q('backdrop'), panel: q('panel'), title: q('title') };
}

/** A press that begins on `from` and is released over `over`. The browser
 *  retargets the resulting click to the nearest common ancestor. */
function press(from: HTMLElement, clickTarget: HTMLElement) {
  act(() => {
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('T14-T20: fresh first title interaction never closes the editor', () => {
  it('T14: clicking into the title leaves the editor open', () => {
    const h = mountHarness();
    press(h.title, h.title);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T15: the reflow that focus causes cannot retarget the click into a dismissal', () => {
    // THE reported defect: focus widens the panel, the centred layout moves out
    // from under the pointer, mouseup lands on the backdrop, and the browser
    // dispatches the click on the common ancestor -- the backdrop itself.
    const h = mountHarness();
    act(() => { h.title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    act(() => { h.title.focus(); });
    act(() => { h.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T16: drag-selecting the title text and releasing outside does not close it', () => {
    const h = mountHarness();
    press(h.title, h.backdrop);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T17: a press beginning anywhere inside the panel is never a dismissal', () => {
    const h = mountHarness();
    press(h.panel, h.backdrop);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T18: it stays reliable across repeated interactions -- no stale origin', () => {
    const h = mountHarness();
    // A genuine backdrop press first, then an inside press: the second must not
    // inherit the first's authorisation, and vice versa.
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    press(h.title, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(2);
  });

  it('T19: a genuine backdrop click still closes it -- the fix is not a disabled dismissal', () => {
    const h = mountHarness();
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('T20: a click released over the panel is not a dismissal either', () => {
    const h = mountHarness();
    press(h.backdrop, h.panel);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('the overlay uses this shared authority rather than its own onClick', () => {
    // The old naive backdrop is what produced the defect; it must be gone.
    expect(overlay()).toContain('{...imageOverlayBackdropDismiss}');
    expect(overlay()).not.toContain('onClick={() => setImageToolbarPadletId(null)}');
    expect(freeform).toContain('useBackdropDismiss(');
    // One implementation, shared with every PostEditorShell editor.
    expect(shell).toContain('export function useBackdropDismiss(');
    expect((freeform.match(/pressBeganOnBackdrop/g) ?? [])).toHaveLength(0);
  });
});
