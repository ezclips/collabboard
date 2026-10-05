'use client';

/**
 * PATCH-287. The thin browser shell around the pure redraw core: render the old
 * and the next data, carry the user's edits over, and replace the chart's
 * elements in ONE undoable `updateScene`. If anything throws before that call,
 * the scene is untouched.
 */

import { antvChartDataSchema, chartDataToOutline } from './data';
import {
  buildNextData,
  carryOver,
  readCanvasTexts,
  replaceChartInScene,
  type ChartRow,
  type ChartSceneElement,
  type SelectedChart,
} from './redraw';
import { renderAntvToElements } from './render';

export interface ExcalidrawApiLike {
  getSceneElements: () => readonly ChartSceneElement[];
  getAppState: () => {
    selectedElementIds?: Record<string, boolean>;
    selectedGroupIds?: Record<string, boolean>;
  };
  updateScene: (sceneData: Record<string, unknown>) => void;
  onChange: (callback: (elements?: unknown, appState?: unknown) => void) => () => void;
}

export type RedrawResult = { ok: true } | { ok: false; error: string };

/** Redraw `chart` with `rows` into the live Excalidraw scene. */
export async function redrawChart(
  api: ExcalidrawApiLike,
  chart: SelectedChart,
  rows: readonly ChartRow[],
): Promise<RedrawResult> {
  try {
    const oldData = chart.data;
    const canvasTexts = readCanvasTexts(chart.elements);
    const nextData = buildNextData(oldData, canvasTexts, rows);
    if (!antvChartDataSchema.safeParse(nextData).success) {
      return { ok: false, error: 'The chart values are not valid.' };
    }

    const indexMap: Array<number | null> = new Array(oldData.items.length).fill(null);
    rows.forEach((row, newIndex) => {
      if (row.from !== null && row.from >= 0 && row.from < indexMap.length) {
        indexMap[row.from] = newIndex;
      }
    });

    const oldRender = await renderAntvToElements({
      template: oldData.template,
      theme: oldData.theme,
      outline: chartDataToOutline(oldData),
    });
    const nextRender = await renderAntvToElements({
      template: nextData.template,
      theme: nextData.theme,
      outline: chartDataToOutline(nextData),
    });

    const newElements = carryOver({
      oldRender: oldRender.elements as unknown as ChartSceneElement[],
      current: chart.elements,
      nextRender: nextRender.elements as unknown as ChartSceneElement[],
      indexMap,
      oldCount: oldData.items.length,
      nextCount: nextData.items.length,
      nextData,
    });

    const elements = replaceChartInScene(api.getSceneElements(), chart.groupId, newElements);
    const selectedElementIds: Record<string, boolean> = {};
    for (const element of newElements) selectedElementIds[element.id] = true;

    api.updateScene({
      elements,
      appState: {
        selectedGroupIds: { [chart.groupId]: true },
        selectedElementIds,
      },
      // Addendum 1, item 7: the literal value of CaptureUpdateAction.IMMEDIATELY.
      // Importing the constant would pull the whole Excalidraw runtime into this
      // module's static graph; the wrapper loads the editor lazily on purpose.
      captureUpdate: 'IMMEDIATELY',
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
