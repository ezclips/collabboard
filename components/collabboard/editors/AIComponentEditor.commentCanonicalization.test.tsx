// @vitest-environment jsdom
//
// PATCH 8T -- AI Component normal/detached comment canonicalization.
//
// AIComponentEditor.tsx's own left-toolbar Comment button/badge/panel is the
// ONLY live normal/detached comment entry point for AI Component (Phase 1
// inventory: FreeformPadletCards.tsx has no `if (padlet.type === 'ai-component')`
// CommentPopup branch, unlike Note/Clipart/Image/Todo -- AI Component is
// opened through exactly one modal route, with no separate read-only lightbox
// like Drawing). AI Component already delegated to canonical CommentPopup
// before this patch -- like Drawing (PATCH 8R), it only needed wiring, not a
// full local-JSX replacement like Todo (PATCH 8S). AI Component has no
// anchored/highlighted (Category B) comment system either.
//
// Follows this repo's own established convention for editors with no heavy
// canvas dependency (react-dom/client + act, no @testing-library/react --
// see NoteEditor.characterization.test.tsx). AIContentRenderer (the deep
// diagram/lesson-board/photo-card rendering tree) is mocked out -- irrelevant
// to comment behavior, same rationale as DrawingEditor's ExcalidrawWrapper mock.
//
// AIComponentEditor's own CommentPopup call is portaled to document.body (a
// `createPortal(..., document.body)` wrapper, same as DrawingEditor), so
// comment-panel content is queried from document.body, not the mounted
// container -- the toolbar Comment button that triggers it stays inline in
// the mounted container. Unlike Drawing/Todo/Note (draft-then-batch-save:
// onSave fires on modal close/backdrop-click), AIComponentEditor only saves
// via its explicit "Save to Canvas" button (backdrop click here fires only
// onClose) -- Save is also disabled until persistedContent is truthy, so
// tests that need to observe a save pass a minimal initialContent.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({ default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }) }));

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
function saveButton(root: ParentNode) {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Save to Canvas')) as HTMLButtonElement | undefined;
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const noop = () => {};
const MINIMAL_CONTENT = { html: '<p>stub</p>' };

describe('AIComponentEditor -- canonical Comment UI wiring (PATCH 8T)', () => {
  describe('MANAGE mode (default)', () => {
    it('renders existing comments and a newly added comment uses real identity', () => {
      const onSave = vi.fn();
      const c = mount(
        <AIComponentEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialContent={MINIMAL_CONTENT}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 }] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      expect(document.body.textContent).toContain('existing');

      const composer = document.body.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'a fresh comment');
      click(document.body.querySelector('button[aria-label="Send"]')!);
      expect(document.body.textContent).toContain('a fresh comment');

      click(saveButton(c)!);
      const saved = onSave.mock.calls[0][0];
      const newComment = saved.metadata.detachedComments.find((cm: any) => cm.text === 'a fresh comment');
      expect(newComment.userId).toBe('real-user-123');
      expect(newComment.userName).toBe('Real Name');
      expect(saved.metadata.detachedComments.find((cm: any) => cm.id === 'c1')).toEqual({ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 });
    });

    it('title editing and styling persist through Save to Canvas', () => {
      const onSave = vi.fn();
      const c = mount(
        <AIComponentEditor isOpen onClose={noop} onSave={onSave} initialContent={MINIMAL_CONTENT} initialMetadata={{}} currentUserId="u1" currentUserName="U1" />,
      );
      click(btn(c, 'Comment')!);
      const titleEl = document.body.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      const titleInput = document.body.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
      setInputValue(titleInput, 'Feedback');
      act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      click(saveButton(c)!);
      const saved = onSave.mock.calls[0][0];
      expect(saved.metadata.commentTitle).toBe('Feedback');
    });

    it('Delete targets only the clicked comment (row isolation)', () => {
      const c = mount(
        <AIComponentEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [
            { id: 'a', text: 'first comment', userId: 'u1', userName: 'U1', timestamp: 1 },
            { id: 'b', text: 'second comment', userId: 'u1', userName: 'U1', timestamp: 2 },
          ] }}
        />,
      );
      click(btn(c, 'Comment')!);
      const rows = Array.from(document.body.querySelectorAll('button[title="Delete"]'));
      const target = rows.find((b) => b.closest('[class*="group/row"]')?.textContent?.includes('first comment'));
      expect(target).toBeTruthy();
      click(target!);
      expect(document.body.textContent).not.toContain('first comment');
      expect(document.body.textContent).toContain('second comment');
    });

    it('comment interaction does not trigger AI generation/regeneration', () => {
      const c = mount(
        <AIComponentEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'existing', userId: 'u1', userName: 'U1', timestamp: 1 }] }}
        />,
      );
      expect(c.textContent).not.toContain('Generating...');
      click(btn(c, 'Comment')!);
      const composer = document.body.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'does not trigger generation');
      click(document.body.querySelector('button[aria-label="Send"]')!);
      expect(document.body.textContent).toContain('does not trigger generation');
      expect(c.textContent).not.toContain('Generating...');
      expect(c.textContent).not.toContain('Rendering...');
    });
  });

  describe('READ mode', () => {
    it('the Comment button is reachable and comments are visible', () => {
      const c = mount(
        <AIComponentEditor
          isOpen
          accessMode="read"
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'a reader can see this', userId: 'u1', userName: 'U1', timestamp: 1 }] }}
        />,
      );
      const commentButton = btn(c, 'Comment');
      expect(commentButton).not.toBeNull();
      click(commentButton!);
      expect(document.body.textContent).toContain('a reader can see this');
    });

    it('composer, Send, Delete, and title editing are absent', () => {
      const c = mount(
        <AIComponentEditor
          isOpen
          accessMode="read"
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'existing', userId: 'u1', userName: 'U1', timestamp: 1 }] }}
        />,
      );
      click(btn(c, 'Comment')!);
      expect(document.body.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(document.body.querySelector('button[aria-label="Send"]')).toBeNull();
      expect(document.body.querySelector('button[title="Delete"]')).toBeNull();
      const titleEl = document.body.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      expect(document.body.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    });

    it('manage mode (explicit or default/omitted) keeps the composer available, unchanged', () => {
      const explicit = mount(<AIComponentEditor isOpen accessMode="manage" onClose={noop} onSave={noop} />);
      click(btn(explicit, 'Comment')!);
      expect(document.body.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();

      const omitted = mount(<AIComponentEditor isOpen onClose={noop} onSave={noop} />);
      click(btn(omitted, 'Comment')!);
      expect(document.body.querySelectorAll('input[placeholder="Add a comment..."]').length).toBeGreaterThan(0);
    });
  });

  describe('historical identity', () => {
    it('a pre-existing placeholder-identity comment is left untouched by opening and saving without editing', () => {
      const onSave = vi.fn();
      const historical = { id: 'legacy-1', text: 'an old comment', userId: 'anon', userName: 'You', timestamp: 1 };
      const c = mount(
        <AIComponentEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialContent={MINIMAL_CONTENT}
          initialMetadata={{ detachedComments: [historical] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      click(saveButton(c)!);
      const saved = onSave.mock.calls[0][0];
      expect(saved.metadata.detachedComments).toEqual([historical]);
    });
  });
});
