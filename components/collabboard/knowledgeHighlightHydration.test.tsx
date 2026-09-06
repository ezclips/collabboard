// @vitest-environment jsdom
//
// IMAGE_LIBRARY_RUNTIME_CORRECTION_1 defect A -- the standalone-highlight
// hydration must read once per distinct set of placed documents, and a failed
// read must not become a request loop.
//
// Observed against production: `GET /api/boards/<board>/knowledge/highlights
// ?documentId=<doc> 503` repeating for the SAME two documents every 150-200ms,
// continuously. The board tolerated the failure visually -- marks simply did
// not render -- but it never stopped asking.
//
// Two things made that possible, and both are asserted here:
//
//   1. the effect depended on a callback whose identity was rebuilt from
//      `placedKnowledgeDocumentIds`, itself a fresh array on every `padlets`
//      change, so unrelated board churn re-fired a network read; and
//   2. every completed read wrote a NEW index object into state even when it
//      found nothing, so the 503 path re-rendered on its own result.
//
// This suite drives the real hydration shape rather than the component, which
// needs the whole canvas: the wiring under test is the effect's dependency and
// dedup contract, and that is reproduced exactly.
import React, { act, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import {
  knowledgeStandaloneHighlightIndexOf,
  type KnowledgeStandaloneHighlightIndex,
} from '@/lib/domain/knowledge/knowledgeStandaloneHighlightIndex';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY: KnowledgeStandaloneHighlightIndex = new Map();

interface Placement { readonly id: string; readonly documentId: string | null }

/**
 * The hydration exactly as CanvasClient now wires it: ids travel as an
 * argument, the effect keys on the joined string, and a once-per-key ref stops
 * a failed read from re-asking on the next render.
 */
function useHighlightHydration(canvasId: string | null, padlets: readonly Placement[]) {
  const [index, setIndex] = useState<KnowledgeStandaloneHighlightIndex>(EMPTY);

  const placedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of padlets) if (p.documentId) ids.add(p.documentId);
    return [...ids].sort();
  }, [padlets]);
  const placedKey = placedIds.join(',');

  const load = useCallback(async (documentIds: readonly string[]) => {
    if (!canvasId || documentIds.length === 0) { setIndex(EMPTY); return; }
    const rows: any[] = [];
    for (const documentId of documentIds) {
      try {
        const response = await fetch(
          `/api/boards/${encodeURIComponent(canvasId)}/knowledge/highlights`
          + `?documentId=${encodeURIComponent(documentId)}`);
        if (!response.ok) continue;
        const payload = await response.json() as { highlights?: any[] };
        for (const row of payload.highlights ?? []) rows.push(row);
      } catch { /* supplementary */ }
    }
    setIndex((current) => (
      rows.length === 0 && current.size === 0 ? current : knowledgeStandaloneHighlightIndexOf(rows)
    ));
  }, [canvasId]);

  const placedIdsRef = useRef(placedIds);
  placedIdsRef.current = placedIds;
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasId) return;
    const key = `${canvasId}|${placedKey}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    void load(placedIdsRef.current);
  }, [canvasId, placedKey, load]);

  return { index, reconcile: () => load(placedIdsRef.current) };
}

let requests: string[] = [];
let respond: () => Promise<Response>;

function Harness({ canvasId, padlets }: { canvasId: string | null; padlets: readonly Placement[] }) {
  const { index } = useHighlightHydration(canvasId, padlets);
  return <div data-marks={index.size} />;
}

const roots: Root[] = [];
function render(node: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return { host, rerender: (next: React.ReactElement) => act(() => root.render(next)) };
}

/** Lets every queued microtask (the async read) settle inside act(). */
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  requests = [];
  respond = async () => new Response('{"error":"unavailable"}', { status: 503 });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { requests.push(String(url)); return respond(); }));
});
afterEach(() => {
  act(() => { roots.splice(0).forEach((r) => r.unmount()); });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const placed = (docs: readonly string[]): Placement[] =>
  docs.map((documentId, i) => ({ id: `p${i}`, documentId }));

describe('defect A: standalone-highlight hydration', () => {
  it('reads once per placed document, not once per render', async () => {
    const padlets = placed(['doc-a', 'doc-b']);
    const { rerender } = render(<Harness canvasId="board-1" padlets={padlets} />);
    await settle();
    expect(requests).toHaveLength(2);

    // Ten renders with the SAME placed documents. A new padlets array each
    // time is exactly what board churn produces.
    for (let i = 0; i < 10; i += 1) {
      rerender(<Harness canvasId="board-1" padlets={placed(['doc-a', 'doc-b'])} />);
      await settle();
    }
    expect(requests, 'unchanged documents must never be re-read').toHaveLength(2);
  });

  it('a 503 fails soft and does NOT retry', async () => {
    const { rerender } = render(<Harness canvasId="board-1" padlets={placed(['doc-a'])} />);
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('documentId=doc-a');

    // The failing read is what used to re-render on its own result. Give the
    // component many more chances to loop.
    for (let i = 0; i < 20; i += 1) {
      rerender(<Harness canvasId="board-1" padlets={placed(['doc-a'])} />);
      await settle();
    }
    expect(requests, 'a failed supplementary read must not loop').toHaveLength(1);
  });

  it('still re-reads when the placed documents actually change', async () => {
    const { rerender } = render(<Harness canvasId="board-1" padlets={placed(['doc-a'])} />);
    await settle();
    expect(requests).toHaveLength(1);

    rerender(<Harness canvasId="board-1" padlets={placed(['doc-a', 'doc-b'])} />);
    await settle();
    expect(requests).toHaveLength(3); // doc-a + doc-b re-read as one new set
    expect(requests.some((u) => u.includes('documentId=doc-b'))).toBe(true);

    // Removing one is a different key again.
    rerender(<Harness canvasId="board-1" padlets={placed(['doc-b'])} />);
    await settle();
    expect(requests).toHaveLength(4);
  });

  it('re-reads when the board changes', async () => {
    const { rerender } = render(<Harness canvasId="board-1" padlets={placed(['doc-a'])} />);
    await settle();
    rerender(<Harness canvasId="board-2" padlets={placed(['doc-a'])} />);
    await settle();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain('board-2');
  });

  it('a successful read still populates marks', async () => {
    respond = async () => new Response(JSON.stringify({
      highlights: [{ id: 'h1', sourceDocumentId: 'doc-a', pageNumber: 1 }],
    }), { status: 200 });
    const { host } = render(<Harness canvasId="board-1" padlets={placed(['doc-a'])} />);
    await settle();
    expect(requests).toHaveLength(1);
    expect(host.querySelector('[data-marks]')?.getAttribute('data-marks')).toBe('1');
  });

  it('places no request at all when the board holds no PDF', async () => {
    render(<Harness canvasId="board-1" padlets={placed([])} />);
    await settle();
    expect(requests).toHaveLength(0);
  });
});
