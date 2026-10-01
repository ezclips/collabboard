'use client';

import React from 'react';

/**
 * PATCH-240. The thin HTML layer over an AI picture's SVG: the blue +/− circles,
 * the inline text input, and the colour popover. It is pure presentation -- the
 * renderer owns the state and the edit helpers. Never part of the saved picture.
 */

export interface EditHandle {
  key: string;
  kind: 'add' | 'remove';
  /** Percentage position inside the preview box. */
  left: number;
  top: number;
  /** The attribute value (`data-ai-edit-add` / `data-ai-edit-remove`). */
  target: string;
  onActivate: () => void;
}

export interface ActiveEdit {
  key: string;
  value: string;
  maxLength: number;
  left: number;
  top: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export interface ColorPopoverState {
  key: string;
  left: number;
  top: number;
  /** The theme's six palette stroke colours. */
  swatches: readonly string[];
  onPick: (colorIndex: number | null) => void;
}

function EditInput({ edit }: { edit: ActiveEdit }) {
  const doneRef = React.useRef(false);
  const commit = (value: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    edit.onCommit(value);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    edit.onCancel();
  };

  return (
    <input
      data-ai-edit-input="true"
      data-no-drag="true"
      autoFocus
      defaultValue={edit.value}
      maxLength={edit.maxLength}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
        else if (e.key === 'Escape') cancel();
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      className="pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded border border-indigo-400 bg-white px-1 py-0.5 text-xs shadow-md outline-none"
      style={{ left: `${edit.left}%`, top: `${edit.top}%`, minWidth: 80 }}
    />
  );
}

export default function PictureEditOverlay({
  handles,
  activeEdit,
  colorPopover,
}: {
  handles: EditHandle[];
  activeEdit?: ActiveEdit | null;
  colorPopover?: ColorPopoverState | null;
}) {
  return (
    <div data-ai-edit-overlay="true" className="pointer-events-none absolute inset-0 z-20">
      {handles.map((handle) => (
        <button
          key={handle.key}
          type="button"
          data-no-drag="true"
          {...(handle.kind === 'add' ? { 'data-ai-edit-add': handle.target } : { 'data-ai-edit-remove': handle.target })}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            handle.onActivate();
          }}
          title={handle.kind === 'add' ? 'Add' : 'Remove'}
          className="pointer-events-auto absolute z-30 flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-blue-500 text-[12px] font-bold leading-none text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
          style={{ left: `${handle.left}%`, top: `${handle.top}%` }}
        >
          {handle.kind === 'add' ? '+' : '\u2212'}
        </button>
      ))}

      {activeEdit && <EditInput edit={activeEdit} />}

      {colorPopover && (
        <div
          data-ai-edit-color-popover="true"
          data-no-drag="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
          style={{ left: `${colorPopover.left}%`, top: `${colorPopover.top}%` }}
        >
          {colorPopover.swatches.map((swatch, index) => (
            <button
              key={index}
              type="button"
              data-ai-edit-color={index}
              aria-label={`Colour ${index + 1}`}
              onClick={() => colorPopover.onPick(index)}
              className="h-5 w-5 rounded-full border border-gray-300"
              style={{ background: swatch }}
            />
          ))}
          <button
            type="button"
            data-ai-edit-color="auto"
            onClick={() => colorPopover.onPick(null)}
            className="rounded px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
          >
            Auto
          </button>
        </div>
      )}
    </div>
  );
}
