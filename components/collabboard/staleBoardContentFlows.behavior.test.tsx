// @vitest-environment jsdom
//
// CANVAS_SHARED_CONTENT_PERMISSION_CORRECTION_2 -- the stale-flow proofs.
//
// Correction 1 stopped an unauthorised user REACHING a shared-content control.
// Review found the other half open: a flow already on screen when the authority
// went away could still finish. Hiding a control is not refusing a callback,
// and a callback captured by a long-lived host (the Excalidraw surface, a
// modal, a file dialog, a provider browser) outlives the render that made it.
//
// So every case here performs a REAL true -> false transition and then drives
// the production path again. The CanvasClient callbacks cannot be mounted --
// the file is the whole board shell -- so they are EXECUTED from their own
// source through `new Function`, the technique knowledgePdfSpatialScope already
// uses: the real code runs, with the dependencies injected. The import surface
// is mounted for real.
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/imports/clientAuth', () => ({
  resolveClientAccessToken: () => Promise.resolve('test-token'),
}));

import ImportBrowser from './imports/ImportBrowser';

/** jsdom ships neither observer, and the import grid lazy-loads thumbnails. */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopObserver;

const CLIENT = readFileSync(
  resolvePath(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

/**
 * The source of one CanvasClient callback, from its own definition.
 *
 * Both shapes it is written in are supported, and an unmatched name throws --
 * a renamed handler must fail loudly here rather than silently testing nothing.
 */
function callbackSource(name: string): string {
  const wrapped = `const ${name} = useCallback(`;
  const plain = `const ${name} = async (`;
  const at = CLIENT.indexOf(wrapped);
  if (at >= 0) {
    const start = at + wrapped.length;
    const end = CLIENT.indexOf('\n  }, [', start);
    if (end < 0) throw new Error(`CALLBACK_END_NOT_FOUND: ${name}`);
    return `${CLIENT.slice(start, end)}\n  }`;
  }
  const plainAt = CLIENT.indexOf(plain);
  if (plainAt < 0) throw new Error(`CALLBACK_NOT_FOUND: ${name}`);
  const start = plainAt + `const ${name} = `.length;
  const end = CLIENT.indexOf('\n  };', start);
  if (end < 0) throw new Error(`CALLBACK_END_NOT_FOUND: ${name}`);
  return `${CLIENT.slice(start, end)}\n  }`;
}

/**
 * `new Function` parses JavaScript and these callbacks are TypeScript, so the
 * annotations are removed -- and each removal must match, so an edit that
 * changes a handler's shape fails here instead of running a mangled copy.
 */
function stripTypes(
  source: string,
  extra: ReadonlyArray<readonly [string, string]> = [],
  normalizeSignature = true,
): string {
  let out = source;
  for (const [from, to] of extra) {
    if (!out.includes(from)) throw new Error(`STRIP_NO_LONGER_MATCHES: ${from}`);
    out = out.split(from).join(to);
  }
  if (!normalizeSignature) return out;
  const signature = /^async \(([^)]*)\) =>/;
  const match = signature.exec(out);
  if (!match) throw new Error('CALLBACK_SIGNATURE_NOT_RECOGNISED');
  const params = match[1]
    .split(',')
    .map((param) => param.split(':')[0].trim())
    .filter(Boolean)
    .join(', ');
  out = out.replace(signature, `async (${params}) =>`);
  if (out.includes(': any') || out.includes(' as any')) {
    throw new Error('TYPE STRIP INCOMPLETE');
  }
  return out;
}

/** Builds one real callback with its dependencies injected. */
function buildCallback(source: string, deps: Record<string, unknown>) {
  const names = Object.keys(deps);
  const make = new Function(...names, `return ${source};`);
  return make(...names.map((name) => deps[name])) as (...args: never[]) => Promise<unknown>;
}

/** The live authority ref the production code reads, flippable mid-test. */
function authorityRef(initial: boolean) {
  return { current: initial };
}

type Recorder = {
  padletStates: unknown[][];
  inserted: unknown[];
  updated: unknown[];
  deleted: string[];
  scheduled: unknown[];
};

function recorder(): Recorder {
  return { padletStates: [], inserted: [], updated: [], deleted: [], scheduled: [] };
}

// ---------------------------------------------------------------------------
// A. DrawingLayout add / update / delete
// ---------------------------------------------------------------------------

describe('A. DrawingLayout mutations refuse once authority is lost', () => {
  function drawingDeps(ref: { current: boolean }, log: Recorder) {
    return {
      canEditBoardContentRef: ref,
      canvasId: 'board-1',
      crypto: { randomUUID: () => 'new-id' },
      setPadlets: (updater: (prev: unknown[]) => unknown[]) => {
        log.padletStates.push(updater([]));
      },
      addDrawingLayoutPadlet: async (row: unknown) => { log.inserted.push(row); return row; },
      persistKnowledgeSourceReference: () => { log.inserted.push('source-reference'); },
      updateDrawingLayoutPadlet: async (id: string, updates: unknown) => { log.updated.push({ id, updates }); },
      updatePostFieldsOrThrow: async (id: string, updates: unknown) => { log.updated.push({ id, updates }); },
      deletePadletById: async (id: string) => { log.deleted.push(id); },
    };
  }

  const ADD = stripTypes(callbackSource('handleDrawingLayoutAddPadlet'), [
    ['(postData as { sourceReference?: KnowledgeSourceReferenceDraft }).sourceReference', 'postData.sourceReference'],
    [' as any', ''],
  ]);
  const UPDATE = stripTypes(callbackSource('handleDrawingLayoutUpdatePadlet'));
  const UPDATE_STRICT = stripTypes(callbackSource('handleDrawingLayoutUpdatePadletStrict'), [
    ['updates: Partial<Padlet>', 'updates'],
  ]);
  const DELETE = stripTypes(callbackSource('handleDrawingLayoutDeletePadlet'));

  it('add: authorised inserts, then the SAME handle refuses after revocation', async () => {
    const ref = authorityRef(true);
    const log = recorder();
    const add = buildCallback(ADD, drawingDeps(ref, log));

    await add({ type: 'text', metadata: {} } as never);
    expect(log.inserted, 'positive control').toHaveLength(1);
    expect(log.padletStates).toHaveLength(1);

    // The true -> false transition, with the callback already in hand.
    ref.current = false;
    const refused = await add({ type: 'text', metadata: {} } as never);

    expect(refused, 'the stale handle reports no placement').toBeNull();
    expect(log.inserted, 'zero further inserts').toHaveLength(1);
    expect(log.padletStates, 'zero further optimistic content').toHaveLength(1);
  });

  it('update: both update paths refuse, writing nothing', async () => {
    const ref = authorityRef(true);
    const log = recorder();
    const deps = drawingDeps(ref, log);
    const update = buildCallback(UPDATE, deps);
    const updateStrict = buildCallback(UPDATE_STRICT, deps);

    await update('p1' as never, { position_x: 1.4 } as never);
    await updateStrict('p1' as never, { position_y: 2.6 } as never);
    expect(log.updated, 'positive control').toHaveLength(2);

    ref.current = false;
    await update('p1' as never, { position_x: 9 } as never);
    await updateStrict('p1' as never, { position_y: 9 } as never);

    expect(log.updated, 'zero further writes').toHaveLength(2);
    expect(log.padletStates, 'zero optimistic state after revocation').toHaveLength(1);
  });

  it('delete: the stale handle deletes nothing', async () => {
    const ref = authorityRef(true);
    const log = recorder();
    const remove = buildCallback(DELETE, drawingDeps(ref, log));

    await remove('p1' as never);
    expect(log.deleted).toEqual(['p1']);

    ref.current = false;
    await remove('p2' as never);
    expect(log.deleted, 'nothing further deleted').toEqual(['p1']);
  });

  it('the surface itself is read-only without board authority', () => {
    // The prop, not a paraphrase of it: Drawing takes the board's authority.
    expect(CLIENT).toContain('readOnly={!canEditBoardContent}');
    expect(CLIENT).not.toContain("readOnly={currentWorkspaceRole === 'readonly'}");
  });
});

// ---------------------------------------------------------------------------
// B. Library completion: card creation, icon replacement, scheduled commit
// ---------------------------------------------------------------------------

describe('B. Library completion refuses once authority is lost', () => {
  const FENCE = (() => {
    const at = CLIENT.indexOf('const guardBoardContentSave = useCallback(');
    if (at < 0) throw new Error('SAVE_FENCE_NOT_FOUND');
    const start = at + 'const guardBoardContentSave = useCallback('.length;
    const end = CLIENT.indexOf('\n    [],', start);
    if (end < 0) throw new Error('SAVE_FENCE_END_NOT_FOUND');
    return CLIENT.slice(start, end)
      .trim()
      .replace(/,$/, '')
      .replace('(save: (...args: any[]) => any) => async (...args: any[]) =>', '(save) => async (...args) =>');
  })();

  const METADATA = stripTypes(callbackSource('updatePadletMetadata'), [
    ['metadataUpdates: any', 'metadataUpdates'],
  ]);

  it('card/clipart creation: the fenced save writes nothing after revocation', async () => {
    const ref = authorityRef(true);
    const saved: unknown[] = [];
    const guard = new Function('canEditBoardContentRef', `return ${FENCE};`)(ref) as
      (save: (...args: unknown[]) => unknown) => (...args: unknown[]) => Promise<unknown>;
    // The very same wrapped handle the ClipartCardDraftModal and CardEditor get.
    const saveCard = guard((data: unknown) => { saved.push(data); return data; });

    await saveCard({ title: 'clipart' });
    expect(saved, 'positive control').toHaveLength(1);

    ref.current = false;
    await saveCard({ title: 'after revocation' });
    expect(saved, 'zero padlet writes from the stale modal callback').toHaveLength(1);
  });

  it('icon replacement / slider: no optimistic change and no scheduled commit', async () => {
    const ref = authorityRef(true);
    const log = recorder();
    const deps = {
      canEditBoardContentRef: ref,
      padlets: [{ id: 'p1', metadata: { svgUrl: 'old' } }],
      setPadlets: (updater: (prev: unknown[]) => unknown[]) => {
        log.padletStates.push(updater([{ id: 'p1', metadata: { svgUrl: 'old' } }]));
      },
      commitPadletMeta: (id: string, metadata: unknown) => { log.scheduled.push({ id, metadata }); },
    };
    const updateMetadata = buildCallback(METADATA, deps);

    await updateMetadata('p1' as never, { svgUrl: 'new' } as never);
    expect(log.padletStates, 'positive control: optimistic').toHaveLength(1);
    expect(log.scheduled, 'positive control: scheduled commit').toHaveLength(1);

    ref.current = false;
    await updateMetadata('p1' as never, { svgUrl: 'newer' } as never);

    expect(log.padletStates, 'zero optimistic metadata change').toHaveLength(1);
    expect(log.scheduled, 'zero scheduled commit').toHaveLength(1);
  });

  it('the board-mutating Library surface closes with the authority', () => {
    expect(CLIENT).toContain('isOpen={isLibraryOpen && canEditBoardContent}');
    // The icon-replacement completion asks the live ref, not the render that
    // opened the panel.
    expect(CLIENT).toContain('iconReplaceTargetPadlet && canEditBoardContentRef.current');
  });
});

// ---------------------------------------------------------------------------
// C. Import: before resolution starts, and while it is already pending
// ---------------------------------------------------------------------------

describe('C. Import resolution answers to current authority', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.unstubAllGlobals();
  });

  const ITEM = {
    id: 'file-1',
    name: 'Report.pdf',
    mimeType: 'application/pdf',
    isFolder: false,
    thumbnailUrl: null,
    rawThumbnailUrl: null,
    openUrl: null,
    sizeBytes: 10,
  };

  /**
   * Serves the folder listing, and records every resolve attempt. The resolve
   * promise never settles, so a test can inspect a request that is still in
   * flight -- which is the whole point of the pending case.
   */
  function stubImportFetch() {
    const resolveCalls: { signal?: AbortSignal }[] = [];
    const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/resolve-selection')) {
        resolveCalls.push({ signal: init?.signal ?? undefined });
        return new Promise<Response>(() => { /* deliberately pending */ });
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [ITEM] }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchSpy);
    return { fetchSpy, resolveCalls };
  }

  async function mountBrowser(
    canResolveSelection: () => boolean,
    onSelectItem: (resolved: unknown) => void,
  ) {
    await act(async () => {
      root!.render(
        <ImportBrowser
          provider="google-drive"
          onSelectItem={onSelectItem as never}
          onClose={vi.fn()}
          canResolveSelection={canResolveSelection}
        />,
      );
    });
    // Let the listing settle so the grid has something to select.
    await act(async () => { await Promise.resolve(); });
  }

  /** Lets the token lookup and the request it precedes actually happen. */
  async function flush() {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  function selectFirstItemAndConfirm(mounted: HTMLElement) {
    const card = [...mounted.querySelectorAll('div')]
      .find((node) => node.textContent?.includes('Report.pdf') && node.className.includes('cursor-pointer'));
    expect(card, 'the listed file must be selectable').toBeTruthy();
    act(() => { card!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const confirm = [...mounted.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Select');
    expect(confirm, 'the Select button must be present').toBeTruthy();
    act(() => { confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }

  it('no authority: selection starts NO resolution request at all', async () => {
    const { resolveCalls } = stubImportFetch();
    const onSelectItem = vi.fn();
    let allowed = true;
    await mountBrowser(() => allowed, onSelectItem);

    // The transition happens while the browser is open and the handle is held.
    allowed = false;
    selectFirstItemAndConfirm(host!);
    await flush();

    expect(resolveCalls, 'zero resource-consuming requests').toHaveLength(0);
    expect(onSelectItem, 'nothing handed on for publication').not.toHaveBeenCalled();
  });

  it('resolution already pending: losing the surface aborts the request', async () => {
    const { resolveCalls } = stubImportFetch();
    const onSelectItem = vi.fn();
    await mountBrowser(() => true, onSelectItem);

    selectFirstItemAndConfirm(host!);
    await flush();
    expect(resolveCalls, 'positive control: the request was made').toHaveLength(1);
    const signal = resolveCalls[0].signal;
    expect(signal, 'the request carries an abort signal').toBeTruthy();
    expect(signal!.aborted).toBe(false);

    // Revocation unmounts the surface -- which is what carries the abort.
    act(() => { root!.unmount(); });
    root = null;

    expect(signal!.aborted, 'the in-flight request is aborted').toBe(true);
    expect(onSelectItem, 'no preview is handed on').not.toHaveBeenCalled();
  });

  it('the board import surface is mounted on the board authority', () => {
    expect(CLIENT).toContain('isOpen={isImportBrowserOpen && canEditBoardContent}');
    expect(CLIENT).toContain('canResolveSelection={() => canEditBoardContentRef.current}');
  });
});

// ---------------------------------------------------------------------------
// D. Existing-Note Knowledge source drop
// ---------------------------------------------------------------------------

describe('D. dropping a source clip on an existing Note asks the LIVE authority', () => {
  const DROP = stripTypes(
    callbackSource('handleKnowledgeSourceClipDropOnExistingNote'),
    [[
      '(\n    event: React.DragEvent,\n    targetPadlet: Padlet,\n  ): boolean => {',
      '(event, targetPadlet) => {',
    ]],
    false,
  );

  function dropDeps(ref: { current: boolean }, log: Recorder) {
    return {
      canEditBoardContentRef: ref,
      canvasId: 'board-1',
      KNOWLEDGE_SOURCE_CLIP_MIME: 'application/x-knowledge-clip',
      parseKnowledgeSourceTextClipPayload: () => ({ selectedText: 'passage', pageNumber: 1 }),
      buildKnowledgeSourceNoteDraft: () => ({ sourceReference: { page: 1 } }),
      knowledgeSourceClipPageRequest: (payload: unknown) => payload,
      appendKnowledgeSourceSelectionToNoteContent: (content: string, text: string) => `${content}${text}`,
      updatePostFieldsOrThrow: async (id: string, fields: unknown) => { log.updated.push({ id, fields }); },
      setPadlets: (updater: (prev: unknown[]) => unknown[]) => { log.padletStates.push(updater([])); },
      persistKnowledgeSourceReference: () => { log.inserted.push('source-reference'); },
      toast: { error: () => {} },
      console: { error: () => {} },
    };
  }

  const dragEvent = () => ({
    dataTransfer: { getData: () => 'clip' },
    preventDefault: () => {},
    stopPropagation: () => {},
  });

  it('the retained callback writes nothing after a true -> false transition', async () => {
    const ref = authorityRef(true);
    const log = recorder();
    const drop = buildCallback(DROP, dropDeps(ref, log)) as unknown as
      (event: unknown, target: unknown) => boolean;
    const target = { id: 'note-1', type: 'text', content: 'existing ' };

    // Positive control: an authorised drop still appends and links.
    expect(drop(dragEvent(), target)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(log.updated, 'positive control: the Note is updated').toHaveLength(1);

    // The transition, with the callback already in the reader panel's hands.
    ref.current = false;
    expect(drop(dragEvent(), target), 'the drop is still consumed').toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(log.updated, 'zero updatePostFieldsOrThrow').toHaveLength(1);
    expect(log.padletStates, 'zero optimistic/local update').toHaveLength(1);
    expect(log.inserted, 'zero reference network mutation').toHaveLength(1);
  });

  it('no knowledge-drop handler reads a closed-over authority any more', () => {
    expect(CLIENT).not.toContain('if (!canEditBoardContent || !canvasId) return true;');
    const live = CLIENT.match(/if \(!canEditBoardContentRef\.current \|\| !canvasId\) return true;/g) ?? [];
    expect(live, 'all three drop routes are live').toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// E. Already-open Drawing UI after revocation
// ---------------------------------------------------------------------------

const DRAWING = readFileSync(
  resolvePath(process.cwd(), 'components/collabboard/canvas/layouts/DrawingLayout.tsx'),
  'utf8',
);

/** One DrawingLayout callback, executed from its own source. */
function drawingCallback(name: string, extra: ReadonlyArray<readonly [string, string]> = []) {
  const marker = `const ${name} = useCallback(`;
  const at = DRAWING.indexOf(marker);
  if (at < 0) throw new Error(`DRAWING_CALLBACK_NOT_FOUND: ${name}`);
  const start = at + marker.length;
  const end = DRAWING.indexOf('\n  }, [', start);
  if (end < 0) throw new Error(`DRAWING_CALLBACK_END_NOT_FOUND: ${name}`);
  let source = `${DRAWING.slice(start, end)}\n  }`;
  for (const [from, to] of extra) {
    if (!source.includes(from)) throw new Error(`DRAWING_STRIP_NO_LONGER_MATCHES: ${from}`);
    source = source.split(from).join(to);
  }
  return source;
}

describe('E. already-open Drawing surfaces cannot mutate after revocation', () => {
  /**
   * Every context-menu action -- cut, copy-paste, duplicate, delete and the
   * four ordering commands -- reaches the scene through this one funnel, so
   * executing it is what proves the whole menu fails closed.
   */
  it('the scene funnel refuses once readOnly flips, so the open menu is inert', () => {
    const ref = { current: false };
    const updates: unknown[] = [];
    const source = drawingCallback('updateDrawingSceneElements', [
      ['(nextElements: readonly any[], options?: { commitToHistory?: boolean })', '(nextElements, options)'],
      ['elements: nextElements as any[]', 'elements: nextElements'],
    ]);
    const update = new Function(
      'readOnlyRef', 'excalidrawAPI', 'buildDrawingSceneUpdate',
      `return ${source};`,
    )(
      ref,
      { updateScene: (payload: unknown) => { updates.push(payload); } },
      (payload: unknown) => payload,
    ) as (elements: readonly unknown[]) => void;

    update([{ id: 'a' }]);
    expect(updates, 'positive control: the scene is updated').toHaveLength(1);

    ref.current = true;
    update([{ id: 'b' }]);
    expect(updates, 'zero scene mutation after revocation').toHaveLength(1);
  });

  /**
   * The slide handlers touch the scene directly rather than through that
   * funnel, so each is executed on its own. Reaching `getSceneElements` or
   * `updateScene` means the handler got past its guard.
   */
  const SLIDE_HANDLERS: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
    ['handleAddSlide', []],
    ['handleAddSlideBelow', [['(id: string)', '(id)']]],
    ['handleDuplicateSlide', [['(id: string)', '(id)']]],
    ['handleRemoveSlide', [['(id: string)', '(id)']]],
    ['handleRenameSlide', [['(id: string, name: string)', '(id, name)']]],
  ];

  /** A scene with one frame, so the id-taking handlers have something real. */
  const SCENE = [
    { id: 'slide-1', type: 'frame', x: 0, y: 0, width: 100, height: 100, name: 'Slide 1' },
    { id: 'child-1', type: 'rectangle', frameId: 'slide-1', x: 10, y: 10, width: 10, height: 10 },
  ];

  for (const [name, extra] of SLIDE_HANDLERS) {
    it(`${name} reaches the scene only while editable`, async () => {
      const ref = { current: false };
      const touched: string[] = [];
      const updates: unknown[] = [];
      const api = {
        getSceneElements: () => { touched.push('read'); return []; },
        updateScene: (payload: unknown) => { updates.push(payload); },
      };
      // Parameter annotations only -- these handlers carry no string literals
      // containing `: any`, and a strip that stopped matching would surface
      // as a syntax error here rather than a silently mangled handler.
      const source = drawingCallback(name, extra)
        .replace(/: any(?=[,)])/g, '')
        .replace(/ as any\[\]/g, '')
        .replace(/ as any/g, '');
      const handler = new Function(
        'readOnlyRef', 'excalidrawAPI', 'elements', 'syncSceneElementIndices',
        'onUpdatePadlet', 'padlets', 'setActiveSlideId', 'persistFrameOrder',
        'cloneLinkedRowsForDuplicateSlide', 'navigateToPresentationFrameSoon',
        `return ${source};`,
      )(
        ref, api, SCENE, (els: unknown) => els,
        async () => {}, [], () => {}, async () => {},
        async () => new Map(), () => {},
      ) as (...args: unknown[]) => unknown;

      // Positive control: editable reaches the scene (it may then fail on a
      // stub dependency -- what matters is that the guard let it through).
      try { await handler('slide-1', 'name'); } catch { /* stub depth */ }
      expect(touched.length + updates.length, `${name} positive control`).toBeGreaterThan(0);

      const readsBefore = touched.length;
      const updatesBefore = updates.length;
      ref.current = true;
      try { await handler('slide-1', 'name'); } catch { /* unreachable past the guard */ }

      expect(touched.length, `${name} reads nothing after revocation`).toBe(readsBefore);
      expect(updates.length, `${name} mutates nothing after revocation`).toBe(updatesBefore);
    });
  }

  it('the z-order action on a heading refuses without touching the parent', async () => {
    const ref = { current: false };
    const updated: unknown[] = [];
    const source = drawingCallback('moveSectionHeadingZOrder', [
      ["(padlet: Padlet, action: 'bringToFront' | 'sendToBack')", '(padlet, action)'],
    ]).replace(/ as \{ zIndex\?: number \} \| undefined/g, '').replace(/ as any/g, '');
    const move = new Function(
      'readOnlyRef', 'padlets', 'onUpdatePadlet', 'onUpdatePadletStrict',
      `return ${source};`,
    )(
      ref,
      [{ id: 'h1', metadata: { zIndex: 100 } }],
      async (id: string, updates: unknown) => { updated.push({ id, updates }); },
      async (id: string, updates: unknown) => { updated.push({ id, updates }); },
    ) as (padlet: unknown, action: string) => Promise<void>;

    await move({ id: 'h1', metadata: { zIndex: 100 } }, 'bringToFront');
    expect(updated, 'positive control').toHaveLength(1);

    ref.current = true;
    await move({ id: 'h1', metadata: { zIndex: 100 } }, 'bringToFront');
    expect(updated, 'zero parent persistence after revocation').toHaveLength(1);
  });

  it('revocation dismisses the open menu and the mutation-capable sidebar', () => {
    // The real effect body, executed: dismissal is the other half of the fix.
    const at = DRAWING.indexOf('  useEffect(() => {\n    if (!readOnly) return;');
    expect(at, 'the revocation effect exists').toBeGreaterThan(-1);
    const body = DRAWING.slice(at, DRAWING.indexOf('\n  }, [readOnly]);', at));
    const makeEffect = new Function(
      'readOnly', 'setContextMenu', 'setActiveTool',
      `${body.replace('  useEffect(() => {', 'const run = () => {')}\n  }; return run;`,
    );

    for (const [readOnly, expectedTool, expectedMenu] of [
      [false, 'present', 'kept'],
      [true, 'select', 'dismissed'],
    ] as const) {
      let tool = 'present';
      let menu: unknown = { x: 1, y: 1 };
      makeEffect(
        readOnly,
        (next: unknown) => { menu = next; },
        (updater: (current: string) => string) => { tool = updater(tool); },
      )();
      expect(tool, `activeTool when readOnly=${readOnly}`).toBe(expectedTool);
      expect(menu === null ? 'dismissed' : 'kept', `menu when readOnly=${readOnly}`).toBe(expectedMenu);
    }
  });

  it('read-only viewing survives: the fullscreen presentation is not torn down', () => {
    // The effect touches the sidebar tool and the menu only -- never
    // presentationActive -- so a running slideshow keeps playing.
    const at = DRAWING.indexOf('  useEffect(() => {\n    if (!readOnly) return;');
    const body = DRAWING.slice(at, DRAWING.indexOf('\n  }, [readOnly]);', at));
    expect(body).not.toContain('setPresentationActive');
    expect(body).not.toContain('onDeletePadlet');
  });
});
