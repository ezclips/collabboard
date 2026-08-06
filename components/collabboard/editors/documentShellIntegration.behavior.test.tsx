// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentEditor from './DocumentEditor';
// PATCH-152 C3-A (§24.15/38): CanvasModals cannot be imported in ANY test in
// this environment -- it unconditionally imports ImageEditor, which imports
// react-image-crop's CSS, which this repo's vitest/PostCSS pipeline cannot
// process ("Invalid PostCSS Plugin", independent of C3-A). Verified with a
// zero-logic import-only probe before writing this file. Fixing that is a
// vitest.config.ts/PostCSS change outside the C3-A allowlist. The OQ-2 proof
// below is therefore the strongest available real-chain substitute: the real
// DocumentEditor mounted with the exact currentUserId/currentUserName
// CanvasModals.tsx:168-169 passes, proving the DocumentEditor -> shell ->
// CommentPopup propagation; CanvasModals's own wiring is checked by source.

// PATCH-152 C3-A (§24.17): real-chain proofs that Document now consumes
// PostEditorShell -- structure, toolbar, panel convergence, selection
// reactivity/restoration/visibility, read-only containment, and OQ-2
// authenticated identity end-to-end. Note's own 33+20 tests are the
// regression net; this file proves Document-specific behaviour only.

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
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

function click(el: Element) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
function btn(c: HTMLElement, title: string) { return c.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null; }
function isDisabled(el: HTMLButtonElement) { return el.className.includes('cursor-not-allowed'); }
function openDoc(overrides: Partial<React.ComponentProps<typeof DocumentEditor>> = {}) {
  return mount(<DocumentEditor isOpen title="Doc" initialContent="<p>hello world again</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} {...overrides} />);
}
function centre(c: HTMLElement) { return c.querySelector('.rounded-2xl.shadow-2xl') as HTMLElement; }
function shellRow(c: HTMLElement) { return c.querySelector('.fixed.inset-0')!.firstElementChild as HTMLElement; }
function selectText(c: HTMLElement, text: string) {
  const pm = c.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let node: Text | null = null; let idx = -1;
    while ((node = walker.nextNode() as Text | null)) { idx = node.textContent?.indexOf(text) ?? -1; if (idx !== -1) break; }
    if (!node || idx === -1) throw new Error(`text not found: ${text}`);
    const range = document.createRange();
    range.setStart(node, idx); range.setEnd(node, idx + text.length);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
// Simulates the live ProseMirror selection drifting to a collapsed caret while
// a panel is open -- the shell's lastSelection stays stuck at the prior
// non-empty range (§24.11), so restoreSelection is what makes Apply correct.
function collapseCaretAtStart(c: HTMLElement) {
  const pm = c.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    const node = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT).nextNode() as Text;
    const range = document.createRange();
    range.setStart(node, 0); range.setEnd(node, 0);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
function setInput(el: HTMLInputElement, v: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Editable Document consumes PostEditorShell (1-4)', () => {
  it('renders exactly one shell overlay and one toolbar zone', () => {
    const c = openDoc();
    expect(c.querySelectorAll('.fixed.inset-0.z-\\[1000\\]').length).toBe(1);
    expect(c.querySelectorAll('.min-w-\\[72px\\]').length).toBe(1);
  });

  it('preserves title/body/description/Save/Close in the centre', () => {
    const c = openDoc();
    expect(c.querySelector('input[placeholder="Untitled document"]')).not.toBeNull();
    expect(c.querySelector('.ProseMirror')).not.toBeNull();
    expect(c.querySelector('input[placeholder="Add a description..."]')).not.toBeNull();
    expect(c.querySelector('button[aria-label="Save document"]')).not.toBeNull();
    expect(c.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it('DocumentEditor.tsx consumes PostEditorShell, not a local shell', () => {
    const src = fs.readFileSync('components/collabboard/editors/DocumentEditor.tsx', 'utf8');
    expect(src).toContain("from './PostEditorShell'");
    expect(src).not.toContain("from './NoteEditorToolbar'");
  });
});

describe('Document Text toolbar matches the governed set; incomplete Box mode cannot be entered (5,6)', () => {
  it('shows the governed control set in order, no Align, no Box switch', () => {
    const c = openDoc();
    for (const title of ['Change text formatting', 'Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Strikethrough', 'Underline (Ctrl+U)', 'Bullet list', 'Numbered list', 'Code block']) {
      expect(btn(c, title)).not.toBeNull();
    }
    expect(c.querySelector('button[title="Text alignment"]')).toBeNull();
    expect(c.querySelectorAll('button[title^="Switch to"]').length).toBe(0);
  });
});

describe('Document secondary panels converge into the shared right-side region (7-14)', () => {
  const has = (el: Element, sel: string) => el.matches(sel) || !!el.querySelector(sel);
  it('TextStylePopup: flex sibling after the centre, outside the toolbar, no absolute escape', () => {
    const c = openDoc();
    click(btn(c, 'Change text formatting')!);
    const row = shellRow(c);
    const idx = (pred: (el: Element) => boolean) => Array.from(row.children).findIndex(pred);
    const toolbarIdx = idx((el) => has(el, 'button[title="Change text formatting"]'));
    const centreIdx = idx((el) => has(el, 'input[placeholder="Untitled document"]'));
    const panelIdx = idx((el) => has(el, '[style*="width: 300px"]'));
    expect(centreIdx).toBeGreaterThan(toolbarIdx);
    expect(panelIdx).toBeGreaterThan(centreIdx);
    expect(centre(c).contains(c.querySelector('[style*="width: 300px"]'))).toBe(false);
    const panel = c.querySelector('[style*="width: 300px"]') as HTMLElement;
    expect(panel.className).not.toMatch(/\babsolute\b/);
  });

  it('LinkPopup: flex sibling after the centre, outside the toolbar, no absolute escape', () => {
    const c = openDoc();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    const input = c.querySelector('input[placeholder="Paste or type a URL"]')!;
    expect(centre(c).contains(input)).toBe(false);
    expect(c.querySelector('.min-w-\\[72px\\]')!.contains(input)).toBe(false);
    const wrapper = input.closest('div[class]') as HTMLElement;
    expect(wrapper.className).not.toMatch(/\babsolute\b/);
  });

  it('selected-text CommentPopup: flex sibling after the centre, no absolute escape, exclusive with the other two', () => {
    const c = openDoc();
    click(btn(c, 'Change text formatting')!);
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const input = c.querySelector('input[placeholder="Add a comment..."]');
    expect(input).not.toBeNull();
    expect(c.querySelector('.bg-white.rounded-lg.shadow-xl.border.border-gray-200.p-4.relative')).toBeNull(); // textStyle closed by exclusivity
    expect(centre(c).contains(input)).toBe(false);
    const wrapper = c.querySelector('[style*="width: 300px"]') as HTMLElement;
    expect(wrapper.contains(input)).toBe(true);
    expect(wrapper.className).not.toMatch(/\babsolute\b|\bfixed\b/);
  });

  it('centre remains mounted while a panel is open', () => {
    const c = openDoc();
    click(btn(c, 'Change text formatting')!);
    expect(c.querySelector('input[placeholder="Untitled document"]')).not.toBeNull();
  });
});

describe('Selection reactivity and restoration through the shell (15-20, 24)', () => {
  it('selection immediately enables Link and selected-text Comment; no unrelated click required', () => {
    const c = openDoc();
    expect(isDisabled(btn(c, 'Link text first!')!)).toBe(true);
    selectText(c, 'world');
    expect(btn(c, 'Add link to selected text')).not.toBeNull();
    expect(btn(c, 'Add comment to selected text')).not.toBeNull();
  });

  it('Link applies to the original stored selection even after the live selection drifts to a collapsed caret', () => {
    const c = openDoc();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    collapseCaretAtStart(c);
    setInput(c.querySelector('input[placeholder="Paste or type a URL"]') as HTMLInputElement, 'example.com');
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Apply')!);
    const html = c.querySelector('.ProseMirror')!.innerHTML;
    expect(html).toContain('<a');
    expect(html).toMatch(/<a[^>]*>world<\/a>/);
    expect(html).toContain('hello');
    expect(html).toContain('again');
  });

  it('Link removal applies to the original stored selection even after the live selection drifts', () => {
    const c = openDoc({ initialContent: '<p>hello <a href="https://example.com">world</a> again</p>' });
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    collapseCaretAtStart(c);
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Remove')!);
    expect(c.querySelector('.ProseMirror')!.innerHTML).not.toContain('<a');
  });

  it('selected-text Comment applies to the original stored selection even after the live selection drifts', () => {
    const c = openDoc();
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    collapseCaretAtStart(c);
    setInput(c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement, 'a comment');
    act(() => { c.querySelector('input[placeholder="Add a comment..."]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const mark = c.querySelector('.ProseMirror span[data-comment-id]');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('world');
  });

  it('an invalidated stored range fails safely and does not mutate the wrong content (24)', () => {
    function Parent({ content }: { content: string }) {
      return <DocumentEditor isOpen title="Doc" initialContent={content} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />;
    }
    const c = mount(<Parent content="<p>hello world again</p>" />);
    const { root } = mounted[mounted.length - 1];
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    act(() => { root.render(<Parent content="<p>hi</p>" />); }); // shrinks the doc; stored range now exceeds it
    setInput(c.querySelector('input[placeholder="Paste or type a URL"]') as HTMLInputElement, 'example.com');
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Apply')!);
    expect(c.querySelector('.ProseMirror')!.innerHTML).toBe('<p>hi</p>');
  });
});

describe('Selection visibility indicator (21-23)', () => {
  it('never enters the saved ProseMirror HTML regardless of overlay state', () => {
    const c = openDoc();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('.ProseMirror')!.innerHTML).not.toContain('shell-selection-overlay');
    expect(c.querySelector('.ProseMirror')!.innerHTML).not.toContain('OVERLAY-LEAK-MARKER');
  });

  it('does not appear when no panel holds focus', () => {
    const c = openDoc();
    selectText(c, 'world');
    expect(c.querySelector('[data-testid="shell-selection-overlay"]')).toBeNull();
  });
});

describe('Read-only Document: shell-level containment (28-33)', () => {
  it('the toolbar zone is structurally absent from the DOM, not merely hidden', () => {
    const c = mount(<DocumentEditor isOpen readOnly title="" initialContent="<p>x</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(c.querySelector('.min-w-\\[72px\\]')).toBeNull();
  });

  it('mounts no secondary panels', () => {
    const c = mount(<DocumentEditor isOpen readOnly title="" initialContent="<p>x</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(c.querySelector('[style*="width: 300px"]')).toBeNull();
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).toBeNull();
  });

  it('read-only renders the same centre serialization as editable for identical content', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    const editable = openDoc({ readOnly: false, initialContent: html });
    const readOnlyC = mount(<DocumentEditor isOpen readOnly title="" initialContent={html} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(readOnlyC.querySelector('.ProseMirror')!.innerHTML).toBe(editable.querySelector('.ProseMirror')!.innerHTML);
  });
});

describe('OQ-2: authenticated identity reaches CommentPopup through DocumentEditor -> PostEditorShell (38)', () => {
  it('carries real currentUserId/currentUserName (as CanvasModals.tsx:168-169 supplies them) through to the rendered comment', () => {
    const c = openDoc({ currentUserId: 'u1', currentUserName: 'Real User' });
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    setInput(c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement, 'a real comment');
    act(() => { c.querySelector('input[placeholder="Add a comment..."]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const mark = c.querySelector('.ProseMirror span[data-comment-id]');
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute('data-user-id')).toBe('u1');
    expect(mark!.getAttribute('data-user-name')).toBe('Real User');
  });

  it('CanvasModals.tsx wires readOnly, currentUserId and currentUserName to the real DocumentEditor unchanged (§24.15)', () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/CanvasModals.tsx', 'utf8');
    expect(src).toContain('readOnly={documentModalDestination === \'document-viewer\'}');
    expect(src).toContain('currentUserId={user?.id}');
    expect(src).toContain("currentUserName={user?.user_metadata?.name || user?.email?.split('@')[0] || 'Anonymous'}");
  });
});

describe('Save/discard lifecycle unchanged through the shell (25)', () => {
  it('a successful save updates the baseline, so Save re-disables with no further edits', async () => {
    const onSave = vi.fn(async () => ({ status: 'saved' as const }));
    const c = openDoc({ onSave, title: 'T' });
    const titleInput = c.querySelector('input[placeholder="Untitled document"]') as HTMLInputElement;
    setInput(titleInput, 'Edited');
    const saveBtn = c.querySelector('button[aria-label="Save document"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    await act(async () => { click(saveBtn); });
    expect(saveBtn.disabled).toBe(true);
  });
});
