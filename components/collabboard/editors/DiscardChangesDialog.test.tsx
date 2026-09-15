// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiscardChangesDialog from './DiscardChangesDialog';
import { IMAGE_POST_EDITOR_CONFIRM_Z_INDEX, IMAGE_POST_EDITOR_OVERLAY_Z_CLASS } from './ImagePostEditorShell';

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
function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function btn(c: HTMLElement, text: string) {
  return Array.from(c.querySelectorAll('button')).find((b) => b.textContent === text)!;
}

describe('DiscardChangesDialog (PATCH-149B2-i §32.8)', () => {
  it('is an accessible alertdialog with an unsaved-changes message and exactly two actions', () => {
    const c = mount(<DiscardChangesDialog onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    const dialog = c.querySelector('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(c.textContent).toMatch(/unsaved/i);
    expect(c.querySelectorAll('button')).toHaveLength(2);
    expect(btn(c, 'Keep editing')).not.toBeNull();
    expect(btn(c, 'Discard changes')).not.toBeNull();
    expect(c.textContent).not.toMatch(/^Save$/m);
  });

  it('focuses "Keep editing" initially (the safe default)', () => {
    const c = mount(<DiscardChangesDialog onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    expect(document.activeElement).toBe(btn(c, 'Keep editing'));
  });

  it('invokes the matching callback exactly once per action, and clicks on its own backdrop do not bubble out', () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    const c = mount(<DiscardChangesDialog onKeepEditing={onKeepEditing} onDiscard={onDiscard} />);
    click(c.firstElementChild!); // own backdrop
    expect(onKeepEditing).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    click(btn(c, 'Keep editing'));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    click(btn(c, 'Discard changes'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('defaults to the in-place surface at the original tier, for every pre-existing caller', () => {
    const c = mount(<DiscardChangesDialog onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    const surface = c.querySelector('[data-ui="discard-changes-dialog"]')!;
    expect(surface).not.toBeNull();
    expect(surface.className).toContain('z-[1100]');
    // Still rendered in the normal tree position -- NOT portalled away.
    expect(c.contains(surface)).toBe(true);
    expect(document.body.querySelector('[data-ui="discard-changes-dialog-raised"]')).toBeNull();
  });
});

// PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1. Browser-confirmed defect: over a
// portalled Image post editor, the in-place dialog painted underneath and was
// unreachable by mouse and by Tab. jsdom cannot prove visual stacking -- that
// is what the browser gate is for -- but it CAN prove the two things stacking
// depends on here: that the surface leaves the isolated subtree, and that it
// owns the keyboard while open.
describe('DiscardChangesDialog raised above an Image post editor', () => {
  const raised = () => document.body.querySelector<HTMLElement>('[data-ui="discard-changes-dialog-raised"]')!;
  const raisedBtn = (text: string) =>
    Array.from(raised().querySelectorAll('button')).find((b) => b.textContent === text)!;

  it('portals out of its container and paints above the Image post editor tier', () => {
    const c = mount(
      <DiscardChangesDialog layer="above-image-editor" onKeepEditing={vi.fn()} onDiscard={vi.fn()} />,
    );
    const surface = raised();
    expect(surface).not.toBeNull();
    // The whole point: it is NOT inside the caller's subtree any more.
    expect(c.contains(surface)).toBe(false);
    expect(surface.parentElement).toBe(document.body);
    // An inline z-index, not a Tailwind arbitrary utility: the class form
    // generated no CSS here and computed `auto`. See the constant's own doc.
    expect(surface.style.zIndex).toBe(String(IMAGE_POST_EDITOR_CONFIRM_Z_INDEX));
    // ...and it clears whatever tier the editor overlay itself declares.
    const overlayTier = Number(IMAGE_POST_EDITOR_OVERLAY_Z_CLASS.replace(/\D/g, ''));
    expect(IMAGE_POST_EDITOR_CONFIRM_Z_INDEX).toBeGreaterThan(overlayTier);
    expect(surface.className).not.toContain('z-[1100]');
  });

  it('still focuses "Keep editing" first and keeps both actions reachable', () => {
    mount(<DiscardChangesDialog layer="above-image-editor" onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    expect(document.activeElement).toBe(raisedBtn('Keep editing'));
    expect(raised().querySelectorAll('button')).toHaveLength(2);
  });

  it('Escape acts as Keep editing and does not reach a listener behind it', () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      mount(
        <DiscardChangesDialog layer="above-image-editor" onKeepEditing={onKeepEditing} onDiscard={onDiscard} />,
      );
      act(() => {
        raisedBtn('Keep editing').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      });
      expect(onKeepEditing).toHaveBeenCalledTimes(1);
      expect(onDiscard).not.toHaveBeenCalled();
      // The draft's own window-level Escape listener must never see it.
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  it('Tab and Shift+Tab cycle within the confirmation instead of walking out behind it', () => {
    mount(<DiscardChangesDialog layer="above-image-editor" onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    const keep = raisedBtn('Keep editing');
    const discard = raisedBtn('Discard changes');

    act(() => { discard.focus(); });
    act(() => {
      discard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(keep);

    act(() => {
      keep.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(discard);
  });
});
