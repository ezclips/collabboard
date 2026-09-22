import { describe, expect, it } from 'vitest';

import {
  mediaPostOffersTranscriptPaste,
  mediaPostTranscriptState,
  transcriptImportVideoIdentity,
  type BoardTranscriptIndexEntry,
} from './boardTranscriptIndex';

const entry = (over: Partial<BoardTranscriptIndexEntry> = {}): BoardTranscriptIndexEntry => ({
  documentId: 'doc-1',
  title: 'A talk',
  videoIdentity: 'yt:dQw4w9WgXcQ',
  format: 'youtube-panel',
  processingStatus: 'ready',
  updatedAt: '2026-09-22T10:00:00.000Z',
  ...over,
});

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const OTHER_YOUTUBE = 'https://youtu.be/VzRZG_NEeLk';

describe('mediaPostTranscriptState', () => {
  it('shows nothing on a card that is not media', () => {
    // The affordance must not appear on an article. This is the gate that
    // keeps "Add transcript" off every link on the board.
    expect(mediaPostTranscriptState('https://example.com/an-article', [entry()])).toEqual({
      kind: 'unsupported',
    });
  });

  it('offers a paste for media the board has no transcript for', () => {
    expect(mediaPostTranscriptState(OTHER_YOUTUBE, [entry()])).toEqual({
      kind: 'none',
      provider: 'youtube',
    });
    expect(mediaPostTranscriptState(YOUTUBE, [])).toEqual({ kind: 'none', provider: 'youtube' });
  });

  it('finds the transcript for the same video pasted under a different URL shape (W1)', () => {
    // The dedupe requirement: a second card of the same video must find the
    // existing transcript rather than ask for the same paste again.
    const state = mediaPostTranscriptState('https://youtu.be/dQw4w9WgXcQ?si=abc&t=90', [entry()]);
    expect(state.kind).toBe('ready');
    expect(state.kind === 'ready' && state.entry.documentId).toBe('doc-1');
  });

  it('NEVER attaches a transcript whose video is merely a similar URL', () => {
    // The mis-attribution case, and the only one here with no safe failure
    // mode: a transcript that renders, resolves and belongs to another video.
    const fileEntry = entry({ videoIdentity: 'url:https://cdn.example.com/a.mp4' });
    expect(mediaPostTranscriptState('https://cdn.example.com/a.mp4', [fileEntry]).kind).toBe(
      'none',
    );
  });

  it('ignores a transcript that claims no video at all', () => {
    expect(mediaPostTranscriptState(YOUTUBE, [entry({ videoIdentity: null })]).kind).toBe('none');
  });

  describe('status, and why failed is not the same as absent (W3)', () => {
    it('reports processing separately from ready', () => {
      expect(mediaPostTranscriptState(YOUTUBE, [entry({ processingStatus: 'processing' })]).kind).toBe(
        'processing',
      );
      expect(mediaPostTranscriptState(YOUTUBE, [entry({ processingStatus: 'uploaded' })]).kind).toBe(
        'processing',
      );
    });

    it('reports a failure as a failure, carrying the document that failed', () => {
      const state = mediaPostTranscriptState(YOUTUBE, [entry({ processingStatus: 'failed' })]);
      expect(state.kind).toBe('failed');
      // The entry travels with it: a card that only knew "failed" could not
      // offer to open, retry or replace the document that is actually stuck.
      expect(state.kind === 'failed' && state.entry.documentId).toBe('doc-1');
    });

    it('offers an action for both absent and failed, and for neither of the others', () => {
      expect(mediaPostOffersTranscriptPaste({ kind: 'none', provider: 'youtube' })).toBe(true);
      expect(mediaPostOffersTranscriptPaste({ kind: 'failed', entry: entry() })).toBe(true);
      expect(mediaPostOffersTranscriptPaste({ kind: 'ready', entry: entry() })).toBe(false);
      expect(mediaPostOffersTranscriptPaste({ kind: 'processing', entry: entry() })).toBe(false);
      expect(mediaPostOffersTranscriptPaste({ kind: 'unsupported' })).toBe(false);
    });
  });

  describe('two transcripts claiming one video', () => {
    it('prefers a READY one over a failed one', () => {
      // Showing "failed" while a working transcript sits beside it tells the
      // reader this video has no usable transcript. That is false, and they
      // will act on it.
      const state = mediaPostTranscriptState(YOUTUBE, [
        entry({ documentId: 'broken', processingStatus: 'failed', updatedAt: '2026-09-23T00:00:00.000Z' }),
        entry({ documentId: 'good', processingStatus: 'ready', updatedAt: '2026-09-01T00:00:00.000Z' }),
      ]);
      expect(state.kind).toBe('ready');
      // Note the dates: the failed one is NEWER. Status outranks recency.
      expect(state.kind === 'ready' && state.entry.documentId).toBe('good');
    });

    it('prefers a ready one over a processing one', () => {
      const state = mediaPostTranscriptState(YOUTUBE, [
        entry({ documentId: 'pending', processingStatus: 'processing' }),
        entry({ documentId: 'good', processingStatus: 'ready' }),
      ]);
      expect(state.kind === 'ready' && state.entry.documentId).toBe('good');
    });

    it('falls back to the most recent within one status', () => {
      const state = mediaPostTranscriptState(YOUTUBE, [
        entry({ documentId: 'older', updatedAt: '2026-09-01T00:00:00.000Z' }),
        entry({ documentId: 'newer', updatedAt: '2026-09-20T00:00:00.000Z' }),
      ]);
      expect(state.kind === 'ready' && state.entry.documentId).toBe('newer');
    });

    it('does not depend on the order the index arrives in', () => {
      // Whatever the database returns first must not decide what the card says.
      const a = entry({ documentId: 'good', processingStatus: 'ready' });
      const b = entry({ documentId: 'broken', processingStatus: 'failed' });
      const forward = mediaPostTranscriptState(YOUTUBE, [a, b]);
      const reverse = mediaPostTranscriptState(YOUTUBE, [b, a]);
      expect(forward).toEqual(reverse);
    });
  });
});

describe('transcriptImportVideoIdentity', () => {
  it('claims a canonical id so the next card of this video finds it', () => {
    expect(transcriptImportVideoIdentity(YOUTUBE)).toBe('yt:dQw4w9WgXcQ');
  });

  it('claims NOTHING when the identity is only a normalised URL', () => {
    // Storing a guess would make the next similar URL believe it had found a
    // match, turning one uncertain reading into an attribution relied on
    // afterwards. A transcript with no claimed video still cites its text.
    expect(transcriptImportVideoIdentity('https://cdn.example.com/talks/keynote.mp4')).toBeNull();
    expect(transcriptImportVideoIdentity('https://www.facebook.com/x/videos/1/')).toBeNull();
  });

  it('claims nothing for a link that is not media', () => {
    expect(transcriptImportVideoIdentity('https://example.com/an-article')).toBeNull();
  });
});

describe('W7 — a post whose URL changes must not keep the previous video’s transcript', () => {
  /**
   * SATISFIED BY CONSTRUCTION, WHICH IS WHY IT IS PINNED HERE RATHER THAN
   * IMPLEMENTED SOMEWHERE.
   *
   * Nothing detaches anything. The card does not store a transcript reference
   * at all -- it asks, every render, which transcript matches the video it is
   * currently pointing at. Edit the URL and the question changes, so the
   * answer changes. There is no stale pointer to miss, no edit hook to forget,
   * and no ordering in which the old transcript survives the change.
   *
   * THE ALTERNATIVE WAS WORSE IN BOTH DIRECTIONS. Storing `documentId` on the
   * post and clearing it on edit needs every path that can change a URL to
   * remember -- the editor, a paste, an undo, a realtime update from another
   * person -- and the failure mode of forgetting ONE of them is a transcript
   * silently describing the wrong video.
   *
   * Note also what does NOT happen: the old transcript is not deleted. It is
   * the correct transcript for the old video, someone may have cited it, and
   * a card changing its link is not a reason to destroy it.
   */
  const transcriptForOldVideo = entry({ documentId: 'old-video-doc', videoIdentity: 'yt:dQw4w9WgXcQ' });

  it('stops matching the moment the card points somewhere else', () => {
    const before = mediaPostTranscriptState(YOUTUBE, [transcriptForOldVideo]);
    expect(before.kind).toBe('ready');

    const after = mediaPostTranscriptState(OTHER_YOUTUBE, [transcriptForOldVideo]);
    expect(after.kind).toBe('none');
  });

  it('offers a fresh paste for the new video rather than showing the old one', () => {
    const after = mediaPostTranscriptState(OTHER_YOUTUBE, [transcriptForOldVideo]);
    expect(mediaPostOffersTranscriptPaste(after)).toBe(true);
  });

  it('keeps the old transcript available to the old video, wherever it still appears', () => {
    // Not deleted, not orphaned: another card of the original video still
    // finds it. Detaching by destroying would have taken it from them too.
    expect(mediaPostTranscriptState('https://youtu.be/dQw4w9WgXcQ', [transcriptForOldVideo]).kind).toBe(
      'ready',
    );
  });

  it('a URL edited only for tracking parameters is NOT a change', () => {
    // The other half of the requirement. If every share-link variant read as a
    // new video, the transcript would vanish from a card nobody meaningfully
    // edited, and the person would paste it again to get a duplicate.
    const after = mediaPostTranscriptState(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=newsletter',
      [transcriptForOldVideo],
    );
    expect(after.kind).toBe('ready');
  });
});
