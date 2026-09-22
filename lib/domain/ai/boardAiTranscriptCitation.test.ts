import { describe, expect, it } from 'vitest';

import { boardAiSearchContextBlock, type BoardAiSearchPassage } from './boardAiSearchContext';
import {
  BOARD_AI_CITATION_VERSION,
  boardAiCitationItemFromPassage,
  boardAiCitationsFromStored,
} from './boardAiChatCitation';
import type { BoardAiSearchResult } from './boardAiSearchContext';

/**
 * A TRANSCRIPT PASSAGE MUST CARRY ITS MOMENT ALL THE WAY TO THE ANSWER.
 *
 * Observed 2026-09-22: asked "at what minute does the video talk about the
 * Sicilian?", Board AI replied that the text it was given "has no timestamps on
 * it ... so there's nothing in what was shared with me to convert the Sicilian
 * discussion into minute X."
 *
 * THAT REPLY WAS CORRECT, which is what made the defect hard to see. The model
 * was not failing to use information it had; it was refusing to invent
 * information it did not have. The cues sat in the document's stored
 * representation, the search read the chunks, and nothing joined them. These
 * tests pin the join, in the two places the user can observe it: what the model
 * is given, and what the citation offers.
 */
const result: BoardAiSearchResult = {
  postHits: 0,
  chunkHits: 2,
  dropped: 0,
  skipped: false,
} as never;

const transcriptPassage: BoardAiSearchPassage = {
  source: 'knowledge',
  label: 'Basic Chess Openings Explained',
  rank: 0.9,
  knowledgeDocumentId: 'doc-1',
  charStart: 3000,
  charEnd: 3785,
  transcriptStartMs: 470_000,
  transcriptEndMs: 518_000,
  videoIdentity: 'yt:8IlJ3v8I4Z8',
  text: 'instead of playing the open sicilian you play the rossolimo sicilian',
};

const pdfPassage: BoardAiSearchPassage = {
  source: 'knowledge',
  label: 'chess_opening_theory.pdf — page 2',
  rank: 0.5,
  knowledgeDocumentId: 'doc-2',
  pageStart: 2,
  pageNumber: 2,
  text: 'The Sicilian Defence arises after 1.e4 c5.',
};

describe('the context block tells the model WHEN a transcript passage was spoken', () => {
  it('names the moment in the origin line', () => {
    const block = boardAiSearchContextBlock([transcriptPassage], 'sicilian', result, 3);
    expect(block.text).toContain('[S4.1 | video transcript at 7:50: Basic Chess Openings Explained]');
  });

  it('gives the START only, never a range', () => {
    // The end is derived for some formats. A span in the line invites the model
    // to quote it as though the source declared both times; one number that is
    // always real beats two where one sometimes is not.
    const block = boardAiSearchContextBlock([transcriptPassage], 'sicilian', result, 3);
    expect(block.text).not.toContain('8:38');
    expect(block.text).not.toContain('–');
  });

  it('leaves a PDF passage exactly as it was', () => {
    const block = boardAiSearchContextBlock([pdfPassage], 'sicilian', result, 3);
    expect(block.text).toContain('[S4.1 | PDF text: chess_opening_theory.pdf — page 2]');
    expect(block.text).not.toContain('transcript at');
  });

  it('says nothing about time when no cue vouched for one', () => {
    // A transcript passage whose characters no cue owns arrives WITHOUT
    // `transcriptStartMs`, and must read as an ordinary passage rather than
    // acquiring a 0:00 that nobody measured.
    const { transcriptStartMs, transcriptEndMs, ...noTime } = transcriptPassage;
    const block = boardAiSearchContextBlock([noTime], 'sicilian', result, 3);
    expect(block.text).not.toContain('transcript at');
    expect(block.text).toContain('[S4.1 | PDF text: Basic Chess Openings Explained]');
  });

  it('carries the moment on the block’s passage list, for the citation layer', () => {
    const block = boardAiSearchContextBlock([transcriptPassage, pdfPassage], 'sicilian', result, 3);
    expect(block.passages?.[0].transcriptStartMs).toBe(470_000);
    expect(block.passages?.[0].videoIdentity).toBe('yt:8IlJ3v8I4Z8');
    // Derived ONCE, on the server, and carried. If the answer and the link each
    // computed it, the day they disagree the answer cites 7:50 beside a link
    // that opens at 7:49.
    expect(block.passages?.[1].transcriptStartMs).toBeUndefined();
  });
});

describe('the citation offers the moment', () => {
  it('carries the timestamp and the video on a transcript citation', () => {
    const item = boardAiCitationItemFromPassage({
      source: 'knowledge',
      label: 'Basic Chess Openings Explained',
      knowledgeDocumentId: 'doc-1',
      charStart: 3000,
      charEnd: 3785,
      transcriptStartMs: 470_000,
      videoIdentity: 'yt:8IlJ3v8I4Z8',
    });
    expect(item).toMatchObject({
      type: 'knowledge-selection',
      knowledgeDocumentId: 'doc-1',
      transcriptStartMs: 470_000,
      videoIdentity: 'yt:8IlJ3v8I4Z8',
    });
  });

  it('OMITS BOTH FIELDS ENTIRELY when there is no moment, so old proofs still verify', () => {
    // The provenance canonicalization drops keys whose value is `undefined`
    // before signing. Present-but-undefined and absent produce the same bytes,
    // but an explicit `transcriptStartMs: undefined` would still show up in
    // `Object.keys` filtering -- so this asserts true absence.
    const item = boardAiCitationItemFromPassage({
      source: 'knowledge',
      label: 'A text document',
      knowledgeDocumentId: 'doc-2',
      charStart: 10,
      charEnd: 40,
    });
    expect(item).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(item!, 'transcriptStartMs')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(item!, 'videoIdentity')).toBe(false);
  });

  it('still refuses a passage that cannot be located at all', () => {
    // A moment is an enrichment of an identity, never a substitute for one.
    expect(
      boardAiCitationItemFromPassage({
        source: 'knowledge',
        label: 'Somewhere',
        knowledgeDocumentId: 'doc-3',
        transcriptStartMs: 470_000,
      }),
    ).toBeNull();
  });
});

describe('a stored transcript citation survives being read back', () => {
  /**
   * THE DEFECT THIS PINS PRODUCED NO ERROR OF ANY KIND.
   *
   * The server stored `transcriptStartMs` and `videoIdentity` correctly --
   * confirmed in the database -- and `boardAiCitationsFromStored` rebuilt every
   * item FIELD BY FIELD, so the two fields it did not know about were dropped
   * on the way to the screen. The envelope parsed, the citation resolved, the
   * chip rendered, and the only symptom was an absence: no timestamp on the
   * chip, and a click that opened the reader instead of seeking the video.
   *
   * A field-by-field reader is safe against junk and silently lossy against its
   * own newer writer. Anything added to a stored item from here on needs a line
   * in that function AND a case in this block.
   */
  const envelope = (item: Record<string, unknown>) => ({
    version: BOARD_AI_CITATION_VERSION,
    items: [item],
  });

  const storedTranscriptCitation = {
    type: 'knowledge-selection',
    knowledgeDocumentId: 'doc-1',
    charStart: 452,
    charEnd: 697,
    transcriptStartMs: 47_000,
    videoIdentity: 'yt:sAKVRgN11Po',
    label: 'Audi a2 front bumber removal and ac cooler change tips',
  };

  it('keeps the moment and the video', () => {
    const read = boardAiCitationsFromStored(envelope(storedTranscriptCitation));
    expect(read?.items[0]).toMatchObject({
      transcriptStartMs: 47_000,
      videoIdentity: 'yt:sAKVRgN11Po',
    });
  });

  it('KEEPS A MOMENT OF ZERO, which is a real moment', () => {
    // A passage at the very start of a video. A truthiness test here would
    // drop it and send the reader to the document instead of to 0:00.
    const read = boardAiCitationsFromStored(
      envelope({ ...storedTranscriptCitation, transcriptStartMs: 0 }),
    );
    expect(read?.items[0]).toMatchObject({ transcriptStartMs: 0 });
  });

  it('drops BOTH when only one is present, rather than half a request', () => {
    const noVideo = boardAiCitationsFromStored(
      envelope({ ...storedTranscriptCitation, videoIdentity: undefined }),
    );
    expect(Object.prototype.hasOwnProperty.call(noVideo!.items[0], 'transcriptStartMs')).toBe(false);

    const noMoment = boardAiCitationsFromStored(
      envelope({ ...storedTranscriptCitation, transcriptStartMs: undefined }),
    );
    expect(Object.prototype.hasOwnProperty.call(noMoment!.items[0], 'videoIdentity')).toBe(false);
  });

  it('refuses junk in either field without losing the citation itself', () => {
    // The citation still names a real range, so it stays openable -- it simply
    // offers no moment. Dropping the whole chip would lose more than it saved.
    const read = boardAiCitationsFromStored(
      envelope({ ...storedTranscriptCitation, transcriptStartMs: -5, videoIdentity: '   ' }),
    );
    expect(read?.items[0]).toMatchObject({ knowledgeDocumentId: 'doc-1', charStart: 452 });
    expect(Object.prototype.hasOwnProperty.call(read!.items[0], 'transcriptStartMs')).toBe(false);
  });

  it('leaves an ordinary text citation exactly as it was', () => {
    const read = boardAiCitationsFromStored(
      envelope({
        type: 'knowledge-selection',
        knowledgeDocumentId: 'doc-2',
        charStart: 10,
        charEnd: 40,
        label: 'A text document',
      }),
    );
    expect(read?.items[0]).toEqual({
      type: 'knowledge-selection',
      knowledgeDocumentId: 'doc-2',
      charStart: 10,
      charEnd: 40,
      label: 'A text document',
    });
  });
});
