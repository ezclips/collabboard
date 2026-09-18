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
const caption = () => document.body.querySelector('[data-ui="pdf-area-image-draft-caption"]');
const actions = () => document.body.querySelector('[data-ui="pdf-area-image-draft-actions"]');
const backArrow = () => document.body.querySelector<HTMLButtonElement>('[data-ui="image-editor-draft-complete"]');

/**
 * A REAL backdrop click, which is pointerdown THEN click, both on the backdrop
 * itself. useBackdropDismiss records the press origin on pointerdown and
 * refuses a click whose press began anywhere else -- so dispatching `click`
 * alone proves nothing and would pass even if the binding were broken.
 */
const backdropClick = (el: Element | null) => {
  act(() => {
    el!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

/** Enter from inside the card, which is how the keyboard publishes. */
const pressEnter = (el: Element | null) => {
  act(() => {
    el!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
};
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

// PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1. This suite previously asserted a
// labelled Save and a Cancel button. Those are gone on purpose: the draft's
// exit model now matches every other post editor -- you click away and what you
// made is kept -- so a suite describing a footer no longer describes the
// product.
describe('A: the draft has NO footer buttons, only the caption', () => {
  it('renders no save and no cancel control at all', () => {
    mount(<PdfAreaImageDraftModal {...baseProps()} />);
    expect(document.body.querySelector('[data-ui="pdf-area-image-draft-save"]')).toBeNull();
    expect(document.body.querySelector('[data-ui="pdf-area-image-draft-cancel"]')).toBeNull();
    // Nothing inside the actions region is a button any more.
    expect(actions()!.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps the actions region, the caption, and the preview', () => {
    mount(<PdfAreaImageDraftModal {...baseProps()} />);
    expect(actions()).not.toBeNull();
    expect(caption()!.textContent).toBe('Adds this image to the canvas and PDF Library.');
    expect(document.body.querySelector('img[alt="Selected PDF area"]')).not.toBeNull();
  });

  it('the title input remains -- the draft is never left with nothing focusable', () => {
    mount(<PdfAreaImageDraftModal {...baseProps()} />);
    const input = titleInput();
    expect(input).not.toBeNull();
    act(() => { input!.focus(); });
    expect(document.activeElement).toBe(input);
  });
});

describe('B: clicking outside SAVES', () => {
  it('a backdrop click calls onSave, and never onCancel or the confirmation', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, onCancel })} />);
    backdropClick(overlay());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();
  });

  // The property that makes a saving backdrop safe rather than trigger-happy.
  it('a press that BEGAN inside the card does not publish when it drifts out', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    act(() => {
      // Press starts on the title input (dragging to select it), releases over
      // the backdrop -- the browser then retargets the click to the overlay.
      titleInput()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      overlay()!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a click on the CARD does not publish -- only the backdrop does', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    backdropClick(document.body.querySelector('[data-ui="image-post-editor-card"]'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('B2: Enter saves from the keyboard', () => {
  it('Enter from the title input calls onSave', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    pressEnter(titleInput());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a non-Enter key does not', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    act(() => {
      titleInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});

// The discard confirmation is UNCHANGED. Only its triggers are: Escape and the
// toolbar arrow, since Cancel no longer exists.
describe('C: Escape/toolbar arrow opens confirmation; Keep editing retains draft data; Discard closes without saving', () => {
  it('the toolbar arrow opens the confirmation with the exact required copy, never calling onCancel directly', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onCancel })} />);
    click(backArrow());
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

  it('"Keep editing" retains the complete draft and returns focus to the TITLE INPUT', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onCancel, title: 'Keep me' })} />);
    // Escape from the page body: no real invoker, so the fallback is exercised.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    click(btnByText('Keep editing'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();
    // Still open, still the same draft.
    expect(titleInput()).toHaveProperty('value', 'Keep me');
    // The fallback is the title input because it is now the ONLY focusable
    // control the draft owns -- the save button it used to fall back to is gone.
    expect(document.activeElement).toBe(titleInput());
  });

  // PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1
  it('raises the confirmation out of the canvas subtree, above the editor tier', () => {
    const { container } = mount(<PdfAreaImageDraftModal {...baseProps()} />);
    click(backArrow());
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
    const cancel = backArrow()!;
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
    click(backArrow());
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
    click(backArrow());
    click(btnByText('Discard'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('D: submission calls the real wired save callback once, including rapid double clicks', () => {
  it('a single backdrop click calls onSave exactly once', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    backdropClick(overlay());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // submitLockRef is now the ONLY lock: there is no disabled attribute on a
  // backdrop, so this is the sole thing standing between a fast double click
  // and two creation requests.
  it('two backdrop clicks before any prop update (the real double-click race) still call onSave once', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave, isSaving: false })} />);
    const back = overlay()!;
    // Both dispatches happen inside ONE act(), synchronously, with no
    // re-render (and therefore no updated `isSaving` prop) between them --
    // exactly the window a React-state-only guard would miss.
    act(() => {
      back.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      back.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      back.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      back.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Enter twice in the same window also calls onSave once', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ onSave })} />);
    const input = titleInput()!;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('E: pending save cannot be dismissed; successful save closes normally', () => {
  // THE GUARD THAT SURVIVED THE BUTTONS. Cancel's `disabled={isSaving}` used to
  // stop a discard racing a write; with the button gone, requestClose's own
  // `if (isSaving ...) return` is what does it. These assertions are what prove
  // that guard was re-established on the close path rather than lost with the
  // control that used to carry it.
  it('while isSaving, the caption says so, the toolbar arrow is disabled, and Escape does not open confirmation', () => {
    const onCancel = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ isSaving: true, onCancel })} />);
    expect(caption()!.textContent).toBe('Adding…');
    expect(backArrow()!.disabled).toBe(true);

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(confirmDialog()).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();

    click(backArrow());
    expect(confirmDialog()).toBeNull();
  });

  it('a backdrop click mid-save does not submit a second time', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ isSaving: true, onSave })} />);
    backdropClick(overlay());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Enter mid-save does not submit a second time', () => {
    const onSave = vi.fn();
    mount(<PdfAreaImageDraftModal {...baseProps({ isSaving: true, onSave })} />);
    pressEnter(titleInput());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a successful save is the caller clearing the draft -- isOpen becoming false closes the modal normally', () => {
    const { root } = mount(<PdfAreaImageDraftModal {...baseProps({ isSaving: true })} />);
    expect(overlay()).not.toBeNull();
    // The real success path: CanvasClient sets isPdfAreaDraftSaving(false)
    // AND clears pendingPdfAreaDraft (isOpen -> false) in the same commit.
    act(() => { root.render(<PdfAreaImageDraftModal {...baseProps({ isOpen: false, isSaving: false })} />); });
    expect(overlay()).toBeNull();
  });
});

describe('F: failed/denied save keeps the preview and draft fields, displays an error, and permits a subsequent attempt', () => {
  it('isSaving returning to false with the draft still open and an error prop shows it, keeps the preview, and allows a retry', () => {
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

    // The caption is back to its resting copy -- the failure is reported by the
    // error line, not by the caption.
    expect(caption()!.textContent).toBe('Adds this image to the canvas and PDF Library.');

    // RETRY. With no button, clicking outside again is the retry path, and the
    // submitLockRef released when isSaving went false -- so this is the
    // assertion that proves a failed save is not a dead end.
    backdropClick(overlay());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Enter is also a retry path after a failure', () => {
    const onSave = vi.fn();
    const { root } = mount(<PdfAreaImageDraftModal {...baseProps({ onSave, isSaving: true })} />);
    act(() => {
      root.render(<PdfAreaImageDraftModal {...baseProps({ onSave, isSaving: false, error: 'nope' })} />);
    });
    pressEnter(titleInput());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a denied (403-style) message is shown exactly as the caller supplies it', () => {
    mount(<PdfAreaImageDraftModal {...baseProps({ error: 'You do not have permission to add cards to this board' })} />);
    expect(errorText()!.textContent).toBe('You do not have permission to add cards to this board');
  });
});
