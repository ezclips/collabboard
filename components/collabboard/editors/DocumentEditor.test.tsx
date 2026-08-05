// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentEditor from './DocumentEditor';
import type { SaveCardResult } from '@/hooks/canvas/usePadletSave';

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
function escKey() {
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
}
function saveBtn(c: HTMLElement) {
  return c.querySelector('button[aria-label="Save document"]') as HTMLButtonElement | null;
}
// Reuses the toolbar's real Bold command to produce a genuine body-HTML
// change -- the same mechanism the existing formatting test already relied on.
function toggleBold(c: HTMLElement) {
  const pm = c.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const range = document.createRange();
    range.selectNodeContents(pm);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  click(c.querySelector('button[title*="Bold"]')!);
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

  it('Bold control executes a real command; dirties the draft, and formatting survives the save payload (1-4/9/11/14-16)', () => {
    const onSave = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="T" initialContent="<p>hello</p>" metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    expect(saveBtn(container)).not.toBeNull(); // 11: visible editable
    expect(saveBtn(container)!.disabled).toBe(true); // 13/1: clean on open -> disabled
    toggleBold(container);
    expect(saveBtn(container)!.disabled).toBe(false); // 4/14: body edit dirties -> enabled
    click(saveBtn(container)!);
    expect(onSave).toHaveBeenCalledTimes(1); // 16
    expect(onSave.mock.calls[0][0].content).toContain('<strong>'); // 15
  });

  it('keeps title separate from body content, and preserves metadata through save (15)', () => {
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
    setInput(descInput(container), 'x'); // dirty via an unchecked field
    click(saveBtn(container)!);
    const payload = onSave.mock.calls[0][0];
    expect(payload.content).not.toContain('My Title');
    expect(payload.title).toBe('My Title');
    expect(payload.metadata).toMatchObject({ parentId: 'p1', zIndex: 2 });
  });

  it('25: clean Close exits immediately, no save', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    click(container.querySelector('button[aria-label="Close"]')!);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('26-28: dirty Close opens discard confirmation; Keep editing preserves the draft; Discard closes without saving', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'Edited');
    click(container.querySelector('button[aria-label="Close"]')!);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull(); // 26
    click(container.querySelectorAll('[role="alertdialog"] button')[0]);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull(); // 27: Keep editing closes only the confirmation
    expect(titleInput(container).value).toBe('Edited'); // 27: draft preserved
    click(container.querySelector('button[aria-label="Close"]')!);
    const discardBtn = Array.from(container.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Discard changes')!;
    click(discardBtn);
    expect(onSave).not.toHaveBeenCalled(); // 28
    expect(onClose).toHaveBeenCalledTimes(1); // 28
  });

  it('29/30: clean backdrop closes immediately; dirty backdrop confirms instead of closing; inner clicks never trigger it', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    click(container.querySelector('.ProseMirror')!);
    expect(onClose).not.toHaveBeenCalled();
    click(container.firstElementChild!); // clean backdrop
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={onClose2} />,
    );
    setInput(titleInput(c2), 'Edited');
    click(c2.firstElementChild!); // dirty backdrop
    expect(onClose2).not.toHaveBeenCalled();
    expect(c2.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it('31-33: clean Escape closes; dirty Escape confirms; Escape inside the confirmation returns to editing', () => {
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={vi.fn()} onClose={onClose} />,
    );
    escKey();
    expect(onClose).toHaveBeenCalledTimes(1); // 31

    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={onClose2} />,
    );
    setInput(titleInput(c2), 'Edited');
    escKey();
    expect(onClose2).not.toHaveBeenCalled();
    expect(c2.querySelector('[role="alertdialog"]')).not.toBeNull(); // 32
    escKey();
    expect(c2.querySelector('[role="alertdialog"]')).toBeNull(); // 33
    expect(onClose2).not.toHaveBeenCalled();
    expect(titleInput(c2).value).toBe('Edited');
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
});
describe('PATCH-149B2-i: save result handling (17-24)', () => {
  it('17: a second Save click while saving is blocked -- exactly one onSave call', async () => {
    let resolveSave: (r: SaveCardResult) => void;
    const onSave = vi.fn(() => new Promise<SaveCardResult>((res) => { resolveSave = res; }));
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    setInput(titleInput(container), 'Edited');
    click(saveBtn(container)!);
    expect(saveBtn(container)!.disabled).toBe(true); // 18: saving indicator/disabled
    expect(container.textContent).toContain('Saving');
    click(saveBtn(container)!); // blocked -- button is disabled and handler re-guards
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave!({ status: 'saved' }); });
  });

  it('19: a successful save closes the modal; a void-returning onSave is also treated as success', async () => {
    const onSave = vi.fn(async (): Promise<SaveCardResult> => ({ status: 'saved' }));
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'Edited');
    await act(async () => { click(saveBtn(container)!); });
    expect(onClose).toHaveBeenCalledTimes(1);

    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={onClose2} />,
    );
    setInput(titleInput(c2), 'Edited');
    await act(async () => { click(saveBtn(c2)!); });
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('20-23: a failed save keeps the modal open, preserves the dirty draft, shows an accessible error, and a retry can succeed', async () => {
    const onSave = vi.fn()
      .mockResolvedValueOnce({ status: 'failed', error: new Error('network') } as SaveCardResult)
      .mockResolvedValueOnce({ status: 'saved' } as SaveCardResult);
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'Edited');
    await act(async () => { click(saveBtn(container)!); });
    expect(onClose).not.toHaveBeenCalled(); // 20
    expect(titleInput(container).value).toBe('Edited'); // 21
    expect(saveBtn(container)!.disabled).toBe(false); // 22: still dirty -> retry enabled
    expect(container.querySelector('[role="alert"]')).not.toBeNull(); // accessible error
    await act(async () => { click(saveBtn(container)!); }); // 23: retry
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("skipped-blank and deferred-placement both close without being presented as a completed save", async () => {
    for (const status of ['skipped-blank', 'deferred-placement'] as const) {
      const onSave = vi.fn(async (): Promise<SaveCardResult> => ({ status }));
      const onClose = vi.fn();
      const container = mount(
        <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
      );
      setInput(titleInput(container), 'Edited');
      await act(async () => { click(saveBtn(container)!); });
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('PATCH-149B2-i: dirty-state definition (5-10)', () => {
  it('reverting title/description to baseline returns clean; unrelated rerenders and mount do not dirty', () => {
    const container = mount(
      <DocumentEditor isOpen title="Base" initialContent="" metadata={{ description: 'Base desc' }} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(saveBtn(container)!.disabled).toBe(true); // 1/9: clean on open, no phantom dirty
    setInput(titleInput(container), 'Changed');
    expect(saveBtn(container)!.disabled).toBe(false); // 2
    setInput(titleInput(container), 'Base');
    expect(saveBtn(container)!.disabled).toBe(true); // 5: revert -> clean
    setInput(descInput(container), 'Changed desc');
    expect(saveBtn(container)!.disabled).toBe(false); // 3
    setInput(descInput(container), 'Base desc');
    expect(saveBtn(container)!.disabled).toBe(true); // 6: revert -> clean
  });

  it('reverting body to the normalized baseline returns clean (7)', () => {
    const container = mount(
      <DocumentEditor isOpen title="T" initialContent="<p>hello</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    toggleBold(container);
    expect(saveBtn(container)!.disabled).toBe(false);
    toggleBold(container); // toggling back off returns the same normalized HTML
    expect(saveBtn(container)!.disabled).toBe(true);
  });

  it('unrelated parent rerenders do not change dirty state (8)', () => {
    function Parent({ n }: { n: number }) {
      return <DocumentEditor isOpen title="T" initialContent="" metadata={{ n } as any} onSave={vi.fn()} onClose={vi.fn()} />;
    }
    const container = mount(<Parent n={0} />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'Edited');
    expect(saveBtn(container)!.disabled).toBe(false);
    act(() => { root.render(<Parent n={1} />); }); // unrelated metadata key changes
    expect(saveBtn(container)!.disabled).toBe(false);
    expect(titleInput(container).value).toBe('Edited');
  });
});

describe('PATCH-149B2-i: creation flow (35-40)', () => {
  it('35: a blank untouched new draft closes without confirmation on Close/backdrop/Escape', () => {
    for (const via of ['close', 'backdrop', 'escape'] as const) {
      const onSave = vi.fn();
      const onClose = vi.fn();
      const container = mount(
        <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
      );
      if (via === 'close') click(container.querySelector('button[aria-label="Close"]')!);
      else if (via === 'backdrop') click(container.firstElementChild!);
      else escKey();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    }
  });

  it('36/37: an edited blank draft confirms on Close, and Discard creates no row (saveCard is never invoked)', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'New Doc');
    click(container.querySelector('button[aria-label="Close"]')!);
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    const discardBtn = Array.from(container.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Discard changes')!;
    click(discardBtn);
    expect(onSave).not.toHaveBeenCalled(); // 37: no row created
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('38/39: Save on a blank new draft follows the existing skipped-blank path and is not presented as a completed save', async () => {
    const onSave = vi.fn(async (): Promise<SaveCardResult> => ({ status: 'skipped-blank' }));
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), ' '); // dirties the draft so Save is reachable
    await act(async () => { click(saveBtn(container)!); });
    expect(onSave).toHaveBeenCalledTimes(1); // 38: routed through the existing saveCard path
    expect(onClose).toHaveBeenCalledTimes(1); // 39: closes, but never claims a persisted save
  });
});

function setInput(el: HTMLInputElement, v: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function titleInput(c: HTMLElement) {
  return c.querySelector('input[placeholder="Untitled document"]') as HTMLInputElement;
}
function descInput(c: HTMLElement) {
  return c.querySelector('input[placeholder="Add a description..."]') as HTMLInputElement;
}

describe('DocumentEditor draft stability across parent rerenders (PATCH-149 §23.15 F3)', () => {
  it('survives a fresh {} metadata reference on an unrelated rerender; edits are what get saved', () => {
    const onSave = vi.fn();
    const stored = { title: 'Stored Title', metadata: undefined as any };
    function Parent() {
      return (
        <DocumentEditor isOpen title={stored.title} initialContent="" metadata={stored.metadata || {}} onSave={onSave} onClose={vi.fn()} />
      );
    }
    const container = mount(<Parent />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'User Renamed This');
    setInput(descInput(container), 'User Description');
    act(() => { root.render(<Parent />); }); // fresh {} every render, same caller pattern as CanvasClient:7374
    expect(titleInput(container).value).toBe('User Renamed This');
    expect(descInput(container).value).toBe('User Description');
    click(saveBtn(container)!);
    expect(onSave.mock.calls[0][0].title).toBe('User Renamed This');
    expect(onSave.mock.calls[0][0].metadata.description).toBe('User Description');
  });

  it('survives a newly allocated but value-equivalent metadata object', () => {
    function Parent({ n }: { n: number }) {
      return (
        <DocumentEditor isOpen title="Stored Title" initialContent="" metadata={{ description: 'orig', parentId: 'p1' }} onSave={vi.fn()} onClose={vi.fn()} />
      );
    }
    const container = mount(<Parent n={0} />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'Edited Title');
    act(() => { root.render(<Parent n={1} />); });
    expect(titleInput(container).value).toBe('Edited Title');
  });

  it('survives an unrelated metadata key changing; save carries the latest unrelated keys', () => {
    const onSave = vi.fn();
    let zIndex = 1;
    function Parent() {
      return (
        <DocumentEditor isOpen title="Stored Title" initialContent="" metadata={{ description: 'orig', zIndex }} onSave={onSave} onClose={vi.fn()} />
      );
    }
    const container = mount(<Parent />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'Edited Title');
    zIndex = 2;
    act(() => { root.render(<Parent />); });
    expect(titleInput(container).value).toBe('Edited Title');
    click(saveBtn(container)!);
    expect(onSave.mock.calls[0][0].metadata.zIndex).toBe(2);
    expect(onSave.mock.calls[0][0].title).toBe('Edited Title');
  });

  it('discards an abandoned draft on reopen even when title/description are unchanged (isOpen transition)', () => {
    function Parent({ open, t, d }: { open: boolean; t: string; d: string }) {
      return (
        <DocumentEditor isOpen={open} title={t} initialContent="" metadata={{ description: d }} onSave={vi.fn()} onClose={vi.fn()} />
      );
    }
    const container = mount(<Parent open t="Doc A" d="Desc A" />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'Unsaved edit');
    act(() => { root.render(<Parent open={false} t="Doc A" d="Desc A" />); });
    // Same title/description as before -- only the isOpen transition should force the reset.
    act(() => { root.render(<Parent open t="Doc A" d="Desc A" />); });
    expect(titleInput(container).value).toBe('Doc A');
  });

  it('resets to a different document\'s values when reopened with new initial values', () => {
    function Parent({ open, t, d }: { open: boolean; t: string; d: string }) {
      return (
        <DocumentEditor isOpen={open} title={t} initialContent="" metadata={{ description: d }} onSave={vi.fn()} onClose={vi.fn()} />
      );
    }
    const container = mount(<Parent open t="Doc A" d="Desc A" />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'Unsaved edit');
    act(() => { root.render(<Parent open={false} t="Doc A" d="Desc A" />); });
    act(() => { root.render(<Parent open t="Doc B" d="Desc B" />); });
    expect(titleInput(container).value).toBe('Doc B');
    expect(descInput(container).value).toBe('Desc B');
  });

  it('preserves TipTap body content across the unrelated parent rerender', () => {
    function Parent() {
      return (
        <DocumentEditor isOpen title="T" initialContent="<p>stable body</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />
      );
    }
    const container = mount(<Parent />);
    const { root } = mounted[mounted.length - 1];
    act(() => { root.render(<Parent />); });
    expect(container.querySelector('.ProseMirror')!.textContent).toBe('stable body');
  });
});
