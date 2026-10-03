'use client';

import React from 'react';

/**
 * PATCH-262. The small inline input for editing an added text on the picture.
 * Enter/blur commits, Escape cancels (and is consumed first, PATCH-265). It is a
 * picture control, so a press is never pan-captured by PictureStage.
 */
export interface AntvAddedTextInputProps {
  value: string;
  /** Percent position inside the overlay (the addition's centre). */
  left: number;
  top: number;
  counterScale: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export default function AntvAddedTextInput({
  value,
  left,
  top,
  counterScale,
  onCommit,
  onCancel,
}: AntvAddedTextInputProps) {
  const doneRef = React.useRef(false);
  const finish = (action: () => void) => {
    if (doneRef.current) return;
    doneRef.current = true;
    action();
  };

  return (
    <input
      data-ai-addition-text-input="true"
      data-picture-control="true"
      autoFocus
      defaultValue={value}
      maxLength={200}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(() => onCommit(event.currentTarget.value));
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(onCancel);
        }
      }}
      onBlur={(event) => finish(() => onCommit(event.currentTarget.value))}
      className="absolute z-40 w-40 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-sm shadow-md outline-none"
      style={{
        pointerEvents: 'auto',
        left: `${left}%`,
        top: `${top}%`,
        transform: `translate(-50%, -50%) scale(${counterScale})`,
      }}
    />
  );
}
