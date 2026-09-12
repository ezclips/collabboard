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
function stripTypes(source: string, extra: ReadonlyArray<readonly [string, string]> = []): string {
  let out = source;
  for (const [from, to] of extra) {
    if (!out.includes(from)) throw new Error(`STRIP_NO_LONGER_MATCHES: ${from}`);
    out = out.split(from).join(to);
  }
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
