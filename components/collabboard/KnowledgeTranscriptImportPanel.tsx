"use client";

import React, { useCallback, useState } from 'react';

import type { KnowledgeTranscriptFormat } from '@/lib/domain/knowledge/knowledgeTranscriptCues';
import { KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN } from '@/lib/domain/knowledge/knowledgeTranscriptImport';

/**
 * Paste a transcript, and re-paste it over itself later.
 *
 * DELIBERATELY MINIMAL, and it is the Stage 3 outcome rather than a fallback:
 * the caption-path instrument found no reliable automatic source, so a person
 * pasting a transcript IS the supported path.
 *
 * TWO THINGS THIS COMPONENT MUST GET RIGHT, and they are both about honesty
 * rather than appearance:
 *
 *   1. THE FORMAT IS ASKED FOR, NEVER GUESSED. Reading a nearly-SRT paste as
 *      SRT drops the lines that did not fit, and a transcript missing cues
 *      looks exactly like one that never had them. So there is no "detect"
 *      option, and no default that silently decides.
 *
 *   2. THE VERSION IS CARRIED, BOTH HALVES. A re-import sends the hash AND the
 *      revision it was opened with. The hash alone cannot separate two people
 *      editing from one view, because a metadata correction leaves it
 *      unchanged -- so a reply that only refreshed the hash would let the next
 *      save overwrite somebody's work without a word.
 */

/** What the panel holds after a successful save, and sends on the next one. */
export interface KnowledgeTranscriptVersionHandle {
  readonly documentId: string;
  readonly contentSha256: string;
  readonly mutationRevision: string;
}

export interface KnowledgeTranscriptImportPanelProps {
  readonly boardId: string;
  /** Present when re-importing over a transcript the board already has. */
  readonly existing?: KnowledgeTranscriptVersionHandle & { readonly title: string };
  readonly onImported?: (handle: KnowledgeTranscriptVersionHandle) => void;
  /**
   * The video, when the import was started from a card that points at one.
   *
   * PREFILLED BECAUSE IT IS DERIVED, NOT GUESSED. It comes from the URL of the
   * card the person clicked, so it is a fact about which card they clicked --
   * unlike the FORMAT, which is a claim about what is on their clipboard and
   * which this panel therefore still refuses to assume. Typing `yt:dQw4w9WgXcQ`
   * by hand is also the step most likely to be skipped or mistyped, and a
   * transcript with a wrong or missing identity is one nothing can dedupe
   * against and no card can find again.
   */
  readonly initialVideoIdentity?: string | null;
  /** The card's link title, as a starting point for the transcript's name. */
  readonly initialTitle?: string;
  /**
   * The format to start on.
   *
   * THE ONE EXCEPTION TO "NEVER GUESS THE FORMAT", AND IT IS NOT A GUESS.
   * Rule 1 above exists because SNIFFING a paste is unsafe -- a nearly-SRT
   * paste read as SRT drops the lines that did not fit. Nothing is sniffed
   * here: the transcript flow SENT the person to YouTube’s transcript panel,
   * so the format is established by the route they took, not inferred from
   * bytes. It stays visible and changeable, and a wrong one now fails loudly
   * -- the panel parser refuses a caption file by name rather than half-
   * reading it (see knowledgeTranscriptPanelPaste.ts).
   */
  readonly initialFormat?: KnowledgeTranscriptFormat;
}

/** One label and one control style, so no two fields can drift apart. */
const labelClass = 'mb-1 block text-xs font-medium text-gray-700';
const controlClass =
  'block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; message: string }
  | { kind: 'error'; message: string; refreshRequired: boolean; safeToRetry: boolean };

const FORMAT_OPTIONS: readonly { value: KnowledgeTranscriptFormat; label: string }[] = [
  { value: 'srt', label: 'SubRip (.srt)' },
  { value: 'vtt', label: 'WebVTT (.vtt)' },
  // KEPT IN STEP WITH `FORMATS` IN knowledgeTranscriptRoute.ts BY HAND. Neither
  // list is an exhaustive Record, so widening KnowledgeTranscriptFormat breaks
  // neither of them -- a new format that is added to the union and to nothing
  // else compiles, tests green, and cannot be chosen or submitted by anyone.
  { value: 'youtube-panel', label: 'Copied from YouTube’s transcript panel' },
  { value: 'plain', label: 'Plain text (no timings)' },
];

export function KnowledgeTranscriptImportPanel({
  boardId,
  existing,
  initialVideoIdentity,
  initialTitle,
  initialFormat,
  onImported,
}: KnowledgeTranscriptImportPanelProps) {
  const [payload, setPayload] = useState('');
  // NO DEFAULT FORMAT. An empty value cannot be submitted, which is the point:
  // the person says what they pasted.
  const [format, setFormat] = useState<KnowledgeTranscriptFormat | ''>(initialFormat ?? '');
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? '');
  const [language, setLanguage] = useState('');
  const [trackKind, setTrackKind] = useState<'human' | 'machine' | 'unknown'>('unknown');
  const [videoIdentity, setVideoIdentity] = useState(initialVideoIdentity ?? '');
  const [version, setVersion] = useState<KnowledgeTranscriptVersionHandle | null>(existing ?? null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (format === '') return;
      setStatus({ kind: 'saving' });

      const response = await fetch(`/api/boards/${boardId}/knowledge/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          format,
          title,
          language: language.trim() === '' ? null : language.trim(),
          trackKind,
          // A CLAIM, not a verified association. The importer cannot check it;
          // a person can, by opening a timestamp and reading along.
          videoIdentity: videoIdentity.trim() === '' ? null : videoIdentity.trim(),
          replaces:
            version === null
              ? null
              : {
                  documentId: version.documentId,
                  expectedContentSha256: version.contentSha256,
                  expectedMutationRevision: version.mutationRevision,
                },
        }),
      });

      const body = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const refreshRequired = body.refreshRequired === true;
        const safeToRetry = body.safeToRetry === true;
        setStatus({
          kind: 'error',
          message: typeof body.error === 'string' ? body.error : 'The transcript could not be saved',
          refreshRequired,
          // SAVED-STATE-UNCERTAIN IS NOT A FAILED SAVE. The write committed
          // and the version marker did not move, so retrying would re-send a
          // token the database still matches and overwrite whatever really
          // happened. The panel stops offering a retry at all.
          safeToRetry: body.code === KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN ? false : safeToRetry,
        });
        return;
      }

      const handle: KnowledgeTranscriptVersionHandle = {
        documentId: String(body.documentId),
        contentSha256: String(body.contentSha256),
        mutationRevision: String(body.mutationRevision),
      };
      setVersion(handle);
      onImported?.(handle);

      const changed = Array.isArray(body.metadataChanged) ? (body.metadataChanged as string[]) : [];
      setStatus({
        kind: 'saved',
        message:
          body.written === true
            ? 'Saved as a new version of this transcript.'
            : body.metadataOnly === true
              ? `Nothing in the transcript changed; updated ${changed.join(', ')}.`
              : 'This is already the stored version; nothing changed.',
      });
    },
    [boardId, payload, format, title, language, trackKind, videoIdentity, version, onImported],
  );

  return (
    /**
     * STYLING ADDED 2026-09-22, AFTER IT WAS SEEN FOR THE FIRST TIME.
     *
     * This form carried no classes at all -- every label ran inline with its
     * own control, so the panel read as one run-on paragraph with boxes in it.
     * It was not a regression: the component shipped in Stage 3b, was mounted
     * NOWHERE until PATCH-156 Part B, and so had never been rendered for
     * anybody to look at. Unreachable code is untested code in every sense,
     * including this one.
     *
     * Presentation only below. Every id, handler, validation rule and piece of
     * state is exactly as it was -- the ids in particular are load-bearing:
     * the dialog's clipboard button finds the textarea by `transcript-payload`.
     */
    <form onSubmit={submit} aria-label="Import a transcript" className="space-y-3">
      <div>
        <label htmlFor="transcript-title" className={labelClass}>
          Name
        </label>
        <input
          id="transcript-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          className={controlClass}
        />
      </div>

      <div>
        <label htmlFor="transcript-format" className={labelClass}>
          Format
        </label>
        <select
          id="transcript-format"
          value={format}
          onChange={(event) => setFormat(event.target.value as KnowledgeTranscriptFormat)}
          required
          className={controlClass}
        >
          <option value="">Choose the format you pasted…</option>
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="transcript-track-kind" className={labelClass}>
            Track
          </label>
          <select
            id="transcript-track-kind"
            value={trackKind}
            onChange={(event) =>
              setTrackKind(event.target.value as 'human' | 'machine' | 'unknown')
            }
            className={controlClass}
          >
            {/* 'unknown' is the honest default: nothing here can tell. */}
            <option value="unknown">Not known</option>
            <option value="human">Written by a person</option>
            <option value="machine">Machine generated</option>
          </select>
        </div>

        <div>
          <label htmlFor="transcript-language" className={labelClass}>
            Language <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="transcript-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="e.g. en"
            className={controlClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="transcript-video" className={labelClass}>
          Video this describes <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="transcript-video"
          value={videoIdentity}
          onChange={(event) => setVideoIdentity(event.target.value)}
          placeholder="e.g. yt:dQw4w9WgXcQ"
          className={`${controlClass} font-mono`}
        />
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          Recorded as your claim. Nothing here checks it against the video — open a
          timestamp and read along to confirm it.
        </p>
      </div>

      <div>
        <label htmlFor="transcript-payload" className={labelClass}>
          Transcript
        </label>
        <textarea
          id="transcript-payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          required
          rows={12}
          placeholder="Paste the transcript here…"
          // Monospace and pre-wrap: this is a timestamped list, and reading it
          // back to check a paste worked is most of what this box is for.
          className={`${controlClass} min-h-[12rem] resize-y whitespace-pre-wrap font-mono text-[11px] leading-relaxed`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status.kind === 'saving' || format === ''}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {status.kind === 'saving'
            ? 'Saving…'
            : version === null
              ? 'Import transcript'
              : 'Save new version'}
        </button>
        {format === '' ? (
          // Says WHY the button is dead. A disabled control with no
          // explanation is the same dead end the menu item had.
          <span className="text-[11px] text-gray-500">Choose the format first.</span>
        ) : null}
      </div>

      {status.kind === 'saved' ? (
        <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
          {status.message}
        </p>
      ) : null}

      {status.kind === 'error' ? (
        <div role="alert" className="rounded bg-red-50 px-3 py-2 text-[11px] text-red-800">
          <p>{status.message}</p>
          {status.refreshRequired ? (
            <p className="mt-1">
              {status.safeToRetry
                ? 'Reload this transcript to see the current version, then apply your change again.'
                : 'Reload this transcript before editing it again. Do not resend this change.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
