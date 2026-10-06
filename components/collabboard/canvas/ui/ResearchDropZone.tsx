'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  isBoardPdfUploadAvailable,
  openBoardPdfPicker,
  uploadBoardPdfs,
} from '@/lib/collabboard/boardUploadBridge';

/**
 * PATCH-302. The body of the Research template's `upload` post: a PDF drop
 * zone in the middle of the board. It renders only when the post's metadata
 * says so; moving, resizing and deleting the card stay the note's own.
 */
export interface ResearchDropZoneProps {
  /** The post title, shown as the zone's heading. */
  title: string;
}

export default function ResearchDropZone({ title }: ResearchDropZoneProps) {
  const available = isBoardPdfUploadAvailable();
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    // Stop here: the canvas' own drop handler is for posts and clips, and a
    // dropped PDF must not also be read as one.
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    if (!available) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    const { rejected } = uploadBoardPdfs(files);
    if (rejected > 0) toast.error('Only PDF files can be added here.');
  };

  return (
    <div
      data-research-drop-zone="true"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (available && !dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center"
      style={{
        borderColor: dragOver ? '#2563eb' : '#93c5fd',
        backgroundColor: dragOver ? '#dbeafe' : '#eff6ff',
      }}
    >
      <img src="/templates/freeform/research/inbox-tray.svg" alt="" width={56} height={56} />
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="max-w-xs text-xs text-gray-600">
        {available
          ? 'Drop a PDF here or choose a file. It lands on this board, and Board AI can read it with you.'
          : "PDFs added by the board's editors appear here."}
      </p>
      {available && (
        <button
          type="button"
          data-no-drag="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={openBoardPdfPicker}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          Choose a PDF
        </button>
      )}
    </div>
  );
}
