"use client";

import React, { useEffect, useRef } from 'react';

interface DiscardChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
}

// PATCH-149B2-i §32.8: exactly two actions -- a third "Save" action would
// fork save-error handling into the confirmation, so it is deliberately
// excluded. No window.confirm: the repository has no existing accessible
// dialog primitive suited to this modal (kanban's ConfirmModal belongs to
// the separate kanban system; CanvasClient's inline delete-confirm has no
// role or accessible name).
export default function DiscardChangesDialog({ onKeepEditing, onDiscard }: DiscardChangesDialogProps) {
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-changes-title"
        aria-describedby="discard-changes-message"
        className="bg-white rounded-xl shadow-2xl w-[360px] p-5"
      >
        <h2 id="discard-changes-title" className="text-base font-semibold text-gray-900 mb-2">
          Discard changes?
        </h2>
        <p id="discard-changes-message" className="text-sm text-gray-600 mb-5">
          You have unsaved changes. If you discard now, they will be lost.
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={keepRef}
            type="button"
            onClick={onKeepEditing}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
