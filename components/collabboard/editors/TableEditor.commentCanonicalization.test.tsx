// @vitest-environment jsdom
//
// PATCH 8V -- Table normal/detached comment canonicalization.
//
// TableEditor.tsx's own left-toolbar Comment button/badge/panel is one of two
// live normal/detached comment entry points for Table (the other is
// FreeformPadletCards.tsx's on-canvas badge popup, covered structurally in
// canonicalCommentPermission.contract.test.tsx). Both were previously a
// fully local, hand-rolled comment implementation -- same shape as Todo
// (PATCH 8S) and Link (PATCH 8U), not a wiring-only fix like Drawing/AI
// Component.
//
// Table's storage architecture is unique among every post type migrated so
// far: comments/badgeColor/commentTitle/commentTitleStyle live inside
// padlet.content (a single JSON blob shared with rows/columns/cellStyles/
// caption/titleStyle), not padlet.metadata. TableEditor.tsx has no
// useEffect-based resync on reopen either -- each field is a lazily
// -initialized useState(() => JSON.parse(initialContent)...) that only reruns
// because CanvasModals.tsx remounts TableEditor via a `key` that changes per
// padlet id (see the "table-${...}" key wrapper), the same remount-driven
// resync convention already used for Link/Todo/AIComponent in that file.
//
// Follows this repo's own established convention for editors with no heavy
// canvas dependency (react-dom/client + act, no @testing-library/react --
// see NoteEditor.characterization.test.tsx). TableEditor's own CommentPopup
// call is NOT portaled -- it renders inline inside the mounted container
// (same as TodoEditor/LinkEditor), so comment-panel content is queried from
// the mounted container `c`, not document.body.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TableEditor from './TableEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const noop = () => {};
const BASE_CONTENT = { rows: [['x']], columns: ['A'], cellStyles: {}, caption: '', titleStyle: {} };

describe('TableEditor -- canonical Comment UI wiring (PATCH 8V)', () => {
  describe('MANAGE mode (default)', () => {
    it('renders existing comments and a newly added comment uses real identity', () => {
      const onSave = vi.fn();
      const c = mount(
        <TableEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialContent={JSON.stringify({ ...BASE_CONTENT, comments: [{ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 }] })}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      expect(c.textContent).toContain('existing');

      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      expect(composer).not.toBeNull();
      setInputValue(composer, 'a fresh comment');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(c.textContent).toContain('a fresh comment');

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      const parsed = JSON.parse(saved.content);
      const newComment = parsed.comments.find((cm: any) => cm.text === 'a fresh comment');
      expect(newComment.userId).toBe('real-user-123');
      expect(newComment.userName).toBe('Real Name');
      expect(parsed.comments.find((cm: any) => cm.id === 'c1')).toEqual({ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1, textColor: undefined, backgroundColor: undefined });
    });

    it('title editing persists through Save', () => {
      const onSave = vi.fn();
      const c = mount(
        <TableEditor isOpen onClose={noop} onSave={onSave} initialContent={JSON.stringify(BASE_CONTENT)} currentUserId="u1" currentUserName="U1" />,
      );
      click(btn(c, 'Comment')!);
      const titleEl = c.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      expect(titleEl).not.toBeNull();
      click(titleEl);
      const titleInput = c.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
      setInputValue(titleInput, 'Feedback');
      act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      const parsed = JSON.parse(saved.content);
      expect(parsed.commentTitle).toBe('Feedback');
    });

    it('Delete targets only the clicked comment (row isolation)', () => {
      const c = mount(
        <TableEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialContent={JSON.stringify({ ...BASE_CONTENT, comments: [
            { id: 'a', text: 'first comment', userId: 'u1', userName: 'U1', timestamp: 1 },
            { id: 'b', text: 'second comment', userId: 'u1', userName: 'U1', timestamp: 2 },
          ] })}
        />,
      );
      click(btn(c, 'Comment')!);
      const rows = Array.from(c.querySelectorAll('button[title="Delete"]'));
      const target = rows.find((b) => b.closest('[class*="group/row"]')?.textContent?.includes('first comment'));
      expect(target).toBeTruthy();
      click(target!);
      expect(c.textContent).not.toContain('first comment');
      expect(c.textContent).toContain('second comment');
    });

    it('Table content (rows/columns/cellStyles/caption/titleStyle) is unchanged by opening Comments and adding a comment', () => {
      const onSave = vi.fn();
      const content = { rows: [['hello', 'world'], ['foo', 'bar']], columns: ['A', 'B'], cellStyles: { '0-0': { bold: true } }, caption: 'a caption', titleStyle: { color: '#ff0000' } };
      const c = mount(
        <TableEditor isOpen onClose={noop} onSave={onSave} initialContent={JSON.stringify(content)} />,
      );
      click(btn(c, 'Comment')!);
      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'does not touch the table');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      const parsed = JSON.parse(saved.content);
      expect(parsed.rows).toEqual(content.rows);
      expect(parsed.columns).toEqual(content.columns);
      expect(parsed.cellStyles).toEqual(content.cellStyles);
      expect(parsed.caption).toBe(content.caption);
      expect(parsed.titleStyle).toEqual(content.titleStyle);
    });

    it('no table cell becomes selected/active as a side effect of opening Comments, typing, or submitting (cell-selection isolation)', () => {
      const c = mount(
        <TableEditor isOpen onClose={noop} onSave={noop} initialContent={JSON.stringify(BASE_CONTENT)} />,
      );
      expect(c.querySelectorAll('td .ring-purple-500').length).toBe(0);
      click(btn(c, 'Comment')!);
      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'no cell selection');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(c.querySelectorAll('td .ring-purple-500').length).toBe(0);
    });

    it('pressing Enter in the comment composer submits the comment and does NOT add a table row or change any cell value (keyboard isolation)', () => {
      const content = { rows: [['x', 'y']], columns: ['A', 'B'], cellStyles: {}, caption: '', titleStyle: {} };
      const c = mount(
        <TableEditor isOpen onClose={noop} onSave={noop} initialContent={JSON.stringify(content)} />,
      );
      const rowCountBefore = c.querySelectorAll('tbody tr').length;
      const cellValuesBefore = Array.from(c.querySelectorAll('tbody input[type="text"]')).map((el) => (el as HTMLInputElement).value);

      click(btn(c, 'Comment')!);
      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'enter only submits the comment');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(c.textContent).toContain('enter only submits the comment');

      const rowCountAfter = c.querySelectorAll('tbody tr').length;
      const cellValuesAfter = Array.from(c.querySelectorAll('tbody input[type="text"]')).map((el) => (el as HTMLInputElement).value);
      expect(rowCountAfter).toBe(rowCountBefore);
      expect(cellValuesAfter).toEqual(cellValuesBefore);
    });
  });

  describe('READ mode', () => {
    it('existing comments are visible but composer/Send/Edit/Strikethrough/Delete/title-editing are all absent', () => {
      const c = mount(
        <TableEditor
          isOpen
          accessMode="read"
          onClose={noop}
          onSave={noop}
          initialContent={JSON.stringify({ ...BASE_CONTENT, comments: [{ id: 'c1', text: 'existing table comment', userId: 'u1', userName: 'A', timestamp: 1 }] })}
        />,
      );
      click(btn(c, 'Comment')!);
      expect(c.textContent).toContain('existing table comment');
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(c.querySelector('button[title="Delete"]')).toBeNull();
      expect(c.querySelector('button[title="Edit"]')).toBeNull();
      expect(c.querySelector('button[title="Strikethrough"]')).toBeNull();
      const titleEl = c.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      expect(c.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    });

    it('manage mode (explicit or default/omitted) keeps the composer available, unchanged', () => {
      const explicit = mount(<TableEditor isOpen accessMode="manage" onClose={noop} onSave={noop} initialContent={JSON.stringify(BASE_CONTENT)} />);
      click(btn(explicit, 'Comment')!);
      expect(explicit.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();

      const omitted = mount(<TableEditor isOpen onClose={noop} onSave={noop} initialContent={JSON.stringify(BASE_CONTENT)} />);
      click(btn(omitted, 'Comment')!);
      expect(omitted.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    });
  });

  describe('historical identity', () => {
    it('a pre-existing placeholder-identity comment is left untouched by opening/closing without editing', () => {
      const onSave = vi.fn();
      const historical = { id: 'legacy-1', text: 'an old comment', userId: 'current-user', userName: 'You', timestamp: 1 };
      const c = mount(
        <TableEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialContent={JSON.stringify({ ...BASE_CONTENT, comments: [historical] })}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      const parsed = JSON.parse(saved.content);
      expect(parsed.comments).toEqual([{ ...historical, textColor: undefined, backgroundColor: undefined }]);
    });
  });
});
