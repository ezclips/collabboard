// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostEditorShell, { useShellPanels } from './PostEditorShell';
import NoteEditor from './NoteEditor';

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
    click(c.querySelector('[data-testid="inside"]')!);
    expect(onBackdropClick).not.toHaveBeenCalled();
    click(c.firstElementChild as HTMLElement);
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
        <button onClick={() => panels.openPanel('comment', ['textStyle', 'cardColor', 'reaction'])}>openComment</button>
      </div>
    );
  }
  const find = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll('button')).find((b) => b.textContent === text)!;

  it('opening one panel does not close an unrelated one that has no declared conflict', () => {
    const c = mount(<Harness />);
    click(find(c, 'openTextStyle'));
    click(find(c, 'openCardColor'));
    expect(c.querySelector('[data-testid="textStyle"]')!.textContent).toBe('true');
    expect(c.querySelector('[data-testid="cardColor"]')!.textContent).toBe('true');
  });

  it('opening with an explicit closing list reproduces the current handleTextComment transition', () => {
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
  return Array.from(c.querySelectorAll('div')).find((d) => d.className.includes('z-[100]')) as HTMLElement;
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
    expect(btn(c, 'View 1 comment')).not.toBeNull();
  });

  it('survives when the prop is omitted entirely', async () => {
    const c = openNote();
    await addAndRerender(c);
    expect(c.textContent).toContain('persists');
    expect(btn(c, 'View 1 comment')).not.toBeNull();
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

  it('LinkPopup stays card-relative', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    const input = c.querySelector('input[placeholder="Paste or type a URL"]')!;
    expect(card(c).contains(input)).toBe(true);
  });

  it('selected-text CommentPopup stays card-relative', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const input = card(c).querySelector('input[placeholder="Add a comment..."]');
    expect(input).not.toBeNull();
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

// PATCH-152 P1 (§23.3): pins the real NoteEditor call site -- a synthetic
// useShellPanels-only test cannot detect a regression at handleTextComment
// itself. Measured coexistence (Task 1): TextStylePopup, Card colour,
// Reaction and Link never close one another; only opening selected-text
// Comment closes textStyle/cardColor/reaction.
describe('Real NoteEditor panel coordination (§23.3): selected-text Comment closes textStyle/cardColor/reaction, not Link', () => {
  it('closes exactly the three declared panels and leaves Link and later coexistence unaffected', () => {
    const c = openNote();
    const textStyle = () => c.querySelector('[style*="width: 300px"]');
    const cardColorPanel = () => c.querySelector('.bg-white.rounded-lg.shadow-xl.border.border-gray-200.p-4.h-fit');
    const reaction = () => c.querySelector('.note-emoji-picker');

    click(btn(c, 'Change text formatting')!);
    expect(textStyle()).not.toBeNull();

    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Change card background and top strip color')!);
    expect(textStyle()).not.toBeNull();
    expect(cardColorPanel()).not.toBeNull();

    click(btn(c, 'Add emoji reaction to this post')!);
    expect(textStyle()).not.toBeNull();
    expect(cardColorPanel()).not.toBeNull();
    expect(reaction()).not.toBeNull();

    click(btn(c, 'Switch to Text Design')!);
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(textStyle()).not.toBeNull();
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();

    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    expect(card(c).querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    expect(textStyle()).toBeNull();
    expect(cardColorPanel()).toBeNull();
    expect(reaction()).toBeNull();
    // Link is not in the declared closing list -- it must survive the Comment
    // transition (over-closing detector, §23.3/12).
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();

    click(btn(c, 'Close')!);
    click(btn(c, 'Change text formatting')!);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Change card background and top strip color')!);
    expect(textStyle()).not.toBeNull();
    expect(cardColorPanel()).not.toBeNull();
  });
});
