'use client';

import React from 'react';

import {
  VISUAL_FONTS,
  type FontRole,
  type VisualFontId,
  type VisualStyle,
} from '@/lib/ai/visualStyle';
import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';

/**
 * PATCH-253. The "Colours & Fonts" side panel: the seven preset themes, then a
 * background colour, one colour per palette slot the design uses and the title /
 * label / description fonts. Every change is local (no AI call) and is reported
 * through `onVisualStyleChange`; choosing a preset theme clears the custom style.
 */

const FONT_ROLES: readonly FontRole[] = ['title', 'label', 'desc'];

const ROLE_LABELS: Record<FontRole, string> = {
  title: 'Title',
  label: 'Label',
  desc: 'Description',
};

const WEIGHTS: ReadonlyArray<{ value: 400 | 500 | 700; label: string }> = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 700, label: 'Bold' },
];

interface ColoursFontsPanelProps {
  theme: VisualThemeId;
  visualStyle?: VisualStyle;
  onVisualStyleChange: (style: VisualStyle | undefined) => void;
  onThemeChange: (id: VisualThemeId) => void;
  /** How many palette slots the selected design actually uses (max 6). */
  slotCount: number;
}

export default function ColoursFontsPanel({
  theme,
  visualStyle,
  onVisualStyleChange,
  onThemeChange,
  slotCount,
}: ColoursFontsPanelProps) {
  const themeBackground = VISUAL_THEMES[theme].background;

  const baseColors = (): string[] => {
    if (visualStyle?.colors?.length) return [...visualStyle.colors];
    return VISUAL_THEMES[theme].palette.slice(0, slotCount).map((entry) => entry.stroke);
  };

  const setBackground = (value: string) =>
    onVisualStyleChange({ ...visualStyle, background: value.toLowerCase() });

  const setColor = (index: number, value: string) => {
    const colors = baseColors();
    colors[index] = value.toLowerCase();
    onVisualStyleChange({ ...visualStyle, colors });
  };

  const setFont = (role: FontRole, family: VisualFontId) =>
    onVisualStyleChange({
      ...visualStyle,
      fonts: { ...visualStyle?.fonts, [role]: { family, weight: visualStyle?.fonts?.[role]?.weight ?? 400 } },
    });

  const setWeight = (role: FontRole, weight: 400 | 500 | 700) =>
    onVisualStyleChange({
      ...visualStyle,
      fonts: { ...visualStyle?.fonts, [role]: { family: visualStyle?.fonts?.[role]?.family ?? 'sans', weight } },
    });

  return (
    <div data-ai-colours="true" className="space-y-4">
      <section data-ai-style-section="themes">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Themes</div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(VISUAL_THEMES) as VisualThemeId[]).map((id) => {
            const swatch = VISUAL_THEMES[id];
            return (
              <button
                key={id}
                type="button"
                data-ai-theme={id}
                aria-label={swatch.name}
                aria-pressed={theme === id}
                title={swatch.name}
                onClick={() => {
                  onVisualStyleChange(undefined);
                  onThemeChange(id);
                }}
                className={`h-5 w-5 rounded-full border ${theme === id ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-300'}`}
                style={{
                  background: `conic-gradient(${swatch.background} 0 33.33%, ${swatch.palette[0].stroke} 33.33% 66.66%, ${swatch.palette[1].stroke} 66.66% 100%)`,
                }}
              />
            );
          })}
        </div>
      </section>

      <section data-ai-style-section="background">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Background</div>
        <input
          type="color"
          data-ai-style-background="true"
          aria-label="Background colour"
          title="Background colour"
          value={visualStyle?.background ?? themeBackground}
          onChange={(event) => setBackground(event.target.value)}
          className="h-6 w-6 cursor-pointer rounded-full border border-gray-300 bg-transparent p-0"
        />
      </section>

      <section data-ai-style-section="elements">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Elements</div>
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: slotCount }).map((_, index) => (
            <input
              key={index}
              type="color"
              data-ai-style-color={index}
              aria-label={`Element colour ${index + 1}`}
              title={`Element colour ${index + 1}`}
              value={baseColors()[index] ?? themeBackground}
              onChange={(event) => setColor(index, event.target.value)}
              className="h-6 w-6 cursor-pointer rounded-full border border-gray-300 bg-transparent p-0"
            />
          ))}
        </div>
      </section>

      <section data-ai-style-section="fonts">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fonts</div>
        <div className="space-y-2">
          {FONT_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-2">
              <span className="w-20 text-[11px] text-gray-600">{ROLE_LABELS[role]}</span>
              <select
                data-ai-style-font={role}
                aria-label={`${ROLE_LABELS[role]} font`}
                value={visualStyle?.fonts?.[role]?.family ?? 'sans'}
                onChange={(event) => setFont(role, event.target.value as VisualFontId)}
                className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-0.5 text-[11px]"
              >
                {VISUAL_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                data-ai-style-weight={role}
                aria-label={`${ROLE_LABELS[role]} weight`}
                value={visualStyle?.fonts?.[role]?.weight ?? 400}
                onChange={(event) => setWeight(role, Number(event.target.value) as 400 | 500 | 700)}
                className="rounded border border-gray-300 px-1 py-0.5 text-[11px]"
              >
                {WEIGHTS.map((weight) => (
                  <option key={weight.value} value={weight.value}>
                    {weight.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section data-ai-style-section="reset">
        <button
          type="button"
          data-ai-style-reset="true"
          onClick={() => onVisualStyleChange(undefined)}
          className="text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline"
        >
          Reset to theme
        </button>
      </section>
    </div>
  );
}
