// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgePdfCanvasSurface, {
  KnowledgePdfOpenProvider,
  readKnowledgePdfPlacement,
} from './KnowledgePdfCanvasSurface';

/**
 * PDF-C1. Behavioural proofs for the one canvas PDF surface, plus source-level
 * proofs for the wiring that cannot be mounted here (CanvasClient is the whole
 * board shell). The negative controls matter as much as the positives: this
 * phase's entire premise is that a canvas placement REFERENCES a Knowledge
 * document rather than owning, copying or deleting it.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Absence assertions run against EXECUTABLE source only, following the same
 * convention as the BYOK migration source tests: this file's prose explains
 * what it deliberately does not do ("no Storage authority", "no percentage"),
 * and matching that prose would fail a test that is really about the code.
 */
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SURFACE = read('components/collabboard/KnowledgePdfCanvasSurface.tsx');
const SIDEBAR = read('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const UPLOADER = read('components/collabboard/KnowledgePdfUploader.tsx');
const CLIENT = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const POST_CARD = read('components/collabboard/PostCardContent.tsx');
const FREEFORM = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '33333333-3333-4333-8333-333333333333';

function mount(node: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return host;
}

function surface(status: 'uploaded' | 'processing' | 'ready' | 'failed', onOpen = vi.fn()) {
  return mount(
    <KnowledgePdfOpenProvider onOpenDocument={onOpen}>
      <KnowledgePdfCanvasSurface
        boardId={BOARD_ID}
        documentId={DOC_ID}
        originalFilename="lesson.pdf"
        processingStatus={status}
      />
    </KnowledgePdfOpenProvider>,
  );
}

describe('1. the old Knowledge launcher is gone, Add PDF stays', () => {
  it('removes the trigger, its icon and its library mount', () => {
    expect(SIDEBAR).not.toContain('data-knowledge-trigger');
    expect(SIDEBAR).not.toContain('aria-label="Knowledge"');
    expect(SIDEBAR).not.toContain('BookOpen');
    expect(SIDEBAR).not.toContain('<KnowledgeDocumentsList');
  });

  it('keeps Add PDF and its hidden picker', () => {
    expect(SIDEBAR).toContain("type === 'knowledge-pdf'");
    expect(SIDEBAR).toContain('openPicker()');
    // The library component itself must survive for internal reuse.
    expect(fs.existsSync(path.join(ROOT, 'components/collabboard/KnowledgeDocumentsList.tsx'))).toBe(true);
  });
});

describe('2. upload places the object before processing finishes', () => {
  it('fires the placement callback after POST and before the polling wait', () => {
    const fired = UPLOADER.indexOf('onDocumentUploaded?.(uploaded)');
    const waited = UPLOADER.indexOf('await waitForKnowledgePdf');
    expect(fired).toBeGreaterThan(-1);
    expect(waited).toBeGreaterThan(-1);
    expect(fired).toBeLessThan(waited);
  });

  it('carries the server document, not a filename', () => {
    expect(UPLOADER).toContain('onDocumentUploaded?: (document: KnowledgePdfUploadResult) => void');
    expect(CLIENT).toContain('knowledgeDocumentId: document.id');
  });
});

describe('3. identity is the document id', () => {
  it('refuses a second placement for the same document id', () => {
    expect(CLIENT).toContain("(p.metadata as any)?.knowledgeDocumentId === document.id");
    expect(CLIENT).toContain('if (alreadyPlaced) return;');
  });

  it('reads a placement by id and tolerates repeated filenames', () => {
    const a = readKnowledgePdfPlacement({ metadata: { knowledgeDocumentId: 'a', knowledgeOriginalFilename: 'same.pdf' } });
    const b = readKnowledgePdfPlacement({ metadata: { knowledgeDocumentId: 'b', knowledgeOriginalFilename: 'same.pdf' } });
    expect(a?.documentId).toBe('a');
    expect(b?.documentId).toBe('b');
    expect(readKnowledgePdfPlacement({ metadata: { knowledgeOriginalFilename: 'same.pdf' } })).toBeNull();
    expect(readKnowledgePdfPlacement({ type: 'file' })).toBeNull();
  });
});

describe('4. the placement stores a reference and nothing derived', () => {
  it('uses an existing padlet type with no schema change', () => {
    expect(CLIENT).toContain("type: 'file'");
    const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
    expect(migrations.some((f) => /pdf.?canvas|canvas.?pdf/i.test(f))).toBe(false);
  });

  it('never persists secret or duplicated content', () => {
    for (const forbidden of [
      'storage_path', 'signedUrl', 'signed_url', 'createSignedUrl',
      'pageText', 'extractedText', 'chunks', 'embedding',
    ]) {
      expect(CLIENT.slice(CLIENT.indexOf('handleKnowledgePdfUploaded'), CLIENT.indexOf('persistKnowledgeSourceReference')))
        .not.toContain(forbidden);
    }
  });
});

describe('5. processing states are shown truthfully', () => {
  it.each([
    ['uploaded', 'Uploading…'],
    ['processing', 'Processing…'],
    ['ready', 'Ready'],
    ['failed', 'Processing failed'],
  ] as const)('%s renders %s', (status, label) => {
    const host = surface(status);
    expect(host.textContent).toContain(label);
    expect(host.querySelector(`[data-knowledge-pdf-status="${status}"]`)).not.toBeNull();
  });

  it('invents no percentage anywhere', () => {
    expect(executable(SURFACE)).not.toMatch(/%|percent|progress/i);
  });
});

describe('6. the ready preview reuses the one raster authority', () => {
  it('renders KnowledgeDocumentPageImage per page and never touches Storage', () => {
    expect(SURFACE).toContain('KnowledgeDocumentPageImage');
    // The card now renders every page rather than only page 1, so the page
    // number comes from the page itself. Still the ONE raster authority.
    expect(SURFACE).toContain('pageNumber={page.pageNumber}');
    const code = executable(SURFACE).toLowerCase();
    for (const forbidden of ['supabase', 'createsignedurl', 'storage', '.from(']) {
      expect(code, `${forbidden} must not appear in executable source`).not.toContain(forbidden);
    }
  });

  it('shows the filename without a preview while not ready', () => {
    const host = surface('processing');
    expect(host.textContent).toContain('lesson.pdf');
    expect(host.querySelector('img')).toBeNull();
  });
});

describe('7. presentation is a separate axis from identity', () => {
  it('declares expanded but does not implement it', () => {
    expect(SURFACE).toContain("export type KnowledgePdfDisplayMode = 'compact' | 'preview' | 'expanded'");
    // No branch draws an expanded layout yet.
    expect(SURFACE).not.toMatch(/displayMode === 'expanded'/);
  });

  it('compact suppresses the preview without changing the document reference', () => {
    const host = mount(
      <KnowledgePdfOpenProvider onOpenDocument={vi.fn()}>
        <KnowledgePdfCanvasSurface
          boardId={BOARD_ID}
          documentId={DOC_ID}
          originalFilename="lesson.pdf"
          processingStatus="ready"
          displayMode="compact"
        />
      </KnowledgePdfOpenProvider>,
    );
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-knowledge-document-id]')?.getAttribute('data-knowledge-document-id')).toBe(DOC_ID);
  });
});

describe('8 + 9. Open and Add to side panel are the same one reader', () => {
  it('both call the shared open path with the document id', () => {
    const onOpen = vi.fn();
    const host = surface('ready', onOpen);
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-knowledge-pdf-action="open"]')!.click();
    });
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-knowledge-pdf-action="side-panel"]')!.click();
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenNthCalledWith(1, { documentId: DOC_ID });
    expect(onOpen).toHaveBeenNthCalledWith(2, { documentId: DOC_ID });
  });

  it('routes into the existing shell reader, adding no second one', () => {
    expect(CLIENT).toMatch(/<KnowledgePdfOpenProvider[\s\S]{0,120}onOpenDocument=\{requestKnowledgeDocumentOpen\}/);
    expect(SURFACE).not.toMatch(/KnowledgeSourceReaderDrawer|createPortal|<dialog/);
  });
});

describe('10. new tab uses the existing original route', () => {
  it('links to /original only when ready', () => {
    const ready = surface('ready').querySelector<HTMLAnchorElement>('[data-knowledge-pdf-action="new-tab"]')!;
    expect(ready.getAttribute('href')).toBe(
      `/api/boards/${BOARD_ID}/knowledge/${DOC_ID}/original`,
    );
    expect(ready.getAttribute('target')).toBe('_blank');
    expect(ready.getAttribute('rel')).toBe('noopener noreferrer');
    expect(surface('processing').querySelector('[data-knowledge-pdf-action="new-tab"]')).toBeNull();
  });
});

describe('11 + 12. one surface, both hosts', () => {
  it('the common post host renders it', () => {
    expect(POST_CARD).toContain('KnowledgePdfCanvasSurface');
    expect(POST_CARD).toContain('readKnowledgePdfPlacement(padlet)');
  });

  it('Freeform renders the SAME component rather than its own', () => {
    expect(FREEFORM).toContain("from '@/components/collabboard/KnowledgePdfCanvasSurface'");
    expect(FREEFORM).toContain('<KnowledgePdfCanvasSurface');
  });
});

describe('13. deleting a placement never deletes the document', () => {
  it('introduces no Knowledge delete request', () => {
    for (const source of [SURFACE, CLIENT.slice(CLIENT.indexOf('handleKnowledgePdfUploaded'), CLIENT.indexOf('persistKnowledgeSourceReference'))]) {
      expect(source).not.toMatch(/method:\s*'DELETE'/);
      expect(source).not.toMatch(/knowledge\/[^'"`]*['"`],\s*\{\s*method:\s*'DELETE'/);
    }
  });
});

describe('14. no AI surface is introduced', () => {
  it('adds no Ask AI, chat or AI route touch', () => {
    for (const source of [SURFACE, POST_CARD, FREEFORM, SIDEBAR]) {
      expect(source).not.toMatch(/Ask AI/i);
    }
    expect(SURFACE).not.toMatch(/\/api\/ai|lib\/server\/ai|aiRoles|text-action/);
  });
});

describe('polling stops on a terminal state', () => {
  it('never starts a loop for a document that is already ready', () => {
    expect(SURFACE).toContain('if (TERMINAL(status) || !boardId) return;');
    expect(SURFACE).toContain('window.clearInterval(timer)');
  });
});

/**
 * R1-B. Terminal status resolved on a REOPENED board must reach the board's
 * own persistence owner exactly once. The surface itself must never write.
 */
describe('R1-B. reopen-resolved terminal status is reported to the board once', () => {
  const listUrl = `/api/boards/${BOARD_ID}/knowledge`;

  function mountWithStatus(
    processingStatus: 'uploaded' | 'processing' | 'ready' | 'failed',
    report: (id: string, s: string) => void,
  ) {
    return mount(
      <KnowledgePdfOpenProvider onOpenDocument={vi.fn()} onStatusResolved={report as never}>
        <KnowledgePdfCanvasSurface
          boardId={BOARD_ID}
          documentId={DOC_ID}
          originalFilename="lesson.pdf"
          processingStatus={processingStatus}
        />
      </KnowledgePdfOpenProvider>,
    );
  }

  function stubList(status: string) {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith(listUrl)) {
        return new Response(JSON.stringify({ documents: [{
          id: DOC_ID, boardId: BOARD_ID, originalFilename: 'lesson.pdf',
          mimeType: 'application/pdf', fileSizeBytes: 1, pageCount: 1,
          processingStatus: status, createdAt: 'x', updatedAt: 'x',
        }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it.each(['ready', 'failed'] as const)('persisted "processing" resolving to %s reports once', async (terminal) => {
    vi.useFakeTimers();
    const report = vi.fn();
    stubList(terminal);
    mountWithStatus('processing', report);

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(DOC_ID, terminal);
  });

  it.each(['ready', 'failed'] as const)('a placement already %s never polls and never reports', async (terminal) => {
    vi.useFakeTimers();
    const report = vi.fn();
    const fetchMock = stubList(terminal);
    mountWithStatus(terminal, report);

    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

    // The STATUS poll is what must not run for a terminal document. The card
    // may still read page content once -- that is document rendering, not
    // status polling -- so this asserts against the list authority by name
    // rather than against every request the surface makes.
    // Exact match: the page-content URL is prefixed by the list URL, so a
    // startsWith filter would count document rendering as status polling.
    const listCalls = fetchMock.mock.calls.filter(([url]) => String(url) === listUrl);
    expect(listCalls).toHaveLength(0);
    expect(report).not.toHaveBeenCalled();
  });

  it('the surface itself performs no persistence -- it only reports', () => {
    const code = executable(SURFACE);
    expect(code).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    expect(code).not.toContain('updatePostFields');
    expect(code).not.toContain('setPadlets');
    // The board owns the durable write.
    expect(CLIENT).toContain('onStatusResolved={handleKnowledgePdfSettled}');
    expect(CLIENT).toContain('updatePostFieldsSwallowResolved(target.id');
  });

  it('the board writes only on a real non-terminal -> terminal transition', () => {
    const owner = CLIENT.slice(
      CLIENT.indexOf('const handleKnowledgePdfSettled'),
      CLIENT.indexOf('const persistKnowledgeSourceReference'),
    );
    expect(owner).toContain("if (status !== 'ready' && status !== 'failed') return;");
    expect(owner).toContain("knowledgeProcessingStatus === status) return;");
  });

  it('both hosts deliver through the SAME context contract, not two writers', () => {
    // Neither host passes a status writer of its own, and neither renders the
    // surface with per-host persistence wiring: the reporter reaches the board
    // through the one context. (Freeform's unrelated comment-mutation calls are
    // deliberately not matched -- this asserts about the PDF surface only.)
    for (const host of [POST_CARD, FREEFORM]) {
      const mountSite = host.slice(host.indexOf('<KnowledgePdfCanvasSurface'));
      const element = mountSite.slice(0, mountSite.indexOf('/>') + 2);
      expect(element).toContain('documentId=');
      expect(element).not.toContain('onStatusResolved');
      expect(element).not.toContain('updatePostFields');
    }
    expect(SURFACE).toContain('useKnowledgePdfStatusReporter');
    expect(CLIENT).toContain('onStatusResolved={handleKnowledgePdfSettled}');
  });
});

/**
 * R1-A-2. The PDF placement must ask the SAME layout placement authority every
 * other new post asks, and must keep its own persistence. These are source
 * proofs because the authority lives in a hook wired through the whole board
 * shell; the behavioural half (which layout prompts) belongs to the layouts'
 * own suites, which this change does not alter.
 */
describe('R1-A-2. placement policy is delegated, never reimplemented', () => {
  const HOOK = read('hooks/canvas/usePadletSave.ts');
  const GHOST = read('components/collabboard/canvas/ui/GhostDragElement.tsx');
  const TYPES = read('types/collabboard.ts');
  const handler = CLIENT.slice(
    CLIENT.indexOf('const handleKnowledgePdfUploaded'),
    CLIENT.indexOf('const handleKnowledgePdfSettled'),
  );

  it('1. the public gate delegates to the existing checkPlacementRequired', () => {
    expect(HOOK).toContain('requestPlacementIfRequired:');
    expect(HOOK).toContain('checkPlacementRequired(draft, closeEditor, {');
    // Exactly one definition of the policy still exists.
    expect((HOOK.match(/const checkPlacementRequired = \(/g) || []).length).toBe(1);
  });

  it('2. the public gate performs no persistence of its own', () => {
    const gate = HOOK.slice(HOOK.indexOf('requestPlacementIfRequired:'));
    const body = gate.slice(0, gate.indexOf('};'));
    for (const forbidden of ['supabase', 'insert(', 'Repository', 'fetch(']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('3. the PDF builds a file draft and honours the TRUE-means-taken contract', () => {
    expect(TYPES).toContain("| 'file';");
    expect(handler).toContain("kind: 'file'");
    expect(handler).toContain('if (placementTaken) return;');
    // The gate is consulted BEFORE any row is built or inserted.
    expect(handler.indexOf('placementTaken')).toBeLessThan(handler.indexOf('crypto.randomUUID()'));
  });

  it('4. the no-placement path keeps the existing PDF persistence authority', () => {
    expect(handler).toContain('insertPostPreservingFailureChannels(placement');
    expect(handler).not.toContain('supabase.from');
  });

  it('5. a required placement suppresses the immediate insert', () => {
    const gateAt = handler.indexOf('if (placementTaken) return;');
    const insertAt = handler.indexOf('insertPostPreservingFailureChannels');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(insertAt);
  });

  it('6-12. no PDF-specific per-layout branch exists anywhere in the PDF path', () => {
    for (const layout of [
      'isDrawingLayout', 'isTimelineLayout', 'isSchedulerLayout',
      'isMapLayout', 'isGridLayout', 'isColumnsLayout', 'isWallLayout',
    ]) {
      expect(handler, `${layout} must not be branched on in the PDF handler`).not.toContain(layout);
    }
    // The layout policy the PDF now inherits is the one the hook already owns.
    for (const branch of ['isDrawingLayout', 'isTimelineLayout', 'isSchedulerLayout']) {
      expect(HOOK).toContain(branch);
    }
    expect(HOOK).toContain('checkGridPlacementRequired({');
  });

  it('13. deferred completion rebuilds a file payload with the same identity', () => {
    const payload = CLIENT.slice(CLIENT.indexOf('const draftToInsertPayload'));
    const fileCase = payload.slice(payload.indexOf("case 'file':"), payload.indexOf("case 'comment':"));
    expect(fileCase).toContain("type: 'file'");
    expect(fileCase).toContain('...draft.metadata');
    expect(fileCase).toContain('parentId');
    for (const forbidden of ['storage_path', 'signedUrl', 'pageText', 'chunks', 'embedding']) {
      expect(fileCase).not.toContain(forbidden);
    }
  });

  it('14. the drag ghost names a file draft instead of rendering blank', () => {
    expect(GHOST).toContain("draft.kind === 'file'");
    expect(GHOST).toContain("'PDF'");
  });

  it('15. document-id dedupe still guards before the gate is consulted', () => {
    expect(handler.indexOf('if (alreadyPlaced) return;'))
      .toBeLessThan(handler.indexOf('placementTaken'));
    expect(handler).not.toContain('originalFilename ===');
  });
});

/**
 * R2. The placement policy must judge an EXTERNAL draft on the draft itself.
 * Source-level, because checkPlacementRequired is a closure inside a hook wired
 * through the whole board shell -- but these assert the exact mechanism the
 * race depended on, not merely that some code exists.
 */
describe('R2. external draft placement is isolated from editor state', () => {
  const HOOK = read('hooks/canvas/usePadletSave.ts');
  const policy = HOOK.slice(
    HOOK.indexOf('const checkPlacementRequired = ('),
    HOOK.indexOf('const withSchedulerDefaults'),
  );
  const wrapper = HOOK.slice(HOOK.indexOf('requestPlacementIfRequired:'));
  const wrapperBody = wrapper.slice(0, wrapper.indexOf('}),') + 3);

  it('1 + 2. an external draft declares isNewPost itself, so an open editor cannot suppress it', () => {
    // The wrapper always asserts NEW; padletToEdit is not consulted for it.
    expect(wrapperBody).toContain('isNewPost: true');
    // And the policy prefers the explicit subject over the editor-derived one.
    expect(policy).toContain('placementSubject ?? {');
    const explicitAt = policy.indexOf('placementSubject ?? {');
    const editorAt = policy.indexOf('!padletToEdit || padletToEdit.id');
    expect(explicitAt).toBeGreaterThan(-1);
    expect(explicitAt).toBeLessThan(editorAt); // editor form is only the fallback
  });

  it('3 + 4. parent/section come from the draft, never from the editor', () => {
    expect(wrapperBody).toContain("hasParentId: Boolean(draft.metadata?.parentId)");
    expect(wrapperBody).toContain("hasSectionId: Boolean(draft.metadata?.sectionId)");
    expect(wrapperBody).not.toContain('padletToEdit');
  });

  it('5 + 6. editor-driven saves keep the padletToEdit-derived behaviour', () => {
    // The fallback branch is exactly today's derivation, unchanged.
    expect(policy).toContain("isNewPost: !padletToEdit || padletToEdit.id === 'new'");
    expect(policy).toContain('hasParentId: !!padletToEdit?.metadata?.parentId');
    expect(policy).toContain('hasSectionId: !!padletToEdit?.metadata?.sectionId');
    // Exactly ONE call site supplies an explicit subject -- the external
    // wrapper. Every editor-driven saveX still calls with two arguments and so
    // keeps the padletToEdit-derived fallback above.
    expect((HOOK.match(/isNewPost: true/g) || []).length).toBe(1);
    expect(wrapperBody).toContain('isNewPost: true');
    expect((HOOK.match(/checkPlacementRequired\(/g) || []).length).toBeGreaterThan(7);
  });

  it('7. the wrapper still performs no persistence', () => {
    for (const forbidden of ['supabase', 'insert(', 'Repository', 'fetch(']) {
      expect(wrapperBody).not.toContain(forbidden);
    }
  });

  it('8. exactly one placement policy body remains', () => {
    expect((HOOK.match(/const checkPlacementRequired = \(/g) || []).length).toBe(1);
    // and the layout rules live only there, not in the wrapper
    for (const branch of ['isDrawingLayout', 'isTimelineLayout', 'isSchedulerLayout']) {
      expect(policy).toContain(branch);
      expect(wrapperBody).not.toContain(branch);
    }
  });

  it('9. the PDF handler still has no per-layout logic and no editor inspection', () => {
    const handler = CLIENT.slice(
      CLIENT.indexOf('const handleKnowledgePdfUploaded'),
      CLIENT.indexOf('const handleKnowledgePdfSettled'),
    );
    for (const forbidden of [
      'isDrawingLayout', 'isTimelineLayout', 'isSchedulerLayout', 'isMapLayout',
      'isGridLayout', 'isColumnsLayout', 'isWallLayout', 'padletToEdit',
    ]) {
      expect(handler, `${forbidden} must not appear in the PDF handler`).not.toContain(forbidden);
    }
  });
});
