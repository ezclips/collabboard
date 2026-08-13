// @vitest-environment jsdom
//
// PATCH 8AE.1 -- closes the live permission gap PATCH 8AE found: the Map
// layout's pin popup (CanvasClient.tsx -> MapCanvas.tsx -> PostPopup.tsx)
// rendered RowColumnContainerCard/PostCardContent's embedded child comment
// lists without ever threading the real commentAccessMode, so those
// renderers silently fell back to their own 'manage' default regardless of
// the viewer's actual WorkspaceRole.
//
// This is the "layer 2" caller-side proof for the Map route, mirroring
// RowColumnContainerCard.embeddedCommentPermission.test.tsx's mount
// convention and child-ownership/sibling-isolation methodology. PostPopup is
// mounted directly (not MapCanvas, which pulls in Mapbox) per the patch
// spec's own suggestion.
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PostPopup from './PostPopup';

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
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
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

const CONTAINER = {
  id: 'pin-container-1',
  title: 'Pin container',
  content: '',
  type: 'container',
  metadata: { childPadletIds: ['child-a', 'child-b'], mapLocation: { lng: 1, lat: 2 } },
};
// userId matches mountPopup()'s default currentUserId ('real-user-123') so
// the Edit button's own ownership check (unrelated to the accessMode gate
// under test) doesn't block these MANAGE-mode edit tests.
const CHILD_A_COMMENTS = [{ id: 'ca1', text: 'child A comment', userId: 'real-user-123', userName: 'Alice', timestamp: 1000 }];
const CHILD_B_COMMENTS = [{ id: 'cb1', text: 'child B comment', userId: 'real-user-123', userName: 'Bob', timestamp: 2000 }];

function twoCommentTypeChildren() {
  return [
    { id: 'child-a', title: 'A', content: '', type: 'comment', metadata: { comments: CHILD_A_COMMENTS, parentId: 'pin-container-1' } },
    { id: 'child-b', title: 'B', content: '', type: 'comment', metadata: { comments: CHILD_B_COMMENTS, parentId: 'pin-container-1' } },
  ];
}

function mountPopup(overrides: Partial<React.ComponentProps<typeof PostPopup>> = {}) {
  const children = (overrides.allPadlets as any[] | undefined) ?? twoCommentTypeChildren();
  return mount(
    <PostPopup
      post={CONTAINER as any}
      allPadlets={[CONTAINER as any, ...children]}
      onClose={vi.fn()}
      currentUserId="real-user-123"
      currentUserName="Real Name"
      onUpdateChildComments={vi.fn()}
      {...overrides}
    />,
  );
}

describe('Map pin PostPopup -- embedded child comment permission wiring (PATCH 8AE.1)', () => {
  describe('MANAGE (default, and explicit)', () => {
    it('renders both children\'s existing comments', () => {
      const c = mountPopup();
      expect(c.textContent).toContain('child A comment');
      expect(c.textContent).toContain('child B comment');
    });

    it('Add via Send targets only the owning child and the comments field', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountPopup({ onUpdateChildComments, accessMode: 'manage' });
      const inputs = c.querySelectorAll('input[placeholder="Add a comment..."]');
      expect(inputs.length).toBe(2);
      const childAInput = inputs[0] as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(childAInput, 'new reply');
        childAInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(c.querySelectorAll('button[title="Send"]')[0]);
      expect(onUpdateChildComments).toHaveBeenCalledTimes(1);
      const [childId, comments, options] = onUpdateChildComments.mock.calls[0];
      expect(childId).toBe('child-a');
      expect(childId).not.toBe('child-b');
      expect(comments.some((cm: any) => cm.text === 'new reply')).toBe(true);
      expect(options).toEqual({ field: 'comments' });
    });

    it('Edit targets only the owning child (sibling isolation)', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountPopup({ onUpdateChildComments, accessMode: 'manage' });
      const editButtons = c.querySelectorAll('button[title="Edit"]');
      expect(editButtons.length).toBe(2);
      click(editButtons[0]);
      const input = c.querySelector('.ProseMirror') as HTMLElement;
      expect(input).not.toBeNull();
      act(() => {
        input.focus();
        input.textContent = 'edited text';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
      expect(onUpdateChildComments).toHaveBeenCalled();
      const [childId] = onUpdateChildComments.mock.calls[onUpdateChildComments.mock.calls.length - 1];
      expect(childId).toBe('child-a');
      expect(childId).not.toBe('child-b');
    });

    it('a child comment mutation never touches pin/container-level callbacks (Map/container data isolation)', () => {
      const onUpdateChildComments = vi.fn();
      const onEditContainer = vi.fn();
      const onDeleteContainer = vi.fn();
      const onChangeContainerColor = vi.fn();
      const onEditLocation = vi.fn();
      const c = mountPopup({
        onUpdateChildComments,
        accessMode: 'manage',
        onEditContainer,
        onDeleteContainer,
        onChangeContainerColor,
        onEditLocation,
        canEdit: true,
      });
      click(c.querySelectorAll('button[title="Delete"]')[0]);
      expect(onUpdateChildComments).toHaveBeenCalledTimes(1);
      const [childId] = onUpdateChildComments.mock.calls[0];
      // Never the container/pin id, never coordinates -- always the owning child.
      expect(childId).not.toBe(CONTAINER.id);
      expect(childId).toBe('child-a');
      expect(onEditContainer).not.toHaveBeenCalled();
      expect(onDeleteContainer).not.toHaveBeenCalled();
      expect(onChangeContainerColor).not.toHaveBeenCalled();
      expect(onEditLocation).not.toHaveBeenCalled();
    });
  });

  describe('READ', () => {
    it('comments remain visible; composer and Delete are absent for both children', () => {
      const c = mountPopup({ accessMode: 'read' });
      expect(c.textContent).toContain('child A comment');
      expect(c.textContent).toContain('child B comment');
      expect(c.querySelectorAll('input[placeholder="Add a comment..."]').length).toBe(0);
      expect(c.querySelectorAll('button[title="Delete"]').length).toBe(0);
      expect(c.querySelectorAll('button[title="Edit"]').length).toBe(0);
      expect(c.querySelectorAll('button[title="Color"]').length).toBe(0);
    });

    it('callback-defense: no interaction fires onUpdateChildComments', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountPopup({ accessMode: 'read', onUpdateChildComments });
      const rows = Array.from(c.getElementsByClassName('group/row'));
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
    });

    it('a non-container post (PostCardContent branch) renders read-only with no mutation callback reachable', () => {
      const commentPost = {
        id: 'standalone-comment-pin',
        title: 'Standalone comment',
        content: '',
        type: 'comment',
        metadata: { comments: [{ id: 'sc1', text: 'standalone comment text', userId: 'u1', userName: 'Alice', timestamp: 1 }] },
      };
      const c = mount(
        <PostPopup
          post={commentPost as any}
          allPadlets={[commentPost as any]}
          onClose={vi.fn()}
          currentUserId="real-user-123"
          currentUserName="Real Name"
          accessMode="read"
        />,
      );
      expect(c.textContent).toContain('standalone comment text');
      expect(c.querySelectorAll('input[placeholder="Add a comment..."]').length).toBe(0);
    });
  });

  describe('architecture -- closure-blocker regression for the exact PATCH 8AE defect', () => {
    it('CanvasClient.tsx passes commentAccessMode to its sole MapCanvas call site', () => {
      const src = fs.readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
      const callSites = (src.match(/<MapCanvas\b/g) ?? []).length;
      expect(callSites, 'CanvasClient.tsx must render MapCanvas exactly once').toBe(1);
      const start = src.indexOf('<MapCanvas');
      const end = src.indexOf('onUpdateChildComments={async', start);
      const block = src.slice(start, end);
      expect(block).toContain('commentAccessMode={commentAccessMode}');
    });

    it('MapCanvas.tsx accepts commentAccessMode and forwards it as accessMode to its sole PostPopup call site', () => {
      const src = fs.readFileSync('components/map/MapCanvas.tsx', 'utf8');
      expect(src).toContain("import type { CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(src).toContain('commentAccessMode?: CommentAccessMode;');
      expect(src).toContain("commentAccessMode = 'manage',");
      const callSites = (src.match(/<PostPopup\b/g) ?? []).length;
      expect(callSites, 'MapCanvas.tsx must render PostPopup exactly once').toBe(1);
      const start = src.indexOf('<PostPopup');
      const end = src.indexOf('/>', start);
      const block = src.slice(start, end);
      expect(block).toContain('accessMode={commentAccessMode}');
    });

    it('PostPopup.tsx accepts accessMode and forwards it to every reachable comment-capable child renderer', () => {
      const src = fs.readFileSync('components/map/PostPopup.tsx', 'utf8');
      expect(src).toContain("import type { CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(src).toContain('accessMode?: CommentAccessMode;');
      expect(src).toContain("accessMode = 'manage',");

      const rccStart = src.indexOf('<RowColumnContainerCard');
      const rccEnd = src.indexOf('/>', rccStart);
      expect(src.slice(rccStart, rccEnd)).toContain('accessMode={accessMode}');

      const pccStart = src.indexOf('<PostCardContent');
      const pccEnd = src.indexOf('/>', pccStart);
      expect(src.slice(pccStart, pccEnd)).toContain('accessMode={accessMode}');
    });

    it('no Map comment renderer relies on its implicit default -- every link in the chain is explicit', () => {
      // This is the dedicated PATCH 8AE closure-blocker assertion: the test
      // fails if ANY of the three links (CanvasClient->MapCanvas,
      // MapCanvas->PostPopup, PostPopup->child renderer) is removed, because
      // each link is checked independently above AND the full chain is
      // re-asserted here as one combined proof.
      const canvasClient = fs.readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
      const mapCanvas = fs.readFileSync('components/map/MapCanvas.tsx', 'utf8');
      const postPopup = fs.readFileSync('components/map/PostPopup.tsx', 'utf8');

      const link1 = canvasClient.includes('commentAccessMode={commentAccessMode}') && canvasClient.includes('<MapCanvas');
      const link2 = mapCanvas.includes('commentAccessMode?: CommentAccessMode') && mapCanvas.includes('accessMode={commentAccessMode}');
      const link3 =
        postPopup.includes('accessMode?: CommentAccessMode') &&
        /RowColumnContainerCard[\s\S]*?accessMode=\{accessMode\}/.test(postPopup) &&
        /PostCardContent[\s\S]*?accessMode=\{accessMode\}/.test(postPopup);

      expect(link1, 'link 1 (CanvasClient -> MapCanvas) missing').toBe(true);
      expect(link2, 'link 2 (MapCanvas -> PostPopup) missing').toBe(true);
      expect(link3, 'link 3 (PostPopup -> child renderer) missing').toBe(true);
    });

    it('resolveCommentAccessMode still has exactly one live call site -- no second producer introduced by this patch', () => {
      const canvasClient = fs.readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
      const mapCanvas = fs.readFileSync('components/map/MapCanvas.tsx', 'utf8');
      const postPopup = fs.readFileSync('components/map/PostPopup.tsx', 'utf8');
      expect(mapCanvas).not.toContain('resolveCommentAccessMode(');
      expect(postPopup).not.toContain('resolveCommentAccessMode(');
      const calls = (canvasClient.match(/resolveCommentAccessMode\(/g) ?? []).length;
      expect(calls).toBe(1);
      expect(canvasClient).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
      expect(canvasClient).not.toMatch(/resolveCommentAccessMode\(currentWorkspaceRole,\s*\S/);
    });
  });
});
