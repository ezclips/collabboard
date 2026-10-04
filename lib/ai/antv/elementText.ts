/**
 * PATCH-275. The pure text model behind the element panel: which text fields the
 * current selection has (section B.1) and how a field/style edit rewrites the
 * outline. No React, no DOM; never mutates its input.
 *
 * The element type -> field mapping and the root-offset rule reuse
 * `outlineItemIndexForElementPath` / `isHierarchyTemplate` from `mapOutline.ts`,
 * so there is never a second mapping.
 */

import { additionIdFromKey, findAdditionByKey, isAdditionKey } from './additions';
import { isHierarchyTemplate, outlineItemIndexForElementPath } from './mapOutline';
import { overridesForTemplate } from './templateOverrides';
import {
  sanitizeTextStyle,
  type TextStyle,
  type VisualOutline,
} from '@/lib/ai/outline';

export type TextFieldName = 'label' | 'detail' | 'value' | 'title' | 'child' | 'addition';

export type TextStyleTarget =
  | { scope: 'title' }
  | { scope: 'item'; index: number; part: 'label' | 'detail' };

export interface TextFieldDescriptor {
  field: TextFieldName;
  /** `[]` for the title / an addition, `[i]` for an item, `[i, j]` for a child. */
  path: number[];
  value: string;
  /** Where the text style applies (item label/detail, or the title). */
  styleTarget?: TextStyleTarget;
  /** For an added text: its stable addition key. */
  additionKey?: string;
  /** The UI label for this field. */
  label: string;
}

const TYPE_TO_FIELD: Record<string, 'label' | 'detail' | 'value'> = {
  'item-label': 'label',
  'item-desc': 'detail',
  'item-value': 'value',
};

interface ParsedKey {
  type: string;
  indexes: number[];
}

/** `item-label@0,1#0` -> `{ type: 'item-label', indexes: [0, 1] }`. */
function parseKey(key: string): ParsedKey | null {
  const at = key.indexOf('@');
  const hash = key.indexOf('#');
  const typeEnd = at === -1 ? (hash === -1 ? key.length : hash) : at;
  const type = key.slice(0, typeEnd);
  if (!type) return null;
  if (at === -1) return { type, indexes: [] };
  const end = hash === -1 ? key.length : hash;
  const indexes = key
    .slice(at + 1, end)
    .split(',')
    .map((part) => Number(part.trim()));
  if (indexes.length === 0 || indexes.some((value) => !Number.isInteger(value) || value < 0)) return null;
  return { type, indexes };
}

/** A depth-2 AntV path -> our `[i, j]` child path; `null` for an item/title. */
function childPath(indexes: number[], hierarchy: boolean): [number, number] | null {
  if (hierarchy) {
    if (indexes.length !== 3 || indexes[0] !== 0) return null;
    return [indexes[1], indexes[2]];
  }
  if (indexes.length !== 2) return null;
  return [indexes[0], indexes[1]];
}

function itemFieldDescriptor(
  field: 'label' | 'detail' | 'value',
  index: number,
  outline: VisualOutline,
): TextFieldDescriptor | null {
  const item = outline.items[index];
  if (!item) return null;
  if (field === 'label') {
    return {
      field: 'label',
      path: [index],
      value: item.label,
      styleTarget: { scope: 'item', index, part: 'label' },
      label: 'Label',
    };
  }
  if (field === 'detail') {
    return {
      field: 'detail',
      path: [index],
      value: item.detail ?? '',
      styleTarget: { scope: 'item', index, part: 'detail' },
      label: 'Description',
    };
  }
  return {
    field: 'value',
    path: [index],
    value: item.value !== undefined ? String(item.value) : '',
    label: 'Value',
  };
}

/**
 * PATCH-275. The text fields for the current selection. A whole item shows its
 * label, plus detail and value when the item has them or the design draws them;
 * a single text part shows only that part; a title, a mind-map child and an
 * added text each show their one field.
 */
export function textFieldsForSelection(
  outline: VisualOutline,
  template: string,
  keys: string[],
): TextFieldDescriptor[] {
  if (keys.length === 0) return [];

  const additionKey = keys.find((key) => isAdditionKey(key));
  if (additionKey) {
    const addition = findAdditionByKey(overridesForTemplate(outline, template), additionKey);
    if (!addition || addition.kind !== 'text') return [];
    return [
      {
        field: 'addition',
        path: [],
        value: addition.label ?? '',
        additionKey,
        label: 'Text',
      },
    ];
  }

  const parsed = keys.map(parseKey).filter((value): value is ParsedKey => value !== null);
  const first = parsed[0];
  if (!first) return [];

  const hierarchy = isHierarchyTemplate(template);

  if (first.type === 'title') {
    return [
      { field: 'title', path: [], value: outline.title, styleTarget: { scope: 'title' }, label: 'Title' },
    ];
  }

  const child = childPath(first.indexes, hierarchy);
  if (keys.length === 1 && child) {
    const [i, j] = child;
    const value = outline.items[i]?.children?.[j]?.label ?? '';
    return [{ field: 'child', path: [i, j], value, label: 'Label' }];
  }

  const index = outlineItemIndexForElementPath(first.indexes, template);
  if (index === null) {
    // A hierarchy root (the title) is drawn as an unindexed item-label at [0].
    if (hierarchy && first.indexes.length === 1 && first.indexes[0] === 0) {
      return [
        { field: 'title', path: [], value: outline.title, styleTarget: { scope: 'title' }, label: 'Title' },
      ];
    }
    return [];
  }

  const item = outline.items[index];
  if (!item) return [];

  if (keys.length === 1) {
    const mapped = TYPE_TO_FIELD[first.type];
    if (!mapped) return [];
    const descriptor = itemFieldDescriptor(mapped, index, outline);
    return descriptor ? [descriptor] : [];
  }

  const types = new Set(parsed.map((value) => value.type));
  const fields: TextFieldDescriptor[] = [];
  const label = itemFieldDescriptor('label', index, outline);
  if (label) fields.push(label);
  if (item.detail !== undefined || types.has('item-desc')) {
    const detail = itemFieldDescriptor('detail', index, outline);
    if (detail) fields.push(detail);
  }
  if (item.value !== undefined || types.has('item-value')) {
    const value = itemFieldDescriptor('value', index, outline);
    if (value) fields.push(value);
  }
  return fields;
}

/**
 * PATCH-275. A NEW outline with one text field set. A value edit clears
 * `valueExample` (an edited value is real); an empty value removes it. Pure.
 */
export function outlineWithTextField(
  outline: VisualOutline,
  path: number[],
  field: TextFieldName,
  value: string,
): VisualOutline {
  if (field === 'title') {
    return outline.title === value ? outline : { ...outline, title: value };
  }

  const [i, j] = path;
  const item = outline.items[i];
  if (!item) return outline;

  if (j !== undefined) {
    if (field !== 'child') return outline;
    const children = item.children ? item.children.slice() : [];
    if (!children[j] || children[j].label === value) return outline;
    children[j] = { ...children[j], label: value };
    const items = outline.items.slice();
    items[i] = { ...item, children };
    return { ...outline, items };
  }

  const items = outline.items.slice();
  if (field === 'label') {
    if (item.label === value) return outline;
    items[i] = { ...item, label: value };
  } else if (field === 'detail') {
    if ((item.detail ?? '') === value) return outline;
    const next = { ...item };
    if (value) next.detail = value;
    else delete next.detail;
    items[i] = next;
  } else if (field === 'value') {
    const next = { ...item };
    if (value.trim() === '') {
      delete next.value;
      delete next.valueExample;
    } else {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) return outline;
      next.value = number;
      delete next.valueExample;
    }
    items[i] = next;
  } else {
    return outline;
  }

  return { ...outline, items };
}

/**
 * PATCH-275. A NEW outline with a text style patch merged onto the target and
 * sanitised. An empty result removes the style. Pure.
 */
export function outlineWithTextStyle(
  outline: VisualOutline,
  target: TextStyleTarget,
  patch: TextStyle,
): VisualOutline {
  if (target.scope === 'title') {
    const merged = sanitizeTextStyle({ ...(outline.titleStyle ?? {}), ...patch });
    const next = { ...outline };
    if (merged) next.titleStyle = merged;
    else delete next.titleStyle;
    return next;
  }

  const item = outline.items[target.index];
  if (!item) return outline;
  const style = item.textStyle ?? {};
  const partStyle = sanitizeTextStyle({ ...(style[target.part] ?? {}), ...patch });
  const nextStyle = { ...style };
  if (partStyle) nextStyle[target.part] = partStyle;
  else delete nextStyle[target.part];

  const items = outline.items.slice();
  const nextItem = { ...item };
  if (Object.keys(nextStyle).length) nextItem.textStyle = nextStyle;
  else delete nextItem.textStyle;
  items[target.index] = nextItem;
  return { ...outline, items };
}
