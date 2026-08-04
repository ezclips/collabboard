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
