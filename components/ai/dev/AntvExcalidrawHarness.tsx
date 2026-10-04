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
  HARNESS_OUTLINE,
  selectedRows,
  type HarnessRow,
} from '@/lib/ai/antv/toExcalidraw/harnessFixtures';

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
        `icons ${report.losses.iconsAsImage}, mixed ${report.losses.mixedTextStyle}`,
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

function HarnessRowView({ row, pill }: { row: HarnessRow; pill: PillMode }): ReactElement {
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
  }, [row.template, row.theme, pill, background]);

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

export default function AntvExcalidrawHarness({
  template,
  theme,
  pill,
}: {
  template?: string;
  theme?: string;
  pill?: string;
}): ReactElement {
  const rows = useMemo(() => selectedRows(template ?? null, theme ?? null), [template, theme]);
  // Addendum 4: exact capsule outline is the default; `?pill=rectangle` restores
  // the legacy ADAPTIVE_RADIUS rounded box.
  const pillMode: PillMode = pill === 'rectangle' ? 'rectangle' : 'polygon';
  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>AntV → Excalidraw spike (dev only)</h1>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Each row: AntV picture (left), editable Excalidraw drawing (right), conversion report.
        Reports are also on <code>window.__antvExcalidrawSpike</code>.
      </p>
      {rows.map((row) => (
        <HarnessRowView key={`${row.template}:${row.theme}`} row={row} pill={pillMode} />
      ))}
    </main>
  );
}
