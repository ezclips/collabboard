'use client';

import React from 'react';

import { mapAntvButton } from '@/lib/ai/antv/mapOutline';
import type { VisualOutline } from '@/lib/ai/outline';
import type { VisualIconName } from '@/lib/ai/visualIcons';

import type { Selection } from './AntvElementChrome';

/**
 * PATCH-262. "Change icon": reads the selected item icon's item index and writes
 * a new icon to that outline item. The item is found through the SAME mapping
 * AntV's own edit path uses (`mapAntvButton`), so the hierarchy root offset is
 * respected and there is no second mapping. The write is a content change and
 * goes through the editor's undoable `commitContent`.
 */
export interface UseAntvIconSwapOptions {
  selection: Selection | null;
  findElement: (key: string) => Element | null;
  template: string;
  outline: VisualOutline;
  /** The latest outline (content changes are emitted through `commitContent`). */
  getContent: () => VisualOutline;
  commitContent: (content: VisualOutline) => void;
  onPicked: () => void;
}

export interface AntvIconSwap {
  iconItemIndex: number | null;
  iconCurrent: string | null;
  applyIcon: (name: VisualIconName) => void;
}

export function useAntvIconSwap({
  selection,
  findElement,
  template,
  outline,
  getContent,
  commitContent,
  onPicked,
}: UseAntvIconSwapOptions): AntvIconSwap {
  const iconItemIndex = React.useMemo(() => {
    if (!selection || selection.kind !== 'element') return null;
    const el = findElement(selection.key);
    if (!el) return null;
    const type = el.getAttribute('data-element-type');
    if (type !== 'item-icon' && type !== 'item-icon-group') return null;
    const raw =
      el.getAttribute('data-indexes') ??
      el.querySelector('[data-indexes]')?.getAttribute('data-indexes') ??
      null;
    if (!raw) return null;
    const indexes = raw.split(',').map((part) => Number(part.trim()));
    if (!indexes.length || indexes.some((value) => !Number.isInteger(value) || value < 0)) return null;
    const target = mapAntvButton(indexes, 'add', template);
    return target && target.kind === 'item' ? target.itemIndex : null;
  }, [selection, findElement, template, outline]);

  const iconCurrent = iconItemIndex != null ? outline.items[iconItemIndex]?.icon ?? null : null;

  const applyIcon = React.useCallback(
    (name: VisualIconName) => {
      if (iconItemIndex == null) return;
      const content = getContent();
      const items = content.items.map((item, i) => (i === iconItemIndex ? { ...item, icon: name } : item));
      commitContent({ ...content, items });
      onPicked();
    },
    [iconItemIndex, getContent, commitContent, onPicked],
  );

  return { iconItemIndex, iconCurrent, applyIcon };
}
