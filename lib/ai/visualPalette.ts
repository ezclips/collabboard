/**
 * PATCH-234. The six-colour palette every AI picture shares (mind map branches,
 * flow nodes, comparison columns, timeline markers). Each entry is a
 * `{ stroke, fill, text, detail }` set so a coloured card is legible everywhere:
 * `text` labels it, `detail` is its smaller body copy (PATCH-238).
 */

export interface VisualColor {
  stroke: string;
  fill: string;
  text: string;
  /** PATCH-238. Body/detail text drawn ON this entry's `fill`. */
  detail: string;
}

export const VISUAL_PALETTE: readonly VisualColor[] = [
  { stroke: '#E9A23B', fill: '#FCEFD9', text: '#5A3B06', detail: '#374151' }, // amber
  { stroke: '#4F9D8F', fill: '#DDF0EC', text: '#1D4A42', detail: '#374151' }, // teal
  { stroke: '#D9644A', fill: '#F9E0DA', text: '#6B2415', detail: '#374151' }, // coral
  { stroke: '#6A7FDB', fill: '#E3E8FA', text: '#1F2A6B', detail: '#374151' }, // indigo
  { stroke: '#8E6AC8', fill: '#EDE5F7', text: '#3B2463', detail: '#374151' }, // violet
  { stroke: '#5BA35B', fill: '#E1F1E1', text: '#1F4A1F', detail: '#374151' }, // green
] as const;

/** Index-cycled palette access; negatives wrap as well as positives. */
export function paletteAt(index: number): VisualColor {
  const size = VISUAL_PALETTE.length;
  const i = ((Math.trunc(index) % size) + size) % size;
  return VISUAL_PALETTE[i];
}
