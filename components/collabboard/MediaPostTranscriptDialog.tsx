"use client";

import React, { useCallback, useEffect, useState } from 'react';

import {
  KnowledgeTranscriptImportPanel,
  type KnowledgeTranscriptVersionHandle,
} from './KnowledgeTranscriptImportPanel';
import { transcriptImportVideoIdentity } from '@/lib/domain/knowledge/boardTranscriptIndex';
import { mediaPostVideoIdentity } from '@/lib/domain/knowledge/mediaPostVideoIdentity';
import type { KnowledgeTranscriptFormat } from '@/lib/domain/knowledge/knowledgeTranscriptCues';

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
 *
 * ============================================================================
 * PATCH-204: ONE TAB PER APP, AND THE TRUTH ABOUT EACH
 * ============================================================================
 *
 * The owner asked for YouTube, Spotify, Apple and "so on", because the workflow
 * never changes -- only the instruction for each app does. So the header steps
 * became a tab per app. Each tab says honestly what that app allows (Spotify
 * lets you copy nothing; Apple only a few paragraphs at a time) and how to get
 * the text out of it anyway. The import itself is unchanged, and the paste box
 * and import panel below are shared: switching tabs never clears what someone
 * pasted.
 */
/**
 * Where "Open the video" should actually go.
 *
 * ALWAYS THE ORDINARY WATCH PAGE FOR YOUTUBE, whatever URL the card holds.
 * Found by the owner: a card linking `youtube.com/shorts/<id>` opened the
 * Shorts player, which has NO "Show transcript" control at all -- they had to
 * rewrite the address to `watch?v=<id>` by hand before the button appeared.
 * The same video on the watch page has it.
 *
 * Rebuilt from the canonical identity rather than by string-replacing
 * "/shorts/", so youtu.be links, embed links and share links with tracking
 * parameters all land on the same clean page. Anything that is not a canonical
 * YouTube id keeps its own URL: there is no better page to send it to.
 */
export function transcriptSourceUrl(url: string): string {
  const identity = mediaPostVideoIdentity(url);
  if (identity !== null && identity.canonical && identity.provider === 'youtube') {
    return `https://www.youtube.com/watch?v=${identity.identity.slice('yt:'.length)}`;
  }
  return url;
}

/** The five apps the dialog explains, in the order the owner named them. */
export type TranscriptAppTab = 'youtube' | 'apple' | 'spotify' | 'pocketcasts' | 'website';

const APP_TAB_ORDER: readonly TranscriptAppTab[] = [
  'youtube',
  'apple',
  'spotify',
  'pocketcasts',
  'website',
];

/**
 * Per-tab chrome. `badge` is what the app lets you get; `open` is the label of
 * the button that opens the card's own URL (null only for a Website tab whose
 * URL is not an ordinary web page).
 */
const APP_TAB_LABELS: Record<TranscriptAppTab, { tab: string; badge: string; open: string | null }> = {
  youtube: { tab: 'YouTube', badge: 'Full text + timestamps', open: 'Open on YouTube ↗' },
  apple: { tab: 'Apple Podcasts', badge: 'Copy in parts', open: 'Open in Apple Podcasts ↗' },
  spotify: { tab: 'Spotify', badge: 'No copying', open: 'Open in Spotify ↗' },
  pocketcasts: { tab: 'Pocket Casts', badge: 'Full text', open: 'Open in Pocket Casts ↗' },
  website: { tab: 'Website or file', badge: 'Full text + timestamps', open: 'Open the page ↗' },
};

/** Which tab a card's URL opens on. Anything not a named app is the last tab. */
export function transcriptAppTabForUrl(url: string): TranscriptAppTab {
  const identity = mediaPostVideoIdentity(url);
  switch (identity?.provider) {
    case 'youtube':
      return 'youtube';
    case 'apple-podcasts':
      return 'apple';
    case 'spotify':
      return 'spotify';
    case 'pocketcasts':
      return 'pocketcasts';
    default:
      return 'website';
  }
}

/**
 * The format a tab implies: the route the person took establishes it, they
 * still see and can change it, and `''` means no preselection.
 */
export function transcriptFormatForTab(tab: TranscriptAppTab): KnowledgeTranscriptFormat | '' {
  switch (tab) {
    case 'youtube':
      return 'youtube-panel';
    case 'apple':
    case 'spotify':
    case 'pocketcasts':
      return 'plain';
    case 'website':
      return '';
  }
}

function isPlainWebPage(url: string): boolean {
  const trimmed = url.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The instructions for one tab. Pure, so it holds no state of its own. */
function transcriptTabBody(tab: TranscriptAppTab): React.ReactNode {
  switch (tab) {
    case 'youtube':
      return (
        <>
          <ol className="mb-2 list-decimal space-y-2 pl-5 text-xs text-gray-700">
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
          <p className="mb-2 text-[11px] text-gray-500">
            Leave the timestamps switched on — they are what lets a citation open the video
            at the moment the words were said.
          </p>
          <p className="mb-2 text-[11px] text-gray-500">
            Tip: many podcasts are also on YouTube. That is the easiest way to get the full
            text with timestamps.
          </p>
        </>
      );
    case 'apple':
      return (
        <>
          <ol className="mb-2 list-decimal space-y-2 pl-5 text-xs text-gray-700">
            <li>Open the episode in the Apple Podcasts app and start playing it.</li>
            <li>
              Open the transcript: on a Mac, click the transcript button (speech bubble) in the
              player; on an iPhone, open the player and tap the transcript button.
            </li>
            <li>
              Select a section and copy it. Apple only lets you copy a few paragraphs at a time,
              so paste, then come back for the next section.
            </li>
          </ol>
          <p className="mb-2 text-[11px] text-gray-500">
            Tip: if the show is on YouTube or Pocket Casts, use that tab: you get the whole
            text at once.
          </p>
        </>
      );
    case 'spotify':
      return (
        <>
          <p className="mb-2 text-xs text-gray-700">
            Spotify shows transcripts for many episodes, but does not let you copy or export
            them.
          </p>
          <p className="mb-2 text-xs text-gray-700">
            Find the same episode on YouTube, Pocket Casts or the show’s website, and use that
            tab instead.
          </p>
        </>
      );
    case 'pocketcasts':
      return (
        <ol className="mb-2 list-decimal space-y-2 pl-5 text-xs text-gray-700">
          <li>Open the episode in Pocket Casts.</li>
          <li>
            Open “Transcript” (available when the show publishes one; Plus members also get
            automatic transcripts for some shows).
          </li>
          <li>
            Tap “Share” and copy the transcript, then come back here and press “Paste
            transcript”.
          </li>
        </ol>
      );
    case 'website':
      return (
        <ol className="mb-2 list-decimal space-y-2 pl-5 text-xs text-gray-700">
          <li>
            Many shows publish the transcript on the episode’s web page, or as a transcript
            file (<code>.srt</code> or <code>.vtt</code>).
          </li>
          <li>Copy the text from the page, or open the file and copy everything in it.</li>
          <li>
            Choose SRT or VTT below if you copied a file, so the timestamps are kept; otherwise
            choose Plain text.
          </li>
        </ol>
      );
  }
}

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
  const [activeTab, setActiveTab] = useState<TranscriptAppTab>(() =>
    transcriptAppTabForUrl(url ?? ''),
  );
  // The format the panel would start on for the open tab. The panel re-applies
  // it only while the person has not chosen one and the box is empty.
  const [format, setFormat] = useState<KnowledgeTranscriptFormat | ''>(() =>
    transcriptFormatForTab(transcriptAppTabForUrl(url ?? '')),
  );
  const [formatChosenByHand, setFormatChosenByHand] = useState(false);
  const [boxHasText, setBoxHasText] = useState(false);

  /**
   * A NEW CARD IS A NEW QUESTION. The dialog stays mounted (the parent renders
   * it with `url={null}` while closed), so without this a second card would
   * open on the previous card's tab and format. The panel unmounts while
   * closed, so its pasted text is already gone; this resets the tab state that
   * survives here.
   */
  useEffect(() => {
    if (url === null) return;
    const tab = transcriptAppTabForUrl(url);
    setActiveTab(tab);
    setFormat(transcriptFormatForTab(tab));
    setFormatChosenByHand(false);
    setBoxHasText(false);
  }, [url]);

  useEffect(() => {
    if (url === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [url, onClose]);

  const selectTab = useCallback(
    (next: TranscriptAppTab) => {
      setActiveTab(next);
      // Format follows the tab ONLY while the box is empty and the person has
      // not chosen one themselves. Once either is true, a tab switch leaves the
      // format alone -- which is why the panel reports its box contents.
      if (!formatChosenByHand && !boxHasText) {
        setFormat(transcriptFormatForTab(next));
      }
    },
    [formatChosenByHand, boxHasText],
  );

  const onTabListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const index = APP_TAB_ORDER.indexOf(activeTab);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = APP_TAB_ORDER[(index + delta + APP_TAB_ORDER.length) % APP_TAB_ORDER.length];
      selectTab(next);
      // Focus follows selection, as a tablist should.
      event.currentTarget
        .querySelector<HTMLElement>(`[data-app-tab="${next}"]`)
        ?.focus();
    },
    [activeTab, selectTab],
  );

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

  const handleFormatChange = useCallback((next: KnowledgeTranscriptFormat | '') => {
    setFormat(next);
    setFormatChosenByHand(true);
  }, []);

  const handlePayloadChange = useCallback((next: string) => {
    setBoxHasText(next.length > 0);
  }, []);

  if (url === null) return null;

  const tabSpec = APP_TAB_LABELS[activeTab];
  const showOpenButton = activeTab !== 'website' || isPlainWebPage(url);
  const openHref = activeTab === 'youtube' ? transcriptSourceUrl(url) : url;

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
        <div
          role="tablist"
          aria-label="Where the transcript comes from"
          data-transcript-app-tabs="true"
          onKeyDown={onTabListKeyDown}
          className="mb-3 flex gap-1 overflow-x-auto border-b border-gray-200"
        >
          {APP_TAB_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`transcript-app-tab-${id}`}
              data-app-tab={id}
              aria-selected={activeTab === id}
              aria-controls={`transcript-app-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => selectTab(id)}
              className={`shrink-0 whitespace-nowrap rounded-t px-2.5 py-1.5 text-xs font-medium ${
                activeTab === id
                  ? 'border-b-2 border-blue-600 text-blue-700'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {APP_TAB_LABELS[id].tab}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`transcript-app-panel-${activeTab}`}
          aria-labelledby={`transcript-app-tab-${activeTab}`}
          data-app-tab-panel={activeTab}
        >
          <span
            data-app-tab-badge={activeTab}
            className="mb-2 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600"
          >
            {tabSpec.badge}
          </span>
          {transcriptTabBody(activeTab)}
          {showOpenButton && tabSpec.open !== null ? (
            <div className="mb-3 mt-2">
              {/* THE PRIMARY ACTION, and it is a real click rather than
                  something that fired on the way in -- so the popup blocker
                  allows it for the same reason it allowed the old one, and the
                  person has read the steps before they land there. */}
              <a
                href={openHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white no-underline"
              >
                {tabSpec.open}
              </a>
            </div>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
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
          // PATCH-204. The format follows the open tab until the person chooses
          // one or types; `format` here IS that decision, so an empty string
          // means no preselection (the Website or file tab).
          initialFormat={format === '' ? undefined : format}
          onFormatChange={handleFormatChange}
          onPayloadChange={handlePayloadChange}
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
