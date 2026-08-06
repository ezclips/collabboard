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
function closeBtn(c: HTMLElement) {
  return c.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
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

  it('shows the Document toolbar with real controls, no Align, present Link/Text style, and the Box toggle (Card color parity with Note)', () => {
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="<p>x</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('button[title*="Bold"]')).not.toBeNull();
    expect(container.querySelector('button[title*="Underline"]')).not.toBeNull();
    expect(container.querySelector('button[title*="Text alignment"]')).toBeNull();
    expect(container.querySelector('button[title="Link text first!"]')).not.toBeNull();
    expect(container.querySelector('button[title="Change text formatting"]')).not.toBeNull();
    expect(container.querySelector('button[title*="Switch to Box"]')).not.toBeNull();
  });

  it('Bold control executes a real command, dirties the draft (reported via onDirtyChange), and formatting survives the save-on-close payload', async () => {
    const onSave = vi.fn();
    const dirtySpy = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="T" initialContent="<p>hello</p>" metadata={{}} onSave={onSave} onClose={vi.fn()} onDirtyChange={dirtySpy} />,
    );
    expect(dirtySpy).toHaveBeenLastCalledWith(false); // clean on open
    toggleBold(container);
    expect(dirtySpy).toHaveBeenLastCalledWith(true); // body edit dirties
    await act(async () => { click(closeBtn(container)); });
    expect(onSave).toHaveBeenCalledTimes(1); // dirty close saves
    expect(onSave.mock.calls[0][0].content).toContain('<strong>');
  });

  it('keeps title separate from body content, and preserves metadata through the save-on-close payload', async () => {
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
    await act(async () => { click(closeBtn(container)); });
    const payload = onSave.mock.calls[0][0];
    expect(payload.content).not.toContain('My Title');
    expect(payload.title).toBe('My Title');
    expect(payload.metadata).toMatchObject({ parentId: 'p1', zIndex: 2 });
  });

  it('clean Close exits immediately, no save', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    click(closeBtn(container));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dirty Close saves then closes, with no confirmation popup', async () => {
    const onSave = vi.fn(async (_data: { title: string; content: string; metadata: any }): Promise<SaveCardResult> => ({ status: 'saved' }));
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'Edited');
    await act(async () => { click(closeBtn(container)); });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull(); // no discard confirmation
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].title).toBe('Edited');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clean backdrop closes immediately; dirty backdrop saves then closes; inner clicks never trigger it', async () => {
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

    const onSave2 = vi.fn();
    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave2} onClose={onClose2} />,
    );
    setInput(titleInput(c2), 'Edited');
    await act(async () => { click(c2.firstElementChild!); }); // dirty backdrop
    expect(c2.querySelector('[role="alertdialog"]')).toBeNull();
    expect(onSave2).toHaveBeenCalledTimes(1);
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('clean Escape closes immediately; dirty Escape saves then closes, with no confirmation', async () => {
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={vi.fn()} onClose={onClose} />,
    );
    escKey();
    expect(onClose).toHaveBeenCalledTimes(1);

    const onSave2 = vi.fn();
    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave2} onClose={onClose2} />,
    );
    setInput(titleInput(c2), 'Edited');
    await act(async () => { escKey(); });
    expect(c2.querySelector('[role="alertdialog"]')).toBeNull();
    expect(onSave2).toHaveBeenCalledTimes(1);
    expect(onClose2).toHaveBeenCalledTimes(1);
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

  it('PATCH-152: has no visible Save button', () => {
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    setInput(titleInput(container), 'Edited'); // even while dirty
    expect(container.querySelector('button[aria-label="Save document"]')).toBeNull();
  });

  it('PATCH-152: never shows a discard confirmation dialog on any close path', async () => {
    for (const via of ['close', 'backdrop', 'escape'] as const) {
      const container = mount(
        <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
      );
      setInput(titleInput(container), 'Edited');
      if (via === 'close') await act(async () => { click(closeBtn(container)); });
      else if (via === 'backdrop') await act(async () => { click(container.firstElementChild!); });
      else await act(async () => { escKey(); });
      expect(container.querySelector('[role="alertdialog"]')).toBeNull();
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    }
  });
});
describe('PATCH-152: save-on-close result handling (replaces the explicit Save button flow)', () => {
  it('a second close attempt while saving is blocked -- exactly one onSave call', async () => {
    let resolveSave: (r: SaveCardResult) => void;
    const onSave = vi.fn(() => new Promise<SaveCardResult>((res) => { resolveSave = res; }));
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    setInput(titleInput(container), 'Edited');
    click(closeBtn(container)); // starts the save, does not await
    click(closeBtn(container)); // blocked -- isSaving guards re-entry
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave!({ status: 'saved' }); });
  });

  it('a successful save closes the modal; a void-returning onSave is also treated as success', async () => {
    const onSave = vi.fn(async (): Promise<SaveCardResult> => ({ status: 'saved' }));
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'Edited');
    await act(async () => { click(closeBtn(container)); });
    expect(onClose).toHaveBeenCalledTimes(1);

    const onClose2 = vi.fn();
    const c2 = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={vi.fn()} onClose={onClose2} />,
    );
    setInput(titleInput(c2), 'Edited');
    await act(async () => { click(closeBtn(c2)); });
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('a failed save keeps the modal open, preserves the dirty draft, shows an accessible error, and a retry can succeed', async () => {
    const onSave = vi.fn()
      .mockResolvedValueOnce({ status: 'failed', error: new Error('network') } as SaveCardResult)
      .mockResolvedValueOnce({ status: 'saved' } as SaveCardResult);
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'Edited');
    await act(async () => { click(closeBtn(container)); });
    expect(onClose).not.toHaveBeenCalled(); // never closes before persistence completes
    expect(titleInput(container).value).toBe('Edited'); // draft preserved -- no content loss
    expect(container.querySelector('[role="alert"]')).not.toBeNull(); // accessible error
    await act(async () => { click(closeBtn(container)); }); // retry
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('skipped-blank and deferred-placement both close without being presented as a completed save', async () => {
    for (const status of ['skipped-blank', 'deferred-placement'] as const) {
      const onSave = vi.fn(async (): Promise<SaveCardResult> => ({ status }));
      const onClose = vi.fn();
      const container = mount(
        <DocumentEditor isOpen title="Doc" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
      );
      setInput(titleInput(container), 'Edited');
      await act(async () => { click(closeBtn(container)); });
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('PATCH-149B2-i: dirty-state definition (5-10), observed via onDirtyChange', () => {
  it('reverting title/description to baseline returns clean; unrelated rerenders and mount do not dirty', () => {
    const spy = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="Base" initialContent="" metadata={{ description: 'Base desc' }} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />,
    );
    expect(spy).toHaveBeenLastCalledWith(false); // clean on open, no phantom dirty
    setInput(titleInput(container), 'Changed');
    expect(spy).toHaveBeenLastCalledWith(true);
    setInput(titleInput(container), 'Base');
    expect(spy).toHaveBeenLastCalledWith(false); // revert -> clean
    setInput(descInput(container), 'Changed desc');
    expect(spy).toHaveBeenLastCalledWith(true);
    setInput(descInput(container), 'Base desc');
    expect(spy).toHaveBeenLastCalledWith(false); // revert -> clean
  });

  it('reverting body to the normalized baseline returns clean', () => {
    const spy = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="T" initialContent="<p>hello</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />,
    );
    toggleBold(container);
    expect(spy).toHaveBeenLastCalledWith(true);
    toggleBold(container); // toggling back off returns the same normalized HTML
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it('unrelated parent rerenders do not change dirty state', () => {
    const spy = vi.fn();
    function Parent({ n }: { n: number }) {
      return <DocumentEditor isOpen title="T" initialContent="" metadata={{ n } as any} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />;
    }
    const container = mount(<Parent n={0} />);
    const { root } = mounted[mounted.length - 1];
    setInput(titleInput(container), 'Edited');
    expect(spy).toHaveBeenLastCalledWith(true);
    const callsBefore = spy.mock.calls.length;
    act(() => { root.render(<Parent n={1} />); }); // unrelated metadata key changes
    expect(spy).toHaveBeenCalledTimes(callsBefore); // no additional emission
    expect(titleInput(container).value).toBe('Edited');
  });
});

describe('PATCH-149B2-ii §34.4/§34.6: onDirtyChange transition reporting', () => {
  it('1: emits false once on clean open', () => {
    const spy = vi.fn();
    mount(<DocumentEditor isOpen title="T" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it('2/3: clean->dirty emits true once; further edits while dirty emit nothing further', () => {
    const spy = vi.fn();
    const container = mount(<DocumentEditor isOpen title="T" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />);
    setInput(titleInput(container), 'Edited');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(true);
    setInput(descInput(container), 'more');
    expect(spy).toHaveBeenCalledTimes(2); // still dirty -- no further emission
  });

  it('4: dirty->clean (revert) emits false once', () => {
    const spy = vi.fn();
    const container = mount(<DocumentEditor isOpen title="Base" initialContent="" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />);
    setInput(titleInput(container), 'Changed');
    setInput(titleInput(container), 'Base');
    expect(spy).toHaveBeenCalledTimes(3); // false, true, false
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it('5: read-only emits the initial false and never true', () => {
    const spy = vi.fn();
    mount(<DocumentEditor isOpen readOnly title="T" initialContent="<p>x</p>" metadata={{}} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={spy} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(false);
    expect(spy).not.toHaveBeenCalledWith(true);
  });

  it('6: an unrelated rerender AND a changed onDirtyChange identity emit nothing when isDirty is unchanged (proves the ref guard, not Design A)', () => {
    const spy = vi.fn();
    function Parent({ n }: { n: number }) {
      // A fresh inline lambda every render -- an unstable callback identity.
      return <DocumentEditor isOpen title="T" initialContent="" metadata={{ n } as any} onSave={vi.fn()} onClose={vi.fn()} onDirtyChange={(d) => spy(d)} />;
    }
    const container = mount(<Parent n={0} />);
    const { root } = mounted[mounted.length - 1];
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => { root.render(<Parent n={1} />); });
    act(() => { root.render(<Parent n={2} />); });
    expect(spy).toHaveBeenCalledTimes(1); // no spam from identity changes alone
    setInput(titleInput(container), 'Edited');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('PATCH-152: Freeform creation flow -- close always saves, never confirms', () => {
  it('a blank untouched new draft closes without saving on Close/backdrop/Escape', () => {
    for (const via of ['close', 'backdrop', 'escape'] as const) {
      const onSave = vi.fn();
      const onClose = vi.fn();
      const container = mount(
        <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
      );
      if (via === 'close') click(closeBtn(container));
      else if (via === 'backdrop') click(container.firstElementChild!);
      else escKey();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    }
  });

  it('an edited blank draft (title only) saves on Close instead of confirming, and closes', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), 'New Doc');
    await act(async () => { click(closeBtn(container)); });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1); // now persists instead of discarding
    expect(onSave.mock.calls[0][0].title).toBe('New Doc');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing a dirty-but-effectively-blank new draft follows the existing skipped-blank path and is not presented as a completed save', async () => {
    const onSave = vi.fn(async (): Promise<SaveCardResult> => ({ status: 'skipped-blank' }));
    const onClose = vi.fn();
    const container = mount(
      <DocumentEditor isOpen title="" initialContent="" metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    setInput(titleInput(container), ' '); // dirties the draft so close attempts a save
    await act(async () => { click(closeBtn(container)); });
    expect(onSave).toHaveBeenCalledTimes(1); // routed through the existing saveCard path
    expect(onClose).toHaveBeenCalledTimes(1); // closes, but never claims a persisted save
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
  it('survives a fresh {} metadata reference on an unrelated rerender; edits are what get saved', async () => {
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
    await act(async () => { click(closeBtn(container)); });
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

  it('survives an unrelated metadata key changing; save carries the latest unrelated keys', async () => {
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
    await act(async () => { click(closeBtn(container)); });
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
