'use client';

import React, { useState } from 'react';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import { layoutInfographic, TEMPLATE_RANGE, type InfographicShape, type InfographicText, type InfographicIcon } from '@/lib/ai/infographic';
import {
  insertItem,
  recolorItem,
  removeItem,
  renameOutline,
  type OutlineTextRef,
} from '@/lib/ai/infographic/edit';
import { OUTLINE_LIMITS, type VisualOutline } from '@/lib/ai/outline';
import { shapeBounds, textBox } from '@/lib/ai/infographic/shared';
import { themeById, type VisualTheme } from '@/lib/ai/visualThemes';
import { getVisualIcon } from './visualIconMap';
import PictureEditOverlay, { type ActiveEdit, type ColorPopoverState, type EditHandle } from './PictureEditOverlay';

/**
 * PATCH-236. Draws an infographic design from its stored outline. Every label is
 * React text (escaped), never innerHTML.
 *
 * PATCH-240. With an `edit` prop the same SVG becomes directly editable: click a
 * word to retype it, use the blue +/− circles to add/remove an item, and click a
 * shape to pick its colour. Without it, the render is exactly as before (bar the
 * `data-ai-edit-ref` attributes the board reads).
 */
function shapeEl(shape: InfographicShape, editShape?: { item: number; onActivate: () => void }) {
  const common = {
    fill: shape.fill,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth ?? 0,
  };
  const editable = editShape
    ? { 'data-ai-edit-shape': editShape.item, onClick: editShape.onActivate, style: { cursor: 'pointer' as const } }
    : {};
  switch (shape.kind) {
    case 'rect':
      return <rect key={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...common} {...editable} />;
    case 'circle':
      return <circle key={shape.id} cx={shape.cx} cy={shape.cy} r={shape.r} {...common} {...editable} />;
    case 'polygon':
      return <polygon key={shape.id} points={shape.points} {...common} {...editable} />;
    case 'path':
    default:
      return <path key={shape.id} d={shape.d} strokeLinecap="round" {...common} {...editable} />;
  }
}

function refKey(text: InfographicText): string | undefined {
  if (!text.ref) return undefined;
  if (text.ref.field === 'title') return 'title';
  return `${text.ref.field}:${text.ref.item}`;
}

function parseRefKey(key: string): OutlineTextRef | null {
  if (key === 'title') return { field: 'title' };
  const match = /^(label|detail):(\d+)$/.exec(key);
  if (!match) return null;
  return { field: match[1] as 'label' | 'detail', item: Number(match[2]) };
}

function valueForRef(outline: VisualOutline, ref: OutlineTextRef): string {
  if (ref.field === 'title') return outline.title;
  const item = outline.items[ref.item];
  if (!item) return '';
  return (ref.field === 'label' ? item.label : item.detail) ?? '';
}

function maxForRef(ref: OutlineTextRef): number {
  if (ref.field === 'title') return OUTLINE_LIMITS.title;
  return ref.field === 'label' ? OUTLINE_LIMITS.label : OUTLINE_LIMITS.detail;
}

function textEl(text: InfographicText, onActivate?: () => void) {
  const firstLineY = text.y - ((text.lines.length - 1) * 18) / 2;
  const key = refKey(text);
  return (
    <text
      key={text.id}
      x={text.x}
      y={firstLineY}
      textAnchor={text.anchor}
      fontSize={text.fontSize}
      fontWeight={text.fontWeight}
      fill={text.color}
      fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
      {...(key ? { 'data-ai-edit-ref': key } : {})}
      {...(onActivate ? { onClick: onActivate, style: { cursor: 'text' as const } } : {})}
    >
      {text.lines.map((line, i) => (
        <tspan key={i} x={text.x} dy={i === 0 ? 0 : 18}>{line}</tspan>
      ))}
    </text>
  );
}

function iconEl(icon: InfographicIcon) {
  const Icon = getVisualIcon(icon.name);
  if (!Icon) return null;
  return (
    <g key={`icon-${icon.name}-${icon.x}-${icon.y}`} data-infographic-icon={icon.name}>
      <Icon x={icon.x} y={icon.y} width={icon.size} height={icon.size} color={icon.color} />
    </g>
  );
}

function editHandles(
  outline: VisualOutline,
  layout: ReturnType<typeof layoutInfographic>,
  range: { min: number; max: number },
  onChange: (next: VisualOutline) => void,
): EditHandle[] {
  const count = outline.items.length;
  const pctX = (x: number) => (layout.width ? (x / layout.width) * 100 : 0);
  const pctY = (y: number) => (layout.height ? (y / layout.height) * 100 : 0);
  const handles: EditHandle[] = [];

  if (count > range.min) {
    for (const shape of layout.shapes) {
      if (shape.item == null || shape.item >= count) continue;
      const bounds = shapeBounds(shape);
      if (!bounds) continue;
      handles.push({
        key: `remove-${shape.item}`,
        kind: 'remove',
        left: pctX(bounds.left),
        top: pctY(bounds.top + bounds.height / 2),
        target: String(shape.item),
        onActivate: () => onChange(removeItem(outline, shape.item as number)),
      });
    }
  }

  if (count < range.max) {
    for (let i = 0; i < count; i += 1) {
      const shape = layout.shapes.find((candidate) => candidate.item === i);
      const bounds = shape ? shapeBounds(shape) : null;
      handles.push({
        key: `add-${i}`,
        kind: 'add',
        left: bounds ? pctX(bounds.right) : 100,
        top: bounds ? pctY(bounds.top + bounds.height / 2) : 50,
        target: String(i),
        onActivate: () => onChange(insertItem(outline, i + 1)),
      });
    }
  }

  return handles;
}

function InfographicRenderer({
  data,
  edit,
  initialEditRef,
}: {
  data: InfographicDiagramData;
  edit?: { onChange: (next: VisualOutline) => void };
  initialEditRef?: string | null;
}) {
  const theme: VisualTheme = themeById(data.theme);
  const layout = layoutInfographic(data.template, data.outline, theme);
  const outline = data.outline;

  const [editingKey, setEditingKey] = useState<string | null>(edit && initialEditRef ? initialEditRef : null);
  const [colorItem, setColorItem] = useState<number | null>(null);

  const pctX = (x: number) => (layout.width ? (x / layout.width) * 100 : 0);
  const pctY = (y: number) => (layout.height ? (y / layout.height) * 100 : 0);

  const activeRef = edit && editingKey ? parseRefKey(editingKey) : null;
  const activeText = editingKey ? layout.texts.find((text) => refKey(text) === editingKey) : undefined;
  const activeEdit: ActiveEdit | null = edit && activeRef && activeText
    ? (() => {
        const box = textBox(activeText);
        return {
          key: editingKey as string,
          value: valueForRef(outline, activeRef),
          maxLength: maxForRef(activeRef),
          left: pctX(box.left + box.width / 2),
          top: pctY(box.top + box.height / 2),
          onCommit: (value: string) => {
            edit.onChange(renameOutline(outline, activeRef, value));
            setEditingKey(null);
          },
          onCancel: () => setEditingKey(null),
        };
      })()
    : null;

  const colorShape = colorItem != null ? layout.shapes.find((shape) => shape.item === colorItem) : undefined;
  const colorBounds = colorShape ? shapeBounds(colorShape) : null;
  const colorPopover: ColorPopoverState | null = edit && colorItem != null && colorBounds
    ? {
        key: `color-${colorItem}`,
        left: pctX(colorBounds.left + colorBounds.width / 2),
        top: pctY(colorBounds.bottom),
        swatches: theme.palette.map((swatch) => swatch.stroke),
        onPick: (colorIndex: number | null) => {
          edit.onChange(recolorItem(outline, colorItem, colorIndex));
          setColorItem(null);
        },
      }
    : null;

  const svg = (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      data-infographic-svg={data.template}
      role="img"
      aria-label={data.title}
      style={{ width: '100%', height: 'auto', maxHeight: 520 }}
    >
      {layout.shapes.map((shape) =>
        shapeEl(
          shape,
          edit && shape.item != null
            ? { item: shape.item, onActivate: () => setColorItem((current) => (current === shape.item ? null : (shape.item as number))) }
            : undefined,
        ),
      )}
      {layout.texts.map((text) =>
        textEl(text, edit && refKey(text) ? () => setEditingKey(refKey(text) as string) : undefined),
      )}
      {layout.icons?.map(iconEl)}
    </svg>
  );

  return (
    <div
      data-ai-theme-background={theme.id}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>infographic</div>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: theme.title }}>{data.title}</h2>
          {data.explanation && <p className="mt-2 text-sm" style={{ color: theme.text }}>{data.explanation}</p>}
        </div>
        {edit ? (
          <div className="group relative w-full">
            {svg}
            <PictureEditOverlay
              handles={editHandles(outline, layout, TEMPLATE_RANGE[data.template], edit.onChange)}
              activeEdit={activeEdit}
              colorPopover={colorPopover}
            />
          </div>
        ) : (
          svg
        )}
      </div>
    </div>
  );
}

export default React.memo(InfographicRenderer);
