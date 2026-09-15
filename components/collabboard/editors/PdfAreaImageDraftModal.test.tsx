// @vitest-environment jsdom
//
// PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1 -- the PDF-area Image draft's own
// save/dismiss UX. Confirmed defect: the only save affordance was a small,
// unlabelled arrow, and a backdrop click silently discarded the capture with
// no request, placement or Library item ever created.
//
// These tests mount the REAL PdfAreaImageDraftModal and drive it exactly as
// CanvasClient does: `onSave`/`isSaving`/`error` are props this component
// receives, never state it owns, so re-rendering the same root with updated
// prop values IS the controlled-promise simulation of the real async save --
// not a test-local replica of it.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PdfAreaImageDraftModal from './PdfAreaImageDraftModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

const click = (el: Element | null) => {
  expect(el).not.toBeNull();
  act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};
// ImagePostEditorShell portals its whole subtree (overlay, toolbar, card,
// this modal's footer) to document.body -- it is a SIBLING of the mount
// container, not a descendant, so every one of these must search the body,
// not the `container` handed back by mount(). Since
// PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1 the discard confirmation portals
// out too (it has to clear the portalled overlay), so body finds it either
// way.
const overlay = () => document.body.querySelector('[data-ui="pdf-area-image-draft-overlay"]');
const saveButton = () => document.body.querySelector<HTMLButtonElement>('[data-ui="pdf-area-image-draft-save"]');
const cancelButton = () => document.body.querySelector<HTMLButtonElement>('[data-ui="pdf-area-image-draft-cancel"]');
const backArrow = () => document.body.querySelector<HTMLButtonElement>('[data-ui="image-editor-draft-complete"]');
const errorText = () => document.body.querySelector('[data-ui="pdf-area-image-draft-error"]');
const confirmDialog = () => document.body.querySelector('[role="alertdialog"]');
const titleInput = () => document.body.querySelector<HTMLInputElement>('[data-ui="image-post-editor-title"]');
const btnByText = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === text) ?? null;

function baseProps(overrides: Partial<React.ComponentProps<typeof PdfAreaImageDraftModal>> = {}) {
  return {
    isOpen: true,
    previewSrc: 'data:image/png;base64,AAAA',
    title: 'My area',
    onTitleChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    isSaving: false,
    error: null,
    ...overrides,
  } satisfies React.ComponentProps<typeof PdfAreaImageDraftModal>;
}

describe('A: the draft visibly offers "Add image to canvas" and Cancel', () => {
  it('renders a prominent labelled save action, a separate Cancel, and the helper text', () => {
    mount(<PdfAreaImageDraftModal {...baseProps()} />);
    const save = saveButton();
    expect(save).not.toBeNull();
    expect(save!.textContent).toBe('Add image to canvas');
    const cancel = cancelButton();
    expect(cancel).not.toBeNull();
    expect(cancel!.textContent).toBe('Cancel');
    expect(document.body.textContent).toContain('Adds this image to the canvas and PDF Library.');
    // The image preview is still there -- the footer sits below it, not over it.
    expect(document.body.querySelector('img[alt="Selected PDF area"]')).not.toBeNull();
  });
});

describe('B: backdrop click preserves the draft and triggers no save', () => {
  it('a click on the backdrop does nothing at all -- no save, no cancel, no confirmation', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, onCancel })} />);
    click(overlay());
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();
    // The draft is still fully present and interactive.
    expect(saveButton()).not.toBeNull();
  });
});

describe('C: Escape/Cancel opens confirmation; Keep editing retains draft data; Discard closes without saving', () => {
  it('Cancel opens the confirmation with the exact required copy, never calling onCancel directly', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onCancel })} />);
    click(cancelButton());
    expect(onCancel).not.toHaveBeenCalled();
    const dialog = confirmDialog();
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Discard this image?');
    expect(btnByText('Keep editing')).not.toBeNull();
    expect(btnByText('Discard')).not.toBeNull();
  });

  it('Escape opens the same confirmation, not an immediate discard', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onCancel })} />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirmDialog()).not.toBeNull();
  });

  it('the toolbar arrow also opens confirmation -- it no longer publishes', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, onCancel })} />);
    click(backArrow());
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirmDialog()).not.toBeNull();
  });

  it('"Keep editing" retains the complete draft and returns focus to the primary action', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onCancel, title: 'Keep me' })} />);
    click(cancelButton());
    click(btnByText('Keep editing'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();
    // Still open, still the same draft -- title/preview untouched, save still offered.
    expect(titleInput()).toHaveProperty('value', 'Keep me');
    expect(saveButton()).not.toBeNull();
    expect(document.activeElement).toBe(saveButton());
  });

  // PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1
  it('raises the confirmation out of the canvas subtree, above the editor tier', () => {
    const { container } = mount(<PdfAreaImageDraftModal {...baseProps()} />);
    click(cancelButton());
    const surface = document.body.querySelector<HTMLElement>('[data-ui="discard-changes-dialog-raised"]');
    expect(surface).not.toBeNull();
    // Not left behind inside the caller's own (isolated) subtree.
    expect(container.contains(surface)).toBe(false);
    expect(Number(surface!.style.zIndex)).toBeGreaterThan(60000);
    // And it is a sibling of the draft overlay, not a child of it.
    expect(overlay()!.contains(surface)).toBe(false);
  });

  it('"Keep editing" returns focus to the control that asked to close', () => {
    mount(<PdfAreaImageDraftModal {...baseProps()} />);
    const cancel = cancelButton()!;
    // A real pointer click focuses the button first; jsdom's dispatchEvent
    // does not, so focus it explicitly to model the same starting state.
    act(() => { cancel.focus(); });
    click(cancel);
    expect(confirmDialog()).not.toBeNull();
    click(btnByText('Keep editing'));
    expect(confirmDialog()).toBeNull();
    expect(document.activeElement).toBe(cancel);
  });

  it('Escape while confirming keeps the draft: it does not discard, and does not re-open confirmation', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, onCancel, title: 'Keep me' })} />);
    click(cancelButton());
    const keep = btnByText('Keep editing')!;
    act(() => {
      keep.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    // Confirmation closed, draft intact -- not discarded, not re-confirmed.
    expect(confirmDialog()).toBeNull();
    expect(overlay()).not.toBeNull();
    expect(titleInput()).toHaveProperty('value', 'Keep me');
  });

  it('"Discard" closes with zero creation requests -- onSave is never called', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, onCancel })} />);
    click(cancelButton());
    click(btnByText('Discard'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('D: submission calls the real wired save callback once, including rapid double clicks', () => {
  it('a single click calls onSave exactly once', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('two clicks dispatched before any prop update (the real double-click race) still call onSave once', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, isSaving: false })} />);
    const button = saveButton()!;
    // Both dispatches happen inside ONE act(), synchronously, with no
    // re-render (and therefore no updated `isSaving` prop) between them --
    // exactly the window a React-state-only guard would miss.
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('E: pending save cannot be dismissed; successful save closes normally', () => {
  it('while isSaving, the save/cancel buttons and the toolbar arrow are disabled, and Escape does not open confirmation', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ isSaving: true, onCancel })} />);
    expect(saveButton()!.disabled).toBe(true);
    expect(saveButton()!.textContent).toBe('Adding…');
    expect(cancelButton()!.disabled).toBe(true);
    expect(backArrow()!.disabled).toBe(true);

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(confirmDialog()).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();

    click(cancelButton());
    click(backArrow());
    expect(confirmDialog()).toBeNull();
  });

  it('a successful save is the caller clearing the draft -- isOpen becoming false closes the modal normally', () => {
    const { root } = mount(<PdfAreaImageDraftModal {...baseProps({ isSaving: true })} />);
    expect(saveButton()).not.toBeNull();
    // The real success path: CanvasClient sets isPdfAreaDraftSaving(false)
    // AND clears pendingPdfAreaDraft (isOpen -> false) in the same commit.
    act(() => { root.render(<PdfAreaImageDraftModal {...baseProps({ isOpen: false, isSaving: false })} />); });
    expect(overlay()).toBeNull();
  });
});

describe('F: failed/denied save keeps the preview and draft fields, displays an error, and permits a subsequent attempt', () => {
  it('isSaving returning to false with the draft still open and an error prop shows it, keeps the preview, and re-enables Add image to canvas', () => {
    const onSave = vi.fn();
    const { root } = mount(
      <PdfAreaImageDraftModal {...baseProps({ onSave, isSaving: true, previewSrc: 'data:image/png;base64,KEEP', title: 'Still here' })} />,
    );
    // The failure: still open, isSaving flips back, an error arrives.
    act(() => {
      root.render(
        <PdfAreaImageDraftModal {...baseProps({
          onSave, isSaving: false, error: 'Could not create the image from that area',
          previewSrc: 'data:image/png;base64,KEEP', title: 'Still here',
        })} />,
      );
    });

    expect(overlay()).not.toBeNull();
    expect(document.body.querySelector('img[src="data:image/png;base64,KEEP"]')).not.toBeNull();
    expect(titleInput()).toHaveProperty('value', 'Still here');
    const error = errorText();
    expect(error).not.toBeNull();
    expect(error!.textContent).toBe('Could not create the image from that area');

    const save = saveButton()!;
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('Add image to canvas');

    // The double-click guard was released by the failure, so a genuine retry works.
    click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a denied (403-style) message is shown exactly as the caller supplies it', () => {
    mount(<PdfAreaImageDraftModal {...baseProps({ error: 'You do not have permission to add cards to this board' })} />);
    expect(errorText()!.textContent).toBe('You do not have permission to add cards to this board');
  });
});
