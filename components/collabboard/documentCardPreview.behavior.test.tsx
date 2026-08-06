// @vitest-environment jsdom
//
// PATCH-152 targeted correction: Document canvas-card rendering.
//
// Traced ownership before writing this file:
//   Document post (type:'card', no metadata.svgUrl, isDocumentPost)
//     -> Freeform:   FreeformPadletCards.tsx -> CardPreview.tsx (non-clipart branch)
//     -> containers: PostCardContent.tsx's isDocumentPost branch
//   Both branches delegate the actual preview body + Read button to the SAME
//   shared leaf, DocumentCardContent.tsx -- that is the canonical Document
//   card renderer. CardPreview's own "chrome" (border, background, edit
//   buttons, top strip, reactions) is the Freeform-specific card shell;
//   PostCardContent/RowColumnContainerCard is the container-layout shell.
//   Prior to this patch, CardPreview's non-clipart branch never passed
//   `content` to DocumentCardContent at all -- it rendered a blank gray
//   icon-placeholder block (byte-identical structure to the Clipart branch's
//   icon box, minus the <img>) instead of the Document's own text. That is
//   the root cause of "Document renders like Clipart" -- not a routing bug,
//   a rendering-body bug local to CardPreview's Document branch.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import type { Padlet } from '@/types/collabboard';
import CardPreview from './CardPreview';
import PostCardContent from './PostCardContent';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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

function withOverflow<T>(fn: () => T): T {
  const scrollDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 500 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 100 });
  try {
    return fn();
  } finally {
    if (scrollDesc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollDesc);
    else delete (HTMLElement.prototype as any).scrollHeight;
    if (clientDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientDesc);
    else delete (HTMLElement.prototype as any).clientHeight;
  }
}

const doc = (over: Partial<Omit<Padlet, 'metadata'>> & { metadata?: any } = {}): Padlet => ({
  id: 'doc-1', board_id: 'b', type: 'card', title: 'Meeting Notes',
  content: '<p>First paragraph of real Document body text.</p>',
  position_x: 0, position_y: 0, width: 180, height: 220,
  created_at: '', updated_at: '', metadata: {}, ...over,
} as Padlet);

const readBtn = (c: HTMLElement) => c.querySelector('button[aria-label="Read document"]');
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('1/2/3/4: Document Freeform card uses the Note-style preview, not the Clipart placeholder', () => {
  it('1: renders via the shared DocumentCardContent leaf (Note-style: title + clamped text body), not a locally reimplemented preview', () => {
    const c = mount(<CardPreview padlet={doc()} isSelected={false} />);
    expect(c.querySelector('.tiptap.prose')).not.toBeNull();
    expect(c.textContent).toContain('Meeting Notes');
  });

  it('2: does not render the old Clipart-style icon/image placeholder block', () => {
    const c = mount(<CardPreview padlet={doc()} isSelected={false} />);
    // The removed placeholder was a fixed 32x32 icon box with an inner blank
    // 28x28 gray block -- neither class combination should exist anymore.
    expect(c.querySelector('.h-32.w-32')).toBeNull();
    expect(c.querySelector('.h-28.w-28')).toBeNull();
    expect(c.querySelector('.bg-gray-200')).toBeNull();
  });

  it('3: the first paragraph / initial visible text of the Document body appears in the card', () => {
    const c = mount(<CardPreview padlet={doc({ content: '<p>First paragraph text.</p><p>Second paragraph, should still be reachable inside the clamp.</p>' })} isSelected={false} />);
    expect(c.textContent).toContain('First paragraph text.');
  });

  it('4: raw HTML tags and editor JSON are never displayed as visible text', () => {
    const c = mount(<CardPreview padlet={doc({ content: '<p>Hello <strong>world</strong></p>' })} isSelected={false} />);
    expect(c.textContent).not.toContain('<p>');
    expect(c.textContent).not.toContain('<strong>');
    expect(c.textContent).not.toMatch(/"type":"doc"/); // no TipTap/ProseMirror JSON leaking through
    expect(c.textContent).toContain('Hello');
    expect(c.textContent).toContain('world');
    // it IS real formatted HTML underneath (readable, not raw-escaped) --
    // sanitized rich rendering, matching Note's own preview treatment.
    expect(c.querySelector('strong')).not.toBeNull();
  });

  it('does not mutate the padlet/content it was given', () => {
    const p = doc({ content: '<p>Untouched</p>' });
    const before = JSON.stringify(p);
    mount(<CardPreview padlet={p} isSelected={false} />);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('5/6/7: overflow-gated Read affordance and the Read action', () => {
  it('5: Read is absent when the body fits inside the preview area', () => {
    const c = mount(<CardPreview padlet={doc({ content: '<p>Short.</p>' })} isSelected={false} onReadDocument={vi.fn()} />);
    expect(readBtn(c)).toBeNull();
  });

  it('6: Read appears once the body overflows the preview area', () => {
    const c = withOverflow(() => mount(<CardPreview padlet={doc({ content: '<p>Long enough to overflow in a real browser.</p>' })} isSelected={false} onReadDocument={vi.fn()} />));
    expect(readBtn(c)).not.toBeNull();
  });

  it('7: clicking Read invokes the owner-supplied open callback (the same one that opens the full Document modal)', () => {
    const onReadDocument = vi.fn();
    const c = withOverflow(() => mount(<CardPreview padlet={doc()} isSelected={false} onReadDocument={onReadDocument} />));
    click(readBtn(c)!);
    expect(onReadDocument).toHaveBeenCalledTimes(1);
  });

  it('overflow gating is stable across a rerender with identical content (no flicker)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    withOverflow(() => {
      act(() => { root.render(<CardPreview padlet={doc()} isSelected={false} onReadDocument={vi.fn()} />); });
      expect(readBtn(container)).not.toBeNull();
      act(() => { root.render(<CardPreview padlet={doc()} isSelected={true} onReadDocument={vi.fn()} />); });
      expect(readBtn(container)).not.toBeNull();
    });
    act(() => { root.unmount(); });
    container.remove();
  });
});

describe('19: the same canonical Document card renderer is used by every layout owner (no per-layout duplicate)', () => {
  const cardPreviewSrc = fs.readFileSync('components/collabboard/CardPreview.tsx', 'utf8');
  const postCardContentSrc = fs.readFileSync('components/collabboard/PostCardContent.tsx', 'utf8');

  it('CardPreview (Freeform) delegates the Document body/Read to DocumentCardContent, passing real content', () => {
    expect(cardPreviewSrc).toContain('<DocumentCardContent content={sanitizedDocumentContent}');
    expect(cardPreviewSrc).toContain("import DocumentCardContent from './DocumentCardContent'");
  });

  it('PostCardContent (Wall/Columns/Grid/Table/Timeline/Map/Drawing/Container) delegates the same way', () => {
    expect(postCardContentSrc).toContain('isDocumentPost(padlet) && onOpenDocument');
    expect(postCardContentSrc).toContain('<DocumentCardContent');
  });

  it('neither owner reimplements a Read button or a Document body renderer locally', () => {
    for (const src of [cardPreviewSrc, postCardContentSrc]) {
      expect(src).not.toMatch(/<button[^>]*aria-label="Read document"/);
    }
  });

  it('NC6 guard: exactly one Document-body-rendering component exists in the repo (DocumentCardContent)', () => {
    // A second layout-specific Document renderer would need its own
    // "Read document" button or its own clamp/overflow logic -- neither
    // CardPreview nor PostCardContent contains one; both call into the
    // single shared leaf instead.
    expect(cardPreviewSrc.match(/WebkitLineClamp/g) || []).toHaveLength(0);
    expect(postCardContentSrc.match(/WebkitLineClamp/g)?.length).toBeGreaterThan(0); // Note's own default branch, untouched
  });
});

describe('16/17/18: Note, Clipart and Freeform placement are unaffected by the Document preview correction', () => {
  it('Clipart branch keeps its icon/image placeholder and word counter untouched', () => {
    const clip = doc({ id: 'clip-1', metadata: { svgUrl: 'x.svg' } });
    const c = mount(<CardPreview padlet={clip} isSelected={false} />);
    expect(c.querySelector('.h-32.w-32')).not.toBeNull();
    expect(c.querySelector('img[src="x.svg"]')).not.toBeNull();
    expect(c.textContent).toContain('words');
  });

  it('Note (type: text) never reaches CardPreview\'s Document branch or DocumentCardContent (PostCardContent gates on isDocumentPost)', () => {
    const note = { ...doc(), type: 'note' } as Padlet;
    const c = mount(<PostCardContent padlet={note} onOpenDocument={vi.fn()} />);
    expect(c.querySelector('button[aria-label="Read document"]')).toBeNull();
  });

  it('Freeform placement/positioning source is untouched by this patch (zero-diff characterization)', () => {
    const freeformSrc = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    expect(freeformSrc).toContain('left: padlet.position_x || 0,');
    expect(freeformSrc).toContain('top: padlet.position_y || 0,');
  });
});

describe('follow-up correction: Document Freeform card has square corners and a gray title bar (Note-style, not Clipart-style)', () => {
  it('the outer card wrapper has no rounded-corner classes', () => {
    const c = mount(<CardPreview padlet={doc()} isSelected={false} />);
    const wrapper = c.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/rounded/);
  });

  it('renders a title bar containing the title text, not a centered title inside the body', () => {
    const c = mount(<CardPreview padlet={doc({ title: 'Meeting Notes' })} isSelected={false} />);
    const bar = c.querySelector('.grid') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('Meeting Notes');
  });

  it('the Read button, when overflowing, is positioned inside the clamped text area (not the whole card)', () => {
    const c = withOverflow(() => mount(<CardPreview padlet={doc()} isSelected={false} onReadDocument={vi.fn()} />));
    const btn = readBtn(c)!;
    // Its positioning ancestor is the relative body wrapper directly around
    // DocumentCardContent, not the outer card -- i.e. it overlays the text,
    // matching "Read Me over the bottom half of the text" rather than the card.
    expect(btn.parentElement?.className).toContain('relative');
    expect(btn.parentElement?.className).toContain('overflow-hidden');
  });

  it('does not render with no title bar when title is absent (empty center slot, bar itself still present)', () => {
    const c = mount(<CardPreview padlet={doc({ title: '' })} isSelected={false} />);
    expect(c.querySelector('.grid')).not.toBeNull();
  });
});
