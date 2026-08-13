// @vitest-environment jsdom
//
// PATCH 8AR -- behavioral coverage for CommentEditor's Link authoring, which
// previously had no dedicated test (only toolbar enabled/disabled state was
// covered by CommentEditor.permission.test.tsx). Added alongside the shared
// commentLinkAuthoring extraction so a regression in either CommentEditor's
// own selection-restore wiring or the shared apply command has something
// concrete to fail. Follows this file's own established mount convention
// (react-dom/client + act, no @testing-library/react).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentEditor from './CommentEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!(Range.prototype as any).getClientRects) (Range.prototype as any).getClientRects = () => [];
if (!(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} });
}

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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function doubleClick(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
}
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function findByText(root: ParentNode, tag: string, text: string) {
  return Array.from(root.querySelectorAll(tag)).find((el) => el.textContent?.trim() === text) as HTMLElement | undefined;
}
function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function selectText(root: ParentNode, text: string) {
  const pm = root.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    let idx = -1;
    while ((node = walker.nextNode() as Text | null)) {
      idx = node.textContent?.indexOf(text) ?? -1;
      if (idx !== -1) break;
    }
    if (!node || idx === -1) throw new Error(`text not found: ${text}`);
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + text.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
// handleEditComment defers editEditor.commands.setContent(...) by two
// requestAnimationFrame ticks (CommentEditor's own afterTwoFrames helper) --
// wait for both before relying on the row's editable content being present.
async function afterTwoFrames() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

const EXISTING = [
  { id: 'c1', text: 'Hello world', userId: 'user1', userName: 'Alice', timestamp: 1000 },
];

describe('CommentEditor Link authoring', () => {
  it('applies a Link to selected text in an existing comment being edited, persisted through Save', async () => {
    const onSave = vi.fn();
    const container = mount(
      <CommentEditor isOpen onClose={vi.fn()} onSave={onSave} initialComments={EXISTING} currentUserId="user1" currentUserName="Alice" />
    );

    const rows = container.querySelectorAll('.group\\/row');
    doubleClick(rows[0]);
    await afterTwoFrames();

    selectText(container, 'Hello world');

    const linkBtn = btn(container, 'Link');
    expect(linkBtn).not.toBeNull();
    expect(linkBtn!.disabled).toBe(false);
    click(linkBtn!);

    const urlInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(urlInput).not.toBeNull();
    typeInto(urlInput, 'google.com');
    click(findByText(container, 'button', 'Add')!);

    // handleSave reads editEditor.getHTML() directly for any comment still
    // being edited -- no Enter/blur needed first (CommentEditor's row has no
    // onBlur auto-save, unlike CommentPopup's). Backdrop click -> handleSave -> onSave.
    click(container.firstElementChild!);

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedText = onSave.mock.calls[0][0].comments[0].text as string;
    expect(savedText).toContain('href="https://google.com"');
    expect(savedText).toMatch(/<a[^>]*>Hello world<\/a>/);
  });

  it('the Link toolbar button is disabled until text is selected', async () => {
    const container = mount(
      <CommentEditor isOpen onClose={vi.fn()} onSave={vi.fn()} initialComments={EXISTING} currentUserId="user1" currentUserName="Alice" />
    );

    const rows = container.querySelectorAll('.group\\/row');
    doubleClick(rows[0]);
    await afterTwoFrames();

    // No selection made yet -- title reflects the disabled hint, not "Link".
    expect(btn(container, 'Link')).toBeNull();
    expect(btn(container, 'Select text to add a link')).not.toBeNull();

    selectText(container, 'Hello world');
    expect(btn(container, 'Link')).not.toBeNull();
  });

  it('READ mode never shows an enabled Link affordance', () => {
    const container = mount(
      <CommentEditor isOpen onClose={vi.fn()} onSave={vi.fn()} initialComments={EXISTING} accessMode="read" />
    );
    expect(btn(container, 'Link')).toBeNull();
  });
});
