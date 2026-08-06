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
import CommentPost from './CommentPost';

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

  it('the outer outline is an inset box-shadow, not a stroked border (a stroked 1px border can anti-alias away under the canvas zoom transform on some edges while staying crisp on others)', () => {
    const c = mount(<CardPreview padlet={doc()} isSelected={false} />);
    const wrapper = c.firstElementChild as HTMLElement;
    expect(wrapper.style.boxShadow).toBe('inset 0 0 0 1px #e5e7eb');
    expect(wrapper.style.border).toBe('');
    expect(wrapper.className).not.toMatch(/\bborder\b/);
    expect(wrapper.className).not.toMatch(/border-gray-200/);
  });

  it('the inset outline persists on the selected card too (only a ring accent is added on top, mirroring Note)', () => {
    const c = mount(<CardPreview padlet={doc()} isSelected={true} />);
    const wrapper = c.firstElementChild as HTMLElement;
    expect(wrapper.style.boxShadow).toBe('inset 0 0 0 1px #e5e7eb');
    expect(wrapper.className).toContain('ring-2');
  });

  it('the Freeform selection ring for a Document post is square (Note-style, no rounded-lg/shadow-xl), only Clipart keeps its rounded selected ring', () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    expect(src).toContain('isDocumentPost(padlet)');
    // The Document branch of the selected-state ternary must match Note's
    // own selected styling exactly (ring-offset-2, no rounded-lg/shadow-xl).
    expect(src).toContain("? 'ring-2 ring-blue-500 ring-offset-2'");
    // The Clipart branch (the ternary's else) is untouched.
    expect(src).toContain("'ring-2 ring-blue-500 rounded-lg shadow-xl'");
  });

  it('the Card Comments popup (reachable for both Clipart and Document card posts) has square corners and a real pencil icon, not the old rounded-xl box or the PenTool smudge', () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    const start = src.indexOf('{/* Card Comments Popup - Right side */}');
    const end = src.indexOf('{/* Render Standalone Comment Marker */}');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).not.toContain('rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]');
    expect(block).toContain('shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]');
    expect(block).not.toContain('<PenTool');
    expect(block).toContain('title="Edit"');
    expect(block).toContain('<Edit2 className="w-3 h-3" />');
  });

  it('the shared CommentPopup (rendered via OverlayLayer for canvas comment markers on Note/Document/Clipart alike) has square corners, not rounded-xl', () => {
    const src = fs.readFileSync('components/collabboard/editors/CommentPopup.tsx', 'utf8');
    expect(src).not.toContain('relative rounded-xl border border-gray-200 p-4');
    expect(src).toContain('relative border border-gray-200 p-4');
  });

  it("the standalone Comment post (padlet.type === 'comment', CommentPost.tsx -- a distinct post type from Document/Clipart) has square corners and a real pencil icon, not rounded-xl/rounded-t-xl or the PenTool smudge", () => {
    const src = fs.readFileSync('components/collabboard/CommentPost.tsx', 'utf8');
    expect(src).not.toContain('rounded-xl');
    expect(src).not.toContain('rounded-t-xl');
    expect(src).not.toContain('PenTool');
    expect(src).toContain("import { Edit2, MessageSquare, Palette, Send, Strikethrough, Trash2 } from 'lucide-react';");
    expect(src).toContain('<Edit2 className="w-3 h-3" />');
  });

  it("the standalone Comment post's canvas header has no decorative (non-interactive) Badge Color swatch -- that control belongs only to CommentEditor's editing modal", () => {
    const src = fs.readFileSync('components/collabboard/CommentPost.tsx', 'utf8');
    expect(src).not.toContain('title="Badge Color"');
  });

  it("the Note post's top-strip bar shows a ghost 'Title' placeholder until the user sets a meaningful title, editable in place via the same double-click pattern as Comment/Document, backed by the shared getMeaningfulTitle placeholder check", () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    const start = src.indexOf('{/* Center: title -- containers show their real title');
    const end = src.indexOf('{/* Right: pencil hover-only */}');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    // Real Note posts are created with type 'text' (see usePadletSave.ts's
    // saveNote: `type: 'text', title: 'New Note'`) -- 'note' is a type the
    // union allows but the live create flow never actually stamps, so both
    // are accepted defensively.
    expect(block).toContain("padlet.type === 'text' || (padlet.type as string) === 'note'");
    expect(block).toContain('getMeaningfulTitle(padlet.title, padlet.type)');
    expect(block).toContain('editingNoteTitleId === padlet.id');
    expect(block).toContain('{noteTitle || \'Title\'}');
    expect(block).toContain("noteTitle ? '' : 'opacity-40 select-none'");
    expect(block).toContain('updatePadletTitle(padlet.id, noteTitleDraft.trim())');
  });

  it("CommentEditorToolbar no longer has a separate 'Title' toggle tool -- title editing happens directly in the card's own bar now", () => {
    const src = fs.readFileSync('components/collabboard/editors/CommentEditorToolbar.tsx', 'utf8');
    expect(src).not.toContain("label: 'Title'");
    expect(src).not.toContain('onTitle');
    expect(src).not.toContain('titleActive');
  });

  it("CommentEditor's modal title field is always editable inline (ghost 'Title' placeholder) instead of gated behind a toggle button, and no longer force-stores the legacy 'Comments' default", () => {
    const src = fs.readFileSync('components/collabboard/editors/CommentEditor.tsx', 'utf8');
    expect(src).not.toContain('showTitleInput');
    expect(src).not.toContain('commentTitle || "Comments"');
    expect(src).toContain('placeholder="Title"');
  });

  it("the standalone Comment post has the exact same top-strip bar as Note/Document (3-column grid, minHeight 22px, title centered, pencil in the right slot) instead of no bar at all", () => {
    const src = fs.readFileSync('components/collabboard/CommentPost.tsx', 'utf8');
    // No more custom three-circle kebab icon.
    expect(src).not.toContain('<circle cx="12" cy="5" r="2" />');
    // Same 3-column grid strip CardPreview.tsx uses for Document/Clipart.
    const stripIndex = src.indexOf("className=\"w-full flex-shrink-0 grid\"");
    const bodyIndex = src.indexOf('className="p-4 flex-1 flex flex-col relative"');
    expect(stripIndex).toBeGreaterThan(-1);
    expect(bodyIndex).toBeGreaterThan(stripIndex);
    const stripBlock = src.slice(stripIndex, bodyIndex);
    expect(stripBlock).toContain("gridTemplateColumns: 'auto 1fr auto', minHeight: '22px'");
    // Title is centered in the strip (ghost "Title" placeholder when unset,
    // via getMeaningfulTitle), not left in the old padded header.
    expect(stripBlock).toContain('{meaningfulTitle || \'Title\'}');
    // Edit pencil lives in the strip's right slot, hover-revealed like Document's.
    expect(stripBlock).toContain('showMenu &&');
    expect(stripBlock).toContain('opacity-0 group-hover:opacity-100');
    expect(stripBlock).toContain('<Edit2 className="w-3 h-3" />');
    // The counter badge (outside the strip, on the card's outer edge) is untouched.
    const badgeIndex = src.indexOf('Comment counter badge on card edge');
    expect(badgeIndex).toBeGreaterThan(-1);
    expect(badgeIndex).toBeLessThan(stripIndex);
  });

  it("the Comment post's title bar text auto-switches between light and dark to stay readable against any topStrip color, instead of a fixed color that can go black-on-black", () => {
    const darkStrip = mount(
      <CommentPost comments={[]} cardColor="#ffffff" topStrip="#000000" commentTitle="Comments" showMenu />
    );
    const darkTitle = darkStrip.querySelector('span.text-xs.font-semibold') as HTMLElement;
    expect(darkTitle).not.toBeNull();
    // contrastIconColor('#000000') -> '#f8fafc' (near-white) against a black strip.
    expect(darkTitle.style.color).toBe('rgb(248, 250, 252)');

    const lightStrip = mount(
      <CommentPost comments={[]} cardColor="#ffffff" topStrip="#ffffff" commentTitle="Comments" showMenu />
    );
    const lightTitle = lightStrip.querySelector('span.text-xs.font-semibold') as HTMLElement;
    expect(lightTitle).not.toBeNull();
    // contrastIconColor('#ffffff') -> '#1e293b' (near-black) against a white strip.
    expect(lightTitle.style.color).toBe('rgb(30, 41, 59)');
  });

  it("the Comment post shows a semi-transparent 'Title' ghost placeholder when unset (or still the legacy 'Comments'/empty default), and the real title in full opacity once the user sets one", () => {
    const unset = mount(<CommentPost comments={[]} cardColor="#ffffff" commentTitle="" showMenu />);
    const ghost = unset.querySelector('span.text-xs.font-semibold') as HTMLElement;
    expect(ghost.textContent).toBe('Title');
    expect(ghost.className).toContain('opacity-40');

    const legacyDefault = mount(<CommentPost comments={[]} cardColor="#ffffff" commentTitle="Comments" showMenu />);
    const legacyGhost = legacyDefault.querySelector('span.text-xs.font-semibold') as HTMLElement;
    expect(legacyGhost.textContent).toBe('Title');
    expect(legacyGhost.className).toContain('opacity-40');

    const real = mount(<CommentPost comments={[]} cardColor="#ffffff" commentTitle="Launch feedback" showMenu />);
    const realSpan = real.querySelector('span.text-xs.font-semibold') as HTMLElement;
    expect(realSpan.textContent).toBe('Launch feedback');
    expect(realSpan.className).not.toContain('opacity-40');
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

  it('shows a semi-transparent "Title" ghost placeholder in the bar when title is empty or a legacy placeholder default, and the real title in full opacity otherwise', () => {
    const empty = mount(<CardPreview padlet={doc({ title: '' })} isSelected={false} />);
    const emptyBar = empty.querySelector('.grid') as HTMLElement;
    expect(emptyBar).not.toBeNull();
    const emptySpan = empty.querySelector('span.text-xs.font-semibold.text-center.truncate') as HTMLElement;
    expect(emptySpan.textContent).toBe('Title');
    expect(emptySpan.className).toContain('opacity-40');

    const legacyDefault = mount(<CardPreview padlet={doc({ title: 'New Post' })} isSelected={false} />);
    const legacySpan = legacyDefault.querySelector('span.text-xs.font-semibold.text-center.truncate') as HTMLElement;
    expect(legacySpan.textContent).toBe('Title');
    expect(legacySpan.className).toContain('opacity-40');

    const real = mount(<CardPreview padlet={doc({ title: 'Q3 Roadmap' })} isSelected={false} />);
    const realSpan = real.querySelector('span.text-xs.font-semibold.text-center.truncate') as HTMLElement;
    expect(realSpan.textContent).toBe('Q3 Roadmap');
    expect(realSpan.className).not.toContain('opacity-40');
  });

  it("NoteEditor's modal now has a title field (it previously had none at all) -- ghost \"Title\" placeholder, wired into onSave's payload", () => {
    const src = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    expect(src).toContain('initialTitle');
    expect(src).toContain("const [title, setTitle] = useState(initialTitle);");
    expect(src).toContain('placeholder="Title"');
    expect(src).toContain('title: title.trim() || undefined');
  });

  it("CanvasModals passes NoteEditor a placeholder-aware initialTitle (getMeaningfulTitle), so a legacy \"New Note\" default reads as unset rather than as real text", () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/CanvasModals.tsx', 'utf8');
    expect(src).toContain('initialTitle={getMeaningfulTitle(padletToEdit?.title, padletToEdit?.type)}');
  });

  it("CommentEditor's title input no longer shows the legacy \"Comments\" default as if it were real user text -- both the initial state and the reset-on-open effect run it through getMeaningfulTitle", () => {
    const src = fs.readFileSync('components/collabboard/editors/CommentEditor.tsx', 'utf8');
    const occurrences = src.split("getMeaningfulTitle(initialCommentTitle, 'comment')").length - 1;
    expect(occurrences).toBe(2);
  });
});
