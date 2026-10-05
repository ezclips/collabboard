/**
 * PATCH-283 F. The DrawnPicture prompt: the authoring format, the design rules
 * and the per-kind variants (the "shuffle"). `buildDrawPrompt` pins a variant
 * and a palette to the seed, and optionally shows ONE AntV style example.
 */

import type { VisualOutline } from '@/lib/ai/outline';
import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';
import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';

import { DRAWN_EXAMPLES, type DrawnExample } from './examples.data';

export type DrawnKind = 'flowchart' | 'mindmap' | 'pie' | 'bar' | 'timeline' | 'comparison';

export const DRAWN_KINDS: readonly DrawnKind[] = ['flowchart', 'mindmap', 'pie', 'bar', 'timeline', 'comparison'];

/** Light palettes, cycled by seed; seeds 0-2 land on three distinct grounds. */
const LIGHT_THEME_IDS: readonly VisualThemeId[] = ['classic', 'ocean', 'sunset', 'forest', 'mono', 'hand-drawn'];

const VARIANTS: Record<DrawnKind, readonly [string, string, string]> = {
  pie: [
    'Draw a donut chart with a legend to the right.',
    'Draw a full pie with labels around the ring.',
    'Draw a donut with small cards below it.',
  ],
  bar: [
    'Draw vertical columns on a baseline.',
    'Draw horizontal bars against a left axis.',
    'Draw vertical columns with a value badge on each.',
  ],
  timeline: [
    'Draw a horizontal axis with cards alternating above and below.',
    'Draw a vertical axis with all cards to the right.',
    'Draw a winding road with stops along it.',
  ],
  flowchart: [
    'Draw top-down boxes connected by arrows.',
    'Draw left-to-right steps connected by arrows.',
    'Draw boxes with a decision diamond where the content has a choice.',
  ],
  mindmap: [
    'Draw a centre node with branches on both sides.',
    'Draw a tree growing to the right.',
    'Draw a radial mind map around the centre.',
  ],
  comparison: [
    'Draw two columns with a VS divider.',
    'Draw rows like a table comparing the options.',
    'Draw two cards with an icon on each.',
  ],
};

/**
 * "Show options". A known structural kind wins where it is decisive; otherwise
 * values make a chart and structure makes a mind map, with a flowchart fallback.
 */
export function kindForOutline(outline: VisualOutline): DrawnKind {
  if (outline.kind === 'timeline') return 'timeline';
  if (outline.kind === 'comparison') return 'comparison';
  if (outline.kind === 'steps' || outline.kind === 'cycle' || outline.kind === 'cause_effect') return 'flowchart';
  const valued = outline.items.filter((item) => typeof item.value === 'number').length >= 2;
  if ((outline.kind === 'parts' || outline.kind === 'list') && valued) return 'pie';
  if (outline.kind === 'levels' || outline.kind === 'parts') return 'mindmap';
  return 'flowchart';
}

export const DRAW_SYSTEM_PROMPT = `
You draw a diagram by writing JSON in the "DrawnPicture" format. Return valid JSON only.
DrawnPicture shape:
{
  "version": 1,
  "width": 640..1200, "height": 400..900,
  "background": "#rrggbb",
  "elements": [ ... ]
}
Element types (coordinates in px, origin top-left; colours "#rrggbb" or "none"):
- { "type": "rect", "x", "y", "w", "h", "fill", "stroke", "strokeWidth", "radius", "dash" }
- { "type": "ellipse", "x", "y", "w", "h", "fill", "stroke", "strokeWidth" }
- { "type": "polygon", "points": [[x, y], ...], "fill", "stroke" }
- { "type": "line", "points": [[x, y], ...], "stroke", "strokeWidth", "dash", "arrow": "none" | "end" | "start" | "both" }
- { "type": "wedge", "item": <outline item index>, "cx", "cy", "r", "inner", "fill", "stroke" }
- { "type": "bar", "item": <outline item index>, "x", "y", "w", "h", "orient": "v" | "h", "fill", "radius" }
- { "type": "text", "text", "x", "y", "w", "size", "color", "align", "bold", "in": "<rect or ellipse id>" }
- { "type": "icon", "name": "<a known icon name>", "x", "y", "size", "color" }
Every element needs a unique "id".

Allowed icons ("name" must be exactly one of these): ${VISUAL_ICON_NAMES.join(', ')}.

Design rules:
- Size hierarchy: title 26-32, labels 15-18, details 12-14.
- Leave at least 24 px between shapes and a 32 px canvas margin; the canvas is 640x400 to 1200x900.
- Show EVERY outline item with its label.
- Use only the palette colours plus the ground and text colours. The palette gives you card fills and label text colours, not only the accent strokes.
- Put text inside its card using "in" and let the app fit it; never compute wrapping yourself.
- Several texts may share one card through the same "in" id; they are stacked top to bottom in the order you write them (put the label first, then the detail).
- Use "wedge" for pie slices and "bar" for bar lengths. NEVER draw slices or bars as polygons or rects.
- Draw arrows as "line" with an "arrow" value.
- Do not overlap cards.
`.trim();

export interface BuildDrawPromptInput {
  outline: VisualOutline;
  kind: DrawnKind;
  seed: number;
  examples: boolean;
}

export interface DrawPrompt {
  system: string;
  user: string;
}

/**
 * Addendum 2, fix 2a. The model's own value labels must sit where OUR data marks
 * will be, so we hand it the exact proportions up front.
 */
function dataProportions(outline: VisualOutline, kind: DrawnKind): string | null {
  if (kind !== 'pie' && kind !== 'bar') return null;
  const valued = outline.items
    .map((item, index) => ({ index, value: item.value }))
    .filter((entry): entry is { index: number; value: number } => typeof entry.value === 'number' && entry.value > 0);
  if (valued.length === 0) return null;

  if (kind === 'pie') {
    const total = valued.reduce((sum, entry) => sum + entry.value, 0);
    let cursor = 0;
    const slices = valued.map((entry) => {
      const start = cursor / total;
      cursor += entry.value;
      return `item ${entry.index}: ${(start * 360).toFixed(1)}° to ${((cursor / total) * 360).toFixed(1)}°`;
    });
    return `Real slices (0° = 12 o'clock, clockwise): ${slices.join('; ')}.`;
  }

  const max = Math.max(...valued.map((entry) => entry.value));
  const lengths = valued.map((entry) => `item ${entry.index}: ${(entry.value / max).toFixed(2)}`);
  return `Real bar lengths (fraction of the longest): ${lengths.join(', ')}.`;
}

/** Builds the system + user prompt for one drawn picture. */
export function buildDrawPrompt(input: BuildDrawPromptInput): DrawPrompt {
  const variantIndex = ((input.seed % 3) + 3) % 3;
  const themeId = LIGHT_THEME_IDS[((input.seed % LIGHT_THEME_IDS.length) + LIGHT_THEME_IDS.length) % LIGHT_THEME_IDS.length];
  const theme = VISUAL_THEMES[themeId];
  const accents = theme.palette.map((colour) => colour.stroke).join(', ');
  const fills = theme.palette.map((colour) => colour.fill).join(', ');
  const labelText = theme.palette.map((colour) => colour.text).join(', ');

  const sections = [
    `Draw the outline below as a ${input.kind} picture, using the DrawnPicture JSON format.`,
    VARIANTS[input.kind][variantIndex],
    `Palette: ground ${theme.background}, title ${theme.title}, text ${theme.text}, card fills ${fills}, label text ${labelText}, accents ${accents}.`,
    `Outline:\n${JSON.stringify(input.outline)}`,
  ];

  const proportions = dataProportions(input.outline, input.kind);
  if (proportions) sections.push(proportions);

  if (input.examples) {
    const pool: DrawnExample[] = DRAWN_EXAMPLES[input.kind] ?? [];
    if (pool.length > 0) {
      const example = pool[((input.seed % pool.length) + pool.length) % pool.length];
      sections.push(
        'An example of the STYLE (cards, spacing, typography); its data marks may be polygons — you must use wedge/bar:\n' +
          JSON.stringify({ template: example.template, outline: example.outline, picture: example.picture }),
      );
    }
  }

  return { system: DRAW_SYSTEM_PROMPT, user: sections.join('\n\n') };
}
