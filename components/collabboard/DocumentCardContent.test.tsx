// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import PostCardContent from './PostCardContent';
import CardPreview from './CardPreview';
import DocumentCardContent from './DocumentCardContent';
import DocumentEditor from './editors/DocumentEditor';
import { selectDocumentModalDestination } from '@/lib/domain/canvas/documentModalRoute';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// Stub: jsdom lacks IntersectionObserver, needed by PostCardContent's AI branch.
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

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

const doc = (over: Partial<Omit<Padlet, 'metadata'>> & { metadata?: any } = {}): Padlet => ({
  id: 'doc-1', board_id: 'b', type: 'card', title: 'Doc Title', content: '<p>body</p>',
  position_x: 0, position_y: 0, width: 180, height: 220,
  created_at: '', updated_at: '', metadata: { description: 'd' }, ...over,
} as Padlet);
const clipart = (): Padlet => doc({ id: 'clip-1', metadata: { svgUrl: 'x.svg' } });

const readBtn = (c: HTMLElement) => c.querySelector('button[aria-label="Read document"]');
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('DocumentCardContent (PATCH-149B1b-iii): affordance, opt-in, identity', () => {
  it('1-6: renders an accessible, keyboard-reachable, overlay-styled Read button; click invokes the handler once with the complete post and does not fire the parent click', () => {
    const onOpenDocument = vi.fn();
    const onClick = vi.fn();
    const post = doc({ id: 'doc-42', title: 'Exact Title', content: '<p>exact</p>', metadata: { description: 'exact-desc', parentId: 'p9' } });
    const c = mount(<div onClick={onClick}><PostCardContent padlet={post} onOpenDocument={onOpenDocument} /></div>);
    const btn = readBtn(c)!;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.textContent).toBe('Read');
    expect(btn.getAttribute('tabindex')).not.toBe('-1');
    expect(btn.className).toMatch(/absolute/);
    expect(btn.className).toMatch(/bg-black\/40/);
    expect(btn.className).not.toMatch(/opacity-0/);
    click(btn);
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(onOpenDocument.mock.calls[0][0]).toBeUndefined(); // owner already bound `post` in its own closure
  });

  it('11/12: no handler -> preview renders, no Read button (presentation-safe by construction)', () => {
    const c = mount(<PostCardContent padlet={doc()} />);
    expect(readBtn(c)).toBeNull();
    expect(c.textContent).toContain('body');
  });

  it('7/8/28: clipart never renders Read, in either owner, regardless of a supplied handler (structural, not a second predicate)', () => {
    expect(readBtn(mount(<PostCardContent padlet={clipart()} onOpenDocument={vi.fn()} />))).toBeNull();
    expect(readBtn(mount(<CardPreview padlet={clipart()} isSelected={false} onReadDocument={vi.fn()} />))).toBeNull();
  });

  it('9/10/29/30: Note, Todo, Link, Image and AI-component render no Document Read button; default/AI rendering unaffected', () => {
    for (const type of ['text', 'todo', 'link', 'image', 'ai-component']) {
      const c = mount(<PostCardContent padlet={{ ...doc(), type } as Padlet} onOpenDocument={vi.fn()} />);
      expect(readBtn(c), type).toBeNull();
    }
  });

  it('16: CardPreview/freeform Document renders Read via the shared component; no handler -> no button (mirrors 11/12 at this owner)', () => {
    expect(readBtn(mount(<CardPreview padlet={doc()} isSelected={false} onReadDocument={vi.fn()} />))).not.toBeNull();
    expect(readBtn(mount(<CardPreview padlet={doc()} isSelected={false} />))).toBeNull();
  });

  it('5/6: Read and the existing edit pencil are independent -- clicking Read never also fires onEditContent', () => {
    const onReadDocument = vi.fn();
    const onEditContent = vi.fn();
    const c = mount(<CardPreview padlet={doc()} isSelected={false} onEditContent={onEditContent} onReadDocument={onReadDocument} />);
    click(readBtn(c)!);
    expect(onReadDocument).toHaveBeenCalledTimes(1);
    expect(onEditContent).not.toHaveBeenCalled();
  });

  it('24/25/26: identity -- distinct posts keep distinct ids reaching independent handlers', () => {
    const a = doc({ id: 'doc-a', title: 'Same', metadata: { description: 'Same' } });
    const b = doc({ id: 'doc-b', title: 'Same', metadata: { description: 'Same' } });
    const seen: string[] = [];
    const openFor = (p: Padlet) => () => seen.push(p.id);
    click(readBtn(mount(<PostCardContent padlet={a} onOpenDocument={openFor(a)} />))!);
    click(readBtn(mount(<PostCardContent padlet={b} onOpenDocument={openFor(b)} />))!);
    expect(seen).toEqual(['doc-a', 'doc-b']);
  });
});

describe('CAPABILITY -> readOnly routing (13/14/15): handler presence never decides editor vs. viewer', () => {
  // Mirrors CanvasModals' real wiring: the Read button is capability-blind;
  // selectDocumentModalDestination alone decides readOnly.
  function Harness({ post, canEdit, onSave }: { post: Padlet; canEdit: boolean; onSave: (d: any) => void }) {
    const [dest, setDest] = React.useState<string | null>(null);
    return (
      <>
        <PostCardContent padlet={post} onOpenDocument={() => setDest(selectDocumentModalDestination(post, canEdit))} />
        <DocumentEditor
          isOpen={dest !== null}
          readOnly={dest === 'document-viewer'}
          title={post.title}
          initialContent={post.content}
          metadata={post.metadata ?? null}
          onSave={dest === 'document-editor' ? onSave : () => {}}
          onClose={() => setDest(null)}
        />
      </>
    );
  }

  it('14: editable capability opens readOnly=false (title/description editable)', () => {
    const c = mount(<Harness post={doc()} canEdit onSave={vi.fn()} />);
    click(readBtn(c)!);
    expect(c.querySelector('input[placeholder="Untitled document"]')).not.toBeNull();
  });

  it('15: read-only capability opens readOnly=true with no command surface, and never persists on Close/backdrop', () => {
    const onSave = vi.fn();
    const c = mount(<Harness post={doc()} canEdit={false} onSave={onSave} />);
    click(readBtn(c)!);
    expect(c.querySelector('input[placeholder="Untitled document"]')).toBeNull();
    expect(c.querySelector('input[placeholder="Add a description..."]')).toBeNull();
    expect(c.querySelector('button[title*="Bold"]')).toBeNull();
    expect((c.querySelector('.ProseMirror') as HTMLElement).getAttribute('contenteditable')).toBe('false');
    click(c.querySelector('button[aria-label="Close"]')!);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('F4/T4 (§29.6/§30.4): interactive body honors metadata.textColor, falling back to #1F2937', () => {
  const bodyStyle = (c: HTMLElement) => (c.querySelector('.tiptap') as HTMLElement).style;

  it('1-4/8: explicit textColor colors the body only (Read carries no inline style); undefined/null/empty fall back to #1F2937; body/Read survive handler presence; PostCardContent threads it end-to-end', () => {
    for (const [tc, expected] of [['#ff0000', 'rgb(255, 0, 0)'], [undefined, 'rgb(31, 41, 55)'], [null, 'rgb(31, 41, 55)'], ['', 'rgb(31, 41, 55)']] as const) {
      const c = mount(<DocumentCardContent content="<p>hi</p>" textColor={tc as any} onRead={vi.fn()} />);
      expect(bodyStyle(c).color).toBe(expected);
      expect(readBtn(c)!.getAttribute('style')).toBeNull();
    }
    const withHandler = mount(<DocumentCardContent content="<p>exact text</p>" textColor="#ff0000" onRead={vi.fn()} />);
    const withoutHandler = mount(<DocumentCardContent content="<p>exact text</p>" textColor="#ff0000" />);
    expect(withHandler.textContent).toContain('exact text');
    expect(readBtn(withHandler)).not.toBeNull();
    expect(readBtn(withoutHandler)).toBeNull();
    expect(withHandler.querySelector('.tiptap')!.innerHTML).toBe(withoutHandler.querySelector('.tiptap')!.innerHTML);
    const post = doc({ metadata: { description: 'd', textColor: '#ff0000' } });
    expect(bodyStyle(mount(<PostCardContent padlet={post} onOpenDocument={vi.fn()} />)).color).toBe('rgb(255, 0, 0)');
  });
});
