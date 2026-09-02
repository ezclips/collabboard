// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostEditorShell, { useShellPanels } from './PostEditorShell';
import NoteEditor from './NoteEditor';
import DocumentEditor from './DocumentEditor';

// PATCH-152 152-C2 (§22.10): shell-ownership proofs the 33 NoteEditor
// characterization tests (read-only during C2) do not cover -- structural
// sibling order, single-toolbar/single-shell, backdrop boundary, mode
// ownership, panel-coordination semantics, detached-comment persistence
// across a shell rerender, and the four frozen panels' mount points. Text
// mode/Box mode/Link/Card colour/Reaction/detached-open contract details are
// NOT re-tested here -- they remain the 33-test suite's responsibility.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (!(Range.prototype as any).getClientRects) (Range.prototype as any).getClientRects = () => [];
if (!(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} });
}

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
/** Where a press began. The shell reads this to decide a backdrop dismissal. */
function pressOn(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
}
/** A whole interaction that starts and ends on the same element. */
function pressAndClick(el: Element) {
  pressOn(el);
  click(el);
}
function btn(c: HTMLElement, title: string) {
  return c.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function shellRow(c: HTMLElement) {
  return c.querySelector('.fixed.inset-0')!.firstElementChild as HTMLElement;
}

describe('PostEditorShell: sibling order, single toolbar, backdrop and mode ownership', () => {
  it('renders toolbar, centre and shared panel as siblings in that order', () => {
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={vi.fn()} hasSelection={false} toolbar={{}}
        centre={<div data-testid="centre-marker" />} sharedPanel={<div data-testid="panel-marker" />} />,
    );
    const row = shellRow(c);
    const has = (el: Element, sel: string) => el.matches(sel) || !!el.querySelector(sel);
    const idx = (pred: (el: Element) => boolean) => Array.from(row.children).findIndex(pred);
    const toolbarIdx = idx((el) => has(el, 'button[title="Switch to Box Design"]'));
    const centreIdx = idx((el) => has(el, '[data-testid="centre-marker"]'));
    const panelIdx = idx((el) => has(el, '[data-testid="panel-marker"]'));
    expect(toolbarIdx).toBe(0);
    expect(centreIdx).toBeGreaterThan(toolbarIdx);
    expect(panelIdx).toBeGreaterThan(centreIdx);
  });

  it('never nests the shared panel inside the toolbar wrapper, and renders exactly one toolbar', () => {
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={vi.fn()} hasSelection={false} toolbar={{}}
        centre={null} sharedPanel={<div data-testid="panel-marker" />} />,
    );
    const toolbarZone = c.querySelector('.min-w-\\[72px\\]')!;
    expect(toolbarZone.querySelector('[data-testid="panel-marker"]')).toBeNull();
    expect(c.querySelectorAll('button[title^="Switch to"]').length).toBe(1);
  });

  it('keeps the centre mounted while the shared panel is present', () => {
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={vi.fn()} hasSelection={false} toolbar={{}}
        centre={<div data-testid="centre-marker" />} sharedPanel={<div data-testid="panel-marker" />} />,
    );
    expect(c.querySelector('[data-testid="centre-marker"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="panel-marker"]')).not.toBeNull();
  });

  it('calls onBackdropClick only for a genuine backdrop click, not one bubbled from the centre', () => {
    const onBackdropClick = vi.fn();
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={onBackdropClick} hasSelection={false} toolbar={{}}
        centre={<button data-testid="inside">x</button>} sharedPanel={null} />,
    );
    pressAndClick(c.querySelector('[data-testid="inside"]')!);
    expect(onBackdropClick).not.toHaveBeenCalled();
    pressAndClick(c.firstElementChild as HTMLElement);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  /**
   * The reflow defect: a press that begins inside the editor must never become
   * a dismissal, however the editor moves before release. When the editor
   * reflows under a held button the browser retargets the resulting click to
   * the nearest common ancestor -- this overlay -- so the click target alone
   * cannot distinguish it from a real backdrop click.
   */
  it('ignores a click retargeted to the overlay when the press began inside the editor', () => {
    const onBackdropClick = vi.fn();
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={onBackdropClick} hasSelection={false} toolbar={{}}
        centre={<input data-testid="title" placeholder="Post name" />} sharedPanel={null} />,
    );
    const overlay = c.firstElementChild as HTMLElement;

    // Press starts on the editor's own field...
    pressOn(c.querySelector('[data-testid="title"]')!);
    // ...the editor moves, so the browser dispatches the click on the overlay.
    click(overlay);

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it('still dismisses when the press began on the backdrop and the editor moved', () => {
    const onBackdropClick = vi.fn();
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={onBackdropClick} hasSelection={false} toolbar={{}}
        centre={<input data-testid="title" placeholder="Post name" />} sharedPanel={null} />,
    );
    const overlay = c.firstElementChild as HTMLElement;

    pressOn(overlay);
    click(overlay);

    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it('consumes the origin, so one backdrop press cannot authorise a later close', () => {
    const onBackdropClick = vi.fn();
    const c = mount(
      <PostEditorShell isOpen onBackdropClick={onBackdropClick} hasSelection={false} toolbar={{}}
        centre={<input data-testid="title" placeholder="Post name" />} sharedPanel={null} />,
    );
    const overlay = c.firstElementChild as HTMLElement;

    pressAndClick(overlay);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);

    // A second click with no press of its own must not close again.
    click(overlay);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it('owns Text/Box mode internally -- no external mode prop is required', () => {
    const c = mount(<PostEditorShell isOpen onBackdropClick={vi.fn()} hasSelection={false} toolbar={{}} centre={null} sharedPanel={null} />);
    expect(btn(c, 'Switch to Box Design')).not.toBeNull();
    click(btn(c, 'Switch to Box Design')!);
    expect(btn(c, 'Switch to Text Design')).not.toBeNull();
  });

  it('forwards hasSelection into the toolbar it renders', () => {
    const off = mount(<PostEditorShell isOpen onBackdropClick={vi.fn()} hasSelection={false} toolbar={{ onLink: vi.fn() }} centre={null} sharedPanel={null} />);
    expect(btn(off, 'Link text first!')).not.toBeNull();
    const on = mount(<PostEditorShell isOpen onBackdropClick={vi.fn()} hasSelection toolbar={{ onLink: vi.fn() }} centre={null} sharedPanel={null} />);
    expect(btn(on, 'Add link to selected text')).not.toBeNull();
  });

  it('renders nothing when isOpen is false', () => {
    const c = mount(<PostEditorShell isOpen={false} onBackdropClick={vi.fn()} hasSelection={false} toolbar={{}} centre={null} sharedPanel={null} />);
    expect(c.innerHTML.length).toBe(0);
  });
});

describe('useShellPanels: active-panel coordination', () => {
  function Harness() {
    const panels = useShellPanels();
    return (
      <div>
        <span data-testid="textStyle">{String(panels.open.textStyle)}</span>
        <span data-testid="cardColor">{String(panels.open.cardColor)}</span>
        <span data-testid="comment">{String(panels.open.comment)}</span>
        <button onClick={() => panels.openPanel('textStyle')}>openTextStyle</button>
        <button onClick={() => panels.openPanel('cardColor')}>openCardColor</button>
        <button onClick={() => panels.openPanel('comment')}>openComment</button>
      </div>
    );
  }
  const find = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll('button')).find((b) => b.textContent === text)!;

  it('opening a panel always closes every other panel, with no per-call-site opt-in required', () => {
    const c = mount(<Harness />);
    click(find(c, 'openTextStyle'));
    click(find(c, 'openCardColor'));
    expect(c.querySelector('[data-testid="textStyle"]')!.textContent).toBe('false');
    expect(c.querySelector('[data-testid="cardColor"]')!.textContent).toBe('true');
  });

  it('opening Comment closes a previously open TextStyle', () => {
    const c = mount(<Harness />);
    click(find(c, 'openTextStyle'));
    click(find(c, 'openComment'));
    expect(c.querySelector('[data-testid="textStyle"]')!.textContent).toBe('false');
    expect(c.querySelector('[data-testid="comment"]')!.textContent).toBe('true');
  });
});

function openNote(content = '<p>hello world again</p>') {
  return mount(<NoteEditor isOpen initialContent={content} onSave={vi.fn()} onClose={vi.fn()} />);
}
function selectText(c: HTMLElement, text: string) {
  const pm = c.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    let idx = -1;
    while ((node = walker.nextNode() as Text | null)) {
      idx = node.textContent?.indexOf(text) ?? -1;
      if (idx !== -1) break;
    }
    if (!node || idx === -1) throw new Error(`text not found: ${text}`);
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + text.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
function card(c: HTMLElement) {
  return c.querySelector('.rounded-lg.shadow-2xl.overflow-visible') as HTMLElement;
}
function detachedPanel(c: HTMLElement): HTMLElement {
  return c.querySelector('[data-comment-panel="true"]') as HTMLElement;
}

describe('NoteEditor via PostEditorShell: single shell, no local composition', () => {
  it('NoteEditor.tsx imports and consumes PostEditorShell, not NoteEditorToolbar directly', () => {
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    expect(src).toContain("from './PostEditorShell'");
    expect(src).not.toContain("from './NoteEditorToolbar'");
    expect(src).not.toMatch(/<NoteEditorToolbar/);
  });

  it('PostEditorShell.tsx contains no persistence, save, or network call (ownership boundary, §22.4)', () => {
    const src = fs.readFileSync('components/collabboard/editors/PostEditorShell.tsx', 'utf8');
    expect(src).not.toMatch(/onSave|localStorage|fetch\(|supabase/i);
  });

  it('renders exactly one toolbar and one overlay for the real NoteEditor', () => {
    const c = openNote();
    expect(c.querySelectorAll('.fixed.inset-0.z-\\[1000\\]').length).toBe(1);
    expect(c.querySelectorAll('button[title^="Switch to"]').length).toBe(1);
  });
});

describe('Detached comment persists across a shell rerender (§22.10/15-17)', () => {
  async function addAndRerender(c: HTMLElement) {
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const input = detachedPanel(c).querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'persists');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(c.textContent).toContain('persists');
    // The Enter-triggered submission above -- not this mode toggle -- is what
    // exposes the unstable-default defect: mode is owned by PostEditorShell,
    // and the centre it renders is referentially stable, so NoteEditor itself
    // does not rerender here. Kept as a harmless additional shell-survives-toggle check.
    click(btn(c, 'Switch to Text Design')!);
    click(btn(c, 'Switch to Box Design')!);
  }

  it('survives with an explicitly empty initial list', async () => {
    const c = mount(<NoteEditor isOpen initialContent="<p>hello</p>" initialDetachedComments={[]} onSave={vi.fn()} onClose={vi.fn()} />);
    await addAndRerender(c);
    expect(c.textContent).toContain('persists');
    expect(c.querySelector('button[title="1 comment"]')).not.toBeNull();
  });

  it('survives when the prop is omitted entirely', async () => {
    const c = openNote();
    await addAndRerender(c);
    expect(c.textContent).toContain('persists');
    expect(c.querySelector('button[title="1 comment"]')).not.toBeNull();
  });

  it('CanvasModals still supplies a stable initial reference (unreachable-default guard, §22.6)', () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/CanvasModals.tsx', 'utf8');
    expect(src).toContain('const EMPTY_COMMENTS');
    expect(src).toContain('initialDetachedComments={padletToEdit?.metadata?.detachedComments || EMPTY_COMMENTS}');
  });
});

describe('Frozen panels keep their current mount points (§22.3/§22.10 21-24)', () => {
  it('EmojiReactionPicker stays nested inside the Note card', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add emoji reaction to this post')!);
    const picker = c.querySelector('.note-emoji-picker')!;
    expect(card(c).contains(picker)).toBe(true);
  });

  it('the detached post-comment popup stays a shell-row sibling, outside the card and the shared panel region', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const panel = detachedPanel(c);
    expect(card(c).contains(panel)).toBe(false);
    expect(shellRow(c).contains(panel)).toBe(true);
  });
});

// Revised: only one right-side panel may ever be open at a time. This used
// to allow TextStylePopup/CardColor/Reaction to coexist (an opt-in exclusion
// list per call site), which regressed silently when a call site forgot to
// declare its conflicts (NoteEditor's toolbar buttons). Exclusivity is now
// the hook's own behaviour, so every panel closes every other one.
describe('Real NoteEditor panel coordination: only one right-side panel is ever open at a time', () => {
  it('opening any panel closes every other one, including Link/Comment mutual exclusion', () => {
    const c = openNote();
    // The close button now floats outside the panel's own box (a separate
    // absolutely-positioned sibling), so the panel's visual chrome moved to
    // an inner div -- these selectors key off each panel's still-unique
    // outer wrapper (position + width + a wrapper-only class) rather than
    // the box styling, which Text style and Card color now share.
    const textStyle = () => c.querySelector('div[style*="width: 300px"].relative');
    const cardColorPanel = () => c.querySelector('div[style*="width: 260px"].relative.h-fit');
    const reaction = () => c.querySelector('.note-emoji-picker');

    click(btn(c, 'Change text formatting')!);
    expect(textStyle()).not.toBeNull();

    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Change card background and top strip color')!);
    expect(textStyle()).toBeNull();
    expect(cardColorPanel()).not.toBeNull();

    click(btn(c, 'Add emoji reaction to this post')!);
    expect(cardColorPanel()).toBeNull();
    expect(reaction()).not.toBeNull();

    click(btn(c, 'Switch to Text Design')!);
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(reaction()).toBeNull();
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();

    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    expect(textStyle()).toBeNull();
    expect(cardColorPanel()).toBeNull();
    expect(reaction()).toBeNull();
    // Link and Comment are mutually exclusive -- opening Comment must also close Link.
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).toBeNull();

    click(btn(c, 'Close')!);
    click(btn(c, 'Change text formatting')!);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Change card background and top strip color')!);
    expect(textStyle()).toBeNull();
    expect(cardColorPanel()).not.toBeNull();
  });
});

// PATCH-152 C3-A (§24.16): proves the C3-A shell additions (showToolbar,
// selectionIndicator) stay opt-in and unused by Note. LinkPopup's inline prop
// is the one C3-A addition Note *does* now opt into (PATCH-152 targeted
// correction: align Link and Comment) -- covered by the dedicated alignment
// tests below, not here.
describe('C3-A shell additions stay opt-in and unused by Note (§24.16)', () => {
  it('renders the toolbar normally, with no selection overlay', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('.min-w-\\[72px\\]')).not.toBeNull();
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="shell-selection-overlay"]')).toBeNull();
  });
});

// PATCH-152 targeted correction: selected-text CommentPopup must follow the
// documented .agent/skills/row_canvas_development/SKILL.md layout -- sub-panels
// (TextStylePopup, EmojiPicker, comment popup, colour picker) appear to the
// right, in the shell's own right-side grid column, never inside the
// card/toolbar and never via fixed/absolute escape of their own. (The shell
// row itself moved from a centered flex row to a 3-column grid so the centre
// column's screen position stays fixed regardless of which side panel is
// open -- see PostEditorShell.tsx -- but panels remain ordinary in-flow
// children, just one level deeper inside that column's wrapper.) This
// governs both Note and Document.
describe('Selected-text CommentPopup follows the documented right-side layout', () => {
  function openDoc(overrides: Partial<React.ComponentProps<typeof DocumentEditor>> = {}) {
    return mount(
      <DocumentEditor isOpen title="Doc" initialContent="<p>hello world again</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} {...overrides} />,
    );
  }
  const has = (el: Element, sel: string) => el.matches(sel) || !!el.querySelector(sel);
  const idx = (row: HTMLElement, pred: (el: Element) => boolean) => Array.from(row.children).findIndex(pred);

  it('Note: renders after the centre, outside the toolbar and card, with no fixed/absolute escape', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const input = c.querySelector('input[placeholder="Add a comment..."]')!;

    expect(card(c).contains(input)).toBe(false);
    expect(c.querySelector('.min-w-\\[72px\\]')!.contains(input)).toBe(false);
    expect(shellRow(c).contains(input)).toBe(true);

    const row = shellRow(c);
    const centreIdx = idx(row, (el) => has(el, '.rounded-lg.shadow-2xl.overflow-visible'));
    const panelIdx = idx(row, (el) => has(el, 'input[placeholder="Add a comment..."]'));
    expect(panelIdx).toBeGreaterThan(centreIdx);

    const wrapper = input.closest('[style*="width: 300px"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).not.toMatch(/\babsolute\b|\bfixed\b/);
  });

  it('Note: selected-text comment submission still works from its new location', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const input = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'a remark');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const mark = c.querySelector('.ProseMirror span[data-comment-id]');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('world');
  });

  it('Document: renders after the centre, outside the toolbar and card, with no fixed/absolute escape', () => {
    const c = openDoc();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const input = c.querySelector('input[placeholder="Add a comment..."]')!;
    const centreEl = c.querySelector('.rounded-2xl.shadow-2xl') as HTMLElement;

    expect(centreEl.contains(input)).toBe(false);
    expect(c.querySelector('.min-w-\\[72px\\]')!.contains(input)).toBe(false);
    expect(shellRow(c).contains(input)).toBe(true);

    const row = shellRow(c);
    const centreIdx = idx(row, (el) => has(el, '.rounded-2xl.shadow-2xl'));
    const panelIdx = idx(row, (el) => has(el, 'input[placeholder="Add a comment..."]'));
    expect(panelIdx).toBeGreaterThan(centreIdx);

    const wrapper = input.closest('[style*="width: 300px"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).not.toMatch(/\babsolute\b|\bfixed\b/);
  });

  it('Note and Document place the panel in the same structural position: last (right-side grid column) child of the shell row', () => {
    const noteC = openNote();
    selectText(noteC, 'world');
    click(btn(noteC, 'Add comment to selected text')!);
    const noteRow = shellRow(noteC);
    const notePanelIdx = idx(noteRow, (el) => has(el, 'input[placeholder="Add a comment..."]'));
    expect(notePanelIdx).toBe(noteRow.children.length - 1);

    const docC = openDoc();
    selectText(docC, 'world');
    click(btn(docC, 'Add comment to selected text')!);
    const docRow = shellRow(docC);
    const docPanelIdx = idx(docRow, (el) => has(el, 'input[placeholder="Add a comment..."]'));
    expect(docPanelIdx).toBe(docRow.children.length - 1);
  });
});

// PATCH-152 targeted Note-panel correction: LinkPopup and the selected-text
// CommentPopup must share the same right-side sharedPanel slot (same left
// edge, top alignment, width, spacing from the centre) and be mutually
// exclusive. Document is untouched by this change.
describe('Note: Link and selected-text Comment share the same right-side slot and are mutually exclusive', () => {
  const has = (el: Element, sel: string) => el.matches(sel) || !!el.querySelector(sel);
  const idx = (row: HTMLElement, pred: (el: Element) => boolean) => Array.from(row.children).findIndex(pred);
  function linkWrapper(c: HTMLElement): HTMLElement | null {
    const input = c.querySelector('input[placeholder="Paste or type a URL"]');
    return input ? (input.closest('[style*="width: 300px"]') as HTMLElement) : null;
  }
  function commentWrapper(c: HTMLElement): HTMLElement | null {
    const input = c.querySelector('input[placeholder="Add a comment..."]');
    return input ? (input.closest('[style*="width: 300px"]') as HTMLElement) : null;
  }

  it('1: Link opens to the right of the Note centre, outside the toolbar and card', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    const input = c.querySelector('input[placeholder="Paste or type a URL"]')!;

    expect(card(c).contains(input)).toBe(false);
    expect(c.querySelector('.min-w-\\[72px\\]')!.contains(input)).toBe(false);
    expect(shellRow(c).contains(input)).toBe(true);

    const row = shellRow(c);
    const centreIdx = idx(row, (el) => has(el, '.rounded-lg.shadow-2xl.overflow-visible'));
    const panelIdx = idx(row, (el) => has(el, 'input[placeholder="Paste or type a URL"]'));
    expect(panelIdx).toBeGreaterThan(centreIdx);
  });

  it('2: selected-text Comment opens at the same right-side position as Link (last child of the shell row)', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const row = shellRow(c);
    const panelIdx = idx(row, (el) => has(el, 'input[placeholder="Add a comment..."]'));
    expect(panelIdx).toBe(row.children.length - 1);
  });

  // The panel wrapper itself sits one level inside the row's direct child
  // (the shell's own grid-column + pointer-events wrapper, PATCH: centre
  // stays screen-centered) -- walk up to that direct child before comparing
  // slot index, rather than requiring the panel wrapper to be the row child.
  function directChildOf(row: HTMLElement, el: HTMLElement): HTMLElement {
    let node: HTMLElement | null = el;
    while (node && node.parentElement !== row) node = node.parentElement;
    return node as HTMLElement;
  }

  it('3: Link and Comment wrappers have identical width and occupy the same right-side grid column', () => {
    const linkC = openNote();
    selectText(linkC, 'world');
    click(btn(linkC, 'Add link to selected text')!);
    const lw = linkWrapper(linkC)!;
    expect(lw).not.toBeNull();
    expect(lw.getAttribute('style')).toContain('width: 300px');
    const linkRow = shellRow(linkC);
    const linkIdx = Array.from(linkRow.children).indexOf(directChildOf(linkRow, lw));

    const commentC = openNote();
    selectText(commentC, 'world');
    click(btn(commentC, 'Add comment to selected text')!);
    const cw = commentWrapper(commentC)!;
    expect(cw).not.toBeNull();
    expect(cw.getAttribute('style')).toContain('width: 300px');
    const commentRow = shellRow(commentC);
    const commentIdx = Array.from(commentRow.children).indexOf(directChildOf(commentRow, cw));

    expect(linkIdx).toBe(commentIdx);
    expect(linkIdx).toBe(linkRow.children.length - 1);
  });

  it('4: neither Link nor Comment renders inside the toolbar', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('.min-w-\\[72px\\]')!.contains(c.querySelector('input[placeholder="Paste or type a URL"]'))).toBe(false);

    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    expect(c.querySelector('.min-w-\\[72px\\]')!.contains(c.querySelector('input[placeholder="Add a comment..."]'))).toBe(false);
  });

  it('5: neither Link nor Comment renders inside the Note card', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(card(c).contains(c.querySelector('input[placeholder="Paste or type a URL"]'))).toBe(false);

    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    expect(card(c).contains(c.querySelector('input[placeholder="Add a comment..."]'))).toBe(false);
  });

  it('6: opening Link closes an already-open selected-text Comment', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();
    expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
  });

  it('7: opening selected-text Comment closes an already-open Link', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).toBeNull();
  });

  it('closing Link does not change the Note body', () => {
    const c = openNote();
    const before = c.querySelector('.ProseMirror')!.innerHTML;
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!);
    expect(c.querySelector('.ProseMirror')!.innerHTML).toBe(before);
  });

  it('closing selected-text Comment does not change the Note body', () => {
    const c = openNote();
    const before = c.querySelector('.ProseMirror')!.innerHTML;
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    click(btn(c, 'Close')!);
    expect(c.querySelector('.ProseMirror')!.innerHTML).toBe(before);
  });

  it('Document panels also use the shared exclusivity mechanism, with no per-call-site exclusion list', () => {
    const src = fs.readFileSync('components/collabboard/editors/DocumentEditor.tsx', 'utf8');
    expect(src).toContain("panels.openPanel('link')");
    expect(src).toContain("panels.openPanel('comment')");
  });
});
