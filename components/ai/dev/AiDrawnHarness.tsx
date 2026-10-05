'use client';

/**
 * PATCH-283 I. The hidden developer harness for AI-drawn pictures. It calls the
 * real route (no product UI), renders each result as our SVG and as an editable
 * Excalidraw drawing, and prints a per-row report. Reports are exposed on
 * `window.__aiDrawn`. `?export=examples` instead renders the AntV example
 * templates and prints their DrawnPicture JSON -- no AI call.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import '@excalidraw/excalidraw/index.css';
import type { BinaryFileData } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import { loadAntv } from '@/lib/ai/antv/load';
import { toAntvOptions } from '@/lib/ai/antv/mapOutline';
import { HARNESS_OUTLINE } from '@/lib/ai/antv/toExcalidraw/harnessFixtures';
import { loadExcalidraw } from '@/lib/ai/antv/toExcalidraw/loadExcalidraw';
import { readSvgScene } from '@/lib/ai/antv/toExcalidraw/readSvgScene';
import { toSkeleton } from '@/lib/ai/antv/toExcalidraw/toSkeleton';
import type { PictureScene } from '@/lib/ai/antv/toExcalidraw/scene';
import { themeById } from '@/lib/ai/visualThemes';
import { drawnToScene } from '@/lib/ai/drawn/compile';
import { DRAWN_EXAMPLE_TEMPLATES } from '@/lib/ai/drawn/examples.data';
import type { DrawnPicture } from '@/lib/ai/drawn/format';
import { sceneToDrawn } from '@/lib/ai/drawn/fromScene';
import { HARNESS_DRAWN_KINDS, HARNESS_DRAWN_OUTLINES, HARNESS_DRAWN_SEEDS } from '@/lib/ai/drawn/harnessOutlines';
import type { DrawnKind } from '@/lib/ai/drawn/prompt';
import { sceneToSvg } from '@/lib/ai/drawn/toSvg';

const Excalidraw = dynamic(() => import('@excalidraw/excalidraw').then((mod) => mod.Excalidraw), { ssr: false });

declare global {
  interface Window {
    __aiDrawn?: Record<string, unknown>;
  }
}

interface DrawIssue {
  type: string;
  message: string;
}

interface DrawResult {
  picture: DrawnPicture;
  kind: DrawnKind;
  variant: number;
  seed: number;
  issues: DrawIssue[];
  fixes: string[];
  dropped: string[];
  attempts: number;
  ms: number;
}

interface Row {
  key: string;
  kind: DrawnKind;
  seed: number;
  examples: boolean;
  status: 'pending' | 'done' | 'error';
  result?: DrawResult;
  svg?: string;
  elements?: readonly ExcalidrawElement[];
  files?: Record<string, BinaryFileData>;
  error?: string;
}

async function fetchRow(kind: DrawnKind, seed: number, examples: boolean, reasoning: string, board: string): Promise<Row> {
  const res = await fetch('/api/ai/draw-picture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outline: HARNESS_DRAWN_OUTLINES[kind], kind, seed, examples, reasoning, boardId: board }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const result = (await res.json()) as DrawResult;
  const scene = drawnToScene(result.picture);
  const skeleton = toSkeleton(scene);
  const { convertToExcalidrawElements } = await loadExcalidraw();
  const elements = convertToExcalidrawElements(skeleton.elements, { regenerateIds: false });
  return {
    key: `${kind}:${seed}:${examples ? 1 : 0}`,
    kind,
    seed,
    examples,
    status: 'done',
    result,
    svg: sceneToSvg(scene),
    elements: elements as unknown as readonly ExcalidrawElement[],
    files: skeleton.files,
  };
}

function issueCounts(issues: DrawIssue[]): string {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
  return counts.size === 0 ? 'none' : [...counts.entries()].map(([type, count]) => `${type} x${count}`).join(', ');
}

function RowView({ row }: { row: Row }): ReactElement {
  return (
    <section style={{ borderTop: '1px solid #e5e7eb', padding: '16px 0' }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
        {row.key} {row.status === 'pending' ? '· running…' : row.status === 'error' ? '· FAILED' : ''}
      </h2>
      {row.error ? <p style={{ color: '#b91c1c', fontSize: 12 }}>{row.error}</p> : null}
      {row.status === 'done' && row.result ? (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <div
              style={{ flex: 1, minWidth: 0 }}
              dangerouslySetInnerHTML={{ __html: row.svg ?? '' }}
            />
            <div style={{ flex: 1, minWidth: 0, height: 520, border: '1px solid #e5e7eb' }}>
              <Excalidraw
                key={row.key}
                initialData={{
                  elements: row.elements,
                  files: row.files,
                  appState: { viewBackgroundColor: row.result.picture.background, theme: 'light' },
                  scrollToContent: true,
                }}
              />
            </div>
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <tbody>
              {(
                [
                  ['attempts', String(row.result.attempts)],
                  ['ms', String(row.result.ms)],
                  ['variant', String(row.result.variant)],
                  ['issues', issueCounts(row.result.issues)],
                  ['fixes', row.result.fixes.join('; ') || 'none'],
                  ['dropped', row.result.dropped.length ? row.result.dropped.join('; ') : 'none'],
                  ['elements', String(row.result.picture.elements.length)],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <tr key={label}>
                  <td style={{ border: '1px solid #ddd', padding: '2px 8px', fontWeight: 600 }}>{label}</td>
                  <td style={{ border: '1px solid #ddd', padding: '2px 8px' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}

function BatteryView({ kind, seed, examples, reasoning, board }: {
  kind?: string;
  seed: number;
  examples: boolean;
  reasoning: string;
  board: string;
}): ReactElement {
  const [rows, setRows] = useState<Row[]>([]);

  const tasks = useMemo(
    () =>
      kind && (HARNESS_DRAWN_KINDS as readonly string[]).includes(kind)
        ? [{ kind: kind as DrawnKind, seed, examples }]
        : HARNESS_DRAWN_KINDS.flatMap((k) => HARNESS_DRAWN_SEEDS.map((s) => ({ kind: k, seed: s, examples }))),
    [kind, seed, examples],
  );

  useEffect(() => {
    let cancelled = false;
    setRows(
      tasks.map((task) => ({
        key: `${task.kind}:${task.seed}:${task.examples ? 1 : 0}`,
        kind: task.kind,
        seed: task.seed,
        examples: task.examples,
        status: 'pending' as const,
      })),
    );

    let index = 0;
    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const current = index;
        index += 1;
        if (current >= tasks.length) return;
        const task = tasks[current];
        const key = `${task.kind}:${task.seed}:${task.examples ? 1 : 0}`;
        try {
          const row = await fetchRow(task.kind, task.seed, task.examples, reasoning, board);
          if (cancelled) return;
          window.__aiDrawn = { ...(window.__aiDrawn ?? {}), [key]: row.result };
          setRows((previous) => previous.map((entry) => (entry.key === key ? row : entry)));
        } catch (error) {
          if (cancelled) return;
          setRows((previous) =>
            previous.map((entry) => (entry.key === key ? { ...entry, status: 'error', error: String(error) } : entry)),
          );
        }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [tasks, reasoning, board]);

  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>AI-drawn pictures spike (dev only)</h1>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Each row: our SVG (left), editable Excalidraw of the same scene (right), report. Reports are on{' '}
        <code>window.__aiDrawn</code>. No product UI uses this.
      </p>
      {rows.map((row) => (
        <RowView key={row.key} row={row} />
      ))}
    </main>
  );
}

// ---------------------------------------------------------------------------
// ?export=examples -- no AI call.
// ---------------------------------------------------------------------------

interface AntvInstance {
  on?: (event: string, callback: () => void) => void;
  render?: () => void;
  destroy?: () => void;
}

function renderTemplateScene(
  Ctor: new (options: Record<string, unknown>) => AntvInstance,
  container: HTMLElement,
  template: string,
): Promise<PictureScene> {
  return new Promise((resolve, reject) => {
    const ig = new Ctor({
      ...toAntvOptions(HARNESS_OUTLINE, template, 'classic'),
      container,
      width: '100%',
      height: 'auto',
      editable: false,
    });
    ig.on?.('error', () => reject(new Error(`AntV render failed: ${template}`)));
    ig.on?.('loaded', () => {
      const svg = container.querySelector('svg');
      if (!svg) {
        reject(new Error(`AntV produced no <svg>: ${template}`));
        return;
      }
      try {
        const scene = readSvgScene(svg, { background: themeById('classic').background });
        ig.destroy?.();
        resolve(scene);
      } catch (error) {
        ig.destroy?.();
        reject(error);
      }
    });
    ig.render?.();
  });
}

function DrawnExamplesExportView(): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('Starting…');
  const [items, setItems] = useState<Array<{ key: string; json: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const mod = await loadAntv();
      const Ctor = mod.Infographic as unknown as new (options: Record<string, unknown>) => AntvInstance;
      const out: Array<{ key: string; json: string }> = [];
      for (const kind of HARNESS_DRAWN_KINDS) {
        for (const template of DRAWN_EXAMPLE_TEMPLATES[kind]) {
          if (cancelled || !hostRef.current) return;
          setStatus(`Rendering ${out.length + 1}: ${template}…`);
          const container = hostRef.current;
          container.innerHTML = '';
          const scene = await renderTemplateScene(Ctor, container, template);
          out.push({ key: `${kind}:${template}`, json: JSON.stringify(sceneToDrawn(scene)) });
        }
      }
      if (!cancelled) {
        setItems(out);
        setStatus(`Done: ${out.length} examples`);
      }
    };
    run().catch((error: unknown) => setStatus(`Failed: ${String(error)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>AI-drawn example export (dev only)</h1>
      <p style={{ fontSize: 12, color: '#6b7280' }}>{status}</p>
      <div ref={hostRef} style={{ border: '1px solid #e5e7eb', width: 720 }} />
      {items.map((item) => (
        <pre
          key={item.key}
          data-drawn-example={item.key}
          style={{ fontSize: 11, maxHeight: 240, overflow: 'auto', background: '#f9fafb', padding: 8 }}
        >
          {item.json}
        </pre>
      ))}
    </main>
  );
}

export default function AiDrawnHarness({
  kind,
  seed,
  examples,
  reasoning,
  board,
  export: exportMode,
}: {
  kind?: string;
  seed?: string;
  examples?: string;
  reasoning?: string;
  board?: string;
  export?: string;
}): ReactElement {
  if (exportMode === 'examples') return <DrawnExamplesExportView />;
  const numericSeed = Number(seed);
  return (
    <BatteryView
      kind={kind}
      seed={Number.isFinite(numericSeed) ? numericSeed : 0}
      examples={examples !== '0'}
      reasoning={reasoning === 'auto' ? 'auto' : 'off'}
      board={board ?? ''}
    />
  );
}
