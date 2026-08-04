// @vitest-environment jsdom
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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('DocumentEditor read-only (PATCH-149B1b-i)', () => {
  it('shows the title as visible text, not an input, with an empty-title fallback', () => {
    const c1 = mount(
      <DocumentEditor isOpen readOnly title="Read Doc" initialContent="<p>Body</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c1.textContent).toContain('Read Doc');
    expect(c1.querySelector('input[placeholder="Untitled document"]')).toBeNull();

    const c2 = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c2.textContent).toContain('Untitled document');
  });

  it('renders formatted body content and a registered custom mark (Comment)', () => {
    const c1 = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="<p>Hello <strong>world</strong></p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c1.querySelector('strong')).not.toBeNull();

    const c2 = mount(
      <DocumentEditor isOpen readOnly title="" initialContent='<span data-comment-id="c1">hi</span>' metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c2.innerHTML).toContain('data-comment-id="c1"');
  });

  it('renders no toolbar and no description input', () => {
    const container = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="<p>x</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('button[title*="Bold"]')).toBeNull();
    expect(container.querySelector('input[placeholder="Add a description..."]')).toBeNull();
  });

  it('the editor is genuinely non-editable', () => {
    const container = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="<p>locked</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    expect(pm.getAttribute('contenteditable')).toBe('false');
  });

  it('has an accessible Close control; Close and backdrop invoke onClose only, never onSave', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    const closeBtn = container.querySelector('button[aria-label="Close"]');
    expect(closeBtn).not.toBeNull();
    click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    const onSave2 = vi.fn();
    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="" metadata={{}} onSave={onSave2} onClose={onClose2} />,
    );
    click(c2.firstElementChild!);
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(onSave2).not.toHaveBeenCalled();
  });

  it('renders no dirty/discard UI', () => {
    const container = mount(
      <DocumentEditor isOpen readOnly title="" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/discard/i);
    expect(container.textContent).not.toMatch(/unsaved/i);
  });
});
