/**
 * PATCH-284. Pure helpers for the drawn generator options: subtype -> kind,
 * seed choice and route response -> `DesignSuggestion`. Kept out of the hook so
 * each rule is unit-testable without React.
 */

import type { PictureScene } from '@/lib/ai/antv/toExcalidraw/scene';
import type { DiagramSubtype, DrawnDiagramData } from '@/lib/ai/contracts';
import type { DrawnPicture } from '@/lib/ai/drawn/format';
import { parseDrawnPicture } from '@/lib/ai/drawn/format';
import type { DrawnKind } from '@/lib/ai/drawn/prompt';
import { sceneFromStored } from '@/lib/ai/drawn/stored';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';
import type { VisualOutline } from '@/lib/ai/outline';

/** How many pictures one Generate/Shuffle draws. */
export const DRAWN_BATCH = 3;

/** The route's seed ceiling (inclusive). */
export const DRAWN_SEED_MAX = 9999;

/** A base whose base+1/base+2 all fit under the ceiling. */
export const DRAWN_BASE_MAX = DRAWN_SEED_MAX - (DRAWN_BATCH - 1);

export const DRAWN_KIND_LABELS: Record<DrawnKind, string> = {
  flowchart: 'Flowchart',
  mindmap: 'Mindmap',
  pie: 'Pie Chart',
  bar: 'Bar Chart',
  timeline: 'Timeline',
  comparison: 'Comparison',
};

/** The drawn kind a type button asks for; null for "Show options". */
export function drawnKindForSubtype(subtype: DiagramSubtype | undefined): DrawnKind | null {
  switch (subtype) {
    case 'flowchart':
      return 'flowchart';
    case 'mindmap':
      return 'mindmap';
    case 'pie_chart':
      return 'pie';
    case 'bar_chart':
      return 'bar';
    case 'timeline':
      return 'timeline';
    case 'comparison':
      return 'comparison';
    default:
      return null;
  }
}

/** `base..base+2`, all distinct and inside the route's accepted range. */
export function seedsForBase(base: number): number[] {
  return Array.from({ length: DRAWN_BATCH }, (_, index) => base + index);
}

/**
 * Picks a base seed whose three seeds are all unseen this session. Falls back to
 * a rolling window after enough collisions that a random reroll is hopeless.
 */
export function pickBaseSeed(random: () => number = Math.random, seen: ReadonlySet<number> = new Set()): number {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const base = Math.floor(random() * (DRAWN_BASE_MAX + 1));
    if (!seedsForBase(base).some((seed) => seen.has(seed))) return base;
  }
  for (let base = 0; base <= DRAWN_BASE_MAX; base += 1) {
    if (!seedsForBase(base).some((seed) => seen.has(seed))) return base;
  }
  return 0;
}

export function drawnOptionKey(kind: DrawnKind, seed: number): string {
  return `drawn:${kind}:${seed}`;
}

/** The scene "Edit as drawing" converts, straight from the stored picture. */
export function drawnSceneFromData(data: DrawnDiagramData): PictureScene {
  return sceneFromStored(data);
}

/** The route's human message, exactly as the route words it. */
export function routeErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

export interface SuggestionFromResponseInput {
  picture: unknown;
  outline: VisualOutline;
  kind: DrawnKind;
  seed: number;
  label: string;
  fit: number;
}

/**
 * Turns one `/api/ai/draw-picture` response into a drawn `DesignSuggestion`.
 * Throws (via `parseDrawnPicture`) when the picture is unusable, so the caller
 * can leave that slot out.
 */
export function suggestionFromResponse(input: SuggestionFromResponseInput): DesignSuggestion {
  const { picture } = parseDrawnPicture(input.picture);
  const envelopeData: DrawnDiagramData = {
    type: 'diagram',
    subtype: 'drawn',
    renderer: 'drawn',
    title: input.outline.title,
    outline: input.outline,
    kind: input.kind,
    seed: input.seed,
    picture: picture as DrawnPicture,
  };
  return {
    key: drawnOptionKey(input.kind, input.seed),
    label: input.label,
    category: DRAWN_KIND_LABELS[input.kind],
    fit: input.fit,
    envelopeData,
  };
}
