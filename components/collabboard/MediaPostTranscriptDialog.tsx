"use client";

import React, { useEffect } from 'react';

import {
  KnowledgeTranscriptImportPanel,
  type KnowledgeTranscriptVersionHandle,
} from './KnowledgeTranscriptImportPanel';
import { transcriptImportVideoIdentity } from '@/lib/domain/knowledge/boardTranscriptIndex';

/**
 * Where the paste actually happens, once somebody asked for it.
 *
 * A DIALOG IS FINE HERE AND A POPUP WAS NOT, and the difference is who started
 * it. This opens because a person clicked "Add transcript" on a specific card;
 * the rejected design opened by itself whenever media was added, which turns
 * dropping ten links into ten interruptions. An interruption you asked for is
 * a workflow. One you did not is an obstacle.
 *
 * It holds no import logic of its own. The panel inside it is the same one that
 * has always done this work -- built in Stage 3b and, until now, mounted
 * nowhere, which is why pasting a transcript was possible only in principle.
 */
export interface MediaPostTranscriptDialogProps {
  readonly boardId: string;
  /** The card's URL. Closed when null. */
  readonly url: string | null;
  readonly title?: string;
  readonly onClose: () => void;
  /** Re-read the board index so the card that opened this updates. */
  readonly onImported: (handle: KnowledgeTranscriptVersionHandle) => void;
}

export function MediaPostTranscriptDialog({
  boardId,
  url,
  title,
  onClose,
  onImported,
}: MediaPostTranscriptDialogProps) {
  useEffect(() => {
    if (url === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [url, onClose]);

  if (url === null) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a transcript"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        // The backdrop closes; the dialog itself must not, or every click on a
        // field inside would dismiss the form the person is filling in.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Add a transcript</h2>
            <p className="mt-1 text-xs text-gray-600">
              Open the video, show its transcript, copy it, and paste it below. Choose
              “Copied from YouTube’s transcript panel” as the format so the timings are
              kept.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500">
            ✕
          </button>
        </div>

        <p className="mb-3 break-all text-[11px] text-gray-500">{url}</p>

        <KnowledgeTranscriptImportPanel
          boardId={boardId}
          // DERIVED FROM THE CARD, and null when this module cannot name the
          // video with confidence. A wrong identity is worse than none: it is
          // what the next card would dedupe against.
          initialVideoIdentity={transcriptImportVideoIdentity(url)}
          initialTitle={title}
          onImported={onImported}
        />
      </div>
    </div>
  );
}

export default MediaPostTranscriptDialog;
