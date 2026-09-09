// @vitest-environment jsdom
//
// PDF_READER_UI_FINAL_CLEANUP_1 -- the exact-citation link inside the Note
// editor. It was visibly clickable and did nothing in practice: this modal
// owns the screen, and the reader it navigates to is either yielded (focused
// PDF workspace) or below the editor tier (docked panel), so whatever it
// opened could never be seen.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NoteEditor from './NoteEditor';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOC_A = 'cd308c08-39f9-46ca-a78a-bc8f91f791a3';
const DOC_B = 'bbbbbbbb-2222-4222-8222-222222222222';

/** A page-only citation, the shape a Note saved from a PDF page carries. */
const reference = (id: string, sourceDocumentId: string, page: number): SourceReference => ({
  id,
  targetPadletId: 'padlet-1',
  sourceDocumentId,
  pageStart: page,
  pageEnd: page,
  quoteText: null,
  quoteHash: null,
  charStart: null,
  charEnd: null,
  region: null,
  locator: null,
} as unknown as SourceReference);

// ProseMirror's DOMObserver flushes on a timer after teardown; unmounting every
// root is what keeps that out of later tests.
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

const controls = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-knowledge-source-control="true"]'));
const click = (target: Element | null) => {
  expect(target).not.toBeNull();
  act(() => { target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};

describe('the Note editor source link navigates and hands the screen back', () => {
  it('carries the exact reference, then dismisses the editor through its own save-and-close', () => {
    const order: string[] = [];
    const onOpenSourceReference = vi.fn((_reference: SourceReference) => { order.push('navigate'); });
    const onSave = vi.fn(() => { order.push('save'); });
    const onClose = vi.fn(() => { order.push('close'); });
    const container = mount(
      <NoteEditor
        isOpen
        initialContent="<p>Body</p>"
        sourceReferences={[reference('ref-1', DOC_A, 1)]}
        onOpenSourceReference={onOpenSourceReference}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    const control = controls(container)[0];
    expect(control.textContent).toContain('Source · p. 1');

    click(control);

    // Identity is the reference's own, forwarded untouched: the document id
    // and the page it cites, never a filename and never a page guessed from
    // whatever the reader happens to be showing.
    expect(onOpenSourceReference).toHaveBeenCalledTimes(1);
    const sent = onOpenSourceReference.mock.calls[0][0];
    expect(sent.sourceDocumentId).toBe(DOC_A);
    expect(sent.pageStart).toBe(1);
    expect(sent.pageEnd).toBe(1);
    expect(sent).toEqual(reference('ref-1', DOC_A, 1));

    // The editor stops covering the source it just opened -- and it leaves the
    // way it always leaves, saving first, so nothing typed is lost.
    expect(order).toEqual(['navigate', 'save', 'close']);
  });

  it('uses the cited document, not the first row, when a Note cites two PDFs', () => {
    const onOpenSourceReference = vi.fn((_reference: SourceReference) => {});
    const container = mount(
      <NoteEditor
        isOpen
        sourceReferences={[reference('ref-1', DOC_A, 1), reference('ref-2', DOC_B, 7)]}
        onOpenSourceReference={onOpenSourceReference}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const rows = controls(container);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Source 1 · p. 1');
    expect(rows[1].textContent).toContain('Source 2 · p. 7');

    click(rows[1]);

    const sent = onOpenSourceReference.mock.calls[0][0];
    expect(sent.sourceDocumentId).toBe(DOC_B);
    expect(sent.pageStart).toBe(7);
  });

  it('offers no clickable source action when there is nothing to navigate with', () => {
    const container = mount(
      <NoteEditor
        isOpen
        sourceReferences={[reference('ref-1', DOC_A, 1)]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // The provenance is still stated -- as a label, because a control that
    // cannot act is worse than no control.
    expect(controls(container)).toHaveLength(0);
    const label = container.querySelector('[data-knowledge-source-label="true"]');
    expect(label).not.toBeNull();
    expect(label!.tagName).not.toBe('BUTTON');
    expect(label!.textContent).toContain('Source · p. 1');
  });

  it('states nothing at all for a Note with no citation', () => {
    const container = mount(<NoteEditor isOpen onSave={vi.fn()} onClose={vi.fn()} />);
    expect(controls(container)).toHaveLength(0);
    expect(container.querySelector('[data-knowledge-source-label="true"]')).toBeNull();
    expect(container.textContent).not.toContain('Source ·');
  });
});
