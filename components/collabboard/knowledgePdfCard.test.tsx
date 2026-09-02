// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePdfCanvasSurface, {
  KnowledgePdfCardControls,
  KnowledgePdfOpenProvider,
} from './KnowledgePdfCanvasSurface';

/**
 * PDF-C1 Step 1 -- the Freeform PDF object is a DOCUMENT, not an upload
 * placeholder. The card carries a permanent header of compact actions and a
 * scrollable page body; the three large body buttons are gone.
 *
 * These tests drive the rendered card, because every requirement here is about
 * what a person sees and can click without hovering.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SURFACE = read('components/collabboard/KnowledgePdfCanvasSurface.tsx');
const REGISTRY = read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
const SIDEBAR = read('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const POST_CARD = read('components/collabboard/PostCardContent.tsx');

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '33333333-3333-4333-8333-333333333333';
const PAGES_URL = `/api/boards/${BOARD_ID}/knowledge/${DOC_ID}/pages`;

function pagePayload(count: number) {
  return {
    document: { id: DOC_ID, originalFilename: 'lesson.pdf', pageCount: count },
    pages: Array.from({ length: count }, (_, index) => ({
      pageNumber: index + 1,
      text: `Text of page ${index + 1}. Neutral synthetic content.`,
      widthPoints: 300,
      heightPoints: 400,
      rotation: 0,
    })),
  };
}

/** Serves page content; anything else is an empty 200, as the app's own stub does. */
function stubPages(count = 3, ok = true) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url) === PAGES_URL) {
      return ok
        ? new Response(JSON.stringify(pagePayload(count)), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let mounted: Array<{ root: Root; host: HTMLElement }> = [];

/**
 * The Freeform host reads these as REACT handlers on an ancestor, which is what
 * the card's stopPropagation actually has to defeat. A native listener on the
 * React root would fire before React ever dispatches, and would prove nothing.
 */
type HostSpies = { wheel: () => void; pointerDown: () => void };

async function card(options: {
  status?: 'uploaded' | 'processing' | 'ready' | 'failed';
  onOpen?: (request: { documentId: string }) => void;
  withProvider?: boolean;
  hostSpies?: HostSpies;
} = {}) {
  const { status = 'ready', onOpen = vi.fn(), withProvider = true, hostSpies } = options;
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const surface = (
    <KnowledgePdfCanvasSurface
      boardId={BOARD_ID}
      documentId={DOC_ID}
      originalFilename="lesson.pdf"
      processingStatus={status}
    />
  );
  const withHost = (node: React.ReactElement) => (hostSpies
    ? <div onWheel={hostSpies.wheel} onPointerDown={hostSpies.pointerDown}>{node}</div>
    : node);
  await act(async () => {
    root.render(withHost(withProvider
      ? <KnowledgePdfOpenProvider onOpenDocument={onOpen}>{surface}</KnowledgePdfOpenProvider>
      : surface));
  });
  // Let the page fetch resolve.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  mounted.push({ root, host });
  return host;
}

/** The controls as a read-only viewer gets them: rendered, but inert. */
async function viewerControls() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onOpen = vi.fn();
  await act(async () => {
    root.render(
      <KnowledgePdfOpenProvider onOpenDocument={onOpen}>
        <KnowledgePdfCardControls
          boardId={BOARD_ID}
          documentId={DOC_ID}
          status="ready"
          collapsed={false}
          view="page"
          disabled
          onToggleCollapse={vi.fn()}
          onToggleView={vi.fn()}
        />
      </KnowledgePdfOpenProvider>,
    );
  });
  mounted.push({ root, host });
  return host;
}

const header = (host: HTMLElement) => host.querySelector('[data-knowledge-pdf-header="true"]');
const body = (host: HTMLElement) => host.querySelector('[data-knowledge-pdf-body="true"]');
const action = (host: HTMLElement, name: string) =>
  host.querySelector<HTMLElement>(`[data-knowledge-pdf-action="${name}"]`);
const pageSections = (host: HTMLElement) => [...host.querySelectorAll('[data-knowledge-pdf-page]')];

beforeEach(() => { stubPages(3); });

afterEach(() => {
  for (const { root, host } of mounted) {
    act(() => root.unmount());
    host.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

describe('1-3. the card is a document with a permanent header', () => {
  it('1. is expanded by default and shows page content, not buttons', async () => {
    const host = await card();
    expect(host.getAttribute('data-knowledge-pdf-collapsed')
      ?? host.querySelector('[data-knowledge-pdf-surface]')?.getAttribute('data-knowledge-pdf-collapsed')).toBe('false');
    expect(body(host)).not.toBeNull();
    expect(pageSections(host).length).toBeGreaterThan(0);
  });

  it('2. the header is permanently visible, never hover-revealed', async () => {
    const host = await card();
    const bar = header(host)!;
    expect(bar).not.toBeNull();
    // A hover-gated toolbar would need one of these; the header must have none.
    expect(bar.className).not.toContain('opacity-0');
    expect(bar.className).not.toContain('group-hover');
    expect(bar.className).not.toContain('invisible');
    expect(bar.className).not.toContain('hidden');
    // Nor may the source express the pattern anywhere in the card.
    const code = executable(SURFACE);
    expect(code).not.toContain('group-hover:opacity-100');
    expect(code).not.toContain('opacity-0 group-hover');
  });

  it('3. the header carries every action, and they live only there', async () => {
    const host = await card();
    for (const name of ['collapse', 'page-view', 'parsed-content', 'open', 'side-panel', 'new-tab']) {
      const control = action(host, name);
      expect(control, `${name} must exist`).not.toBeNull();
      expect(header(host)!.contains(control!), `${name} must be in the header`).toBe(true);
    }
  });
});

describe('4-7. the old placeholder body is gone', () => {
  it('4. renders no AI control of any kind', async () => {
    const host = await card();
    expect(host.textContent).not.toMatch(/Ask AI|Add to chat|\bAI\b/);
    const code = executable(SURFACE).toLowerCase();
    for (const forbidden of ['ask ai', 'add to chat', '/api/ai']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('5-7. the three large body buttons no longer exist', async () => {
    const host = await card();
    const bodyEl = body(host)!;
    // The actions moved to the header: none of them may sit in the document body.
    for (const name of ['open', 'side-panel', 'new-tab']) {
      expect(bodyEl.querySelector(`[data-knowledge-pdf-action="${name}"]`), `${name} must not be in the body`).toBeNull();
    }
    // And their old text labels are gone from the card entirely.
    expect(bodyEl.textContent).not.toContain('Side panel');
    expect(bodyEl.textContent).not.toContain('New tab');
  });
});

describe('8-12. page content and fallback', () => {
  it('8. page 1 renders as soon as content is available', async () => {
    const host = await card();
    const first = pageSections(host)[0];
    expect(first.getAttribute('data-knowledge-pdf-page')).toBe('1');
    expect(first.textContent).toContain('Page 1');
  });

  it('9-10. exactly one page is mounted, and it is the current one', async () => {
    const host = await card();
    // PDF-C1 supersedes the vertical multi-page preview: the canvas object is a
    // page CONTROLLER, so one page is mounted -- not one visible among several.
    // A hidden sibling would still fetch its image and still be findable here.
    expect(pageSections(host)).toHaveLength(1);
    expect(pageSections(host)[0].getAttribute('data-knowledge-pdf-page')).toBe('1');
    // The body still scrolls, but now only ever over a single page.
    expect(body(host)!.className).toContain('overflow-y-auto');
  });

  it('11. a page with no rendered image falls back to its parsed text', async () => {
    const host = await card();
    const firstPage = pageSections(host)[0];
    const image = firstPage.querySelector('img')!;
    expect(image, 'the image is attempted first').not.toBeNull();
    expect(firstPage.querySelector('[data-knowledge-pdf-page-text]')).toBeNull();

    // The local environment's real behaviour: no derivative exists, so the
    // image errors and the canonical text must take its place.
    await act(async () => { image.dispatchEvent(new Event('error')); });

    const after = pageSections(host)[0];
    expect(after.querySelector('[data-knowledge-pdf-page-text]')).not.toBeNull();
    expect(after.textContent).toContain('Text of page 1');
  });

  it('12. a failed image leaves no broken-image element behind', async () => {
    const host = await card();
    const image = pageSections(host)[0].querySelector('img')!;
    await act(async () => { image.dispatchEvent(new Event('error')); });
    expect(pageSections(host)[0].querySelector('img')).toBeNull();
  });

  it('a document whose pages cannot be read says so truthfully', async () => {
    vi.unstubAllGlobals();
    stubPages(0, false);
    const host = await card();
    expect(body(host)!.textContent).toContain('not available');
    expect(body(host)!.textContent).not.toContain('%');
  });
});

describe('13-15. loading is truthful and never a percentage', () => {
  it('13-14. the loading state shows while content is pending and clears after', async () => {
    // A fetch held open: the card must be in its loading state meanwhile.
    let release: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url) === PAGES_URL ? pending : new Response('{}', { status: 200 })));

    const host = await card();
    expect(host.querySelector('[data-knowledge-pdf-loading]'), 'loading shows while pending').not.toBeNull();

    await act(async () => {
      release(new Response(JSON.stringify(pagePayload(2)), { status: 200, headers: { 'content-type': 'application/json' } }));
      await Promise.resolve();
    });
    await act(async () => { await Promise.resolve(); });

    expect(host.querySelector('[data-knowledge-pdf-loading]'), 'loading clears on completion').toBeNull();
  });

  it('15. no percentage is rendered, and none is used as zoom', async () => {
    const host = await card();
    expect(host.textContent).not.toMatch(/\d+\s*%/);
    const code = executable(SURFACE);
    // Nothing may synthesise progress from time, polls or a counter.
    expect(code).not.toMatch(/setInterval\([^)]*progress/i);
    expect(code).not.toMatch(/\bzoom\b/i);
    expect(code).not.toContain('%`');
  });
});

describe('16-18. parsed content and collapse', () => {
  it('16. Show parsed content switches the body to the existing parsed text', async () => {
    const host = await card();
    expect(host.querySelectorAll('[data-knowledge-pdf-page-text]')).toHaveLength(0);

    await act(async () => { action(host, 'parsed-content')!.click(); });

    // One page's parsed text, the page currently on screen.
    expect(host.querySelectorAll('[data-knowledge-pdf-page-text]')).toHaveLength(1);
    expect(body(host)!.textContent).toContain('Text of page 1');
    expect(body(host)!.textContent, 'never a second page').not.toContain('Text of page 2');
    // The text came from the pages endpoint; nothing re-parses the PDF.
    expect(executable(SURFACE)).not.toMatch(/pdfjs|pdf-parse|getDocument\(/i);
  });

  it('16b. the two view controls are one selector, not two toggles', async () => {
    const host = await card();
    const mode = () => action(host, 'parsed-content')!.getAttribute('data-knowledge-pdf-view');

    // Page is the initial mode, and its own control is the active one.
    expect(mode()).toBe('page');
    expect(action(host, 'page-view')!.getAttribute('aria-pressed')).toBe('true');
    expect(action(host, 'parsed-content')!.getAttribute('aria-pressed')).toBe('false');

    // T selects parsed text; pressing it again must NOT bounce back to pages.
    await act(async () => { action(host, 'parsed-content')!.click(); });
    expect(mode()).toBe('text');
    await act(async () => { action(host, 'parsed-content')!.click(); });
    expect(mode(), 'selecting the active mode is a no-op').toBe('text');
    expect(action(host, 'parsed-content')!.getAttribute('aria-pressed')).toBe('true');
    expect(action(host, 'page-view')!.getAttribute('aria-pressed')).toBe('false');

    // The document icon is what returns to pages -- it is a real control now.
    await act(async () => { action(host, 'page-view')!.click(); });
    expect(mode()).toBe('page');
    await act(async () => { action(host, 'page-view')!.click(); });
    expect(mode(), 'and it is a no-op when already active').toBe('page');
  });

  it('16c. the selector survives repeated switching without a remount', async () => {
    const host = await card();
    const surfaceId = () => host.querySelector('[data-knowledge-pdf-surface]')!
      .getAttribute('data-knowledge-document-id');
    const before = surfaceId();

    for (let round = 0; round < 2; round += 1) {
      await act(async () => { action(host, 'parsed-content')!.click(); });
      expect(host.querySelectorAll('[data-knowledge-pdf-page-text]').length).toBe(1);
      await act(async () => { action(host, 'page-view')!.click(); });
      expect(host.querySelectorAll('[data-knowledge-pdf-page-text]').length).toBe(0);
    }
    // Same document throughout: switching view never re-creates the surface.
    expect(surfaceId()).toBe(before);
  });

  it('16d. the document icon is a real control, not decoration', async () => {
    const host = await card();
    const pageBtn = action(host, 'page-view')!;
    expect(pageBtn, 'the PDF/page control must exist').not.toBeNull();
    expect(pageBtn.tagName).toBe('BUTTON');
    expect(pageBtn.getAttribute('title')).toBe('PDF pages');
    expect(action(host, 'parsed-content')!.getAttribute('title')).toBe('Parsed text');
    // The two halves are distinct actions, never the same one twice.
    expect(pageBtn).not.toBe(action(host, 'parsed-content'));
  });

  it('16e. navigation actions all address the SAME knowledge document', async () => {
    const onOpen = vi.fn();
    const host = await card({ onOpen });
    const docId = host.querySelector('[data-knowledge-pdf-surface]')!
      .getAttribute('data-knowledge-document-id');

    await act(async () => { action(host, 'open')!.click(); });
    await act(async () => { action(host, 'side-panel')!.click(); });
    expect(onOpen).toHaveBeenCalledTimes(2);
    for (const call of onOpen.mock.calls) expect(call[0].documentId).toBe(docId);
    // New tab targets the same document's original file -- no copy, no re-upload.
    expect(action(host, 'new-tab')!.getAttribute('href')).toContain(docId);
  });

  it('17-18. collapse hides the document and shows filename plus a snippet', async () => {
    const host = await card();
    await act(async () => { action(host, 'collapse')!.click(); });

    expect(body(host), 'the page body must be gone while collapsed').toBeNull();
    const collapsed = host.querySelector('[data-knowledge-pdf-collapsed-body]')!;
    expect(collapsed).not.toBeNull();
    expect(collapsed.textContent).toContain('lesson.pdf');
    expect(collapsed.querySelector('[data-knowledge-pdf-snippet]')!.textContent).toContain('Text of page 1');
    // The header -- and therefore every action -- survives collapsing.
    expect(header(host)).not.toBeNull();
    expect(action(host, 'open')).not.toBeNull();

    await act(async () => { action(host, 'collapse')!.click(); });
    expect(body(host)).not.toBeNull();
  });
});

describe('19-21. canvas interaction is preserved', () => {
  it('19. wheel scrolling in the body never pans the canvas', async () => {
    const spies = { wheel: vi.fn(), pointerDown: vi.fn() };
    const host = await card({ hostSpies: spies });

    const bodyEl = body(host)!;
    await act(async () => {
      bodyEl.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      bodyEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    // Wheel is the one that matters for reading a long document: it must not
    // reach the canvas. Bubble-phase pointer isolation is kept for the same
    // reason, but note it does NOT (and must not) block selection -- the
    // Freeform root selects in CAPTURE phase, deliberately so that a child's
    // stopPropagation cannot make a post unselectable. See test 5b.
    expect(spies.wheel).not.toHaveBeenCalled();
    expect(spies.pointerDown).not.toHaveBeenCalled();
  });

  it('20. the header still lets the host move the card', async () => {
    const spies = { wheel: vi.fn(), pointerDown: vi.fn() };
    const host = await card({ hostSpies: spies });

    // The bar itself is the drag handle: only its BUTTONS swallow the press.
    await act(async () => {
      header(host)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(spies.pointerDown).toHaveBeenCalledTimes(1);

    await act(async () => {
      action(host, 'open')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(spies.pointerDown, 'a control must not start a drag').toHaveBeenCalledTimes(1);
  });

  it('21. the card fills its host box so Freeform resize keeps working', async () => {
    const host = await card();
    const surface = host.querySelector('[data-knowledge-pdf-surface]')!;
    // Height comes from the padlet, not a hardcoded size.
    expect(surface.className).toContain('h-full');
    expect(surface.className).toContain('flex-col');
    expect(body(host)!.className).toContain('flex-1');
    expect(executable(SURFACE)).not.toMatch(/height:\s*['"]?\d+px/);
  });
});

describe('22-23. permissions', () => {
  it('22. every control on the card is read-only navigation or local view state', async () => {
    const host = await card();
    // Open / side panel / new tab navigate; collapse and parsed-content are
    // local view state. None writes anything, so a viewer keeps all of them.
    await act(async () => { action(host, 'collapse')!.click(); });
    await act(async () => { action(host, 'collapse')!.click(); });
    await act(async () => { action(host, 'parsed-content')!.click(); });
    expect(host.querySelectorAll('[data-knowledge-pdf-page-text]')).toHaveLength(1);
  });

  it('23. the surface performs no mutation, so nothing here needs gating', () => {
    const code = executable(SURFACE);
    // Any write would have to be permission-gated; there is none to gate.
    expect(code).not.toMatch(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
    expect(code).not.toContain('updatePostFields');
    expect(code).not.toContain('setPadlets');
    expect(code).not.toContain('supabase');
    // Collapse/parsed state is local React state, never persisted metadata.
    expect(code).not.toContain('knowledgeDisplayMode:');
  });
});

describe('50-53. a read-only viewer sees a name, never an action', () => {
  const FREEFORM = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
  /** The strip's PDF control cell, taken from the placement guard to its close. */
  const pdfCell = () => {
    const at = FREEFORM.indexOf('const pdfPlacement = readKnowledgePdfPlacement(padlet);');
    expect(at, 'the strip must render the PDF controls').toBeGreaterThan(-1);
    const end = FREEFORM.indexOf('})()}', at);
    expect(end).toBeGreaterThan(at);
    return FREEFORM.slice(at, end);
  };

  it('50. no PDF action control is rendered for a viewer', () => {
    // Proven at the call site: the cell returns before any control exists, so
    // there is nothing in the DOM for a viewer to reveal or activate.
    const cell = pdfCell();
    expect(cell).toContain('if (!canUseFreeformEditButton) return null;');
  });

  it('51. and no disabled row is left behind either', () => {
    const cell = pdfCell();
    expect(cell).not.toContain('disabled=');
    expect(cell).not.toContain('cursor-not-allowed');
  });

  it('52. the viewer still gets the filename, from the shared title cell', () => {
    // The centre column is not permission-gated; only renaming is.
    expect(FREEFORM).toContain("|| padlet.type === 'file') ? (() => {");
    expect(FREEFORM).toContain('setEditingNoteTitleId(padlet.id);');
  });

  it('53. an editor still gets every control, wired to its own callback', async () => {
    const host = await card();
    for (const name of ['collapse', 'page-view', 'parsed-content', 'open', 'side-panel', 'new-tab']) {
      expect(action(host, name), name + ' must exist for an editor').not.toBeNull();
    }
    const cell = pdfCell();
    expect(cell).toContain('onToggleCollapse=');
    expect(cell).toContain('onToggleView=');
    expect(cell).toContain('hideStatusWhenReady');
    // No AI control was smuggled in with the restore.
    expect(host.textContent).not.toMatch(/Add to chat|Ask AI/);
  });
});

describe('46-49. renaming a PDF card, and the toolbar yielding to a modal', () => {
  const FREEFORM_SRC = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
  const CLIENT_SRC = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

  it('46. renaming edits the BOARD label, never the Knowledge source', () => {
    expect(FREEFORM_SRC).toContain('updatePadletTitle(padlet.id, noteTitleDraft.trim());');
    // The document's own filename is display data only -- never written back.
    expect(FREEFORM_SRC).not.toContain('originalFilename =');
    expect(FREEFORM_SRC).not.toMatch(/knowledgeOriginalFilename\s*:/);
  });

  it('47. renaming reuses the strip title-edit machinery, not a new one', () => {
    // A file post now joins the shared centre-column title cell rather than
    // carrying a second rename implementation.
    expect(FREEFORM_SRC).toContain("|| padlet.type === 'file') ? (() => {");
    expect(FREEFORM_SRC).toContain('editingNoteTitleId === padlet.id ? (');
    expect(FREEFORM_SRC).not.toContain('editingPdfTitleId');
    expect(FREEFORM_SRC).not.toContain('pdfTitleDraft');
    expect(FREEFORM_SRC).not.toContain('data-knowledge-pdf-title-input');
  });

  it('48. rename stays permission-gated by the strip it now lives in', () => {
    // The pencil beside it is gated the same way, and the controls carry the
    // same capability. No PDF-specific permission rule was introduced.
    expect(FREEFORM_SRC).toContain('const showModalEditButton = canUseFreeformEditButton');
    expect(FREEFORM_SRC).toContain('disabled={!canUseFreeformEditButton}');
  });

  it('49. the toolbar yields to a blocking modal instead of re-ordering z-index', () => {
    expect(CLIENT_SRC).toContain('const isBlockingEditorModalOpen = useMemo(');
    expect(CLIENT_SRC).toContain("isBlockingEditorModalOpen ? 'pointer-events-none opacity-0' : ''");
    // Narrower than isAnyEditorOpen on purpose: modes and popups leave the
    // canvas usable and must not take the toolbar with them.
    const flag = CLIENT_SRC.slice(
      CLIENT_SRC.indexOf('const isBlockingEditorModalOpen = useMemo('),
      CLIENT_SRC.indexOf('// Guard flag to check if any editor or modal is open'),
    );
    for (const excluded of ['isDrawingMode', 'isCropMode', 'isMapStylePanelOpen', 'commentPopupOpen', 'isLibraryOpen']) {
      expect(flag, excluded + ' must not hide the toolbar').not.toContain(excluded);
    }
    // The shared stacking boundary itself is untouched.
    expect(CLIENT_SRC).toContain('z-[3000]');
  });
});

describe('43-45. converted text carries the side-panel highlights', () => {
  it('43. the card paints citations with the SAME domain authority as the reader', () => {
    const code = executable(SURFACE);
    // One resolver, one colour rule -- the card decides neither.
    // Same resolver, now handed the page the card is actually displaying --
    // that substitution IS the switcher's provenance contract.
    expect(code).toMatch(
      /knowledgeSourceHighlightSegments\(\s*references,\s*currentPageData\.pageNumber,\s*currentPageData\.text,?\s*\)/,
    );
    expect(code).toContain('knowledgeSourceHighlightColor(segment.spans, noteColors)');
    expect(code).toContain('useKnowledgeSourceReferencesForDocument(documentId)');
    expect(code).toContain('useKnowledgeSourceNoteColors()');
    // No second notion of a highlight, and no colour invented here.
    expect(code).not.toMatch(/charStart|quoteText|indexOf\(reference/);
  });

  it('44. an unhighlighted document renders its text with no marks at all', async () => {
    // No provider above the card => no references => plain text, unchanged.
    const host = await card();
    await act(async () => { action(host, 'parsed-content')!.click(); });
    expect(host.querySelectorAll('[data-knowledge-pdf-page-text]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-knowledge-pdf-highlight]')).toHaveLength(0);
    // The text is still reconstructed verbatim.
    expect(host.textContent).toContain('Text of page 1');
  });

  it('45. converted text is embedded in the card and scrolls in place', async () => {
    const host = await card();
    await act(async () => { action(host, 'parsed-content')!.click(); });
    const bodyEl = body(host)!;
    // Embedded in the card body -- not a popup, not a second surface.
    expect(bodyEl.querySelectorAll('[data-knowledge-pdf-page-text]').length).toBeGreaterThan(0);
    expect(bodyEl.className).toContain('overflow-y-auto');
    expect(bodyEl.className).toContain('overscroll-contain');
  });
});

describe('30-35. one frame, square corners, real resize handle', () => {
  const FREEFORM = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
  const POLICY = read('lib/domain/canvas/postResizePolicy.ts');

  /** The strip's own early-return block, taken forward from its comment. */
  const stripGuard = () => {
    const at = FREEFORM.indexOf('{/* Top strip');
    expect(at, 'the generic top strip must still exist for other posts').toBeGreaterThan(-1);
    return FREEFORM.slice(at, at + 1200);
  };

  /** The strip's PDF cell -- the controls, rendered unconditionally. */
  const pdfCell = () => {
    const at = FREEFORM.indexOf('const pdfPlacement = readKnowledgePdfPlacement(padlet);');
    expect(at, 'the strip must render the PDF controls').toBeGreaterThan(-1);
    // Just the PDF block itself: the surrounding left column also holds the
    // container/AI cluster, whose own hover behaviour is none of our business.
    const end = FREEFORM.indexOf('})()}', at);
    expect(end, 'the PDF block must close').toBeGreaterThan(at);
    return FREEFORM.slice(at, end);
  };

  it('40. the PDF name uses the strip own shared centre title cell', () => {
    // The 1fr centre column truncates instead of overflowing, and it already
    // carries the shared double-click rename -- so the name needs no cell of
    // its own competing with the controls for width.
    expect(FREEFORM).toContain("|| padlet.type === 'file') ? (() => {");
    expect(FREEFORM).toContain('setEditingNoteTitleId(padlet.id);');
  });

  it('41. the controls are hidden at rest and revealed on hover', () => {
    const cell = pdfCell();
    // Hidden until the card is hovered, then the whole set appears at once --
    // the SAME `group` the strip's pencil already hangs off, so both arrive
    // and leave as one gesture.
    expect(cell).toContain('hidden items-center gap-0.5 group-hover:flex');
    expect(cell).toContain('<KnowledgePdfCardControls');
    expect(FREEFORM).toContain('group group/image-container relative');
    expect(FREEFORM).toContain('opacity-0 group-hover:opacity-100');
  });

  it('41b. the reveal is CSS on the shared group -- no hover state of its own', () => {
    const cell = pdfCell();
    for (const js of ['useState', 'onMouseEnter', 'onMouseLeave', 'onPointerEnter', 'setHover']) {
      expect(cell, js + ' would be a second hover mechanism').not.toContain(js);
    }
  });

  it('42. a read-only viewer gets no action cell at all', () => {
    const cell = pdfCell();
    // Not a disabled row: nothing is rendered, matching the pencil, which the
    // same capability withholds.
    expect(cell).toContain('if (!canUseFreeformEditButton) return null;');
    expect(cell).not.toContain('disabled={!canUseFreeformEditButton}');
    expect(cell.indexOf('if (!canUseFreeformEditButton) return null;'))
      .toBeLessThan(cell.indexOf('group-hover:flex'));
    expect(FREEFORM).toContain('const showModalEditButton = canUseFreeformEditButton');
  });

  it('42b. the title is NOT swapped out -- it stays in the centre cell', () => {
    const cell = pdfCell();
    // The old mechanism hid the filename to make room; this one does not, so
    // the name stays readable while the controls are showing.
    expect(cell).not.toContain('group-hover:hidden');
    expect(cell).not.toContain('pdfCardTitle');
    expect(FREEFORM).toContain("|| padlet.type === 'file') ? (() => {");
  });

  it('35z. a resized PDF hugs its content: manual height is a CAP, not a pin', () => {
    // Widening the card reflows the same page text into fewer lines. With a
    // pinned height that left a block of empty white below the text down to
    // the old bottom edge; as a max-height the card shrinks to fit and still
    // clips-and-scrolls when the content is taller.
    expect(FREEFORM).toContain('const isPdfPlacementCard = !!readKnowledgePdfPlacement(padlet);');
    expect(FREEFORM).toContain('const pdfMaxHeight = isPdfPlacementCard');
    // Even before a first resize the card is capped, so a long converted
    // document scrolls instead of drawing one enormous card.
    expect(FREEFORM).toContain('boxManualHeight ?? `${Math.max(Number(padlet.height) || 0, 160)}px`');
    expect(FREEFORM).toContain('height: isPdfPlacementCard ? undefined : boxManualHeight,');
    expect(FREEFORM).toContain('maxHeight: pdfMaxHeight,');
    // It must also escape the generic 80px floor, or a short document would
    // still be padded out with white space.
    expect(FREEFORM).toContain("(padlet.type === 'ai-component' || isPdfPlacementCard) ? undefined");
    // Every other box type keeps its exact pinned height.
    expect(FREEFORM).toContain("const boxManualHeight = resizeMode === 'box' && padlet.type !== 'ai-component' && manualGeometry");
  });

  it('35y. the card body still scrolls when the document exceeds the cap', async () => {
    const host = await card();
    // The cap clips; this is what makes the remaining pages reachable.
    expect(body(host)!.className).toContain('overflow-y-auto');
    expect(FREEFORM).toContain("needsContentScroll ? 'overflow-y-auto'");
  });

  it('35a. selection STICKS: a PDF click never reaches the canvas deselect', () => {
    // The blue ring appeared on press and vanished on release, because a file
    // placement falls into the shared fallback wrapper whose click was only
    // stopped for text/ai-component. Without this the resize grip -- which is
    // selection-gated -- can never be reached.
    expect(FREEFORM).toContain(
      "onClick={(padlet.type === 'text' || padlet.type === 'ai-component' || padlet.type === 'file') ? (e) => e.stopPropagation() : undefined}",
    );
  });

  it('35b. the controls sit in the strip LEFT column so the pencil survives', () => {
    // In the right column the controls pushed the strip's pencil off the end
    // of a narrow card. Left of the title, the 1fr centre absorbs the squeeze
    // and both auto columns keep their content.
    const left = FREEFORM.indexOf("{/* Left: the PDF's own controls");
    const right = FREEFORM.indexOf('{/* Right: pencil hover-only */}');
    expect(left, 'PDF controls must be in the left column').toBeGreaterThan(-1);
    expect(left).toBeLessThan(right);
    expect(FREEFORM.slice(left, right)).toContain('<KnowledgePdfCardControls');
    // The pencil column is back to exactly what it was.
    expect(FREEFORM.slice(right, right + 300)).not.toContain('KnowledgePdfCardControls');
  });

  it('35c. the strip drops the redundant Ready chip, but never a real state', async () => {
    const host = await card();
    // Standalone (fallback header) still reports every state, as before.
    expect(host.querySelector('[data-knowledge-pdf-status]')).not.toBeNull();
    expect(FREEFORM).toContain('hideStatusWhenReady');
    const code = executable(SURFACE);
    // Only the ready steady-state is droppable; failure must always show.
    expect(code).toContain('hideStatusWhenReady && isReady ? null : (');
  });

  it('36. exactly ONE bar: the PDF puts its controls in the post strip', async () => {
    // The two bars became one by MOVING the controls into the strip the post
    // already had -- not by deleting either bar.
    const strip = stripGuard();
    expect(strip, 'the generic strip must be intact for every post').toContain('if (isFullView) return null;');
    expect(strip).not.toContain('readKnowledgePdfPlacement');

    // The controls sit in the strip, ahead of its pencil.
    expect(FREEFORM.indexOf('<KnowledgePdfCardControls'))
      .toBeLessThan(FREEFORM.indexOf('{/* Right: pencil hover-only */}'));

    // And the surface itself renders no second header when the host has them.
    expect(FREEFORM).toContain('hostRendersControls');
    const host = await card();
    expect(host.querySelector('[data-knowledge-pdf-header]'), 'fallback header only').not.toBeNull();
  });

  it('37. the strip is untouched for every other post type', () => {
    const strip = stripGuard();
    // No PDF condition and no type list inside the strip's guard: the only
    // PDF-specific thing is what the right column renders.
    expect((strip.match(/return null;/g) || []).length).toBe(1);
    expect(strip).not.toMatch(/padlet\.type === '(note|text|todo|image|link|card|table)'/);
    // A non-PDF post renders no PDF controls: the column returns null first.
    expect(FREEFORM).toContain('if (!pdfPlacement) return null;');
  });

  it('37b. the host owns the view state the strip controls toggle', () => {
    // Same per-padlet record convention the strip already uses for expand.
    expect(FREEFORM).toContain('const [pdfCardCollapsed, setPdfCardCollapsed]');
    expect(FREEFORM).toContain('const [pdfCardView, setPdfCardView]');
    expect(FREEFORM).toContain('collapsed={pdfCardCollapsed[padlet.id] ?? false}');
    expect(FREEFORM).toContain("view={pdfCardView[padlet.id] ?? 'page'}");
  });

  it('38. selection stays the host authority, and a child cannot block it', () => {
    // The PDF needed no selection code of its own: the root selects in capture
    // phase precisely so a child's stopPropagation cannot suppress it.
    expect(FREEFORM).toContain('onMouseDownCapture={(e) => {');
    expect(FREEFORM).toContain('handlePadletMouseDown(e, padlet.id);');
    expect(FREEFORM).toContain('Fires in capture phase so child stopPropagation cannot block it.');
    // And the card introduces no selection state of its own.
    const code = executable(SURFACE);
    expect(code).not.toMatch(/setSelected|isSelected|selectPadlet/);
  });

  it('39. the resize handle stays selection-gated, never permanently visible', () => {
    expect(FREEFORM).toContain("isPadletSelected(padlet.id) && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked");
    // The PDF gets the shared grip through policy alone.
    expect(POLICY).toContain("case 'file':");
  });

  it('30-31. the card draws no frame of its own -- the host owns the only one', async () => {
    const host = await card();
    const surface = host.querySelector('[data-knowledge-pdf-surface]')!;
    // A border/background here would sit inside the host's card border and
    // read as a second nested frame.
    expect(surface.className).not.toMatch(/border/);
    expect(surface.className).not.toMatch(/border-gray/);
    // And the document body must not become a card either.
    expect(body(host)!.className).not.toMatch(/border/);
    expect(body(host)!.className).not.toMatch(/rounded-(sm|md|lg|xl)/);
  });

  it('32. corners are square, and the host still draws the selection ring', async () => {
    const host = await card();
    const surface = host.querySelector('[data-knowledge-pdf-surface]')!;
    expect(surface.className).toContain('rounded-none');
    expect(surface.className).not.toMatch(/rounded-(sm|md|lg|xl|full)/);
    // Untouched host chrome: one square border and the blue selection ring.
    expect(FREEFORM).toContain("border: isFullView ? 'none' : '1px solid #e5e7eb'");
    expect(FREEFORM).toContain('ring-2 ring-blue-500');
  });

  it('33. exactly one toolbar exists on the card', async () => {
    const host = await card();
    expect(host.querySelectorAll('[data-knowledge-pdf-header]')).toHaveLength(1);
  });

  it('34-35. resize reuses the one Freeform authority, no second implementation', () => {
    // The handle itself is the shared bottom-right grip, rendered by the host
    // as a sibling of the card -- the PDF only had to become resizable.
    expect(POLICY).toContain("case 'file':");
    expect(POLICY).toContain('file: { minWidth: 180, minHeight: 160 }');
    expect(FREEFORM).toContain('{content}');
    expect(FREEFORM).toContain('{resizeHandle}');
    // No resize UI or gesture may be reimplemented inside the card.
    const code = executable(SURFACE);
    expect(code).not.toMatch(/resize/i);
    expect(code).not.toContain('PostResizeHandle');
  });
});

describe('24-29. nothing outside the card moved', () => {
  it('24-26. Add PDF is untouched: Media, pinned, native label', () => {
    expect(REGISTRY).toContain('type: "knowledge-pdf", pinned: true, activatesInputId: KNOWLEDGE_PDF_INPUT_ID,');
    const media = REGISTRY.slice(REGISTRY.indexOf("id: 'media'"), REGISTRY.indexOf("id: 'draw'"));
    expect(media).toContain('knowledge-pdf');
    const create = REGISTRY.slice(REGISTRY.indexOf("id: 'create'"), REGISTRY.indexOf("id: 'structure'"));
    expect(create).not.toContain('knowledge-pdf');
    expect(SIDEBAR).toContain('htmlFor={tool.activatesInputId}');
  });

  it('27. the Note source/page marker still opens the reader', () => {
    expect(POST_CARD).toContain('useKnowledgeSourceOpen');
    expect(POST_CARD).toContain('data-knowledge-source-open="true"');
    expect(POST_CARD).toContain('openSource(openTarget)');
  });

  it('28. Knowledge authority is unchanged -- one raster route, one pages route', () => {
    expect(SURFACE).toContain('KnowledgeDocumentPageImage');
    expect(SURFACE).toContain('/pages');
    expect(SURFACE).toContain('/original');
    const code = executable(SURFACE).toLowerCase();
    for (const forbidden of ['createsignedurl', 'storage.from', 'getpublicurl']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('29. no AI, API, schema or worker change is implied by the card', () => {
    const code = executable(SURFACE);
    expect(code).not.toMatch(/anthropic|openai|byok/i);
    expect(code).not.toMatch(/migration|supabase\/functions|workers\//i);
  });
});

// ============================================================================
// PDF-C1: single-page canvas preview and its page switcher
// ============================================================================
// The Freeform PDF object stops being a miniature reader. One page is on
// screen, a pager moves between them, and full-document reading stays in Open
// and the side panel. Every page already arrived in the one cached `/pages`
// payload, so paging is a choice of index -- never another request.

describe('PDF-C1 page switcher', () => {
  const pager = (host: HTMLElement) =>
    host.querySelector('[data-knowledge-pdf-pager="true"]') as HTMLElement | null;
  const indicator = (host: HTMLElement) =>
    host.querySelector('[data-knowledge-pdf-page-indicator="true"]')?.textContent?.trim() ?? null;
  const prev = (host: HTMLElement) => action(host, 'page-previous') as HTMLButtonElement | null;
  const next = (host: HTMLElement) => action(host, 'page-next') as HTMLButtonElement | null;
  const shownPage = (host: HTMLElement) =>
    pageSections(host)[0]?.getAttribute('data-knowledge-pdf-page') ?? null;
  const step = async (button: HTMLElement | null) => {
    await act(async () => { button!.click(); });
  };

  it('1-3. opens on page 1, shows 1 / N, and cannot go back from there', async () => {
    const host = await card();
    expect(shownPage(host)).toBe('1');
    expect(indicator(host)).toBe('1 / 3');
    expect(prev(host)!.disabled, 'nothing precedes page 1').toBe(true);
    expect(next(host)!.disabled).toBe(false);
  });

  it('4-6. Next advances, the counter follows, and Previous comes back', async () => {
    const host = await card();
    await step(next(host));
    expect(shownPage(host)).toBe('2');
    expect(indicator(host)).toBe('2 / 3');
    await step(prev(host));
    expect(shownPage(host)).toBe('1');
    expect(indicator(host)).toBe('1 / 3');
  });

  it('7-8. the range is closed at both ends, and pressing past it is a no-op', async () => {
    const host = await card();
    // Forward to the last page.
    await step(next(host));
    await step(next(host));
    expect(indicator(host)).toBe('3 / 3');
    expect(next(host)!.disabled, 'nothing follows the last page').toBe(true);

    // A disabled control cannot fire, and the state clamps regardless.
    await step(next(host));
    expect(indicator(host)).toBe('3 / 3');
    expect(shownPage(host)).toBe('3');

    await step(prev(host));
    await step(prev(host));
    expect(indicator(host)).toBe('1 / 3');
    await step(prev(host));
    expect(indicator(host), 'clamped at the first page').toBe('1 / 3');
  });

  it('9-11. only the current page exists in the DOM -- no hidden siblings', async () => {
    const host = await card();
    for (const expected of ['1', '2', '3']) {
      expect(pageSections(host), 'exactly one page mounted').toHaveLength(1);
      expect(shownPage(host)).toBe(expected);
      // The superseded model rendered every page at once; nothing may keep a
      // hidden copy, which would still request images and still be searchable.
      expect(host.querySelectorAll('[data-knowledge-pdf-page]')).toHaveLength(1);
      if (expected !== '3') await step(next(host));
    }
  });

  it('12-13. each mode shows the current page only', async () => {
    const host = await card();
    await step(next(host));

    // PAGE mode: one page representation.
    expect(host.querySelectorAll('[data-knowledge-pdf-page]')).toHaveLength(1);

    // T mode: one page's parsed text, and it is page 2's.
    await act(async () => { action(host, 'parsed-content')!.click(); });
    const texts = host.querySelectorAll('[data-knowledge-pdf-page-text]');
    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toContain('Text of page 2');
    expect(host.textContent).not.toContain('Text of page 1');
    expect(host.textContent).not.toContain('Text of page 3');
  });

  it('14-15. switching PDF <-> T keeps the page, and paging works in either mode', async () => {
    const host = await card();
    await step(next(host));
    await step(next(host));
    expect(indicator(host)).toBe('3 / 3');

    await act(async () => { action(host, 'parsed-content')!.click(); });
    expect(indicator(host), 'mode is not a page reset').toBe('3 / 3');
    expect(host.querySelector('[data-knowledge-pdf-page-text]')!.textContent).toContain('Text of page 3');

    // Paging still works while parsed text is showing.
    await step(prev(host));
    expect(indicator(host)).toBe('2 / 3');
    expect(host.querySelector('[data-knowledge-pdf-page-text]')!.textContent).toContain('Text of page 2');

    await act(async () => { action(host, 'page-view')!.click(); });
    expect(indicator(host), 'and back again').toBe('2 / 3');
    expect(shownPage(host)).toBe('2');
  });

  it('16. a missing derivative falls back to the SAME page it failed on', async () => {
    const host = await card();
    await step(next(host));
    const image = pageSections(host)[0].querySelector('img')!;
    expect(image).not.toBeNull();
    expect(host.querySelector('[data-knowledge-pdf-page-text]')).toBeNull();

    await act(async () => { image.dispatchEvent(new Event('error')); });
    // Page 2's text, not page 1's, and the pager has not moved.
    expect(host.querySelector('[data-knowledge-pdf-page-text]')!.textContent).toContain('Text of page 2');
    expect(indicator(host)).toBe('2 / 3');
  });

  it('17-18. paging issues no request and retriggers no processing', async () => {
    const fetchMock = stubPages(3);
    const host = await card();
    const before = fetchMock.mock.calls.length;
    await step(next(host));
    await step(next(host));
    await step(prev(host));
    await act(async () => { action(host, 'parsed-content')!.click(); });
    await step(prev(host));
    // Every page arrived in the single cached payload; paging is an index.
    expect(fetchMock.mock.calls.length, 'no request of any kind').toBe(before);
    expect(host.textContent).not.toContain('Preparing document');
    expect(host.textContent).not.toContain('Loading document');
  });

  it('19-22. the displayed page is what reaches the citation authority', async () => {
    const code = executable(SURFACE);
    // The resolver is handed the page on screen, so a reference recorded
    // against p.3 paints on page 3 and nowhere else. A literal 1, or the loop
    // variable of a superseded multi-page render, would silently mis-attribute.
    expect(code).toMatch(
      /knowledgeSourceHighlightSegments\(\s*references,\s*currentPageData\.pageNumber,\s*currentPageData\.text,?\s*\)/,
    );
    expect(code).not.toMatch(/knowledgeSourceHighlightSegments\(\s*references,\s*1\s*,/);
    // The page image is addressed by the same displayed page number.
    expect(code).toContain('pageNumber={currentPageData.pageNumber}');
    // Identity throughout is the document id, never the placement or filename.
    expect(code).toContain('useKnowledgeSourceReferencesForDocument(documentId)');
    expect(code).toContain('documentId={documentId}');
  });

  it('23-24. no second provenance or highlight implementation was introduced', async () => {
    const code = executable(SURFACE);
    // Still purely a consumer of the existing authority: the card resolves no
    // spans of its own and creates no references.
    expect(code).not.toMatch(/charStart|charEnd|quoteText|selectedText/);
    expect(code).not.toMatch(/getSelection\(|createSourceReference|buildKnowledgeSource/);
    expect((code.match(/knowledgeSourceHighlightSegments\(/g) || []).length).toBe(1);
    expect((code.match(/knowledgeSourceHighlightColor\(/g) || []).length).toBe(1);
  });

  it('25. the pager is isolated from card drag and canvas panning', async () => {
    const host = await card();
    // The same isolation the existing card controls use.
    expect(pager(host)!.getAttribute('data-no-drag')).toBe('true');
    expect(prev(host)!.getAttribute('data-no-drag')).toBe('true');
    expect(next(host)!.getAttribute('data-no-drag')).toBe('true');

    // A press that begins on the pager must not reach the host that would drag.
    // Counted on an ancestor ABOVE the React root, which is where the Freeform
    // host's drag/selection handlers live. `mousedown` is measured too, and
    // deliberately: the buttons stop pointerdown and click themselves, so only
    // the pager container's own guard can stop this one -- without it, a press
    // on the pager reaches the card and starts a drag.
    const seen = { pointerdown: 0, mousedown: 0, click: 0 };
    const outer = host.parentElement!;
    const listeners = (Object.keys(seen) as Array<keyof typeof seen>)
      .map((type) => [type, () => { seen[type] += 1; }] as const);
    for (const [type, fn] of listeners) outer.addEventListener(type, fn);
    await act(async () => {
      next(host)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      next(host)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      next(host)!.click();
    });
    for (const [type, fn] of listeners) outer.removeEventListener(type, fn);
    expect(seen.pointerdown, 'drag would start here').toBe(0);
    expect(seen.mousedown, 'drag would start here too').toBe(0);
    expect(seen.click, 'selection/edit would trigger here').toBe(0);
    // And it still did its job.
    expect(indicator(host)).toBe('2 / 3');
  });

  it('26-27. collapsing hides the pager; expanding restores it and the page', async () => {
    const host = await card();
    await step(next(host));
    expect(indicator(host)).toBe('2 / 3');

    await act(async () => { action(host, 'collapse')!.click(); });
    expect(pager(host), 'nothing to page through while collapsed').toBeNull();
    expect(host.querySelector('[data-knowledge-pdf-page]')).toBeNull();
    // The compact form is unchanged.
    expect(host.querySelector('[data-knowledge-pdf-collapsed-body="true"]')).not.toBeNull();

    await act(async () => { action(host, 'collapse')!.click(); });
    expect(pager(host)).not.toBeNull();
    // Local state survived the round trip, so the reader comes back where it was.
    expect(indicator(host)).toBe('2 / 3');
    expect(shownPage(host)).toBe('2');
  });

  it('a single-page document gets a pager with both ends closed', async () => {
    stubPages(1);
    const host = await card();
    expect(indicator(host)).toBe('1 / 1');
    expect(prev(host)!.disabled).toBe(true);
    expect(next(host)!.disabled).toBe(true);
  });
});
