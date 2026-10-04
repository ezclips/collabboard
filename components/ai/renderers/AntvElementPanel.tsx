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
  colourPartsForObject,
  colourRowsForObject,
  rowApplies,
  rowOverride,
  type ColourPart,
  type ColourRow,
} from './useAntvElementColour';
import { useAntvElementText } from './useAntvElementText';

/**
 * PATCH-275. The element's own side panel: its text (content and style), its
 * shape colours, its icon and its reset/delete. Rendered in the shared docked
 * shell and portalled into the provider's host. It never deselects and never
 * covers the picture.
 *
 * PATCH-276. The panel's subject is the OBJECT: whether the user selected the
 * whole item or drilled into one part, the title and sections are the item's,
 * and the drilled part only marks its section active.
 */

export interface AntvElementPanelProps {
  selection: Selection;
  outline: VisualOutline;
  template: string;
  palette: readonly string[];
  recent: readonly string[];
  overrides: ElementOverrides | undefined;
  findElement: (key: string) => Element | null;
  /** PATCH-276. The whole object's member keys (the item's parts). */
  objectKeys: string[];
  /** PATCH-276. The override key of a DOM element (badge keys included). */
  elementKeyOf: (el: Element) => string | null;
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

/** PATCH-276. The label an element path refers to (an item's or a child's). */
function labelForElementPath(parsed: ParsedKey, outline: VisualOutline, template: string): string {
  const hierarchy = isHierarchyTemplate(template);
  const indexes = parsed.indexes;
  const childIndex = hierarchy
    ? indexes.length === 3 && indexes[0] === 0
      ? indexes[2]
      : null
    : indexes.length === 2
      ? indexes[1]
      : null;
  const itemIndex = outlineItemIndexForElementPath(indexes, template);
  if (childIndex !== null && itemIndex !== null) {
    return outline.items[itemIndex]?.children?.[childIndex]?.label ?? '';
  }
  return itemIndex !== null ? outline.items[itemIndex]?.label ?? '' : '';
}

/** PATCH-276. What the panel header says: the OBJECT's label, never a key. */
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

  if (isHierarchyTemplate(template)) {
    // The hierarchy root is drawn as an unindexed item-label at [0]: it is the title.
    if (parsed.indexes.length === 1 && parsed.indexes[0] === 0) return outline.title || 'Title';
    const label = labelForElementPath(parsed, outline, template);
    return label ? `Node · ${label}` : 'Node';
  }

  const label = labelForElementPath(parsed, outline, template);
  const index = outlineItemIndexForElementPath(parsed.indexes, template);
  return index !== null ? `Card ${index + 1} · ${label}` : label || 'Element';
}

/** PATCH-276. The footer noun for the object: a card, a node, or an element. */
export function panelObjectNoun(selection: Selection, template: string): 'card' | 'node' | 'element' {
  const keys = selectedKeys(selection);
  const parsed = keys.length ? parseKey(keys[0]) : null;
  if (!parsed || parsed.type === 'title' || parsed.type === 'ai-addition') return 'element';
  return isHierarchyTemplate(template) ? 'node' : 'card';
}

/** PATCH-276. The panel section a drilled part marks active. */
function sectionForElement(el: Element | null): 'text' | 'shape' | 'icon' | null {
  if (!el) return null;
  if (rowApplies('text', el)) return 'text';
  if (rowApplies('icon', el)) return 'icon';
  if (rowApplies('fill', el)) return 'shape';
  return null;
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
  /** PATCH-276 Addendum 1. Which field this block styles, e.g. "Label style". */
  label: string;
  style: TextStyle | undefined;
  commitStyle: (target: StyleControlsProps['target'], patch: TextStyle) => void;
}

function StyleControls({ target, label, style, commitStyle }: StyleControlsProps) {
  const size = style?.fontSize;
  const family = style?.fontFamily ?? '';
  const align = style?.align ?? 'left';

  const setSize = (value: number) => {
    const clamped = Math.max(OUTLINE_FONT_SIZE_MIN, Math.min(OUTLINE_FONT_SIZE_MAX, value));
    commitStyle(target, { fontSize: clamped });
  };

  return (
    <div className="space-y-2 rounded border border-gray-100 bg-gray-50/60 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
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
  objectKeys,
  elementKeyOf,
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
  const text = useAntvElementText({ template, keys: objectKeys, getContent, commitOutline });

  const rows = React.useMemo(() => colourRowsForObject(objectKeys, findElement), [objectKeys, findElement]);
  const partsFor = React.useCallback(
    (row: ColourRow): ColourPart[] => colourPartsForObject(row, objectKeys, findElement, elementKeyOf),
    [objectKeys, findElement, elementKeyOf],
  );
  const textParts = partsFor('text');
  const fillParts = partsFor('fill');
  const borderParts = partsFor('border');
  const iconParts = partsFor('icon');
  const badgeParts = partsFor('badge');

  const additionField = text.fields.find((field) => field.field === 'addition');
  const styles = text.fields.filter((field) => field.styleTarget);

  const title = panelTitle(selection, outline, template, findElement);
  const noun = panelObjectNoun(selection, template);
  const activeSection =
    selection.kind === 'element' && selection.scope !== null ? sectionForElement(findElement(selection.key)) : null;
  const activeRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (activeSection) activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeSection]);
  const sectionActive = (name: 'text' | 'shape' | 'icon') => activeSection === name;
  const sectionClass = (name: 'text' | 'shape' | 'icon', spacing: string) =>
    `${spacing}${sectionActive(name) ? ' border-l-2 border-blue-400 pl-2' : ''}`;
  const sectionRef = (name: 'text' | 'shape' | 'icon') => (sectionActive(name) ? activeRef : undefined);

  const hasText = text.fields.length > 0 || rows.includes('text');
  const hasShape = rows.includes('fill') || rows.includes('border');
  const hasIcon = rows.includes('icon') || rows.includes('badge') || iconItemIndex != null;

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
          <div
            ref={sectionRef('text')}
            data-ai-element-panel-section="text"
            data-ai-element-panel-section-active={sectionActive('text') ? 'true' : undefined}
            className={sectionClass('text', 'space-y-3')}
          >
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
            {styles.map((field) => {
              const target = field.styleTarget!;
              const part = target.scope === 'item' ? target.part : '';
              return (
                <StyleControls
                  key={`style:${target.scope}:${part}:${field.path.join(',')}`}
                  label={`${field.label} style`}
                  target={target}
                  style={styleForTarget(outline, target)}
                  commitStyle={text.commitStyle}
                />
              );
            })}
            {textParts.length > 0 && (
              <AntvColourField
                row="text"
                label={COLOUR_ROW_LABELS.text}
                kind="text"
                parts={textParts.map((part) => part.el)}
                override={rowOverride('text', textParts, overrides)}
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
          <div
            ref={sectionRef('shape')}
            data-ai-element-panel-section="shape"
            data-ai-element-panel-section-active={sectionActive('shape') ? 'true' : undefined}
            className={sectionClass('shape', 'space-y-2')}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Shape</div>
            {rows.includes('fill') && (
              <AntvColourField
                row="fill"
                label={COLOUR_ROW_LABELS.fill}
                kind="fill"
                parts={fillParts.map((part) => part.el)}
                override={rowOverride('fill', fillParts, overrides)}
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
                parts={borderParts.map((part) => part.el)}
                override={rowOverride('border', borderParts, overrides)}
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
          <div
            ref={sectionRef('icon')}
            data-ai-element-panel-section="icon"
            data-ai-element-panel-section-active={sectionActive('icon') ? 'true' : undefined}
            className={sectionClass('icon', 'space-y-2')}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Icon</div>
            {rows.includes('icon') && (
              <AntvColourField
                row="icon"
                label={COLOUR_ROW_LABELS.icon}
                kind="fill"
                parts={iconParts.map((part) => part.el)}
                override={rowOverride('icon', iconParts, overrides)}
                palette={palette}
                recent={recent}
                onPick={(hex) => onApplyColour('icon', hex)}
                onInput={(hex) => onApplyColour('icon', hex, { collect: false })}
                onReset={() => onResetRow('icon')}
              />
            )}
            {rows.includes('badge') && (
              <AntvColourField
                row="badge"
                label={COLOUR_ROW_LABELS.badge}
                kind="fill"
                parts={badgeParts.map((part) => part.el)}
                override={rowOverride('badge', badgeParts, overrides)}
                palette={palette}
                recent={recent}
                onPick={(hex) => onApplyColour('badge', hex)}
                onInput={(hex) => onApplyColour('badge', hex, { collect: false })}
                onReset={() => onResetRow('badge')}
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
            <RotateCcw size={12} /> Reset {noun}
          </button>
          <button
            type="button"
            data-ai-element-delete="true"
            data-picture-control="true"
            onClick={onDelete}
            className="flex items-center gap-1 rounded border border-red-100 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
          >
            <Trash2 size={12} /> Delete {noun}
          </button>
        </div>
      </section>
    </DockedPanelShell>
  );
}
