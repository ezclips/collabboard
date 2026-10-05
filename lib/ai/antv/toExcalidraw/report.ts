/**
 * PATCH-277. Pure coverage/fidelity measurements, computed from the SOURCE
 * `PictureScene` and the CONVERTED Excalidraw elements. Nothing here trusts the
 * converter: it re-reads the scene's expected boxes and colours and looks for
 * them in the output, so a broken conversion shows up as a miss.
 */

import type { PictureScene, PictureSceneLosses, SceneElement, ScenePoint, SceneSkip } from './scene';

export interface ReportElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
  strokeColor?: string;
  groupIds?: string[];
  customData?: Record<string, unknown> | null;
}

export interface ReportInput {
  scene: PictureScene;
  elements: readonly ReportElement[];
  files: Record<string, { dataURL: string }>;
  conversionMs: number;
  /** Addendum 3. One-time Excalidraw module load; informational, not a gate. */
  moduleLoadMs?: number;
  template?: string;
  theme?: string;
}

export interface Coverage {
  ratio: number;
  passed: boolean;
}

export interface SpikeReport {
  template?: string;
  theme?: string;
  textCoverage: Coverage & { total: number; missing: string[]; extra: string[] };
  shapeCoverage: Coverage & { total: number; converted: number; unknown: number; skipped: SceneSkip[] };
  iconCoverage: Coverage & { total: number; converted: number };
  colourFidelity: Coverage & { total: number; mismatches: string[] };
  geometry: Coverage & { total: number; converted: number; mismatches: string[] };
  conversionMs: number;
  passedTime: boolean;
  /** Addendum 3. How long the (one-time) Excalidraw module load took. */
  moduleLoadMs: number;
  elementCount: number;
  jsonBytes: number;
  losses: PictureSceneLosses & { pillApproximated: number };
  passed: boolean;
}

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function ratio(passed: number, total: number): Coverage {
  const value = total === 0 ? 1 : passed / total;
  return { ratio: value, passed: value >= 1 };
}

function byAntvId(elements: readonly ReportElement[]): Map<string, ReportElement> {
  const map = new Map<string, ReportElement>();
  for (const element of elements) {
    const id = element.customData?.antvId;
    if (typeof id === 'string') map.set(id, element);
  }
  return map;
}

function colourValue(value: string | undefined): string {
  if (!value) return 'transparent';
  const lower = value.trim().toLowerCase();
  return lower === '' ? 'transparent' : lower;
}

function expectedFill(el: SceneElement): string {
  if (el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'polyline') return el.paint.fill;
  return 'transparent';
}

function expectedStroke(el: SceneElement): string {
  if (el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'polyline') return el.paint.stroke;
  return el.kind === 'text' ? el.color : 'transparent';
}

function bboxOf(points: readonly ScenePoint[]): { x: number; y: number; width: number; height: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function isShape(el: SceneElement): boolean {
  return el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'polyline';
}

function isImage(el: SceneElement): el is Extract<SceneElement, { kind: 'image' }> {
  return el.kind === 'image';
}

export function buildReport(input: ReportInput): SpikeReport {
  const { scene, elements, files } = input;
  const output = byAntvId(elements);

  // Text coverage: each non-empty source string must appear in exactly one
  // output text (whitespace-normalised).
  const sourceStrings = scene.elements
    .filter((el): el is Extract<SceneElement, { kind: 'text' }> => el.kind === 'text')
    .map((el) => normalise(el.text))
    .filter(Boolean);
  const outputStrings = elements
    .filter((element) => element.type === 'text')
    .map((element) => normalise(String((element as { text?: string }).text ?? '')));
  // Addendum 1: a MULTISET comparison. Source pictures legitimately repeat text
  // ("Seasonal plan" is title AND root node; "S" in SWOT; an axis tick and its
  // value label may coincide), so we compare per-string COUNTS, not presence.
  const sourceCounts = new Map<string, number>();
  for (const value of sourceStrings) {
    sourceCounts.set(value, (sourceCounts.get(value) ?? 0) + 1);
  }
  const outputCounts = new Map<string, number>();
  for (const value of outputStrings) {
    outputCounts.set(value, (outputCounts.get(value) ?? 0) + 1);
  }
  const missing: string[] = [];
  const extra: string[] = [];
  let textMatched = 0;
  for (const [value, sourceCount] of sourceCounts) {
    const outputCount = outputCounts.get(value) ?? 0;
    textMatched += Math.min(sourceCount, outputCount);
    for (let i = outputCount; i < sourceCount; i += 1) missing.push(value);
  }
  for (const [value, outputCount] of outputCounts) {
    const sourceCount = sourceCounts.get(value) ?? 0;
    for (let i = sourceCount; i < outputCount; i += 1) extra.push(value);
  }
  const textCoverage = {
    ...ratio(textMatched, sourceStrings.length),
    passed: missing.length === 0 && extra.length === 0,
    total: sourceStrings.length,
    missing,
    extra,
  };

  // Shape coverage: every visible source shape must have an output element.
  const shapeElements = scene.elements.filter(isShape);
  const convertedShapes = shapeElements.filter((el) => output.has(el.id)).length;
  const unknown = scene.skips.filter((skip) => skip.reason === 'unknown').length;
  const shapeCoverage = {
    ratio: shapeElements.length === 0 ? 1 : convertedShapes / shapeElements.length,
    passed: convertedShapes === shapeElements.length && unknown === 0,
    total: shapeElements.length,
    converted: convertedShapes,
    unknown,
    skipped: scene.skips,
  };

  // Icon coverage: a resolvable `<use>` icon converted in EITHER mode counts.
  // Image mode: its picture element is present. Strokes mode: at least one
  // output element carries the icon's shared `icon:<n>` group (PATCH-281).
  const imageIcons = scene.elements.filter(isImage).filter((el) => el.fromIcon);
  const strokeIconGroups = new Set<string>();
  for (const el of scene.elements) {
    const group = el.groupIds.find((value) => value.startsWith('icon:'));
    if (group) strokeIconGroups.add(group);
  }
  let convertedIcons = imageIcons.filter((el) => output.get(el.id)?.type === 'image').length;
  for (const group of strokeIconGroups) {
    if (elements.some((element) => element.groupIds?.includes(group))) convertedIcons += 1;
  }
  const iconTotal = imageIcons.length + strokeIconGroups.size;
  const iconCoverage = {
    ...ratio(convertedIcons, iconTotal),
    total: iconTotal,
    converted: convertedIcons,
  };

  // Colour fidelity: every converted fill/stroke equals the paint rule's hex.
  const colourTargets = scene.elements.filter((el) => el.kind !== 'image');
  const mismatches: string[] = [];
  let colourOk = 0;
  for (const el of colourTargets) {
    const element = output.get(el.id);
    if (!element) {
      mismatches.push(`${el.id}: missing`);
      continue;
    }
    const fillExpected = expectedFill(el);
    const strokeExpected = expectedStroke(el);
    const fillActual = colourValue(element.backgroundColor);
    const strokeActual = colourValue(element.strokeColor);
    const fillWanted = fillExpected === 'none' ? 'transparent' : fillExpected.toLowerCase();
    const strokeWanted = strokeExpected === 'none' ? 'transparent' : strokeExpected.toLowerCase();
    if (fillActual === fillWanted && strokeActual === strokeWanted) colourOk += 1;
    else mismatches.push(`${el.id}: fill ${fillActual}/${fillWanted}, stroke ${strokeActual}/${strokeWanted}`);
  }
  const colourFidelity = { ...ratio(colourOk, colourTargets.length), total: colourTargets.length, mismatches };

  // Geometry: rect/ellipse/image within 1 unit; polygons within 2.
  const geometryTargets = scene.elements.filter((el) => el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'image' || el.kind === 'polyline');
  const geometryMismatches: string[] = [];
  let geometryOk = 0;
  for (const el of geometryTargets) {
    const element = output.get(el.id);
    if (!element) {
      geometryMismatches.push(`${el.id}: missing`);
      continue;
    }
    const expected = el.kind === 'polyline' ? bboxOf(el.points) : el.box;
    if (!expected) {
      geometryMismatches.push(`${el.id}: no expected box`);
      continue;
    }
    const tolerance = el.kind === 'polyline' ? 2 : 1;
    const dx = Math.max(Math.abs(element.x - expected.x), Math.abs(element.x + element.width - (expected.x + expected.width)));
    const dy = Math.max(Math.abs(element.y - expected.y), Math.abs(element.y + element.height - (expected.y + expected.height)));
    if (dx <= tolerance && dy <= tolerance) geometryOk += 1;
    else geometryMismatches.push(`${el.id}: dx ${dx.toFixed(2)} dy ${dy.toFixed(2)}`);
  }
  const geometry = {
    ratio: geometryTargets.length === 0 ? 1 : geometryOk / geometryTargets.length,
    passed: geometryOk === geometryTargets.length,
    total: geometryTargets.length,
    converted: geometryOk,
    mismatches: geometryMismatches,
  };

  const pillApproximated = scene.elements.filter(
    (el) => el.kind === 'rect' && el.pill && output.get(el.id)?.type === 'rectangle',
  ).length;

  const elementCount = elements.length;
  let jsonBytes = 0;
  try {
    jsonBytes = new TextEncoder().encode(JSON.stringify({ elements, files })).length;
  } catch {
    jsonBytes = 0;
  }

  const passedTime = input.conversionMs < 150;
  const passed =
    textCoverage.passed &&
    shapeCoverage.passed &&
    iconCoverage.passed &&
    colourFidelity.passed &&
    geometry.passed &&
    passedTime &&
    shapeCoverage.unknown === 0;

  return {
    template: input.template,
    theme: input.theme,
    textCoverage,
    shapeCoverage,
    iconCoverage,
    colourFidelity,
    geometry,
    conversionMs: Math.round(input.conversionMs * 100) / 100,
    passedTime,
    moduleLoadMs: Math.round((input.moduleLoadMs ?? 0) * 100) / 100,
    elementCount,
    jsonBytes,
    losses: { ...scene.losses, pillApproximated },
    passed,
  };
}
