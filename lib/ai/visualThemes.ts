/**
 * PATCH-238. Colour themes for AI pictures. A theme is just a set of colours --
 * the ground, the header text, the neutral text, the connector lines, the hub
 * centre and a six-entry palette -- so restyling a picture is free and instant
 * (no AI call, no new geometry). Classic is today's exact palette, so every
 * stored picture looks unchanged.
 */

import { VISUAL_PALETTE, type VisualColor } from './visualPalette';
import type { FontRole } from './visualStyle';

export type VisualThemeId =
  | 'classic'
  | 'ocean'
  | 'sunset'
  | 'forest'
  | 'mono'
  | 'teal-night'
  | 'midnight'
  | 'hand-drawn';

export interface VisualTheme {
  id: VisualThemeId;
  name: string;
  dark: boolean;
  /** The picture's ground. */
  background: string;
  /** Title / header text. */
  title: string;
  /** Neutral text (details, leader labels, centre labels). */
  text: string;
  /** Small labels, the "INFOGRAPHIC" eyebrow. */
  muted: string;
  /** Arrows, leader lines, links. */
  line: string;
  /** Hub / mind-map root fill and text. */
  centreFill: string;
  centreText: string;
  /** Six `{ stroke, fill, text, detail }` entries, index-cycled. */
  palette: readonly VisualColor[];
  /**
   * PATCH-253. Resolved system font stacks for the title / labels / details,
   * filled by `themeWithStyle` from a stored `VisualStyle`. Absent means the
   * renderer's own default.
   */
  fonts?: Partial<Record<FontRole, { family: string; weight: number }>>;
}

/** A palette entry: the label `text` is also the card's body `detail` colour. */
function trio(stroke: string, fill: string, text: string): VisualColor {
  return { stroke, fill, text, detail: text };
}

export const VISUAL_THEMES: Record<VisualThemeId, VisualTheme> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    dark: false,
    background: '#FFFFFF',
    title: '#1F2937',
    text: '#374151',
    muted: '#6B7280',
    line: '#9CA3AF',
    centreFill: '#1F2937',
    centreText: '#FFFFFF',
    palette: VISUAL_PALETTE,
  },

  ocean: {
    id: 'ocean',
    name: 'Ocean',
    dark: false,
    background: '#F0F7FA',
    title: '#0B3A4A',
    text: '#15505E',
    muted: '#3E7A8A',
    line: '#2C7DA0',
    centreFill: '#0B3A4A',
    centreText: '#FFFFFF',
    palette: [
      trio('#2C7DA0', '#DCEEF5', '#0B3A4A'),
      trio('#1B998B', '#D6F0EC', '#0A423B'),
      trio('#3A6EA5', '#DEE8F7', '#173A63'),
      trio('#2A9D8F', '#D8F1EC', '#0C453D'),
      trio('#468FAF', '#E0F1F7', '#124452'),
      trio('#5C6BC0', '#E3E6F7', '#26306E'),
    ],
  },

  sunset: {
    id: 'sunset',
    name: 'Sunset',
    dark: false,
    background: '#FFF7F0',
    title: '#5A2A0A',
    text: '#6B3410',
    muted: '#8A5A3A',
    line: '#D9644A',
    centreFill: '#8A2D1B',
    centreText: '#FFFFFF',
    palette: [
      trio('#E07A2F', '#FDEBD9', '#7A3B0A'),
      trio('#D9534F', '#FBE3E2', '#7A1F1C'),
      trio('#C2185B', '#FCE3EE', '#6E0E33'),
      trio('#E9A23B', '#FCEFD9', '#5A3B06'),
      trio('#F4845F', '#FEE7DE', '#7A2E14'),
      trio('#B5651D', '#F7E5D4', '#5E3608'),
    ],
  },

  forest: {
    id: 'forest',
    name: 'Forest',
    dark: false,
    background: '#F3F8F0',
    title: '#1E3D14',
    text: '#2C4A1F',
    muted: '#4E6B3E',
    line: '#4B8B3B',
    centreFill: '#1E3D14',
    centreText: '#FFFFFF',
    palette: [
      trio('#4B8B3B', '#E1F0DA', '#22431A'),
      trio('#6B8E23', '#EAF0D8', '#3A4D0F'),
      trio('#2E8B57', '#DAF0E4', '#124A2C'),
      trio('#7A9A01', '#EDF3D4', '#3F4E00'),
      trio('#3E7C59', '#DDEEE4', '#173B29'),
      trio('#8A9A5B', '#ECEFDD', '#3D4420'),
    ],
  },

  mono: {
    id: 'mono',
    name: 'Mono',
    dark: false,
    background: '#F7F7F8',
    title: '#1F2329',
    text: '#3A3F46',
    muted: '#5B6169',
    line: '#9CA3AF',
    centreFill: '#1F2329',
    centreText: '#FFFFFF',
    palette: [
      trio('#6A7FDB', '#E3E8FA', '#1F2A6B'), // the one indigo accent
      trio('#6B7280', '#ECEDEF', '#2B2F36'),
      trio('#4B5563', '#E5E7EB', '#1F2329'),
      trio('#9CA3AF', '#F1F2F4', '#3A3F46'),
      trio('#7C8698', '#E9ECF0', '#2C3340'),
      trio('#57534E', '#EAE8E6', '#292524'),
    ],
  },

  'teal-night': {
    id: 'teal-night',
    name: 'Teal night',
    dark: true,
    background: '#1E4D46',
    title: '#EAFBF7',
    text: '#D2F0EA',
    muted: '#8FC7BE',
    line: '#7FD8C9',
    centreFill: '#7FE9D4',
    centreText: '#0B3B34',
    palette: [
      trio('#5EEAD4', '#CFF6EE', '#0B3B34'),
      trio('#7DD3FC', '#D6EFFB', '#0A3A52'),
      trio('#6EE7B7', '#D2F5E3', '#0A4030'),
      trio('#A5F3FC', '#D9F7FB', '#0A4A55'),
      trio('#67E8F9', '#D2F3F8', '#0A454F'),
      trio('#FDE68A', '#FDF3D0', '#5A4206'),
    ],
  },

  midnight: {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    background: '#0F1E3D',
    title: '#EAF0FC',
    text: '#CFDAF4',
    muted: '#93A6D6',
    line: '#7D9BE8',
    centreFill: '#A5B4FC',
    centreText: '#0F1E3D',
    palette: [
      trio('#93C5FD', '#DBEAFE', '#12305E'),
      trio('#A5B4FC', '#E0E7FF', '#252E7A'),
      trio('#C4B5FD', '#EDE9FE', '#3B2E7E'),
      trio('#7DD3FC', '#D6EFFB', '#0A3A52'),
      trio('#F0ABFC', '#FAE8FF', '#5A1A66'),
      trio('#FDE68A', '#FDF3D0', '#5A4206'),
    ],
  },

  // PATCH-241. AntV's rough, hand-sketched style on a warm paper ground. Text
  // on its light ground meets 4.5:1. Reuses the classic six-colour palette.
  'hand-drawn': {
    id: 'hand-drawn',
    name: 'Hand-drawn',
    dark: false,
    background: '#FDFBF6',
    title: '#2B2B2B',
    text: '#333333',
    muted: '#5F5F5F',
    line: '#4B4B4B',
    centreFill: '#2B2B2B',
    centreText: '#FFFFFF',
    palette: VISUAL_PALETTE,
  },
};

const DEFAULT_THEME = VISUAL_THEMES.classic;

/** Unknown or missing ids fall back to classic (lenient, never throws). */
export function themeById(id?: string | null): VisualTheme {
  if (id && Object.prototype.hasOwnProperty.call(VISUAL_THEMES, id)) {
    return VISUAL_THEMES[id as VisualThemeId];
  }
  return DEFAULT_THEME;
}

/** Index-cycled theme palette access; negatives wrap as well as positives. */
export function themeColor(theme: VisualTheme, index: number): VisualColor {
  const size = theme.palette.length;
  const i = ((Math.trunc(index) % size) + size) % size;
  return theme.palette[i];
}

function parseHex(hex: string): [number, number, number] {
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  const int = Number.parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(channelToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two hex colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
