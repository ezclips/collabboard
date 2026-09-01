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
      expect(tool.label).toBe('Add PDF');
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
    expect(guardBody()).toContain('return;');
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
    // Still exactly one placement per document.
    expect(PDF_HANDLER).toContain('if (alreadyPlaced) return;');
  });

  it('9. the generic placement infrastructure is kept, not churned away', () => {
    // Freeform needs no prompt, so this gate is currently a no-op for the only
    // shipped layout. It stays: R1/R2 are reviewed architecture, and re-adding
    // a layout must not mean rebuilding the file-draft path from scratch.
    expect(PDF_HANDLER).toContain('const placementTaken = requestPlacementIfRequiredRef.current?.({');
    expect(PDF_HANDLER).toContain("kind: 'file'");
    expect(PDF_HANDLER).toContain('if (placementTaken) return;');
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
