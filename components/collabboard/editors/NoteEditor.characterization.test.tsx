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

  it('save callback carries only content/style/reaction fields — no title, no metadata', () => {
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
      ['badgeColor', 'cardColor', 'content', 'detachedComments', 'reactions', 'textColor', 'topStrip'].sort(),
    );
    expect(keys).not.toContain('title');
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
  it('locates working text controls, including the unwired Align control (PATCH-149 §14.10)', () => {
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Body</p>" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('button[title*="Bold"]')).not.toBeNull();
    expect(container.querySelector('button[title*="Italic"]')).not.toBeNull();
    // Align renders despite being a dead control (no onAlign supplied, no
    // extension-text-align in NOTE_EXTENSIONS) — measured here, not corrected.
    expect(container.querySelector('button[title*="Text alignment"]')).not.toBeNull();
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
  'Bold (Ctrl+B)',
  'Italic (Ctrl+I)',
  'Strikethrough',
  'Underline (Ctrl+U)',
  'Bullet list',
  'Numbered list',
  'Text alignment',
  'Code block',
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
    // Align renders despite being unwired (PATCH-149 §14.10) -- characterized, not corrected.
    expect(btn(c, 'Text alignment')).not.toBeNull();
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
    expect(btn(c, 'Bold (Ctrl+B)')).toBeNull(); // text tools replaced, not appended
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
  it('enables from selection and opens CommentPopup with the current hardcoded identity', () => {
    const c = openNote();
    expect(btn(c, 'Highlight text first!')).not.toBeNull();
    selectText(c, 'world');
    const enabled = btn(c, 'Add comment to selected text')!;
    expect(isDisabled(enabled)).toBe(false);
    click(enabled);
    expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    // Identity is hardcoded at NoteEditor.tsx:758-759 -- characterized, not corrected.
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    expect(src).toContain('currentUserId="user1"');
    expect(src).toContain('currentUserName="R"');
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
