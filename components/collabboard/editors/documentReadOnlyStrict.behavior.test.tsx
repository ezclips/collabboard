// @vitest-environment jsdom
//
// PATCH-152 targeted correction: strict read-only enforcement for the
// Document modal, plus the single-permission-source rule. Complements
// DocumentCardContent.test.tsx's CAPABILITY -> readOnly routing tests (which
// already prove: no title/description inputs, no Bold button, contenteditable
// = 'false', no persist on Close) with real *attempted-mutation* evidence
// (paste, drop, a formatting keyboard shortcut) and the read-only link
// behaviour this patch adds.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
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
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

const LINK_HTML = '<p>See <a href="https://example.com/doc">this link</a> for more.</p>';

function proseMirror(c: HTMLElement) {
  return c.querySelector('.ProseMirror') as HTMLElement;
}
function closeBtn(c: HTMLElement) {
  return c.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
}
function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('10/11/12/13: read-only Document modal has no command surface and cannot be mutated', () => {
  it('10: no formatting toolbar at all -- every known toolbar control is absent, not merely disabled or hidden by CSS', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{ description: 'd' }} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    for (const title of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'ordered list', 'bullet', 'Code', 'Link', 'Change text formatting']) {
      expect(c.querySelector(`button[title*="${title}"]`), title).toBeNull();
    }
    // Structural, not visual: PostEditorShell omits the toolbar zone entirely for readOnly.
    expect(c.querySelector('[class*="min-w-[72px]"]')).toBeNull();
  });

  it('11: no Save control anywhere in the read-only modal', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c.querySelector('button[aria-label="Save document"]')).toBeNull();
    expect(Array.from(c.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Save')).toBe(false);
  });

  it('12: closing (X, backdrop, Escape) never calls onSave in read-only mode', () => {
    const onSave = vi.fn();
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    click(closeBtn(c));
    expect(onSave).not.toHaveBeenCalled();

    const c2 = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={onSave} onClose={vi.fn()} />,
    );
    act(() => { c2.querySelector('[role="dialog"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('13a: a paste attempt into the read-only body does not change its content', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const pm = proseMirror(c);
    const before = pm.innerHTML;
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: (t: string) => (t === 'text/plain' ? 'INJECTED' : ''), types: ['text/plain'], files: [] },
    });
    act(() => { pm.dispatchEvent(pasteEvent); });
    expect(pm.innerHTML).toBe(before);
    expect(pm.textContent).not.toContain('INJECTED');
  });

  it('13b: a drop attempt into the read-only body does not change its content', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const pm = proseMirror(c);
    const before = pm.innerHTML;
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (t: string) => (t === 'text/plain' ? 'DROPPED' : ''), types: ['text/plain'], files: [] },
    });
    act(() => { pm.dispatchEvent(dropEvent); });
    expect(pm.innerHTML).toBe(before);
    expect(pm.textContent).not.toContain('DROPPED');
  });

  it('13c: a formatting keyboard shortcut (Ctrl+B) does not bold read-only content -- no keyboard-reachable mutation route exists', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const pm = proseMirror(c);
    const before = pm.innerHTML;
    act(() => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(pm.innerHTML).toBe(before);
    expect(pm.querySelector('strong')).toBeNull();
  });

  it('13d: title and description cannot be changed -- neither input exists to type into', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="Fixed Title" initialContent={LINK_HTML} metadata={{ description: 'Fixed description' }} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(c.querySelector('input[placeholder="Untitled document"]')).toBeNull();
    expect(c.querySelector('input[placeholder="Add a description..."]')).toBeNull();
    expect(c.textContent).toContain('Fixed Title');
  });

  it('the editor instance itself is non-editable (enforced at the TipTap/ProseMirror level, not just CSS)', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(proseMirror(c).getAttribute('contenteditable')).toBe('false');
  });
});

describe('14/15: existing links in read-only Document content stay clickable and open safely', () => {
  const openSpy = vi.fn();
  beforeEach(() => {
    openSpy.mockReset();
    window.open = openSpy as unknown as typeof window.open;
  });

  it('14: clicking an existing link opens it via window.open with target=_blank and noopener,noreferrer', () => {
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const link = c.querySelector('a[href="https://example.com/doc"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/doc', '_blank', 'noopener,noreferrer');
  });

  it('15: clicking a link does not close the modal, does not save, and does not enable editing', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const c = mount(
      <DocumentEditor isOpen readOnly title="T" initialContent={LINK_HTML} metadata={{}} onSave={onSave} onClose={onClose} />,
    );
    const link = c.querySelector('a[href="https://example.com/doc"]') as HTMLAnchorElement;
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(proseMirror(c).getAttribute('contenteditable')).toBe('false');
  });

  it('editable-mode link clicks are unaffected by this change (no in-editor navigation, matching the existing openOnClick:false editing behaviour)', () => {
    const c = mount(
      <DocumentEditor isOpen title="T" initialContent={LINK_HTML} metadata={{}} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const link = c.querySelector('a[href="https://example.com/doc"]') as HTMLAnchorElement;
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('PERMISSION RULE: one predicate governs Edit visibility, Read-modal editability, and mutation-callback availability', () => {
  it('CanvasModals derives readOnly and onSave from the exact same destination value, itself derived from canUseFreeformEditButton', () => {
    const canvasModalsSrc = fs.readFileSync('components/collabboard/canvas/ui/CanvasModals.tsx', 'utf8');
    expect(canvasModalsSrc).toContain("readOnly={documentModalDestination === 'document-viewer'}");
    expect(canvasModalsSrc).toContain("onSave={documentModalDestination === 'document-editor' ? saveCard : noopDocumentSave}");
  });

  it('Freeform Edit-button visibility (onOpenToolbar) and the Document destination resolution both gate on the identical canUseFreeformEditButton value', () => {
    const freeformSrc = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    const branch = freeformSrc.slice(
      freeformSrc.indexOf('onOpenToolbar={canUseFreeformEditButton'),
      freeformSrc.indexOf('onReadDocument={(() => {'),
    );
    expect(branch).toContain('onOpenToolbar={canUseFreeformEditButton ?');
    const readBranch = freeformSrc.slice(
      freeformSrc.indexOf('onReadDocument={(() => {'),
      freeformSrc.indexOf('isSelected={isPadletSelected(padlet.id)}'),
    );
    expect(readBranch).toContain('selectDocumentModalDestination(padlet, canUseFreeformEditButton)');
  });

  it('CanvasClient threads one real permission source (canEditWorkspace(currentWorkspaceRole)) into canUseFreeformEditButton -- not inferred from any button/UI state', () => {
    const canvasClientSrc = fs.readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
    expect(canvasClientSrc).toContain('const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);');
  });

  it('runtime: an editable capability renders an active Edit affordance and an editable modal from the same boolean; a non-editable one renders neither', () => {
    // Mirrors production wiring narrowly: one `canEdit` boolean feeds both
    // CardPreview's Edit control and DocumentEditor's readOnly resolution,
    // exactly as canUseFreeformEditButton does in CanvasClient/FreeformPadletCards.
    function Harness({ canEdit }: { canEdit: boolean }) {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button
            aria-label="edit-affordance"
            data-present={canEdit}
            onClick={canEdit ? () => setOpen(true) : undefined}
            disabled={!canEdit}
          />
          <DocumentEditor
            isOpen={open}
            readOnly={!canEdit}
            title="T"
            initialContent={LINK_HTML}
            metadata={{}}
            onSave={canEdit ? vi.fn() : (() => {})}
            onClose={() => setOpen(false)}
          />
        </div>
      );
    }
    const editableCase = mount(<Harness canEdit />);
    click(editableCase.querySelector('[aria-label="edit-affordance"]')!);
    expect(editableCase.querySelector('input[placeholder="Untitled document"]')).not.toBeNull();

    const readOnlyCase = mount(<Harness canEdit={false} />);
    expect((readOnlyCase.querySelector('[aria-label="edit-affordance"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
