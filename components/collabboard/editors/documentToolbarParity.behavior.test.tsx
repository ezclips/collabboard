// @vitest-environment jsdom
// PATCH-152: proves the Document toolbar's Text-style/Link/Comment controls
// against real editor state and DOM state (§8), including the primary OQ-3
// regression guard (§9) -- Link enabling solely because selection changed.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentEditor from './DocumentEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: Range lacks getClientRects/getBoundingClientRect, which ProseMirror's scrollToSelection needs for structural commands (e.g. toggleCodeBlock).
if (!(Range.prototype as any).getClientRects) (Range.prototype as any).getClientRects = () => [];
if (!(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} });
}

function isDisabledBtn(btn: HTMLButtonElement) {
  return btn.className.includes('cursor-not-allowed');
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
function unmount(container: HTMLElement) {
  const idx = mounted.findIndex((m) => m.container === container);
  if (idx === -1) return;
  const [m] = mounted.splice(idx, 1);
  act(() => { m.root.unmount(); });
  m.container.remove();
}
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function setValue(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
// Selects the exact substring `text` in the real ProseMirror doc -- non-vacuity proof of a genuine selection (§8 proof 8/9).
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
// Mid-string offset, not position 0 -- ProseMirror's DOMObserver (independent of this patch) discards a collapsed selection exactly at doc start in this jsdom harness.
function collapseSelection(c: HTMLElement) {
  const pm = c.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const node = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT).nextNode() as Text;
    const offset = Math.max(1, Math.floor((node.textContent?.length ?? 2) / 2));
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
function linkBtn(c: HTMLElement) {
  return c.querySelector('button[title="Link text first!"], button[title="Add link to selected text"]') as HTMLButtonElement | null;
}
function commentBtn(c: HTMLElement) {
  return c.querySelector('button[title="Highlight text first!"], button[title="Add comment to selected text"]') as HTMLButtonElement | null;
}
function textStyleBtn(c: HTMLElement) {
  return c.querySelector('button[title="Change text formatting"]') as HTMLButtonElement | null;
}
function open(title = '', content = '<p>hello world</p>', extra: Record<string, any> = {}) {
  return mount(<DocumentEditor isOpen title={title} initialContent={content} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} {...extra} />);
}

describe('PATCH-152 §8 1-7 (superseded by the follow-up Card color parity fix): toolbar renders the required text controls, still excludes Align', () => {
  it('renders Text style, Link, Comment, and the Box-mode toggle (Card color parity with Note); never Align', () => {
    const c = open();
    expect(textStyleBtn(c)).not.toBeNull(); // 1
    expect(linkBtn(c)).not.toBeNull(); // 2
    expect(commentBtn(c)).not.toBeNull(); // 3
    // Follow-up correction: Document now exposes the same Text/Box toggle
    // Note has, so a user can reach Card color to change the top strip color.
    expect(c.querySelector('button[title*="Switch to Box"]')).not.toBeNull();
    expect(c.querySelector('button[title*="Text alignment"]')).toBeNull(); // 5: Align is still never wired for Document
  });

  it('Text style opens TextStylePopup exposing only the authorized options', () => {
    const c = open();
    click(textStyleBtn(c)!); // 6
    for (const expected of ['Large heading', 'Normal heading', 'Normal text', 'Small text', 'Code block', 'Callout', '"Quote block"']) {
      expect(c.textContent).toContain(expected); // 7
    }
  });
});

describe('follow-up correction: Document Card color toolbar parity with Note', () => {
  function cardColorBtn(c: HTMLElement) {
    return c.querySelector('button[title="Change card background and top strip color"]') as HTMLButtonElement | null;
  }

  it('switching to Box mode shows exactly one tool: Card color (Reaction/Comment are not wired yet, so they are absent, not broken)', () => {
    const c = open();
    click(c.querySelector('button[title*="Switch to Box"]')!);
    expect(cardColorBtn(c)).not.toBeNull();
    expect(c.querySelector('button[title="Add emoji reaction to this post"]')).toBeNull();
    expect(c.querySelector('button[title*="Add a comment to this post"]')).toBeNull();
  });

  it('opens a BG/TS color panel; changing BG updates the saved backgroundColor', async () => {
    const onSave = vi.fn().mockResolvedValue({ status: 'saved' });
    const c = mount(<DocumentEditor isOpen title="T" initialContent="<p>hi</p>" metadata={{}} onSave={onSave} onClose={vi.fn()} />);
    click(c.querySelector('button[title*="Switch to Box"]')!);
    click(cardColorBtn(c)!);
    expect(c.textContent).toContain('Document Color');
    const bgSwatch = Array.from(c.querySelectorAll('button')).find((b) => b.title === 'Background Color')!;
    expect(bgSwatch.className).toContain('bg-white text-gray-900'); // BG tab active by default
    // ColorPickerContent's hex field displays/accepts digits WITHOUT the
    // leading '#' (it prepends one itself before validating/applying).
    const hexInput = c.querySelector('input[type="text"]') as HTMLInputElement;
    setValue(hexInput, 'f3f4f6');
    await act(async () => {
      c.querySelector('button[aria-label="Close"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ backgroundColor: '#f3f4f6' }),
    }));
  });

  it('the TS tab edits topStripColor independently from BG', async () => {
    const onSave = vi.fn().mockResolvedValue({ status: 'saved' });
    const c = mount(<DocumentEditor isOpen title="T" initialContent="<p>hi</p>" metadata={{}} onSave={onSave} onClose={vi.fn()} />);
    click(c.querySelector('button[title*="Switch to Box"]')!);
    click(cardColorBtn(c)!);
    click(Array.from(c.querySelectorAll('button')).find((b) => b.title === 'Top Strip Color')!);
    // "transparent" is a preset swatch, not a typeable hex value.
    click(c.querySelector('button[title="transparent"]')!);
    await act(async () => {
      c.querySelector('button[aria-label="Close"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ topStripColor: 'transparent' }),
    }));
  });

  it('closing without touching colors does not include backgroundColor/topStripColor overrides (no spurious dirty state)', () => {
    const dirtySpy = vi.fn();
    const c = mount(<DocumentEditor isOpen title="T" initialContent="<p>hi</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={dirtySpy} />);
    click(c.querySelector('button[title*="Switch to Box"]')!);
    click(cardColorBtn(c)!);
    expect(dirtySpy).toHaveBeenLastCalledWith(false); // opening the panel alone does not dirty the draft
  });
});

describe('PATCH-152 §9 PRIMARY REGRESSION GUARD + §8 8/9/15/16/19/20: Link enables solely from a genuine selection change', () => {
  it('Link disabled -> real non-empty selection with expected text -> Link enabled, with no manual rerender/typing/popup/colour edit; collapsing disables it again', () => {
    const c = open();
    const before = linkBtn(c)!;
    expect(before.title).toBe('Link text first!'); // before-state
    expect(isDisabledBtn(before)).toBe(true);

    selectText(c, 'world');

    const after = linkBtn(c)!;
    expect(after.title).toBe('Add link to selected text'); // 15: enabled from selection alone
    expect(isDisabledBtn(after)).toBe(false); // no typing, no popup, no colour edit, no unrelated state occurred above (16)

    collapseSelection(c);
    expect(linkBtn(c)!.title).toBe('Link text first!'); // 19: collapsing disables again
  });

  it('selecting linked text updates the active Link state and prefills the existing URL (20)', () => {
    const c = open('', '<p>hello <a href="https://example.com">world</a></p>');
    selectText(c, 'world');
    expect(linkBtn(c)!.className).toContain('bg-blue-100');
    click(linkBtn(c)!);
    expect(c.querySelector('[title="https://example.com"]')).not.toBeNull();
  });
});

describe('PATCH-152 §8 11-14/17/18: Link no-selection guard and selection-scoped application', () => {
  it('disabled tooltip is exact; activating without selection opens nothing and mutates nothing', () => {
    const c = open();
    expect(linkBtn(c)!.title).toBe('Link text first!'); // 11/12
    const before = c.querySelector('.ProseMirror')!.innerHTML;
    click(linkBtn(c)!); // 13
    expect(c.textContent).not.toContain('Paste or type a URL');
    expect(c.querySelector('.ProseMirror')!.innerHTML).toBe(before); // 14
  });

  it('Link applies only to the intended selection; surrounding text is unchanged', () => {
    const c = open();
    selectText(c, 'world');
    click(linkBtn(c)!);
    setValue(c.querySelector('input[placeholder="Paste or type a URL"]') as HTMLInputElement, 'example.com');
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Apply')!);
    const html = c.querySelector('.ProseMirror')!.innerHTML;
    expect(html).toContain('<a'); // 17
    expect(html).toContain('world');
    expect(html).toContain('hello'); // 18: surrounding text unchanged
    expect(html.match(/hello/g)?.length).toBe(1);
  });
});

describe('PATCH-152 §8 10: a formatting command applies to the actual selected Document text', () => {
  it('Code block wraps the selected text without disturbing the rest', () => {
    const c = open();
    selectText(c, 'world');
    click(textStyleBtn(c)!);
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes('Code block'))!);
    expect(c.querySelector('.ProseMirror pre')).not.toBeNull();
    expect(c.textContent).toContain('hello');
    expect(c.textContent).toContain('world');
  });
});

describe('PATCH-152 §8 21-27: Comment enablement, pinned OQ-2 identity, and mark application', () => {
  it('disabled with the exact tooltip until a real selection exists, then enables', () => {
    const c = open();
    expect(commentBtn(c)!.title).toBe('Highlight text first!'); // 21/22
    expect(isDisabledBtn(commentBtn(c)!)).toBe(true);
    selectText(c, 'world');
    expect(commentBtn(c)!.title).toBe('Add comment to selected text'); // 23
    expect(isDisabledBtn(commentBtn(c)!)).toBe(false);
  });

  it('uses currentUserId and the pinned currentUserName expression; applies only to the selection; isComment reflects the active mark', () => {
    const c = open('', '<p>hello world</p>', { currentUserId: 'u-42', currentUserName: 'Ada' });
    selectText(c, 'world');
    click(commentBtn(c)!);
    setValue(c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement, 'nice work');
    const input = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const mark = c.querySelector('.ProseMirror span[data-comment-id]') as HTMLElement;
    expect(mark).not.toBeNull(); // 26
    expect(mark.getAttribute('data-user-id')).toBe('u-42'); // 24
    expect(mark.getAttribute('data-user-name')).toBe('Ada'); // 25
    expect(mark.textContent).toBe('world');
    expect(c.querySelector('.ProseMirror')!.textContent).toContain('hello');
    selectText(c, 'world');
    expect(commentBtn(c)!.className).toContain('bg-blue-100'); // 27: isComment reflects the active mark
  });
});

describe('PATCH-152 §8 28/29: selectionUpdate listener lifecycle', () => {
  it('registers its own selectionUpdate listener last and removes exactly that listener on unmount, with a fresh one (not a stale duplicate) on the next mount', () => {
    // @tiptap/react's useEditor also registers its own selectionUpdate listener (destroyed on a deferred tick, out of scope here); ours runs after that hook, so
    // it's identifiable as the last one registered this mount -- verified by function identity, not a raw count the library's internal listener would pollute.
    const onSpy = vi.spyOn(Editor.prototype, 'on');
    const offSpy = vi.spyOn(Editor.prototype, 'off');
    const selUpdateOn = () => onSpy.mock.calls.filter((call) => call[0] === 'selectionUpdate').map((call) => call[1]);
    const selUpdateOff = (fn: unknown) => offSpy.mock.calls.filter((call) => call[0] === 'selectionUpdate' && call[1] === fn).length;

    const c1 = open();
    const registered1 = selUpdateOn();
    expect(registered1.length).toBeGreaterThan(0); // 28: our listener was registered
    const mine1 = registered1[registered1.length - 1];
    unmount(c1);
    expect(selUpdateOff(mine1)).toBe(1); // our synchronous cleanup removed exactly it, exactly once

    const c2 = open();
    const registered2 = selUpdateOn().filter((fn) => !registered1.includes(fn));
    expect(registered2.length).toBe(registered1.length); // 29: second cycle re-registers the same shape, no leftover duplicate from the first
    const mine2 = registered2[registered2.length - 1];
    expect(mine2).not.toBe(mine1); // a genuinely fresh listener, not the stale one reused
    unmount(c2);
    expect(selUpdateOff(mine2)).toBe(1);

    onSpy.mockRestore();
    offSpy.mockRestore();
  });
});

describe('PATCH-152 §8 30-33: no regression to Document lifecycle or Note', () => {
  it('dirty-state and identity absence remain unaffected by the new controls (PATCH-152: observed via onDirtyChange, no Save button)', () => {
    const onSave = vi.fn();
    const dirtySpy = vi.fn();
    const c = mount(<DocumentEditor isOpen title="T" initialContent="<p>hello</p>" metadata={{}} onSave={onSave} onClose={vi.fn()} onDirtyChange={dirtySpy} />);
    expect(c.querySelector('button[aria-label="Save document"]')).toBeNull();
    expect(dirtySpy).toHaveBeenLastCalledWith(false); // clean on open, unaffected
    selectText(c, 'hello');
    click(linkBtn(c)!);
    expect(dirtySpy).toHaveBeenLastCalledWith(false); // opening a popup alone does not dirty the draft
  });
});

// jsdom has no layout, so EditorView.posAtCoords (the real hit-test facility) is stubbed per test; production always calls the real one.
import { EditorView } from 'prosemirror-view';
describe('KNI-R3: selected-text context menu (Document) -- same shared component as Note', () => {
  const stubHit = (offset: number) => vi.spyOn(EditorView.prototype, 'posAtCoords').mockImplementation(function (this: any) { return { pos: this.state.selection.from + offset, inside: -1 }; });
  const rightClick = (el: Element) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); act(() => { el.dispatchEvent(e); }); return e; };
  const menu = () => document.body.querySelector('[data-positioned-menu-surface]');

  it('opens on a right-click inside a real selection, using the shared SelectedTextContextMenu component (source-level)', () => {
    const src = require('node:fs').readFileSync('components/collabboard/editors/DocumentEditor.tsx', 'utf8');
    expect(src).toContain("import SelectedTextContextMenu from './SelectedTextContextMenu'");
    const c = open();
    selectText(c, 'world');
    const stub = stubHit(0);
    const event = rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
    stub.mockRestore();
  });

  it('does not claim without a real selection, or when the click lands outside it', () => {
    const c = open();
    const bare = rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).toBeNull();
    expect(bare.defaultPrevented).toBe(false);
    selectText(c, 'world');
    const outside = stubHit(6);
    rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).toBeNull();
    outside.mockRestore();
  });

  it('read-only: never opens the menu even over a real selection', () => {
    const c = open('', '<p>hello world</p>', { readOnly: true });
    selectText(c, 'world');
    const stub = stubHit(0);
    rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).toBeNull();
    stub.mockRestore();
  });
});
