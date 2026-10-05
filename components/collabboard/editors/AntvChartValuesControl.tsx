'use client';

/**
 * PATCH-287. "Edit values" for an AntV chart inserted from the drawing library.
 * It subscribes to the Excalidraw API, finds the selected chart, lets the user
 * change its label/value rows and redraws it through the pure redraw core. All
 * logic lives in `lib/ai/antv/chartValues`; this file is UI only.
 */

import React from 'react';

import { isAntvPieTemplate } from '@/lib/ai/antv/chartValues/data';
import {
  findSelectedChart,
  planRows,
  readCanvasTexts,
  type ChartRow,
  type SelectedChart,
} from '@/lib/ai/antv/chartValues/redraw';
import { redrawChart, type ExcalidrawApiLike } from '@/lib/ai/antv/chartValues/redrawChart';

import { editButtonStyle, inputStyle, panelStyle, rowStyle } from './AntvChartValuesControl.styles';

export interface AntvChartValuesControlProps {
  getApi: () => ExcalidrawApiLike | null;
  apiVersion?: number;
  readOnly?: boolean;
}

interface DraftRow {
  key: string;
  from: number | null;
  label: string;
  value: string;
}

function errorFor(row: DraftRow): string | null {
  if (!row.label.trim()) return 'Label is required';
  const value = Number(row.value);
  if (row.value.trim() === '' || !Number.isFinite(value) || value < 0) {
    return 'Value must be a number ≥ 0';
  }
  return null;
}

export default function AntvChartValuesControl({
  getApi,
  apiVersion = 0,
  readOnly = false,
}: AntvChartValuesControlProps): React.ReactElement | null {
  const [chart, setChart] = React.useState<SelectedChart | null>(null);
  const [openGroupId, setOpenGroupId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const signature = React.useRef('');
  const nextKey = React.useRef(0);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    const api = getApi();
    if (!api) {
      setChart(null);
      return;
    }
    const update = () => {
      const appState = api.getAppState();
      const selected = appState.selectedElementIds ?? {};
      const ids = Object.keys(selected)
        .filter((id) => selected[id])
        .sort()
        .join(',');
      if (ids === signature.current) return;
      signature.current = ids;
      const found = findSelectedChart(api.getSceneElements(), appState);
      setChart(found);
      setOpenGroupId((current) => (current && found?.groupId !== current ? null : current));
    };
    update();
    return api.onChange(update);
  }, [getApi, apiVersion]);

  if (readOnly) return null;

  // Addendum 2: the public API has no `focusContainer`, so after the panel
  // unmounts hand focus to the Excalidraw container rendered beside this control.
  const focusCanvas = () => {
    setTimeout(() => {
      const container = rootRef.current?.parentElement?.querySelector<HTMLElement>('.excalidraw-container');
      container?.focus();
    }, 0);
  };

  const close = () => {
    setOpenGroupId(null);
    setErrors({});
    setError(null);
    focusCanvas();
  };

  const open = () => {
    const api = getApi();
    // Addendum 1, item 3: never trust the cached chart; re-read the live scene.
    const fresh = api ? findSelectedChart(api.getSceneElements(), api.getAppState()) : null;
    if (!fresh || (chart && fresh.groupId !== chart.groupId)) {
      setError('Select the chart again');
      return;
    }
    setChart(fresh);
    const texts = readCanvasTexts(fresh.elements);
    setRows(
      planRows(fresh.data, texts).map((row) => ({
        key: row.key,
        from: row.from,
        label: row.label,
        value: String(row.value),
      })),
    );
    setErrors({});
    setError(null);
    setOpenGroupId(fresh.groupId);
  };

  const stop = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    nextKey.current += 1;
    setRows((current) => [
      ...current,
      { key: `new-${nextKey.current}`, from: null, label: 'New slice', value: '0' },
    ]);
  };

  const removeRow = (key: string) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));
  };

  const apply = async () => {
    const nextErrors: Record<string, string> = {};
    for (const row of rows) {
      const message = errorFor(row);
      if (message) nextErrors[row.key] = message;
    }
    const isPie = isAntvPieTemplate(chart?.data.template ?? '');
    if (isPie && !rows.some((row) => Number(row.value) > 0)) {
      nextErrors.__pie = 'At least one value must be greater than 0';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const api = getApi();
    if (!api || !chart) return;
    // Addendum 1, item 3: re-read the live chart, so a colour/text changed while
    // the chart stayed selected is carried, and a vanished chart does nothing.
    const fresh = findSelectedChart(api.getSceneElements(), api.getAppState());
    if (!fresh || fresh.groupId !== chart.groupId) {
      setError('Select the chart again');
      return;
    }
    setBusy(true);
    setError(null);
    const chartRows: ChartRow[] = rows.map((row) => ({
      key: row.key,
      from: row.from,
      label: row.label.trim(),
      value: Number(row.value),
    }));
    const result = await redrawChart(api, fresh, chartRows);
    if (result.ok) close();
    else setError(result.error);
    setBusy(false);
  };

  const isPie = chart ? isAntvPieTemplate(chart.data.template) : false;
  const total = rows.reduce((sum, row) => {
    const value = Number(row.value);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);

  return (
    <span ref={rootRef} style={{ display: 'contents' }}>
      {chart && openGroupId === null ? (
        <button type="button" data-antv-chart-edit onClick={open} style={editButtonStyle}>
          Edit values
        </button>
      ) : null}
      {chart && openGroupId !== null ? (
        <aside
          data-antv-chart-panel
          style={panelStyle}
          onKeyDown={stop}
          onKeyUp={stop}
          onKeyPress={stop}
          aria-label="Chart values"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Chart values</strong>
            <button type="button" data-antv-chart-cancel onClick={close} style={{ cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
          {rows.map((row) => {
            const value = Number(row.value);
            const share = total > 0 && Number.isFinite(value) ? Math.round((value / total) * 100) : 0;
            return (
              <div key={row.key} data-antv-chart-row style={rowStyle}>
                <input
                  data-antv-chart-label
                  style={inputStyle}
                  value={row.label}
                  onChange={(event) => updateRow(row.key, { label: event.target.value })}
                />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    data-antv-chart-value
                    type="number"
                    min={0}
                    step="any"
                    style={inputStyle}
                    value={row.value}
                    onChange={(event) => updateRow(row.key, { value: event.target.value })}
                  />
                  {isPie ? <span data-antv-chart-share>{share}%</span> : null}
                  <button
                    type="button"
                    data-antv-chart-remove
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(row.key)}
                    style={{ cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
                {errors[row.key] ? (
                  <p data-antv-chart-row-error style={{ color: '#b91c1c', margin: 0 }}>
                    {errors[row.key]}
                  </p>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            data-antv-chart-add
            disabled={rows.length >= 10}
            onClick={addRow}
            style={{ marginTop: 6, cursor: 'pointer' }}
          >
            Add row
          </button>
          {errors.__pie ? (
            <p data-antv-chart-row-error style={{ color: '#b91c1c' }}>
              {errors.__pie}
            </p>
          ) : null}
          {error ? (
            <p data-antv-chart-error style={{ color: '#b91c1c' }}>
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <button type="button" data-antv-chart-apply disabled={busy} onClick={apply} style={{ cursor: 'pointer' }}>
              {busy ? 'Redrawing…' : 'Apply'}
            </button>
          </div>
        </aside>
      ) : null}
    </span>
  );
}
