"use client";

import React, { useCallback, useEffect, useState } from 'react';

import {
  KnowledgeTranscriptImportPanel,
  type KnowledgeTranscriptVersionHandle,
} from './KnowledgeTranscriptImportPanel';
import { transcriptImportVideoIdentity } from '@/lib/domain/knowledge/boardTranscriptIndex';

/**
 * Where the paste happens, once somebody chose "Add transcript" from a link
 * post's right-click menu.
 *
 * ============================================================================
 * WHAT THIS FLOW CANNOT DO, AND WHY IT ASKS FOR THREE MANUAL STEPS
 * ============================================================================
 *
 * The obvious design is: open the video with its transcript panel already
 * showing, the text already selected, so the person presses copy once. Every
 * part of that is out of reach from a web page, and it is worth writing down so
 * it is not attempted again:
 *
 *   - WE CANNOT OPEN YOUTUBE'S TRANSCRIPT PANEL. There is no documented URL
 *     parameter that opens it, and opening it by script would mean running code
 *     on youtube.com, which the same-origin policy forbids outright.
 *   - WE CANNOT PRE-SELECT THE TEXT, for the same reason.
 *   - THERE IS NO COPY BUTTON IN YOUTUBE'S PANEL. Measured 2026-09-22 while
 *     reading the panel on a 34-minute video: the only way out of it is
 *     selecting the text and copying. So even a person following perfect
 *     instructions performs a manual selection.
 *
 * A browser extension could do all three, because an extension is allowed on
 * the page and we are not. That was considered and not taken.
 *
 * WHAT WE CAN DO is remove every step on OUR side of the boundary: the format
 * is already chosen, the video is already identified, the link is one click,
 * and the clipboard can be read in one click on return. That leaves the three
 * steps below, and no more.
 *
 * ORDER MATTERS, AND THE FIRST VERSION GOT IT WRONG. Choosing the menu item
 * opened the YouTube tab immediately. The new tab took focus, so these
 * instructions were behind it, and the owner arrived on YouTube without yet
 * knowing what to look for -- then could not find "Show transcript", which is
 * genuinely buried. The video now opens from a button in here, after the steps
 * have been read, and those steps name BOTH places YouTube puts that control.
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
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);

  useEffect(() => {
    if (url === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [url, onClose]);

  /**
   * Read the clipboard into the transcript box.
   *
   * ON A CLICK, NEVER ON FOCUS. Reading the clipboard requires a user gesture
   * and a permission the browser prompts for; doing it automatically when the
   * tab regains focus would fire a permission prompt the person did not ask
   * for, and would fail silently in every browser that does not implement
   * readText for pages at all. A button that says what it will do is both more
   * honest and more portable -- and Ctrl+V into the box below always works,
   * which is why this is an accelerator and not the only way in.
   */
  const pasteFromClipboard = useCallback(async () => {
    const box = document.getElementById('transcript-payload') as HTMLTextAreaElement | null;
    if (!box) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length === 0) {
        setClipboardNotice('The clipboard is empty. Copy the transcript first, then try again.');
        return;
      }
      // Set through the native setter so React's onChange sees it; assigning
      // `.value` on a controlled textarea updates the DOM and leaves React's
      // state behind, and the form would submit the empty string.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      setClipboardNotice(null);
    } catch {
      setClipboardNotice(
        'This browser would not let the page read the clipboard. Click in the box below and press Ctrl+V instead.',
      );
    }
  }, []);

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
        // field inside would dismiss the form being filled in.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold">Add a transcript</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500">
            ✕
          </button>
        </div>

        {/* READ FIRST, THEN LEAVE. The video used to open the moment the menu
            item was chosen, which took focus and put these instructions behind
            it -- so the owner arrived on YouTube not yet knowing what to look
            for, and found the steps only after coming back. */}
        <ol className="mb-3 list-decimal space-y-2 pl-5 text-xs text-gray-700">
          <li>
            <span className="font-medium">Open the video</span>, then find its transcript.
            YouTube hides it in one of two places:
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-gray-600">
              <li>
                under the video, click <span className="font-medium">“…more”</span> in the
                description, then scroll to the bottom and click{' '}
                <span className="font-medium">“Show transcript”</span>; or
              </li>
              <li>
                click the <span className="font-medium">“···”</span> next to the Share
                button and choose <span className="font-medium">“Show transcript”</span>.
              </li>
            </ul>
          </li>
          <li>Click inside the transcript panel, select all of it, and copy (Ctrl+C).</li>
          <li>
            Come back to this tab and press <span className="font-medium">“Paste
            transcript”</span>.
          </li>
        </ol>
        <p className="mb-3 text-[11px] text-gray-500">
          Leave the timestamps switched on — they are what lets a citation open the video
          at the moment the words were said.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* THE PRIMARY ACTION, and it is a real click rather than something
              that fired on the way in -- so the popup blocker allows it for the
              same reason it allowed the old one, and the person has read the
              steps before they land there. */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white no-underline"
          >
            Open the video on YouTube ↗
          </a>
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800"
          >
            Paste transcript
          </button>
        </div>

        {clipboardNotice ? (
          <p role="alert" className="mb-3 text-[11px] text-amber-700">
            {clipboardNotice}
          </p>
        ) : null}

        <p className="mb-3 break-all text-[11px] text-gray-500">{url}</p>

        <KnowledgeTranscriptImportPanel
          boardId={boardId}
          // ESTABLISHED BY THE ROUTE TAKEN, not sniffed from the bytes: this
          // dialog sent them to YouTube's own panel. Still visible and still
          // changeable, and a caption file pasted under it is refused by name.
          initialFormat="youtube-panel"
          // DERIVED FROM THE CARD, and null when the video cannot be named with
          // confidence. A wrong identity is worse than none: it is what the
          // next card would dedupe against.
          initialVideoIdentity={transcriptImportVideoIdentity(url)}
          initialTitle={title}
          onImported={onImported}
        />
      </div>
    </div>
  );
}

export default MediaPostTranscriptDialog;
