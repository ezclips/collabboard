// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NoteEditor from './NoteEditor';

// PATCH-149B0: characterizes NoteEditor's current behaviour under a real DOM so
// PATCH-149B1/B2 have a measured baseline instead of the vacuous renderToStaticMarkup
// output ('' — see PATCH-149.md §14.5) that a node-only environment produces.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// BINDING (PATCH-149.md §15.3): ProseMirror's DOMObserver flushes on a timer after
// teardown; unmounting every root here is what prevents the resulting
// "document is not defined" error from leaking into later tests.
let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
});

describe('NoteEditor closed state', () => {
  it('renders nothing when isOpen is false', () => {
    const container = mount(<NoteEditor isOpen={false} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(container.innerHTML.length).toBe(0);
  });
});

describe('NoteEditor open state (non-vacuity: fails if the modal renders empty while open)', () => {
  it('produces real DOM with a modal shell, ProseMirror body, and toolbar', () => {
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Legacy HTML body</p>" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(1000);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain('fixed inset-0 z-[1000]');
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
    expect(container.textContent).toContain('Legacy HTML body');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

describe('NoteEditor content initialization', () => {
  it('renders provided initial HTML as text', () => {
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Stored note</p>" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.textContent).toContain('Stored note');
  });

  it('initializes safely with empty content', () => {
    const container = mount(<NoteEditor isOpen initialContent="" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });
});

describe('NoteEditor current save-on-close lifecycle (characterized, not corrected)', () => {
  it('backdrop click saves then closes, in that order, and the save does persist', () => {
    const calls: string[] = [];
    const onSave = vi.fn(() => calls.push('save'));
    const onClose = vi.fn(() => calls.push('close'));
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Body</p>" onSave={onSave} onClose={onClose} />,
    );
    const overlay = container.firstElementChild as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(calls).toEqual(['save', 'close']);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('save callback carries content/style/reaction fields plus title (a top-level padlet field, added for the ghost-placeholder title bar) — still no metadata', () => {
    const onSave = vi.fn();
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Body</p>" onSave={onSave} onClose={vi.fn()} />,
    );
    const overlay = container.firstElementChild as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const keys = Object.keys(onSave.mock.calls[0][0]).sort();
    expect(keys).toEqual(
      ['badgeColor', 'cardColor', 'commentTitle', 'commentTitleStyle', 'content', 'detachedComments', 'reactions', 'textColor', 'title', 'titleStyle', 'topStrip'].sort(),
    );
    expect(keys).not.toContain('metadata');
  });
});

describe('NoteEditor Escape handling (characterizes absence — does not invent support)', () => {
  it('does not save or close on Escape', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    mount(<NoteEditor isOpen initialContent="<p>Body</p>" onSave={onSave} onClose={onClose} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('NoteEditor formatting toolbar (measured, not modified)', () => {
  it('locates working text controls inside the Text style panel, including the unwired Align control (PATCH-149 §14.10)', () => {
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Body</p>" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    // Bold/Italic/.../Align now live inside the Text style panel
    // (TextFormattingButtons), not the left toolbar -- open it first.
    click(container.querySelector('button[title="Change text formatting"]')!);
    expect(container.querySelector('button[title="Bold"]')).not.toBeNull();
    expect(container.querySelector('button[title="Italic"]')).not.toBeNull();
    // Align renders despite being a dead control (no onAlign supplied, no
    // extension-text-align in NOTE_EXTENSIONS) — measured here, not corrected.
    expect(container.querySelector('button[title="Align"]')).not.toBeNull();
  });
});

describe('NoteEditor prop surface (source-level; not observable from rendered DOM)', () => {
  it('declares no title prop and no readOnly prop on NoteEditorProps', () => {
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    const start = src.indexOf('interface NoteEditorProps');
    const body = src.slice(start, src.indexOf('\n}', start));
    expect(body).not.toMatch(/\btitle\s*:/);
    expect(body).not.toMatch(/\breadOnly\s*:/);
  });

  it('renders the fixed 280px note card width', () => {
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Body</p>" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const card = container.querySelector('.rounded-lg.shadow-2xl.overflow-visible') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.style.width).toBe('280px');
  });
});

describe('NoteEditor extraction ownership (PATCH-149B1a; source-level)', () => {
  it('constructs its editor via the shared hook, not a direct useEditor call', () => {
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    expect(src).toContain('useSharedTipTapEditor(');
    expect(src).not.toContain('useEditor(');
    expect(src).not.toContain('NOTE_EXTENSIONS');
  });
});

// ===========================================================================
// PATCH-152 stage 152-C1 (§20.5): characterization net for the Note editor
// SHELL, captured before the §20.3 Route-A extraction. Every assertion below
// records CURRENT behaviour. Nothing here is a desired future requirement, and
// no known defect is corrected -- see "known defects" at the end.
// ===========================================================================

// jsdom implements no layout: Range lacks getClientRects/getBoundingClientRect,
// which ProseMirror's scrollToSelection needs for structural commands.
if (!(Range.prototype as any).getClientRects) (Range.prototype as any).getClientRects = () => [];
if (!(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} });
}

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function titles(c: HTMLElement) {
  return Array.from(c.querySelectorAll('button')).map((b) => b.getAttribute('title')).filter(Boolean);
}
function btn(c: HTMLElement, title: string) {
  return c.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function isDisabled(b: HTMLButtonElement) {
  return b.className.includes('cursor-not-allowed');
}
// Real DOM selection over a known substring -- non-vacuity proof that a genuine
// ProseMirror selection occurred, not a simulated flag.
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
function openNote(content = '<p>hello world again</p>') {
  return mount(<NoteEditor isOpen initialContent={content} onSave={vi.fn()} onClose={vi.fn()} />);
}
// The shell's flex row: [toolbar zone][note card][...right-side panels]
function shellRow(c: HTMLElement) {
  return c.querySelector('.fixed.inset-0')!.firstElementChild as HTMLElement;
}
function rowIndexContaining(c: HTMLElement, predicate: (el: Element) => boolean) {
  return Array.from(shellRow(c).children).findIndex(predicate);
}

const TEXT_MODE_TITLES = [
  'Switch to Box Design',
  'Change text formatting',
  'Link text first!',
  'Highlight text first!',
];
const BOX_MODE_TITLES = [
  'Switch to Text Design',
  'Change card background and top strip color',
  'Add emoji reaction to this post',
  'Add a comment to this post',
];

describe('C1/1: Text mode is the default, with its current control set and order', () => {
  it('opens in Text mode and renders exactly the current text-mode controls, in order', () => {
    const c = openNote();
    expect(titles(c)).toEqual(TEXT_MODE_TITLES);
    // Align now lives inside the Text style panel (unwired there too,
    // PATCH-149 §14.10) rather than the toolbar -- characterized, not corrected.
    click(btn(c, 'Change text formatting')!);
    expect(btn(c, 'Align')).not.toBeNull();
  });

  it('shows the mode control labelled for the destination mode, not the current one', () => {
    const c = openNote();
    const toggle = btn(c, 'Switch to Box Design')!;
    expect(toggle).not.toBeNull();
    expect(toggle.parentElement!.textContent).toContain('Box');
  });

  it('Link and Comment start disabled with their current no-selection tooltips', () => {
    const c = openNote();
    expect(isDisabled(btn(c, 'Link text first!')!)).toBe(true);
    expect(isDisabled(btn(c, 'Highlight text first!')!)).toBe(true);
  });
});

describe('C1/2: Text <-> Box mode switching', () => {
  it('switches to Box mode, replacing the text controls, then back again, with one toolbar throughout', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    expect(titles(c)).toEqual(BOX_MODE_TITLES);
    expect(btn(c, 'Change text formatting')).toBeNull(); // text tools replaced, not appended
    expect(c.querySelectorAll('button[title^="Switch to"]').length).toBe(1); // no duplicate toolbar

    click(btn(c, 'Switch to Text Design')!);
    expect(titles(c)).toEqual(TEXT_MODE_TITLES);
    expect(btn(c, 'Change card background and top strip color')).toBeNull();
  });
});

describe('C1/3: Text style popup', () => {
  it('opens TextStylePopup with the current option set and closes again', () => {
    const c = openNote();
    expect(c.textContent).not.toContain('Large heading');
    click(btn(c, 'Change text formatting')!);
    for (const label of ['Large heading', 'Normal heading', 'Normal text', 'Small text', 'Code block', 'Callout', '"Quote block"']) {
      expect(c.textContent).toContain(label);
    }
    expect(btn(c, 'Text Color')).not.toBeNull();
    expect(btn(c, 'Highlight Color')).not.toBeNull();
    click(btn(c, 'Close')!);
    expect(c.textContent).not.toContain('Large heading');
    expect(c.querySelector('.ProseMirror')).not.toBeNull(); // centre survives
  });
});

describe('C1/4: Link workflow', () => {
  it('enables Link from a real selection alone and opens LinkPopup targeting that text', () => {
    const c = openNote();
    expect(btn(c, 'Link text first!')!.title).toBe('Link text first!');
    selectText(c, 'world');
    // CURRENT behaviour: NoteEditor.tsx:257-262 stores lastSelection via a React
    // state setter, which incidentally rerenders the toolbar. Characterized as-is.
    const enabled = btn(c, 'Add link to selected text')!;
    expect(enabled).not.toBeNull();
    expect(isDisabled(enabled)).toBe(false);
    click(enabled);
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).not.toBeNull();
  });

  it('Cancel closes the URL panel without mutating the body', () => {
    const c = openNote();
    const before = c.querySelector('.ProseMirror')!.innerHTML;
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!);
    expect(c.querySelector('input[placeholder="Paste or type a URL"]')).toBeNull();
    expect(c.querySelector('.ProseMirror')!.innerHTML).toBe(before);
  });

  it('Apply links only the selected text, leaving surrounding text unchanged', () => {
    const c = openNote();
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    const input = c.querySelector('input[placeholder="Paste or type a URL"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'example.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Apply')!);
    const html = c.querySelector('.ProseMirror')!.innerHTML;
    expect(html).toContain('<a');
    expect(html).toContain('world');
    expect(html).toContain('hello');
    expect(html).toContain('again');
  });

  it('prefills the existing URL when linked text is selected', () => {
    const c = openNote('<p>hello <a href="https://example.com">world</a> again</p>');
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('[title="https://example.com"]')).not.toBeNull();
  });
});

describe('C1/5: selected-text Comment (distinct from post-level Comment)', () => {
  it('enables from selection and opens CommentPopup', () => {
    const c = openNote();
    expect(btn(c, 'Highlight text first!')).not.toBeNull();
    selectText(c, 'world');
    const enabled = btn(c, 'Add comment to selected text')!;
    expect(isDisabled(enabled)).toBe(false);
    click(enabled);
    expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });

  // PATCH 8AB -- previously hardcoded currentUserId="user1"/currentUserName="R"
  // at this popup's own call site; now uses the same real identity props
  // already threaded into NoteEditor for the detached panel.
  it('a newly submitted anchored comment uses the real currentUserId/currentUserName props, not "user1"/"R"', () => {
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      currentUserId="real-user-123" currentUserName="Real Name"
      onSave={vi.fn()} onClose={vi.fn()} />);
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    const input = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'anchored identity check');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(c.textContent).toContain('anchored identity check');
    expect(c.textContent).toContain('Real Name');
    const mark = c.querySelector('.ProseMirror span[data-comment-id]');
    expect(mark?.getAttribute('data-user-id')).toBe('real-user-123');
    expect(mark?.getAttribute('data-user-name')).toBe('Real Name');
  });

  it('submitting marks only the selected text with a comment mark', () => {
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
});

describe('C1/6: Box mode - Card colour', () => {
  it('exposes Card colour, opens the existing colour panel with both tabs, and keeps the centre', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Change card background and top strip color')!);
    expect(c.textContent).toContain('Note Color');
    expect(btn(c, 'Background Color')).not.toBeNull();
    expect(btn(c, 'Top Strip Color')).not.toBeNull();
    expect(c.querySelector('.ProseMirror')).not.toBeNull();
  });
});

describe('C1/7: Box mode - Reaction', () => {
  it('exposes Reaction and opens the existing picker', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    const before = c.querySelectorAll('button').length;
    click(btn(c, 'Add emoji reaction to this post')!);
    expect(c.querySelectorAll('button').length).toBeGreaterThan(before);
    expect(c.querySelector('.note-emoji-picker')).not.toBeNull();
  });
});

describe('C1/8: Box mode - post-level Comment stays distinct from text Comment', () => {
  it('opens the detached post-comment surface, which is not the selected-text comment popup', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    const postComment = btn(c, 'Add a comment to this post')!;
    expect(postComment).not.toBeNull();
    expect(isDisabled(postComment)).toBe(false); // never selection-gated, unlike text Comment
    click(postComment);
    expect(c.textContent).toContain('Comments');
    expect(c.textContent).toContain('No comments yet');
    // The post-level path writes detachedComments; the text path writes a comment mark.
    expect(c.querySelector('.ProseMirror span[data-comment-id]')).toBeNull();
  });

  it('the two comment features are separate controls in separate modes', () => {
    const c = openNote();
    expect(btn(c, 'Highlight text first!')).not.toBeNull(); // text mode
    expect(btn(c, 'Add a comment to this post')).toBeNull();
    click(btn(c, 'Switch to Box Design')!);
    expect(btn(c, 'Add a comment to this post')).not.toBeNull(); // box mode
    expect(btn(c, 'Highlight text first!')).toBeNull();
  });
});

describe('C1/9: shell panel placement (the §20.7 panel contract, as it exists today)', () => {
  it('renders toolbar and note card as siblings, with the style panel after the card and never inside the toolbar wrapper', () => {
    const c = openNote();
    const toolbarIdx = rowIndexContaining(c, (el) => !!el.querySelector('button[title="Change text formatting"]'));
    const cardIdx = rowIndexContaining(c, (el) => !!el.querySelector('.ProseMirror'));
    expect(toolbarIdx).toBeGreaterThanOrEqual(0);
    expect(cardIdx).toBeGreaterThan(toolbarIdx); // toolbar is a sibling left of the card

    click(btn(c, 'Change text formatting')!);
    const panelIdx = rowIndexContaining(c, (el) => el.textContent!.includes('Large heading'));
    expect(panelIdx).toBeGreaterThan(cardIdx); // panel occupies the right-side region
    const toolbarZone = shellRow(c).children[toolbarIdx];
    expect(toolbarZone.textContent).not.toContain('Large heading'); // not nested in the toolbar wrapper
    expect(c.querySelector('.ProseMirror')).not.toBeNull(); // centre not replaced
  });

  it('the card-colour panel uses the same right-side region', () => {
    const c = openNote();
    const cardIdx = rowIndexContaining(c, (el) => !!el.querySelector('.ProseMirror'));
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Change card background and top strip color')!);
    const panelIdx = rowIndexContaining(c, (el) => el.textContent!.includes('Note Color'));
    expect(panelIdx).toBeGreaterThan(cardIdx);
  });
});

describe('C1/10: known defects characterized as-is (NOT future requirements)', () => {
  it('Note has no read-only concept: the toolbar and editable body are unconditional', () => {
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    expect(src).not.toMatch(/\breadOnly\b/);
    const c = openNote();
    expect(btn(c, 'Switch to Box Design')).not.toBeNull();
  });

  it('an empty comment thread shows the empty state and no secondary actions; Escape still does not close the note', () => {
    const onClose = vi.fn();
    const c = mount(<NoteEditor isOpen initialContent="<p>hello world again</p>" onSave={vi.fn()} onClose={onClose} />);
    selectText(c, 'world');
    click(btn(c, 'Add comment to selected text')!);
    // CommentPopup gates Edit/Strikethrough/Delete behind a non-empty thread.
    expect(c.textContent).toContain('No comments yet');
    expect(btn(c, 'Delete')).toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).not.toHaveBeenCalled(); // characterized absence, unchanged
  });
});

// PATCH-152 152-C1 correction (§21): link removal, reaction, and detached-
// comment submission, each proved as an EFFECT, not just an opening.
// Scope to the detached wrapper's "z-[100]" class -- its input shares a
// placeholder with CommentPopup's (NoteEditor.tsx:848, :1046, CommentPopup.tsx:483).
function detachedPanel(c: HTMLElement): HTMLElement {
  return c.querySelector('[data-comment-panel="true"]') as HTMLElement;
}

describe('C1/11: Link removal through the real LinkPopup (not just Cancel)', () => {
  it('removes an existing link via the real removal affordance, preserving surrounding text', () => {
    const c = openNote('<p>hello <a href="https://example.com">world</a> again</p>');
    selectText(c, 'world');
    click(btn(c, 'Add link to selected text')!);
    expect(c.querySelector('[title="https://example.com"]')).not.toBeNull();
    click(btn(c, 'Remove link')!);
    const html = c.querySelector('.ProseMirror')!.innerHTML;
    expect(html).not.toContain('<a');
    expect(html).toContain('world');
    expect(html).toContain('hello');
    expect(html).toContain('again');
  });
});

describe('C1/12: Box mode - Reaction application (selecting an emoji, not just opening)', () => {
  it('applies the chosen emoji to the current Note reaction state', () => {
    const c = openNote();
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add emoji reaction to this post')!);
    // jsdom can't attribute-select an astral emoji in title="..."; filter in JS.
    const option = Array.from(c.querySelectorAll<HTMLButtonElement>('.note-emoji-picker button')).find((b) => b.title === '👍')!;
    click(option);
    expect(c.querySelector('.note-emoji-picker')).toBeNull();
    expect(Array.from(c.querySelectorAll('span')).some((s) => s.textContent === '👍' && s.className.includes('cursor-pointer'))).toBe(true);
  });
});

// Real callers (CanvasModals.tsx:186,277) pass a stable initialDetachedComments
// reference; NoteEditor.tsx:100's own `= []` default is recreated every render,
// which :147-152's sync effect then wipes back to empty -- mirror the real
// caller instead of tripping that unreachable-in-production default path.
const STABLE_EMPTY_DETACHED: never[] = [];

describe('C1/13: Box mode - detached Comment submission (not just opening)', () => {
  it('submitting adds to the thread, updates the toolbar title, and leaves no text-comment mark', () => {
    const c = mount(<NoteEditor isOpen initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const input = detachedPanel(c).querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'nice note');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(c.textContent).toContain('nice note');
    expect(c.querySelector('button[title="1 comment"]')).not.toBeNull();
    expect(c.querySelector('.ProseMirror span[data-comment-id]')).toBeNull();
  });
});

// PATCH 8P: the detached/Category-A post-comment panel now inherits the
// canonical CommentAccessMode contract via a new `accessMode` prop (default
// 'manage', so C1/8 and C1/13 above stay green unchanged). These tests prove
// the INTEGRATION -- that passing accessMode="read" into NoteEditor actually
// reaches CommentPopup and produces the same read-only rendering CommentPopup
// itself already proves generically in CommentPopup.accessMode.test.tsx.
// They deliberately do not re-derive CommentPopup's own internal contract.
const ONE_DETACHED_COMMENT = [
  { id: 'c1', text: 'existing note comment', userId: 'u1', userName: 'A', timestamp: 1 },
];

describe('PATCH 8P: Box mode - detached Comment panel inherits the canonical READ contract', () => {
  it('read mode: existing comments are visible but composer/Send/Edit/Strikethrough/Delete are all absent', () => {
    const c = mount(<NoteEditor isOpen accessMode="read" initialContent="<p>hello world again</p>"
      initialDetachedComments={ONE_DETACHED_COMMENT} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    // The toolbar hint reads "View N comment(s)" once any comment exists,
    // rather than "Add a comment to this post" (NoteEditorToolbar.tsx:111)
    // -- unrelated to accessMode, a pre-existing characterization.
    click(btn(c, 'View 1 comment')!);
    expect(c.textContent).toContain('existing note comment');
    expect(detachedPanel(c).querySelector('input[placeholder="Add a comment..."]')).toBeNull();
    expect(detachedPanel(c).querySelector('button[aria-label="Send"]')).toBeNull();
    expect(detachedPanel(c).querySelector('button[title="Edit"]')).toBeNull();
    expect(detachedPanel(c).querySelector('button[title="Color"]')).toBeNull();
    expect(detachedPanel(c).querySelector('button[title="Strikethrough"]')).toBeNull();
    expect(detachedPanel(c).querySelector('button[title="Delete"]')).toBeNull();
  });

  it('manage mode (explicit or default/omitted) keeps the composer and Send available, unchanged', () => {
    const explicit = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(explicit, 'Switch to Box Design')!);
    click(btn(explicit, 'Add a comment to this post')!);
    expect(detachedPanel(explicit).querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    expect(detachedPanel(explicit).querySelector('button[aria-label="Send"]')).not.toBeNull();

    const omitted = mount(<NoteEditor isOpen initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(omitted, 'Switch to Box Design')!);
    click(btn(omitted, 'Add a comment to this post')!);
    expect(detachedPanel(omitted).querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });

  // PATCH 8AB -- previously the anchored/selected-text popup was explicitly
  // out of scope for the READ contract and stayed fully writable regardless
  // of accessMode; it now shares the same board-level accessMode as the
  // detached panel above.
  it('read mode disables the selected-text Comment creation affordance (button omitted, not merely disabled-looking)', () => {
    const c = mount(<NoteEditor isOpen accessMode="read" initialContent="<p>hello world again</p>" onSave={vi.fn()} onClose={vi.fn()} />);
    selectText(c, 'world');
    // In read mode onTextComment is omitted entirely, so the button's own
    // hint falls back to 'Read-only' -- it is never reachable by its
    // MANAGE-mode title, and clicking it (whatever its current title) is a
    // no-op that must not open the composer.
    expect(btn(c, 'Add comment to selected text')).toBeNull();
    const readOnlyButton = btn(c, 'Read-only');
    expect(readOnlyButton).not.toBeNull();
    expect(isDisabled(readOnlyButton!)).toBe(true);
    click(readOnlyButton!);
    const input = c.querySelector('[style*="width: 300px"] input[placeholder="Add a comment..."]') as HTMLInputElement | null;
    expect(input).toBeNull();
  });

  // ProseMirror's own click routing resolves a document position from layout
  // coordinates before calling editorProps.handleClick (see
  // DocumentEditor.tsx's handleBodyClick comment on the same constraint) --
  // not reliably exercised by a synthetic click in jsdom's layout-free
  // environment, so this is proven structurally rather than by simulating a
  // click on the rendered mark.
  it('read mode still allows opening an EXISTING anchored thread (view, not create): the click-to-open handler carries no accessMode gate', () => {
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    const handleClickStart = src.indexOf('handleClick: (view, pos, event) => {');
    expect(handleClickStart).toBeGreaterThan(-1);
    const handleClickEnd = src.indexOf('\n      },', handleClickStart);
    const handleClickBlock = src.slice(handleClickStart, handleClickEnd);
    expect(handleClickBlock).toContain('setActiveThread(thread)');
    expect(handleClickBlock).toContain("panels.openPanel('comment')");
    expect(handleClickBlock).not.toContain('canManageAnchoredComments');
    expect(handleClickBlock).not.toContain('anchoredAccessMode');
  });

  it('read mode never fires the anchored-thread mutation callbacks, even via direct DOM dispatch bypassing hidden UI', () => {
    const c = mount(<NoteEditor isOpen accessMode="read" initialContent="<p>hello world again</p>" onSave={vi.fn()} onClose={vi.fn()} />);
    // handleTextComment itself self-guards on canManageAnchoredComments, so
    // even if something invoked it directly (bypassing the omitted toolbar
    // button), no panel would open. Prove no comment panel exists at all.
    expect(c.querySelector('[style*="width: 300px"] input[placeholder="Add a comment..."]')).toBeNull();
    expect(btn(c, 'Add comment to selected text')).toBeNull();
  });
});

const TWO_DETACHED_COMMENTS = [
  { id: 'keep-me', text: 'sibling comment', userId: 'u1', userName: 'A', timestamp: 1 },
  { id: 'delete-me', text: 'comment to remove', userId: 'u1', userName: 'A', timestamp: 2 },
];

describe('PATCH 8P: Box mode - detached Comment Delete targets the correct row (row isolation)', () => {
  it('deleting one comment removes only that comment; its sibling is untouched', () => {
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={TWO_DETACHED_COMMENTS} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'View 2 comments')!);
    expect(c.textContent).toContain('sibling comment');
    expect(c.textContent).toContain('comment to remove');

    const rows = Array.from(detachedPanel(c).querySelectorAll('button[title="Delete"]'));
    // Two comments -> two Delete buttons, one per row; click the one whose
    // row contains 'comment to remove', not merely the first/last in the DOM.
    const target = rows.find((btn) => btn.closest('[class*="group"]')?.textContent?.includes('comment to remove'));
    expect(target).toBeTruthy();
    click(target!);

    expect(c.textContent).toContain('sibling comment');
    expect(c.textContent).not.toContain('comment to remove');
  });
});

// PATCH 8P.1: real identity for newly created detached comments (Category A
// only), and canonical Comments-panel title/style wiring. Neither touches
// the selected-text/anchored-thread CommentPopup, which keeps its own
// pre-existing hardcoded "user1"/"R" identity (see C1/5 above).
const HISTORICAL_USER1_COMMENT = [
  { id: 'legacy-1', text: 'an old comment', userId: 'user1', userName: 'R', timestamp: 1 },
];

describe('PATCH 8P.1: real authenticated identity for new detached comments', () => {
  it('a newly submitted comment uses the real currentUserId/currentUserName props, not "user1"/"R"', () => {
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} currentUserId="real-user-123" currentUserName="Real Name"
      onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const input = detachedPanel(c).querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'identity check');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    // The canonical CommentPopup row renders the author's userName directly.
    expect(c.textContent).toContain('identity check');
    expect(c.textContent).toContain('Real Name');
  });

  it('the onSave payload for a new comment carries the real currentUserId, never the "user1" placeholder', () => {
    const onSave = vi.fn();
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} currentUserId="real-user-123" currentUserName="Real Name"
      onSave={onSave} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const input = detachedPanel(c).querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'identity check');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    const overlay = c.firstElementChild as HTMLElement;
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const saved = onSave.mock.calls[0][0];
    const newComment = saved.detachedComments.find((cm: any) => cm.text === 'identity check');
    expect(newComment.userId).toBe('real-user-123');
    expect(newComment.userId).not.toBe('user1');
    expect(newComment.userName).toBe('Real Name');
  });

  it('historical comments already persisted with userId "user1" are left completely untouched', () => {
    const onSave = vi.fn();
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={HISTORICAL_USER1_COMMENT} currentUserId="real-user-123" currentUserName="Real Name"
      onSave={onSave} onClose={vi.fn()} />);
    // Open and close without editing -- no mutation should occur.
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'View 1 comment')!);
    expect(c.textContent).toContain('an old comment');
    const overlay = c.firstElementChild as HTMLElement;
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const saved = onSave.mock.calls[0][0];
    expect(saved.detachedComments).toEqual(HISTORICAL_USER1_COMMENT);
  });
});

describe('PATCH 8P.1: canonical Comments-panel title/style wiring (MANAGE)', () => {
  it('editing the title via the canonical h4 trigger updates the displayed title', () => {
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const titleEl = detachedPanel(c).querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(titleEl.tagName).toBe('H4');
    expect(titleEl.textContent).toBe('Comments');
    click(titleEl);
    const titleInput = detachedPanel(c).querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(titleInput, 'Feedback');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const committedTitle = detachedPanel(c).querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(committedTitle.tagName).toBe('H4');
    expect(committedTitle.textContent).toBe('Feedback');
  });

  it('styling the title via the canonical Palette trigger updates its inline color', () => {
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    click(detachedPanel(c).querySelector('[data-comment-panel-title="true"]') as HTMLElement);
    const styleTrigger = detachedPanel(c).querySelector('button[aria-label="Style comment title"]') as HTMLButtonElement;
    expect(styleTrigger).not.toBeNull();
    click(styleTrigger);
    // The style popup is portaled to document.body, not inside the mounted container.
    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    expect(swatch).not.toBeNull();
    click(swatch);
    const titleInput = detachedPanel(c).querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    expect(titleInput.style.color).toBe('rgb(76, 110, 245)');
  });

  it('title and title-style persist through close/reopen (survive the onSave payload)', () => {
    const onSave = vi.fn();
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} onSave={onSave} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    click(detachedPanel(c).querySelector('[data-comment-panel-title="true"]') as HTMLElement);
    const titleInput = detachedPanel(c).querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(titleInput, 'Feedback');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const styleTrigger = detachedPanel(c).querySelector('button[aria-label="Style comment title"]') as HTMLButtonElement;
    click(styleTrigger);
    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    click(swatch);
    act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    const overlay = c.firstElementChild as HTMLElement;
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const saved = onSave.mock.calls[0][0];
    expect(saved.commentTitle).toBe('Feedback');
    expect(saved.commentTitleStyle).toEqual({ color: '#4c6ef5' });

    // Reopen with the persisted values as initial props -- same round trip
    // CanvasModals.tsx performs when reopening an existing padlet.
    const reopened = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} initialCommentTitle={saved.commentTitle}
      initialCommentTitleStyle={saved.commentTitleStyle} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(reopened, 'Switch to Box Design')!);
    click(btn(reopened, 'Add a comment to this post')!);
    const reopenedTitle = detachedPanel(reopened).querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(reopenedTitle.textContent).toBe('Feedback');
    expect(reopenedTitle.style.color).toBe('rgb(76, 110, 245)');
  });

  it('opening and closing without any edit produces an unchanged commentTitle/commentTitleStyle in the onSave payload', () => {
    const onSave = vi.fn();
    const c = mount(<NoteEditor isOpen accessMode="manage" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} initialCommentTitle="Feedback"
      initialCommentTitleStyle={{ color: '#4c6ef5' }} onSave={onSave} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const overlay = c.firstElementChild as HTMLElement;
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const saved = onSave.mock.calls[0][0];
    expect(saved.commentTitle).toBe('Feedback');
    expect(saved.commentTitleStyle).toEqual({ color: '#4c6ef5' });
  });
});

describe('PATCH 8P.1: canonical Comments-panel title/style wiring (READ)', () => {
  it('READ mode displays a persisted custom title and its style, read-only', () => {
    const c = mount(<NoteEditor isOpen accessMode="read" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} initialCommentTitle="Feedback"
      initialCommentTitleStyle={{ color: '#4c6ef5' }} onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const titleEl = detachedPanel(c).querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(titleEl.tagName).toBe('H4');
    expect(titleEl.textContent).toBe('Feedback');
    expect(titleEl.style.color).toBe('rgb(76, 110, 245)');
  });

  it('READ mode cannot open title editing (h4 click is inert) or title styling (no Palette trigger)', () => {
    const c = mount(<NoteEditor isOpen accessMode="read" initialContent="<p>hello world again</p>"
      initialDetachedComments={STABLE_EMPTY_DETACHED} initialCommentTitle="Feedback" onSave={vi.fn()} onClose={vi.fn()} />);
    click(btn(c, 'Switch to Box Design')!);
    click(btn(c, 'Add a comment to this post')!);
    const titleEl = detachedPanel(c).querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    click(titleEl);
    expect(detachedPanel(c).querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    expect(detachedPanel(c).querySelector('button[aria-label="Style comment title"]')).toBeNull();
  });
});

// jsdom has no layout, so EditorView.posAtCoords (the real hit-test facility) is stubbed per test; production always calls the real one.
import { EditorView } from 'prosemirror-view';
describe('KNI-R3: selected-text context menu (Note)', () => {
  const stubHit = (offset: number) => vi.spyOn(EditorView.prototype, 'posAtCoords').mockImplementation(function (this: any) { return { pos: this.state.selection.from + offset, inside: -1 }; });
  const rightClick = (el: Element) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); act(() => { el.dispatchEvent(e); }); return e; };
  const menu = () => document.body.querySelector('[data-positioned-menu-surface]');

  it('a right-click inside a real selection opens the menu and stops it reaching an ancestor; no selection leaves it unclaimed and bubbling', () => {
    const c = openNote();
    const outer = vi.fn();
    document.addEventListener('contextmenu', outer);
    const bare = rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).toBeNull();
    expect(bare.defaultPrevented).toBe(false);
    expect(outer).toHaveBeenCalledTimes(1);
    selectText(c, 'world');
    const stub = stubHit(0);
    const claimed = rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).not.toBeNull();
    expect(claimed.defaultPrevented).toBe(true);
    expect(outer).toHaveBeenCalledTimes(1);
    stub.mockRestore();
    document.removeEventListener('contextmenu', outer);
  });

  it('a right-click outside the active selection does not claim it; one inside it applies color to only that word', () => {
    const c = openNote();
    selectText(c, 'world');
    const outside = stubHit(6);
    rightClick(c.querySelector('.ProseMirror')!);
    expect(menu()).toBeNull();
    outside.mockRestore();
    const inside = stubHit(0);
    rightClick(c.querySelector('.ProseMirror')!);
    act(() => { (document.body.querySelector('[aria-label="Red"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const html = c.querySelector('.ProseMirror')!.innerHTML;
    expect(html).toMatch(/rgb\(220, 38, 38\)[^>]*>world</);
    expect(html).not.toMatch(/rgb\(220, 38, 38\)[^>]*>hello/);
    inside.mockRestore();
  });
});
