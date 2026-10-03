'use client';

import React, { createContext, useContext, useState } from 'react';

/**
 * PATCH-264. The small uppercase label printed above a diagram's title
 * ("MINDMAP", "INFOGRAPHIC", ...). It is editable/removable only inside a
 * non-null provider (the generator's main preview and the Edit window);
 * everywhere else -- the board, thumbnails, design tiles -- it is plain text.
 */
export interface DiagramKickerEditContextValue {
  onChange: (next: string | undefined) => void;
}

export const DiagramKickerEditContext = createContext<DiagramKickerEditContextValue | null>(null);

/**
 * PATCH-264. A null provider: render every `DiagramKicker` below it as plain
 * text. Wrap a design tile, the hover preview or any thumbnail that sits inside
 * the edit provider, so the read-only decision is made DURING render. Deciding
 * it after mount draws the editable span + buttons on the first paint, which is
 * an invalid nested `<button>` inside the tile's own button.
 */
export function DiagramKickerReadOnly({ children }: { children: React.ReactNode }) {
  return <DiagramKickerEditContext.Provider value={null}>{children}</DiagramKickerEditContext.Provider>;
}

export interface DiagramKickerProps {
  /** `undefined` -> the renderer's default label; `''` -> no label. */
  value: string | undefined;
  fallback: string;
  color?: string;
  className?: string;
}

const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.18em]';
const MAX_LENGTH = 40;

function DiagramKicker({ value, fallback, color, className }: DiagramKickerProps) {
  const context = useContext(DiagramKickerEditContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const canEdit = context !== null;
  const text = value ?? fallback;

  // Starting from the removed state ('') the input pre-fills the default label,
  // so Enter / blur without a change restores the default instead of storing
  // the default text as a custom label.
  const startEditing = () => {
    setDraft(value === '' ? fallback : value ?? fallback);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim().slice(0, MAX_LENGTH);
    if (next === '') {
      context?.onChange('');
      return;
    }
    // An unchanged default is the default, not a custom label.
    context?.onChange(next === fallback ? undefined : next);
  };

  const stopPointer = (event: React.PointerEvent) => event.stopPropagation();
  const controlProps = {
    'data-picture-control': 'true',
    onPointerDown: stopPointer,
  } as const;

  if (!canEdit) {
    if (value === '') return null;
    return (
      <div
        data-ai-kicker="true"
        className={`${LABEL_CLASS} ${className ?? ''}`.trim()}
        style={color ? { color } : undefined}
      >
        {text}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" {...controlProps}>
        <input
          data-ai-kicker-input="true"
          autoFocus
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={commit}
          className={`${LABEL_CLASS} min-w-[80px] rounded border border-dashed border-blue-400 bg-white px-1 outline-none ${className ?? ''}`.trim()}
          style={color ? { color } : undefined}
        />
      </div>
    );
  }

  if (value === '') {
    return (
      <div className="flex items-center">
        <button
          type="button"
          data-ai-kicker-add="true"
          title="Add label"
          {...controlProps}
          onClick={() => {
            context.onChange(undefined);
            startEditing();
          }}
          className="text-[11px] font-medium text-gray-400 hover:text-gray-600"
        >
          + Add label
        </button>
      </div>
    );
  }

  return (
    <div className="group/kicker flex items-center gap-1">
      <span
        data-ai-kicker="true"
        role="button"
        tabIndex={0}
        title="Edit label"
        {...controlProps}
        onClick={startEditing}
        className={`${LABEL_CLASS} cursor-text rounded border border-dashed border-transparent hover:border-gray-400 ${className ?? ''}`.trim()}
        style={color ? { color } : undefined}
      >
        {text}
      </span>
      <button
        type="button"
        data-ai-kicker-remove="true"
        title="Remove label"
        {...controlProps}
        onClick={() => context.onChange('')}
        className="text-sm leading-none text-gray-400 opacity-0 transition-opacity hover:text-gray-700 group-hover/kicker:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

export default React.memo(DiagramKicker);
