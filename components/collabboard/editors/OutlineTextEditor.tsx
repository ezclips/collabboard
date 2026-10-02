'use client';

import React from 'react';

import { OUTLINE_LIMITS, type VisualOutline, type VisualOutlineItem } from '@/lib/ai/outline';
import { effectiveOutlineSides, insertItem } from '@/lib/ai/infographic/edit';
import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';

/**
 * PATCH-237. Edit text: a small form bound to the CURRENT outline -- title, and
 * per item its label, detail and icon, plus Add/remove within 2..8 items. Every
 * change calls onChange with the edited outline; the caller redraws locally with
 * no AI call.
 */
export default function OutlineTextEditor({
  outline,
  onChange,
}: {
  outline: VisualOutline;
  onChange: (next: VisualOutline) => void;
}) {
  const update = (patch: Partial<VisualOutline>) => onChange({ ...outline, ...patch });

  const updateItem = (index: number, patch: Partial<VisualOutlineItem>) => {
    const items = outline.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    update({ items });
  };

  // PATCH-250. Empty removes the value; a finite number >= 0 sets it; anything
  // else is ignored. Never mutates the outline it was given.
  const updateItemValue = (index: number, raw: string) => {
    const items = outline.items.map((item, i) => {
      if (i !== index) return item;
      if (raw === '') {
        const { value: _drop, ...rest } = item;
        return rest;
      }
      const next = Number(raw);
      if (Number.isFinite(next) && next >= 0) return { ...item, value: next };
      return item;
    });
    update({ items });
  };

  const showValues = outline.items.some((item) => typeof item.value === 'number');

  const addItem = () => {
    if (outline.items.length >= OUTLINE_LIMITS.items) return;
    // PATCH-242: add on the side with fewer items (tie -> right), after the
    // helper has frozen every existing item's current side.
    const sides = effectiveOutlineSides(outline.items);
    const left = sides.filter((side) => side === 'left').length;
    const side = left < sides.length - left ? 'left' : 'right';
    onChange(insertItem(outline, outline.items.length, { side }));
  };

  const removeItem = (index: number) => {
    if (outline.items.length <= OUTLINE_LIMITS.minItems) return;
    update({ items: outline.items.filter((_, i) => i !== index) });
  };

  return (
    <div data-ai-outline-editor="true" className="mt-2 space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">Title</label>
        <input
          type="text"
          data-ai-outline-title="true"
          value={outline.title}
          maxLength={OUTLINE_LIMITS.title}
          onChange={(e) => update({ title: e.target.value })}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>

      <div className="space-y-2">
        {outline.items.map((item, index) => (
          <div key={index} className="rounded-lg border border-gray-100 p-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                data-ai-outline-item-label={index}
                value={item.label}
                maxLength={OUTLINE_LIMITS.label}
                onChange={(e) => updateItem(index, { label: e.target.value })}
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <select
                data-ai-outline-item-icon={index}
                value={item.icon ?? ''}
                onChange={(e) => updateItem(index, { icon: e.target.value || undefined })}
                className="rounded border border-gray-300 px-1 py-1 text-xs"
                title="Icon"
              >
                <option value="">No icon</option>
                {VISUAL_ICON_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {showValues && (
                <input
                  type="number"
                  data-ai-outline-item-value={index}
                  value={item.value ?? ''}
                  min={0}
                  step="any"
                  onChange={(e) => updateItemValue(index, e.target.value)}
                  aria-label="Value"
                  title="Value"
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                  style={{ width: '5rem' }}
                />
              )}
              <button
                type="button"
                data-ai-outline-item-remove={index}
                onClick={() => removeItem(index)}
                disabled={outline.items.length <= OUTLINE_LIMITS.minItems}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                title="Remove item"
              >
                ×
              </button>
            </div>
            <input
              type="text"
              data-ai-outline-item-detail={index}
              value={item.detail ?? ''}
              maxLength={OUTLINE_LIMITS.detail}
              onChange={(e) => updateItem(index, { detail: e.target.value || undefined })}
              placeholder="Detail"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        data-ai-outline-add-item="true"
        onClick={addItem}
        disabled={outline.items.length >= OUTLINE_LIMITS.items}
        className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        Add item
      </button>
    </div>
  );
}
