// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCanvasToolbarGroups,
  isDirectPdfCanvasLayout,
  type CanvasToolbarFlags,
} from './canvas/ui/canvasToolbarRegistry';

/**
 * PDF-C1 final release scope. Direct PDF canvas objects ship on Freeform ONLY.
 * Structured layouts keep their semantic placement structures and will
 * reference a Knowledge PDF from an ordinary Note/Post/Container instead.
 * Drawing is excluded too: its PDF placement works on insert, but
 * container-hosted posts vanish from its rendering after a board reload -- a
 * defect generic to the Drawing host (an ordinary Note reproduces it), tracked
 * as DRAWING_CONTAINER_HOST_RELOAD_DEFECT and deliberately not fixed here.
 *
 * This suite pins BOTH layers of the scope: the rendered toolbar (the primary,
 * pre-upload prevention) and the defensive guard at the placement owner
 * (source-level, because CanvasClient is the whole board shell and cannot be
 * mounted here).
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Same convention as the other PDF-C1 source suites: absence assertions run
 * against executable source only, so prose explaining what the code refuses to
 * do can never satisfy or fail a test that is really about the code.
 */
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CLIENT = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const REGISTRY = read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
const CLIENT_CODE = executable(CLIENT);

const PDF_HANDLER = CLIENT_CODE.slice(
  CLIENT_CODE.indexOf('const handleKnowledgePdfUploaded'),
  CLIENT_CODE.indexOf('const handleKnowledgePdfSettled'),
);

const GUARD = 'if (!canPlaceDirectPdf) {';
const guardBody = () => {
  const at = PDF_HANDLER.indexOf(GUARD);
  return PDF_HANDLER.slice(at, PDF_HANDLER.indexOf('}', at));
};

/**
 * Layouts are described by the flags the real shell derives, so each row here
 * is the same input CanvasClient computes. `isFreeformLayout` is the shell's
 * catch-all -- true for Table/Stream and any unrecognised layout too -- which
 * is exactly why the PDF gate must not be built on it.
 */
type LayoutCase = { layout: string; flags: Partial<CanvasToolbarFlags> };

const SUPPORTED: LayoutCase[] = [
  { layout: 'freeform', flags: { isFreeformLayout: true } },
];

const UNSUPPORTED: LayoutCase[] = [
  // Drawing is a spatial object canvas whose PDF insert path works, and it is
  // still withheld -- see DRAWING_CONTAINER_HOST_RELOAD_DEFECT. This row is the
  // release-scope decision itself, not an incidental structured-layout case.
  { layout: 'drawing', flags: { isDrawingLayout: true } },
  { layout: 'wall', flags: {} },
  { layout: 'columns', flags: {} },
  { layout: 'grid', flags: {} },
  // Table and Stream currently fall through to the shell's Freeform catch-all.
  // They are still structured hosts, so they must NOT get Add PDF -- this is
  // the case a gate written as `isFreeformLayout` would silently let through.
  { layout: 'table', flags: { isFreeformLayout: true } },
  { layout: 'stream', flags: { isFreeformLayout: true } },
  { layout: 'timeline', flags: { isTimelineLayout: true } },
  { layout: 'scheduler', flags: {} },
  { layout: 'map', flags: { isMapLayout: true } },
  { layout: 'kanban', flags: {} },
  { layout: 'gantt', flags: {} },
];

function toolbarFor({ layout, flags }: LayoutCase) {
  return buildCanvasToolbarGroups({
    isMapLayout: false,
    isFreeformLayout: false,
    isFreeformGraphMode: false,
    isTimelineLayout: false,
    chronoMode: null,
    canManageCanvasShare: true,
    canUseFreeformEditButton: true,
    // CORRECTION_2: the Create group asks the BOARD, not the workspace role.
    canCreateBoardContent: true,
    isDrawingLayout: false,
    ...flags,
    // Derived exactly the way the shell derives it: from the layout, through
    // the one allowlist -- never from the caller's other flags.
    isDirectPdfLayout: isDirectPdfCanvasLayout(layout),
  });
}

const hasAddPdf = (layoutCase: LayoutCase) =>
  toolbarFor(layoutCase).some((group) => group.tools.some((tool) => tool.type === 'knowledge-pdf'));

describe('1, 4. the rendered toolbar offers Add PDF on Freeform', () => {
  it.each(SUPPORTED)('$layout renders Add PDF', (layoutCase) => {
    expect(hasAddPdf(layoutCase)).toBe(true);
  });

  it('renders it as a live pinned Media tool, never a disabled stub', () => {
    for (const layoutCase of SUPPORTED) {
      const media = toolbarFor(layoutCase).find((group) => group.id === 'media')!;
      const tool = media.tools.find((t) => t.type === 'knowledge-pdf')!;
      expect(tool.label).toBe('PDF');
      expect(tool.disabled).toBeFalsy();
      // Pinned + label-driven: the sidebar keeps it on the toolbar even when
      // Media collapses, and the browser opens the dialog natively.
      expect(tool.pinned).toBe(true);
      expect(tool.activatesInputId).toBeTruthy();
    }
  });
});

describe('2-3, 5. every unsupported layout renders no Add PDF at all', () => {
  it.each(UNSUPPORTED)('$layout omits Add PDF', (layoutCase) => {
    expect(hasAddPdf(layoutCase)).toBe(false);
  });

  it('5. the predicate itself is the release scope: freeform in, drawing out', () => {
    expect(isDirectPdfCanvasLayout('freeform')).toBe(true);
    expect(isDirectPdfCanvasLayout('drawing')).toBe(false);
  });

  it('omits the tool from the registry rather than mounting it disabled', () => {
    for (const layoutCase of UNSUPPORTED) {
      const tools = toolbarFor(layoutCase).flatMap((group) => group.tools);
      expect(tools.some((tool) => tool.label === 'Add PDF')).toBe(false);
      // The rest of Media is untouched -- this scopes PDFs, it does not thin
      // the toolbar.
      expect(tools.some((tool) => tool.type === 'image')).toBe(true);
      expect(tools.some((tool) => tool.type === 'upload')).toBe(true);
      expect(tools.some((tool) => tool.type === 'import')).toBe(true);
    }
  });

  it('an unknown or absent layout is unsupported, not silently Freeform', () => {
    expect(isDirectPdfCanvasLayout(undefined)).toBe(false);
    expect(isDirectPdfCanvasLayout(null)).toBe(false);
    expect(isDirectPdfCanvasLayout('some-future-structured-host')).toBe(false);
    expect(hasAddPdf({ layout: 'some-future-structured-host', flags: { isFreeformLayout: true } })).toBe(false);
  });
});

describe('6-7. the placement owner defends the same allowlist', () => {
  it('6. an unsupported layout returns before any file placement is built', () => {
    const guardAt = PDF_HANDLER.indexOf(GUARD);
    expect(guardAt).toBeGreaterThan(-1);
    // Nothing that builds or persists a placement may precede the guard.
    for (const creation of ['crypto.randomUUID()', 'setPadlets', 'insertPostPreservingFailureChannels']) {
      const at = PDF_HANDLER.indexOf(creation);
      expect(at, creation + ' must come after the release-scope guard').toBeGreaterThan(guardAt);
    }
    // The guard exits with the placement authority's failure value. An
    // unsupported invocation is therefore REPORTED as "not placed" rather than
    // falling out silently, which a caller cannot tell from a real placement.
    expect(guardBody()).toContain('return false;');
  });

  it('7. Drawing (and every unsupported layout) never reaches requestPlacementIfRequired', () => {
    const guardAt = PDF_HANDLER.indexOf(GUARD);
    const gateAt = PDF_HANDLER.indexOf('requestPlacementIfRequiredRef.current');
    expect(gateAt).toBeGreaterThan(guardAt);
    // The guard's own body returns; it does not fall through into the gate.
    expect(guardBody()).not.toContain('requestPlacementIfRequired');
  });

  it('the guard reads the one shared allowlist, with no per-layout switch', () => {
    expect(CLIENT).toContain('isDirectPdfCanvasLayout } from ');
    expect(CLIENT).toContain('const canPlaceDirectPdf = isDirectPdfCanvasLayout(canvas?.layout);');
    expect(CLIENT).toContain('isDirectPdfLayout: canPlaceDirectPdf,');
    // Exactly one definition of the allowlist exists, and it is a predicate --
    // not a per-layout switch duplicated at the toolbar and at the guard.
    expect((REGISTRY.match(/export function isDirectPdfCanvasLayout/g) || []).length).toBe(1);
    expect(executable(REGISTRY)).toContain("return layout === 'freeform';");
    // The withheld layout must not survive anywhere in the executable gate.
    expect(executable(REGISTRY)).not.toContain("layout === 'drawing'");
    for (const layoutFlag of [
      'isDrawingLayout', 'isTimelineLayout', 'isSchedulerLayout',
      'isMapLayout', 'isGridLayout', 'isColumnsLayout', 'isWallLayout', 'isFreeformLayout',
    ]) {
      expect(PDF_HANDLER, layoutFlag + ' must not be branched on in the PDF handler').not.toContain(layoutFlag);
    }
  });

  it('an unsupported invocation never deletes the Knowledge document to compensate', () => {
    for (const forbidden of ['DELETE', 'delete', 'fetch(', 'supabase']) {
      expect(guardBody()).not.toContain(forbidden);
    }
  });
});

describe('8-10. the kept architecture is untouched', () => {
  it('8. the Freeform direct path still builds the one file placement it owns', () => {
    expect(PDF_HANDLER).toContain('knowledgeDocumentId: document.id');
    expect(PDF_HANDLER).toContain("type: 'file'");
    expect(PDF_HANDLER).toContain('insertPostPreservingFailureChannels(placement');
    // Still exactly one placement per document, and the duplicate guard now
    // says so: `false` is "nothing was placed", which is what a chooser needs
    // to hear when a document acquired a card between its load and the click.
    expect(PDF_HANDLER).toContain('if (alreadyPlaced) return false;');
  });

  it('8b. the one placement authority reports its outcome as a boolean', () => {
    expect(PDF_HANDLER).toContain(
      'async (document: KnowledgePdfPlacementSource): Promise<boolean> =>');
    // No exit may be bare. A `return;` resolves to undefined, which a caller
    // cannot distinguish from a successful placement -- exactly the confusion
    // that would let a chooser close over a placement that never happened.
    expect(PDF_HANDLER).not.toMatch(/\breturn;/);
  });

  it('9. the generic placement infrastructure is kept, not churned away', () => {
    // Freeform needs no prompt, so this gate is currently a no-op for the only
    // shipped layout. It stays: R1/R2 are reviewed architecture, and re-adding
    // a layout must not mean rebuilding the file-draft path from scratch.
    expect(PDF_HANDLER).toContain('const placementTaken = requestPlacementIfRequiredRef.current?.({');
    expect(PDF_HANDLER).toContain("kind: 'file'");
    // The gate is still consulted and still short-circuits the insert; only
    // what it REPORTS changed. Ownership is not confirmation -- the layout may
    // complete the draft later, or the user may abandon the prompt -- so this
    // branch resolves false. Proven executably in "11. the result contract".
    expect(PDF_HANDLER).toContain('if (placementTaken) return false;');
  });

  it('10. placement policy is still the shared one, never PDF-specific', () => {
    const HOOK = executable(read('hooks/canvas/usePadletSave.ts'));
    expect((HOOK.match(/const checkPlacementRequired = \(/g) || []).length).toBe(1);
    expect(HOOK).not.toContain('canPlaceDirectPdf');
    expect(HOOK).not.toContain('isDirectPdfCanvasLayout');
  });
});

describe('9-10. nothing outside the scope gate moved', () => {
  it('9. the canvas PDF surface keeps its own behaviour and mounting', () => {
    const SURFACE = read('components/collabboard/KnowledgePdfCanvasSurface.tsx');
    expect(SURFACE).not.toContain('canPlaceDirectPdf');
    expect(SURFACE).not.toContain('isDirectPdfCanvasLayout');
    expect(CLIENT).toContain('onStatusResolved={handleKnowledgePdfSettled}');
  });

  it('10. Knowledge authority and the status lifecycle are unchanged', () => {
    const settled = CLIENT_CODE.slice(
      CLIENT_CODE.indexOf('const handleKnowledgePdfSettled'),
      CLIENT_CODE.indexOf('const persistKnowledgeSourceReference'),
    );
    expect(settled).toContain("if (status !== 'ready' && status !== 'failed') return;");
    expect(settled).toContain('updatePostFieldsSwallowResolved(target.id');
    expect(settled).not.toContain('canPlaceDirectPdf');
  });

  it('10. reader, provenance and AI/BYOK wiring are not touched by the gate', () => {
    expect(CLIENT).toContain('const requestKnowledgeDocumentOpen = useCallback');
    for (const forbidden of ['byok', 'BYOK', 'anthropic', 'openai', 'fetch(', 'supabase']) {
      expect(REGISTRY).not.toContain(forbidden);
    }
  });
});

/**
 * 11. The result contract, executed rather than described.
 *
 * The suite above pins WHERE each `return` sits. That is necessary but not
 * sufficient: it cannot prove what the handler actually resolves to, and this
 * boolean is load-bearing -- KnowledgeExistingPdfPicker closes on `true`, so a
 * branch that reports success without inserting anything would close the
 * chooser over a placement that never happened.
 *
 * CanvasClient is the whole board shell and cannot be mounted, so the handler's
 * OWN source is lifted out and run with stubs for everything it closes over.
 * These assertions therefore execute the shipped code path.
 */
const HANDLER_ARROW = (() => {
  const at = CLIENT.indexOf('const handleKnowledgePdfUploaded');
  const start = CLIENT.indexOf('async (document', at);
  const depsAt = CLIENT.indexOf(', [canvasId, canPlaceDirectPdf, padlets', start);
  return CLIENT.slice(start, CLIENT.lastIndexOf('}', depsAt) + 1);
})();

/**
 * `new Function` parses JavaScript, and the handler is TypeScript. Rather than
 * pull a transpiler into a jsdom suite, the four annotations this handler
 * actually carries are removed explicitly -- and every removal must match, so
 * an edit that changes the handler's shape fails here loudly instead of
 * quietly running a mangled copy of it.
 */
const HANDLER_JS = (() => {
  const strips: ReadonlyArray<readonly [RegExp | string, string]> = [
    ['async (document: KnowledgePdfPlacementSource): Promise<boolean> =>', 'async (document) =>'],
    ['const placement: Padlet = {', 'const placement = {'],
    [/ as const/g, ''],
    [/ as any/g, ''],
  ];
  let src = HANDLER_ARROW;
  for (const [pattern, replacement] of strips) {
    const before = src;
    src = src.replace(pattern as never, replacement);
    if (src === before) {
      throw new Error(`handler no longer contains ${pattern} -- update this suite, do not skip it`);
    }
  }
  // A strip that removed too much would leave a handler that decides nothing.
  // These are STRUCTURAL markers only -- deliberately not the return values,
  // so that a wrong contract reaches the assertions below and fails there with
  // a readable expected/received rather than throwing during collection.
  for (const kept of ['const alreadyPlaced =', 'const placementTaken =', 'insertPostPreservingFailureChannels(']) {
    if (!src.includes(kept)) throw new Error(`type strip damaged the handler: lost ${kept}`);
  }
  return src;
})();

type PlacementRun = {
  result: unknown;
  inserted: any[];
  onBoard: any[];
  errors: string[];
  gateCalls: any[];
};

async function runPlacement(over: {
  canvasId?: string;
  canPlaceDirectPdf?: boolean;
  padlets?: any[];
  placementTaken?: boolean;
  insertOk?: boolean;
} = {}): Promise<PlacementRun> {
  const o = {
    canvasId: 'board-1', canPlaceDirectPdf: true, padlets: [] as any[],
    placementTaken: false, insertOk: true, ...over,
  };
  const inserted: any[] = [];
  const errors: string[] = [];
  const gateCalls: any[] = [];
  let onBoard: any[] = [];

  const build = new Function(
    'canvasId', 'canPlaceDirectPdf', 'padlets', 'toast', 'requestPlacementIfRequiredRef',
    'getNewPostPosition', 'nextZIndex', 'setPadlets', 'insertPostPreservingFailureChannels',
    'fetchData', 'KNOWLEDGE_PDF_PLACEMENT_WIDTH', 'KNOWLEDGE_PDF_PLACEMENT_HEIGHT', 'crypto',
    `return ${HANDLER_JS};`,
  );
  const handler = build(
    o.canvasId, o.canPlaceDirectPdf, o.padlets,
    { error: (m: string) => errors.push(m) },
    { current: (draft: any) => { gateCalls.push(draft); return o.placementTaken; } },
    () => ({ x: 10, y: 20 }),
    () => 7,
    (updater: any) => { onBoard = updater(onBoard); },
    async (row: any) => { inserted.push(row); return { ok: o.insertOk }; },
    () => {},
    260, 320,
    { randomUUID: () => 'placement-1' },
  );

  const result = await handler({
    id: 'doc-1', originalFilename: 'a.pdf', processingStatus: 'ready',
  });
  return { result, inserted, onBoard, errors, gateCalls };
}

describe('11. the result contract, executed', () => {
  it('a confirmed insert is the ONLY branch that reports true', async () => {
    const run = await runPlacement();
    expect(run.result).toBe(true);
    expect(run.inserted).toHaveLength(1);
    expect(run.inserted[0].metadata.knowledgeDocumentId).toBe('doc-1');
    expect(run.onBoard).toHaveLength(1);
  });

  it('a taken placement reports FALSE -- ownership is not confirmation', async () => {
    const run = await runPlacement({ placementTaken: true });
    // The gate was consulted, and it short-circuited the insert as designed.
    expect(run.gateCalls).toHaveLength(1);
    expect(run.gateCalls[0].kind).toBe('file');
    expect(run.inserted).toHaveLength(0);
    expect(run.onBoard).toHaveLength(0);
    // Nothing reached the board, so nothing may be reported as placed. This is
    // what keeps the chooser open instead of closing over a deferred draft.
    expect(run.result).toBe(false);
  });

  it('an already-placed document reports false and inserts nothing', async () => {
    const run = await runPlacement({
      padlets: [{ id: 'p1', metadata: { knowledgeDocumentId: 'doc-1' } }],
    });
    expect(run.result).toBe(false);
    expect(run.inserted).toHaveLength(0);
    expect(run.gateCalls).toHaveLength(0);
  });

  it('a failed insert reports false and leaves no phantom card behind', async () => {
    const run = await runPlacement({ insertOk: false });
    expect(run.result).toBe(false);
    expect(run.inserted).toHaveLength(1);
    expect(run.onBoard).toHaveLength(0);
    expect(errorsFor(run)).toContain('could not be added');
  });

  it('an unsupported layout reports false before building anything', async () => {
    const run = await runPlacement({ canPlaceDirectPdf: false });
    expect(run.result).toBe(false);
    expect(run.inserted).toHaveLength(0);
    expect(run.gateCalls).toHaveLength(0);
    expect(errorsFor(run)).toContain('Freeform');
  });

  it('no branch resolves undefined, which a caller could not read', async () => {
    for (const run of [
      await runPlacement(),
      await runPlacement({ placementTaken: true }),
      await runPlacement({ insertOk: false }),
      await runPlacement({ canPlaceDirectPdf: false }),
      await runPlacement({ padlets: [{ id: 'p1', metadata: { knowledgeDocumentId: 'doc-1' } }] }),
    ]) {
      expect(typeof run.result).toBe('boolean');
    }
  });
});

const errorsFor = (run: PlacementRun) => run.errors.join(' | ');
