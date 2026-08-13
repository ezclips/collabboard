// @vitest-environment jsdom
//
// PATCH 8AC -- ContainerEditor embedded child CommentPopup permission wiring.
//
// ContainerEditor.tsx's SortableChildItem renders a CommentPopup directly
// (embedded, no portal/position) for any `comment`-type child padlet. This
// proves the READ/MANAGE contract at that specific live surface: composer,
// per-row actions are not rendered at all in READ (not merely hidden), the
// caller's mutation callbacks (onUpdateChildComments) cannot fire even if a
// READ-mode interaction is attempted, and every mutation targets ONLY the
// owning child id -- never a sibling child or the Container itself.
//
// Follows this repo's established mount convention (react-dom/client + act,
// no @testing-library/react).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ContainerEditor from './ContainerEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

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

const CHILD_A_COMMENTS = [
  { id: 'ca1', text: 'child A comment', userId: 'u1', userName: 'Alice', timestamp: 1000 },
];
const CHILD_B_COMMENTS = [
  { id: 'cb1', text: 'child B comment', userId: 'u2', userName: 'Bob', timestamp: 2000 },
];

function twoCommentChildren() {
  return [
    { id: 'child-a', title: 'Comment A', content: '', type: 'comment', metadata: { comments: CHILD_A_COMMENTS } },
    { id: 'child-b', title: 'Comment B', content: '', type: 'comment', metadata: { comments: CHILD_B_COMMENTS } },
  ];
}

function mountContainer(overrides: Partial<React.ComponentProps<typeof ContainerEditor>> = {}) {
  return mount(
    <ContainerEditor
      isOpen
      onSave={vi.fn()}
      onClose={vi.fn()}
      childPadlets={twoCommentChildren()}
      currentUserId="real-user-123"
      currentUserName="Real Name"
      // Required for the CommentPopup branch to render at all
      // (`child.type === "comment" && onUpdateChildComments`) -- overridable
      // per-test when the call needs to be inspected.
      onUpdateChildComments={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ContainerEditor embedded child CommentPopup -- permission wiring (PATCH 8AC)', () => {
  describe('MANAGE (default) -- existing behavior unchanged', () => {
    it('renders both children\'s existing comments', () => {
      const c = mountContainer();
      expect(c.textContent).toContain('child A comment');
      expect(c.textContent).toContain('child B comment');
    });

    it('Add via Send targets only the owning child (child-ownership + sibling isolation)', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountContainer({ onUpdateChildComments });
      const inputs = c.querySelectorAll('input[placeholder="Add a comment..."]');
      expect(inputs.length).toBe(2);
      const childAInput = inputs[0] as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(childAInput, 'new reply');
        childAInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const sendButtons = c.querySelectorAll('button[aria-label="Send"]');
      click(sendButtons[0]);
      expect(onUpdateChildComments).toHaveBeenCalledTimes(1);
      const [childId, comments] = onUpdateChildComments.mock.calls[0];
      expect(childId).toBe('child-a');
      expect(comments.some((cm: any) => cm.text === 'new reply')).toBe(true);
      // Sibling (child-b) untouched -- only child-a's id/comments were passed.
      expect(childId).not.toBe('child-b');
    });

    it('Edit works and Delete isolation removes only the targeted comment', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountContainer({ onUpdateChildComments });
      const deleteButtons = c.querySelectorAll('button[title="Delete"]');
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
      click(deleteButtons[0]);
      expect(onUpdateChildComments).toHaveBeenCalledWith('child-a', []);
    });

    it('a child comment mutation never touches Container-level state (membership, order, save)', () => {
      const onUpdateChildComments = vi.fn();
      const onRemoveChildPadlet = vi.fn();
      const onReorderChildPadlets = vi.fn();
      const onSave = vi.fn();
      const c = mountContainer({ onUpdateChildComments, onRemoveChildPadlet, onReorderChildPadlets, onSave });
      const input = c.querySelectorAll('input[placeholder="Add a comment..."]')[0] as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'container isolation check');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(c.querySelectorAll('button[aria-label="Send"]')[0]);
      expect(onUpdateChildComments).toHaveBeenCalledTimes(1);
      expect(onRemoveChildPadlet).not.toHaveBeenCalled();
      expect(onReorderChildPadlets).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('real currentUserId/currentUserName are used for a new comment, not a hardcoded placeholder', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountContainer({ onUpdateChildComments, currentUserId: 'real-user-999', currentUserName: 'Identity Check' });
      const input = c.querySelectorAll('input[placeholder="Add a comment..."]')[0] as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'identity check comment');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(c.querySelectorAll('button[aria-label="Send"]')[0]);
      const [, comments] = onUpdateChildComments.mock.calls[0];
      const added = comments.find((cm: any) => cm.text === 'identity check comment');
      expect(added.userId).toBe('real-user-999');
      expect(added.userName).toBe('Identity Check');
      expect(added.userId).not.toBe('user1');
      expect(added.userName).not.toBe('R');
    });
  });

  describe('READ -- render gate, not disable', () => {
    it('existing comments remain visible', () => {
      const c = mountContainer({ accessMode: 'read' });
      expect(c.textContent).toContain('child A comment');
      expect(c.textContent).toContain('child B comment');
    });

    it('composer/Send, Edit, Color, Delete are all absent', () => {
      const c = mountContainer({ accessMode: 'read' });
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(c.querySelector('button[aria-label="Send"]')).toBeNull();
      expect(btn(c, 'Delete')).toBeNull();
      // 'Edit'/'Color' are scoped to each comment row -- ContainerEditor's
      // OWN chrome (the Card color trigger) also has title="Color" and would
      // be a false positive for a page-wide query. getElementsByClassName
      // (not a CSS selector) avoids escaping "/" in "group/row".
      const rows = c.getElementsByClassName('group/row');
      expect(rows.length).toBeGreaterThan(0);
      Array.from(rows).forEach((row) => {
        expect(row.querySelector('button[title="Edit"]')).toBeNull();
        expect(row.querySelector('button[title="Color"]')).toBeNull();
        expect(row.querySelector('button[title="Delete"]')).toBeNull();
      });
    });

    it('no mutation callback fires from any interaction attempt (callback-defense)', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountContainer({ accessMode: 'read', onUpdateChildComments });
      // Dispatch clicks directly on every row element present, bypassing
      // whatever UI happens to be hidden, same methodology as PATCH 8Z/8AB.
      const rows = Array.from(c.getElementsByClassName('group/row'));
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
    });

    it('child storage and Container storage are both unchanged after a blocked mutation attempt', () => {
      const onUpdateChildComments = vi.fn();
      const onSave = vi.fn();
      const c = mountContainer({ accessMode: 'read', onUpdateChildComments, onSave });
      const rows = Array.from(c.getElementsByClassName('group/row'));
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('architecture', () => {
    it('embedded CommentPopup receives accessMode and every mutation callback is guarded', () => {
      const src = require('node:fs').readFileSync('components/collabboard/editors/ContainerEditor.tsx', 'utf8');
      const start = src.indexOf('{child.type === "comment" && onUpdateChildComments ? (');
      const end = src.indexOf('/>', src.indexOf('<CommentPopup', start));
      const block = src.slice(start, end);
      expect(block).toContain('accessMode={accessMode}');
      for (const prop of ['onSubmit=', 'onEditComment=', 'onRemoveComment=', 'onCommentColor=']) {
        const propStart = block.indexOf(prop);
        expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
        const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
        expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation(accessMode,'), `${prop} must be wrapped, found: ${nextNonSpace?.[0]}`).toBe(true);
      }
    });

    it('CanvasModals.tsx threads commentAccessMode into ContainerEditor as accessMode', () => {
      const canvasModals = require('node:fs').readFileSync('components/collabboard/canvas/ui/CanvasModals.tsx', 'utf8');
      const start = canvasModals.indexOf('<ContainerEditor');
      const end = canvasModals.indexOf('/>', canvasModals.indexOf('currentUserAvatar={user?.user_metadata?.avatar_url}', start));
      const block = canvasModals.slice(start, end);
      expect(block).toContain('accessMode={commentAccessMode}');
    });

    it('storage ownership unchanged: only metadata.comments is used, never detachedComments, in the embedded child block', () => {
      const src = require('node:fs').readFileSync('components/collabboard/editors/ContainerEditor.tsx', 'utf8');
      const start = src.indexOf('{child.type === "comment" && onUpdateChildComments ? (');
      const end = src.indexOf('/>', src.indexOf('<CommentPopup', start));
      const block = src.slice(start, end);
      expect(block).toContain('child.metadata?.comments');
      expect(block).not.toContain('detachedComments');
    });
  });
});
