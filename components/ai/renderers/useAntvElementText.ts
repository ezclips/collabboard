'use client';

import React from 'react';

import type { EditEntry } from '@/lib/ai/antv/editHistory';
import {
  outlineWithTextField,
  outlineWithTextStyle,
  textFieldsForSelection,
  type TextFieldDescriptor,
  type TextStyleTarget,
} from '@/lib/ai/antv/elementText';
import type { TextStyle, VisualOutline } from '@/lib/ai/outline';

/**
 * PATCH-275. The element panel's text state: which fields the selection has and
 * how a field edit becomes an undoable content change. One history entry per
 * field per focus; later commits in the same focus apply live.
 *
 * PATCH-276. The fields are always the OBJECT's: the caller passes the whole
 * item's member keys, so a drill-down does not change the fields.
 */

export interface UseAntvElementTextOptions {
  template: string;
  /** PATCH-276. The whole object's member keys. */
  keys: string[];
  /** The latest outline (a live-edit must start from the current value). */
  getContent: () => VisualOutline;
  /** Applies a content change and records `entry` when non-null. */
  commitOutline: (next: VisualOutline, entry: EditEntry | null) => void;
}

export interface AntvElementText {
  fields: TextFieldDescriptor[];
  beginField: (field: TextFieldDescriptor) => void;
  endField: () => void;
  commitField: (field: TextFieldDescriptor, value: string) => void;
  revertValue: (field: TextFieldDescriptor) => string;
  commitStyle: (target: TextStyleTarget, patch: TextStyle) => void;
}

interface FieldSession {
  key: string;
  before: string;
  recorded: boolean;
}

function fieldKey(field: TextFieldDescriptor): string {
  return `${field.field}:${field.path.join(',')}:${field.additionKey ?? ''}`;
}

function currentValue(outline: VisualOutline, field: TextFieldDescriptor): string {
  const [i, j] = field.path;
  if (field.field === 'title') return outline.title;
  const item = outline.items[i];
  if (!item) return '';
  if (field.field === 'child') return item.children?.[j]?.label ?? '';
  if (field.field === 'label') return item.label;
  if (field.field === 'detail') return item.detail ?? '';
  if (field.field === 'value') return item.value !== undefined ? String(item.value) : '';
  return '';
}

function buildEntry(field: TextFieldDescriptor, before: string, after: string): EditEntry | null {
  if (field.field === 'title') return { kind: 'title', before, after };
  if (field.field === 'value' || field.field === 'addition') return null;
  if (field.field === 'child') {
    return { kind: 'item-field', path: field.path, field: 'label', before, after };
  }
  return { kind: 'item-field', path: field.path, field: field.field, before, after };
}

export function useAntvElementText(options: UseAntvElementTextOptions): AntvElementText {
  const { template, keys, getContent, commitOutline } = options;
  const sessionRef = React.useRef<FieldSession | null>(null);

  const fields = React.useMemo(
    () => textFieldsForSelection(getContent(), template, keys),
    // The keys identity is enough: the fields are recomputed whenever the
    // outline changes as well, so a committed edit is reflected.
    [getContent, template, keys],
  );

  const beginField = React.useCallback(
    (field: TextFieldDescriptor) => {
      sessionRef.current = { key: fieldKey(field), before: currentValue(getContent(), field), recorded: false };
    },
    [getContent],
  );

  const endField = React.useCallback(() => {
    sessionRef.current = null;
  }, []);

  const revertValue = React.useCallback(
    (field: TextFieldDescriptor) => sessionRef.current?.before ?? currentValue(getContent(), field),
    [getContent],
  );

  const commitField = React.useCallback(
    (field: TextFieldDescriptor, value: string) => {
      const content = getContent();
      const next = outlineWithTextField(content, field.path, field.field, value);
      if (next === content) return;
      const session = sessionRef.current;
      if (!session || session.key !== fieldKey(field)) {
        sessionRef.current = { key: fieldKey(field), before: currentValue(content, field), recorded: false };
      }
      const active = sessionRef.current!;
      if (!active.recorded) {
        active.recorded = true;
        commitOutline(next, buildEntry(field, active.before, value));
      } else {
        commitOutline(next, null);
      }
    },
    [commitOutline, getContent],
  );

  const commitStyle = React.useCallback(
    (target: TextStyleTarget, patch: TextStyle) => {
      const content = getContent();
      const next = outlineWithTextStyle(content, target, patch);
      if (next === content) return;
      const entry: EditEntry | null =
        target.scope === 'item'
          ? {
              kind: 'item-field',
              path: [target.index],
              field: 'textStyle',
              before: content.items[target.index]?.textStyle,
              after: next.items[target.index]?.textStyle,
            }
          : null;
      commitOutline(next, entry);
    },
    [commitOutline, getContent],
  );

  return { fields, beginField, endField, commitField, revertValue, commitStyle };
}
