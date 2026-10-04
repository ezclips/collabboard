'use client';

import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { additionKindOf } from '@/lib/ai/antv/additions';
import type { EditEntry } from '@/lib/ai/antv/editHistory';
import { isHierarchyTemplate, outlineItemIndexForElementPath } from '@/lib/ai/antv/mapOutline';
import type { ElementOverrides } from '@/lib/ai/antv/elementOverrides';
import {
  OUTLINE_FONT_SIZE_MAX,
  OUTLINE_FONT_SIZE_MIN,
  TEXT_STYLE_FONT_FAMILIES,
  type TextStyle,
  type VisualOutline,
} from '@/lib/ai/outline';
import type { VisualIconName } from '@/lib/ai/visualIcons';

import { AntvIconSearch } from './AntvIconPicker';
import { AntvColourField } from './AntvColourField';
import { DockedPanelShell } from './PictureSidePanel';
import { selectedKeys, type Selection } from './AntvElementChrome';
import {
  COLOUR_ROW_LABELS,
  colourRowsForSelection,
  rowApplies,
  rowOverride,
  type ColourRow,
} from './useAntvElementColour';
import { useAntvElementText } from './useAntvElementText';

/**
 * PATCH-275. The element's own side panel: its text (content and style), its
 * shape colours, its icon and its reset/delete. Rendered in the shared docked
 * shell and portalled into the provider's host. It never deselects and never
 * covers the picture.
 */

export interface AntvElementPanelProps {
  selection: Selection;
  outline: VisualOutline;
  template: string;
  palette: readonly string[];
  recent: readonly string[];
  overrides: ElementOverrides | undefined;
  findElement: (key: string) => Element | null;
  iconItemIndex: number | null;
  iconCurrent: string | null;
  getContent: () => VisualOutline;
  commitOutline: (next: VisualOutline, entry: EditEntry | null) => void;
  onApplyColour: (row: ColourRow, hex: string, options?: { collect?: boolean }) => void;
  onResetColour: () => void;
  onResetRow: (row: ColourRow) => void;
  onApplyIcon: (name: VisualIconName) => void;
  onAdditionText: (key: string, value: string) => void;
  onAdditionFontSize: (key: string, size: number) => void;
  onReset: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ADDITION_LABELS: Record<string, string> = {
  rect: 'Rectangle',
  rounded: 'Rounded',
  circle: 'Circle',
  triangle: 'Triangle',
  line: 'Line',
  arrow: 'Arrow',
  text: 'Text',
  icon: 'Icon',
};

interface ParsedKey {
  type: string;
  indexes: number[];
}

function parseKey(key: string): ParsedKey {
  const at = key.indexOf('@');
  const hash = key.indexOf('#');
  const typeEnd = at === -1 ? (hash === -1 ? key.length : hash) : at;
  const type = key.slice(0, typeEnd);
  if (at === -1) return { type, indexes: [] };
  const end = hash === -1 ? key.length : hash;
  const indexes = key
    .slice(at + 1, end)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value));
  return { type, indexes };
}

/** PATCH-275. What the panel header says: the item/part's label, never a key. */
export function panelTitle(
  selection: Selection,
  outline: VisualOutline,
  template: string,
  findElement?: (key: string) => Element | null,
): string {
  const keys = selectedKeys(selection);
  const parsed = keys.length ? parseKey(keys[0]) : null;
  if (!parsed) return 'Element';

  if (parsed.type === 'title') return outline.title || 'Title';

  if (parsed.type === 'ai-addition') {
    const el = findElement?.(keys[0]) ?? null;
    const kind = el ? additionKindOf(el) : null;
    return (kind && ADDITION_LABELS[kind]) || 'Element';
  }

  const index = outlineItemIndexForElementPath(parsed.indexes, template);
  const item = index !== null ? outline.items[index] : undefined;
  const itemLabel = item?.label ?? '';

  if (selection.kind === 'item') {
    return index !== null ? `Card ${index + 1} · ${itemLabel}` : itemLabel || 'Element';
  }

  switch (parsed.type) {
    case 'item-label':
      return `Label · ${itemLabel}`;
    case 'item-desc':
      return `Description · ${itemLabel}`;
    case 'item-value':
      return `Value · ${itemLabel}`;
    case 'item-icon':
    case 'item-icon-group':
      return `Icon · ${itemLabel}`;
    case 'shape':
      return `Shape · ${itemLabel}`;
    default:
      return itemLabel || ADDITION_LABELS[parsed.type] || 'Element';
  }
}

function styleForTarget(
  outline: VisualOutline,
  target: { scope: 'title' } | { scope: 'item'; index: number; part: 'label' | 'detail' },
): TextStyle | undefined {
  if (target.scope === 'title') return outline.titleStyle;
  return outline.items[target.index]?.textStyle?.[target.part];
}

interface TextContentFieldProps {
  field: ReturnType<typeof useAntvElementText>['fields'][number];
  multiline?: boolean;
  beginField: (field: TextContentFieldProps['field']) => void;
  endField: () => void;
  commitField: (field: TextContentFieldProps['field'], value: string) => void;
  revertValue: (field: TextContentFieldProps['field']) => string;
}

const DEBOUNCE_MS = 250;

function TextContentField({
  field,
  multiline = false,
  beginField,
  endField,
  commitField,
  revertValue,
}: TextContentFieldProps) {
  const [draft, setDraft] = React.useState(field.value);
  const focusedRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusedRef.current) setDraft(field.value);
  }, [field.value]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = (value: string) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commitField(field, value);
    }, DEBOUNCE_MS);
  };

  const onChange = (value: string) => {
    setDraft(value);
    schedule(value);
  };

  const onFocus = () => {
    focusedRef.current = true;
    beginField(field);
  };

  const onBlur = () => {
    focusedRef.current = false;
    clearTimer();
    if (cancelledRef.current) {
      cancelledRef.current = false;
      endField();
      return;
    }
    commitField(field, draft);
    endField();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelledRef.current = true;
      setDraft(revertValue(field));
      (event.target as HTMLElement).blur();
    }
  };

  const common = {
    'data-ai-element-text-field': field.field,
    'data-picture-control': 'true',
    value: draft,
    onFocus,
    onBlur,
    onKeyDown,
    className: 'w-full rounded border border-gray-300 px-2 py-1 text-xs',
  } as const;

  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-gray-600">{field.label}</span>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : field.field === 'value' ? (
        <input
          {...common}
          data-ai-element-text-value="true"
          type="number"
          min={0}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input {...common} type="text" onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

interface StyleControlsProps {
  target: { scope: 'title' } | { scope: 'item'; index: number; part: 'label' | 'detail' };
  style: TextStyle | undefined;
  commitStyle: (target: StyleControlsProps['target'], patch: TextStyle) => void;
}

function StyleControls({ target, style, commitStyle }: StyleControlsProps) {
  const size = style?.fontSize;
  const family = style?.fontFamily ?? '';
  const align = style?.align ?? 'left';

  const setSize = (value: number) => {
    const clamped = Math.max(OUTLINE_FONT_SIZE_MIN, Math.min(OUTLINE_FONT_SIZE_MAX, value));
    commitStyle(target, { fontSize: clamped });
  };

  return (
    <div className="space-y-2 rounded border border-gray-100 bg-gray-50/60 p-2">
      <div className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-gray-500">Size</span>
        <button
          type="button"
          data-ai-element-font-size-dec="true"
          aria-label="Smaller"
          onClick={() => setSize((size ?? 18) - 1)}
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          <Minus size={12} />
        </button>
        <input
          type="number"
          data-ai-element-font-size="true"
          data-picture-control="true"
          min={OUTLINE_FONT_SIZE_MIN}
          max={OUTLINE_FONT_SIZE_MAX}
          value={size ?? ''}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value > 0) setSize(value);
          }}
          className="h-6 w-14 rounded border border-gray-300 px-1 text-[11px]"
        />
        <button
          type="button"
          data-ai-element-font-size-inc="true"
          aria-label="Larger"
          onClick={() => setSize((size ?? 18) + 1)}
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          <Plus size={12} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-gray-500">Font</span>
        <select
          data-ai-element-font-family="true"
          data-picture-control="true"
          value={family}
          onChange={(event) => commitStyle(target, { fontFamily: event.target.value })}
          className="h-6 flex-1 rounded border border-gray-300 px-1 text-[11px]"
        >
          <option value="">Default</option>
          {TEXT_STYLE_FONT_FAMILIES.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-gray-500">Align</span>
        <div className="flex overflow-hidden rounded border border-gray-300">
          {(['left', 'center', 'right'] as const).map((value) => {
            const Icon = value === 'left' ? AlignLeft : value === 'center' ? AlignCenter : AlignRight;
            return (
              <button
                key={value}
                type="button"
                data-ai-element-align={value}
                data-picture-control="true"
                aria-label={`Align ${value}`}
                aria-pressed={align === value}
                onClick={() => commitStyle(target, { align: value })}
                className={`flex h-6 w-7 items-center justify-center ${
                  align === value ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={12} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AntvElementPanel({
  selection,
  outline,
  template,
  palette,
  recent,
  overrides,
  findElement,
  iconItemIndex,
  iconCurrent,
  getContent,
  commitOutline,
  onApplyColour,
  onResetColour,
  onResetRow,
  onApplyIcon,
  onAdditionText,
  onAdditionFontSize,
  onReset,
  onDelete,
  onClose,
}: AntvElementPanelProps) {
  const keys = selectedKeys(selection);
  const text = useAntvElementText({ template, selection, getContent, commitOutline });

  const rows = React.useMemo(() => colourRowsForSelection(keys, findElement), [keys, findElement]);
  const partsFor = (row: ColourRow) =>
    keys.map((key) => findElement(key)).filter((el): el is Element => el !== null && rowApplies(row, el));

  const additionField = text.fields.find((field) => field.field === 'addition');
  const styles = text.fields.filter((field) => field.styleTarget);

  const title = panelTitle(selection, outline, template, findElement);
  const textParts = partsFor('text');
  const hasText = text.fields.length > 0 || rows.includes('text');
  const hasShape = rows.includes('fill') || rows.includes('border');
  const hasIcon = rows.includes('icon') || iconItemIndex != null;

  return (
    <DockedPanelShell
      id="element"
      icon={<span className="text-gray-500">✎</span>}
      title={title}
      onClose={onClose}
      className="h-full min-h-0"
    >
      <section
        data-ai-element-panel="true"
        data-picture-control="true"
        onPointerDown={(event) => event.stopPropagation()}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
      >
        {hasText && (
          <div data-ai-element-panel-section="text" className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Text</div>
            {text.fields
              .filter((field) => field.field !== 'addition')
              .map((field) => (
                <TextContentField
                  key={`${field.field}:${field.path.join(',')}`}
                  field={field}
                  multiline={field.field === 'detail'}
                  beginField={text.beginField}
                  endField={text.endField}
                  commitField={text.commitField}
                  revertValue={text.revertValue}
                />
              ))}
            {additionField?.additionKey && (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-gray-600">{additionField.label}</span>
                <input
                  type="text"
                  data-ai-element-text-field="addition"
                  data-picture-control="true"
                  data-ai-element-text-value="true"
                  defaultValue={additionField.value}
                  onBlur={(event) => onAdditionText(additionField.additionKey!, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.value = additionField.value;
                      event.currentTarget.blur();
                    }
                  }}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <label className="flex items-center gap-1.5">
                  <span className="w-16 shrink-0 text-[11px] text-gray-500">Size</span>
                  <input
                    type="number"
                    data-ai-element-font-size="true"
                    data-picture-control="true"
                    min={OUTLINE_FONT_SIZE_MIN}
                    max={OUTLINE_FONT_SIZE_MAX}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value > 0) onAdditionFontSize(additionField.additionKey!, value);
                    }}
                    className="h-6 w-14 rounded border border-gray-300 px-1 text-[11px]"
                  />
                </label>
              </label>
            )}
            {styles.map((field) => (
              <StyleControls
                key={`style:${field.styleTarget!.scope}:${field.path.join(',')}`}
                target={field.styleTarget!}
                style={styleForTarget(outline, field.styleTarget!)}
                commitStyle={text.commitStyle}
              />
            ))}
            {textParts.length > 0 && (
              <AntvColourField
                row="text"
                label={COLOUR_ROW_LABELS.text}
                kind="text"
                parts={textParts}
                override={rowOverride('text', keys, overrides)}
                palette={palette}
                recent={recent}
                onPick={(hex) => onApplyColour('text', hex)}
                onInput={(hex) => onApplyColour('text', hex, { collect: false })}
                onReset={() => onResetRow('text')}
              />
            )}
          </div>
        )}

        {hasShape && (
          <div data-ai-element-panel-section="shape" className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Shape</div>
            {rows.includes('fill') && (
              <AntvColourField
                row="fill"
                label={COLOUR_ROW_LABELS.fill}
                kind="fill"
                parts={partsFor('fill')}
                override={rowOverride('fill', keys, overrides)}
                palette={palette}
                recent={recent}
                onPick={(hex) => onApplyColour('fill', hex)}
                onInput={(hex) => onApplyColour('fill', hex, { collect: false })}
                onReset={() => onResetRow('fill')}
              />
            )}
            {rows.includes('border') && (
              <AntvColourField
                row="border"
                label={COLOUR_ROW_LABELS.border}
                kind="stroke"
                parts={partsFor('border')}
                override={rowOverride('border', keys, overrides)}
                palette={palette}
                recent={recent}
                onPick={(hex) => onApplyColour('border', hex)}
                onInput={(hex) => onApplyColour('border', hex, { collect: false })}
                onReset={() => onResetRow('border')}
              />
            )}
          </div>
        )}

        {hasIcon && (
          <div data-ai-element-panel-section="icon" className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Icon</div>
            {rows.includes('icon') && (
              <AntvColourField
                row="icon"
                label={COLOUR_ROW_LABELS.icon}
                kind="fill"
                parts={partsFor('icon')}
                override={rowOverride('icon', keys, overrides)}
                palette={palette}
                recent={recent}
                onPick={(hex) => onApplyColour('icon', hex)}
                onInput={(hex) => onApplyColour('icon', hex, { collect: false })}
                onReset={() => onResetRow('icon')}
              />
            )}
            <AntvIconSearch current={iconCurrent} onPick={onApplyIcon} />
          </div>
        )}

        <div data-ai-element-panel-section="footer" className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            data-ai-element-colour-reset="true"
            data-picture-control="true"
            onClick={onResetColour}
            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
          >
            <RotateCcw size={12} /> Reset colours
          </button>
          <button
            type="button"
            data-ai-element-reset="true"
            data-picture-control="true"
            onClick={onReset}
            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
          >
            <RotateCcw size={12} /> Reset element
          </button>
          <button
            type="button"
            data-ai-element-delete="true"
            data-picture-control="true"
            onClick={onDelete}
            className="flex items-center gap-1 rounded border border-red-100 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </section>
    </DockedPanelShell>
  );
}
