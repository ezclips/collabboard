// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentEditor from './DocumentEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

// Synthetic corpus-shaped fixture (PATCH-149.md §19.2) -- no real content.
const SYNTHETIC_MALFORMED = 'Line one <not a tag\n\nLine two > also not one\n'.repeat(10);

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('DocumentEditor editable (PATCH-149B1b-i)', () => {
  it('renders a title input with the current title', () => {
    const container = mount(
      <DocumentEditor isOpen title="My Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const input = container.querySelector('input[placeholder="Untitled document"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('My Doc');
  });

  it('renders adapted plain text and malformed angle-bracket content without loss', () => {
    const c1 = mount(
      <DocumentEditor isOpen title="" initialContent="hello world" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c1.textContent).toContain('hello world');
    const c2 = mount(
      <DocumentEditor isOpen title="" initialContent={SYNTHETIC_MALFORMED} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c2.textContent).toContain('not a tag');
    expect(c2.textContent).toContain('also not one');
  });

  it('renders valid supported HTML as formatted markup', () => {
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="<p>Hello <strong>world</strong></p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('strong')).not.toBeNull();
  });

  it('shows the Document toolbar with real controls, no Align, and no Link/Comment/TextStyle', () => {
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="<p>x</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('button[title*="Bold"]')).not.toBeNull();
    expect(container.querySelector('button[title*="Underline"]')).not.toBeNull();
    expect(container.querySelector('button[title*="Text alignment"]')).toBeNull();
    expect(container.querySelector('button[title="Link text first!"]')).toBeNull();
    expect(container.querySelector('button[title="Change text formatting"]')).toBeNull();
    expect(container.querySelector('button[title*="Switch to Box"]')).toBeNull();
  });

  it('Bold control executes a real command and formatting survives serialized save output', () => {
    const onSave = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="T" initialContent="<p>hello</p>" metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    act(() => {
      pm.focus();
      const range = document.createRange();
      range.selectNodeContents(pm);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const boldBtn = container.querySelector('button[title*="Bold"]') as HTMLButtonElement;
    click(boldBtn);
    click(container.firstElementChild!);
    expect(onSave.mock.calls[0][0].content).toContain('<strong>');
  });

  it('keeps title separate from body content, and preserves metadata through save', () => {
    const onSave = vi.fn();
    const container = mount(
      <DocumentEditor
        isOpen
        title="My Title"
        initialContent="<p>Body</p>"
        metadata={{ parentId: 'p1', zIndex: 2 }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    click(container.firstElementChild!);
    const payload = onSave.mock.calls[0][0];
    expect(payload.content).not.toContain('My Title');
    expect(payload.title).toBe('My Title');
    expect(payload.metadata).toMatchObject({ parentId: 'p1', zIndex: 2 });
  });

  it('Close saves exactly once then closes exactly once', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    click(container.querySelector('button[aria-label="Close"]')!);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click saves exactly once then closes exactly once; inner clicks never save', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    click(container.querySelector('.ProseMirror')!);
    expect(onSave).not.toHaveBeenCalled();
    click(container.firstElementChild!);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not save on mount, and mounts safely with an empty new draft', () => {
    const onSave = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('does not duplicate the shared TipTap extension registry or add PDF code', () => {
    const src = fs.readFileSync('components/collabboard/editors/DocumentEditor.tsx', 'utf8');
    expect(src).toContain('useSharedTipTapEditor');
    expect(src).not.toMatch(/const \w*_EXTENSIONS\s*=\s*\[/);
    expect(src).not.toMatch(/pdf/i);
  });

  it('Escape is characterized as a no-op', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    mount(<DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
