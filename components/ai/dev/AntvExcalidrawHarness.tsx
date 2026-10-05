'use client';

/**
 * PATCH-277. The hidden developer harness. For each design row it draws the
 * AntV picture the renderer would draw (same `loadAntv` + `toAntvOptions` path,
 * no editor code) next to the converted drawing in a REAL editable
 * `<Excalidraw>`, with the conversion report underneath and exposed on
 * `window.__antvExcalidrawSpike` for the CTO's browser.
 *
 * `EXCALIDRAW_ASSET_PATH` is deliberately NOT set here, so the CTO can see
 * which font requests the editor makes on its own.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import '@excalidraw/excalidraw/index.css';
import type { BinaryFileData } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import { loadAntv } from '@/lib/ai/antv/load';
import { toAntvOptions } from '@/lib/ai/antv/mapOutline';
import { themeById } from '@/lib/ai/visualThemes';
import { convertAntvSvg } from '@/lib/ai/antv/toExcalidraw';
import type { SpikeReport } from '@/lib/ai/antv/toExcalidraw';
import {
  ANTV_LIBRARY_TEMPLATES,
  serializeAntvLibrary,
  type AntvLibraryItemInput,
} from '@/lib/ai/antv/toExcalidraw/libraryTemplates';
import { stableHash } from '@/lib/ai/antv/toExcalidraw/toSkeleton';
import {
  HARNESS_OUTLINE,
  selectedRows,
  type HarnessRow,
} from '@/lib/ai/antv/toExcalidraw/harnessFixtures';
import { isAntvChartTemplate, type AntvChartData } from '@/lib/ai/antv/chartValues/data';
import { renderAntvToElements } from '@/lib/ai/antv/chartValues/render';

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((mod) => mod.Excalidraw),
  { ssr: false },
);

declare global {
  interface Window {
    __antvExcalidrawSpike?: Record<string, SpikeReport>;
    /** Addendum 2: the converted Excalidraw elements, for the CTO's check. */
    __antvExcalidrawElements?: Record<string, unknown>;
  }
}

type PillMode = 'rectangle' | 'polygon';
type IconMode = 'image' | 'strokes';

interface AntvInstance {
  on?: (event: string, callback: () => void) => void;
  render?: () => void;
  destroy?: () => void;
}

interface Converted {
  elements: readonly ExcalidrawElement[];
  files: Record<string, BinaryFileData>;
  report: SpikeReport;
}

function ReportTable({ report }: { report: SpikeReport }): ReactElement {
  const lines: Array<[string, string]> = [
    ['text coverage', `${Math.round(report.textCoverage.ratio * 100)}%`],
    ['shape coverage', `${report.shapeCoverage.converted}/${report.shapeCoverage.total} (unknown ${report.shapeCoverage.unknown})`],
    ['icon coverage', `${report.iconCoverage.converted}/${report.iconCoverage.total}`],
    ['colour fidelity', `${Math.round(report.colourFidelity.ratio * 100)}%`],
    ['geometry', `${report.geometry.converted}/${report.geometry.total}`],
    ['conversion time', `${report.conversionMs} ms ${report.passedTime ? 'OK' : 'SLOW'}`],
    ['module load', `${report.moduleLoadMs} ms (one-time, excluded)`],
    ['size', `${report.elementCount} elements, ${report.jsonBytes} bytes`],
    [
      'losses',
      `blended ${report.losses.blended}, gradient ${report.losses.gradientFlattened}, ` +
        `pill-approx ${report.losses.pillApproximated}, clip ${report.losses.clipIgnored}, ` +
        `bold ${report.losses.lostFontWeight}, italic ${report.losses.lostFontStyle}, ` +
        `icons ${report.losses.iconsAsImage}, stroke-icons ${report.losses.iconsAsStrokes}, ` +
        `pattern ${report.losses.patternIgnored}, mixed ${report.losses.mixedTextStyle}`,
    ],
    ['pass', report.passed ? 'YES' : 'NO'],
  ];
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
      <tbody>
        {lines.map(([label, value]) => (
          <tr key={label}>
            <td style={{ border: '1px solid #ddd', padding: '2px 8px', fontWeight: 600 }}>{label}</td>
            <td style={{ border: '1px solid #ddd', padding: '2px 8px' }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HarnessRowView({ row, pill, icons }: { row: HarnessRow; pill: PillMode; icons: IconMode }): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [converted, setConverted] = useState<Converted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const background = themeById(row.theme).background;

  useEffect(() => {
    let cancelled = false;
    let instance: AntvInstance | null = null;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    setConverted(null);
    setError(null);

    loadAntv()
      .then((mod) => {
        if (cancelled || !hostRef.current) return;
        const Ctor = mod.Infographic as unknown as new (options: Record<string, unknown>) => AntvInstance;
        const ig = new Ctor({
          ...toAntvOptions(HARNESS_OUTLINE, row.template, row.theme),
          container: hostRef.current,
          width: '100%',
          height: 'auto',
          editable: false,
        });
        instance = ig;
        ig.on?.('error', () => {
          if (!cancelled) setError('AntV render failed');
        });
        ig.on?.('loaded', () => {
          if (cancelled || !hostRef.current) return;
          const svg = hostRef.current.querySelector('svg');
          if (!svg) {
            setError('AntV produced no <svg>');
            return;
          }
          convertAntvSvg(svg, {
            background,
            template: row.template,
            theme: row.theme,
            pill,
            icons,
          })
            .then((result) => {
              if (cancelled) return;
              setConverted({ elements: result.elements, files: result.files, report: result.report });
              window.__antvExcalidrawSpike = {
                ...(window.__antvExcalidrawSpike ?? {}),
                [`${row.template}:${row.theme}`]: result.report,
              };
              window.__antvExcalidrawElements = {
                ...(window.__antvExcalidrawElements ?? {}),
                [`${row.template}:${row.theme}`]: result.elements,
              };
            })
            .catch((cause: unknown) => {
              if (!cancelled) setError(String(cause));
            });
        });
        ig.render?.();
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });

    return () => {
      cancelled = true;
      try {
        instance?.destroy?.();
      } catch {
        // destroying a half-rendered instance must not break the harness
      }
      if (host) host.innerHTML = '';
    };
  }, [row.template, row.theme, pill, icons, background]);

  return (
    <section style={{ borderTop: '1px solid #e5e7eb', padding: '16px 0' }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
        {row.template} · {row.theme}
      </h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div ref={hostRef} style={{ border: '1px solid #e5e7eb', background }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, height: 520, border: '1px solid #e5e7eb' }}>
          {converted ? (
            <Excalidraw
              key={`${row.template}:${row.theme}:${pill}`}
              initialData={{
                elements: converted.elements,
                files: converted.files,
                appState: { viewBackgroundColor: background, theme: 'light' },
                scrollToContent: true,
              }}
            />
          ) : (
            <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>{error ?? 'Converting…'}</p>
          )}
        </div>
      </div>
      {converted ? <ReportTable report={converted.report} /> : null}
    </section>
  );
}

/**
 * PATCH-282. The library export view. It renders the curated templates ONE AT A
 * TIME through a single AntV container (not 74 instances at once), converts each
 * with icons as strokes, normalises it to the origin, and finally prints the
 * complete same-origin `.excalidrawlib` file in one `<pre data-antv-library>`.
 * The CTO copies that text into `public/libraries/antv-diagrams.excalidrawlib`.
 */

function withStableIds(template: string, elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.map((element, index) => ({
    ...element,
    id: `antv-${stableHash(`${template}:${index}`)}`,
  })) as ExcalidrawElement[];
}

function normaliseToOrigin(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  if (elements.length === 0) return [];
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  return elements.map((element) => ({
    ...element,
    x: element.x - minX,
    y: element.y - minY,
  })) as ExcalidrawElement[];
}

/**
 * PATCH-287. The chart data the library export attaches to every element of a
 * chart item, so the editor can offer "Edit values" after insert.
 */
function chartDataFor(template: string): AntvChartData {
  return {
    v: 1,
    template: template as AntvChartData['template'],
    theme: 'classic',
    title: HARNESS_OUTLINE.title,
    items: HARNESS_OUTLINE.items.map((item) => ({
      label: item.label,
      value: item.value ?? 0,
      ...(item.detail ? { detail: item.detail } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
    })),
  };
}

function attachChartData(
  elements: readonly ExcalidrawElement[],
  data: AntvChartData,
): ExcalidrawElement[] {
  return elements.map((element) => ({
    ...element,
    customData: { ...(element.customData ?? {}), antvChart: data },
  })) as ExcalidrawElement[];
}

function AntvLibraryExportView(): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('Starting…');
  const [libraryJson, setLibraryJson] = useState('');
  const [byteSize, setByteSize] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const libraryItems: AntvLibraryItemInput[] = [];
      for (const entry of ANTV_LIBRARY_TEMPLATES) {
        if (cancelled || !hostRef.current) return;
        setStatus(`Rendering ${libraryItems.length + 1}/${ANTV_LIBRARY_TEMPLATES.length}: ${entry.template}…`);
        const container = hostRef.current;
        container.innerHTML = '';
        const rendered = await renderAntvToElements({
          template: entry.template,
          theme: 'classic',
          outline: HARNESS_OUTLINE,
          container,
        });
        if (cancelled) return;
        const elements = isAntvChartTemplate(entry.template)
          ? attachChartData(rendered.elements, chartDataFor(entry.template))
          : rendered.elements;
        libraryItems.push({
          id: `antv:${entry.template}`,
          status: 'published',
          created: 0,
          name: `${entry.section} · ${entry.name}`,
          elements: normaliseToOrigin(
            withStableIds(entry.template, elements),
          ) as unknown as Array<Record<string, unknown>>,
        });
      }
      // Addendum 1: compact JSON, rounded floats, no customData -- the budget is
      // 2.5 MB and pretty-printing alone nearly doubled it.
      const json = serializeAntvLibrary(libraryItems);
      if (cancelled) return;
      setLibraryJson(json);
      setByteSize(new TextEncoder().encode(json).length);
      setStatus(`Done: ${libraryItems.length} templates`);
    };
    run().catch((cause: unknown) => {
      if (!cancelled) {
        setFailed(true);
        setStatus(`Failed: ${String(cause)}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>AntV → Excalidraw library export (dev only)</h1>
      <p style={{ fontSize: 12, color: failed ? '#b91c1c' : '#6b7280' }}>{status}</p>
      <div ref={hostRef} style={{ border: '1px solid #e5e7eb', width: 720 }} />
      {libraryJson ? (
        <>
          <p data-antv-library-bytes style={{ fontSize: 12 }}>
            {byteSize} bytes
          </p>
          <pre
            data-antv-library
            style={{ fontSize: 11, maxHeight: 480, overflow: 'auto', background: '#f9fafb', padding: 8 }}
          >
            {libraryJson}
          </pre>
        </>
      ) : null}
    </main>
  );
}

export default function AntvExcalidrawHarness({
  template,
  theme,
  pill,
  icons,
  export: exportMode,
}: {
  template?: string;
  theme?: string;
  pill?: string;
  icons?: string;
  export?: string;
}): ReactElement {
  const rows = useMemo(() => selectedRows(template ?? null, theme ?? null), [template, theme]);
  // Addendum 4: exact capsule outline is the default; `?pill=rectangle` restores
  // the legacy ADAPTIVE_RADIUS rounded box.
  const pillMode: PillMode = pill === 'rectangle' ? 'rectangle' : 'polygon';
  // PATCH-281: `?icons=strokes` emits editabe icon geometry for the library path.
  const iconMode: IconMode = icons === 'strokes' ? 'strokes' : 'image';
  // PATCH-282: `?export=library` switches to the whole-library export view.
  if (exportMode === 'library') {
    return <AntvLibraryExportView />;
  }
  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>AntV → Excalidraw spike (dev only)</h1>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Each row: AntV picture (left), editable Excalidraw drawing (right), conversion report.
        Reports are also on <code>window.__antvExcalidrawSpike</code>.
      </p>
      {rows.map((row) => (
        <HarnessRowView key={`${row.template}:${row.theme}`} row={row} pill={pillMode} icons={iconMode} />
      ))}
    </main>
  );
}
