import { describe, expect, it } from 'vitest';

import { asBoardId } from '../../domain/core/ids';
import { SupabaseKnowledgeTranscriptIndexRepository } from './knowledgeTranscriptIndexAdapters';

const BOARD = asBoardId('board-1');

/**
 * A client that records the query it was asked to run and answers with fixed
 * rows. The chain shape is part of what is under test: filtering on anything
 * other than a present `transcript_representation` would return every pasted
 * note on the board as a transcript.
 */
const clientReturning = (
  data: unknown[] | null,
  error: { message: string } | null = null,
) => {
  const calls: Record<string, unknown> = {};
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        select(columns: string) {
          calls.columns = columns;
          return {
            eq(column: string, value: string) {
              calls.eqColumn = column;
              calls.eqValue = value;
              return {
                not(notColumn: string, operator: string, notValue: null) {
                  calls.notColumn = notColumn;
                  calls.notOperator = operator;
                  calls.notValue = notValue;
                  return {
                    order(orderColumn: string, options: { ascending: boolean }) {
                      calls.orderColumn = orderColumn;
                      calls.orderAscending = options.ascending;
                      return Promise.resolve({ data, error });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  original_filename: 'A talk',
  processing_status: 'ready',
  updated_at: '2026-09-22T10:00:00.000Z',
  transcript_representation: {
    representationVersion: 1,
    videoIdentity: 'yt:dQw4w9WgXcQ',
    format: 'youtube-panel',
  },
  ...over,
});

describe('SupabaseKnowledgeTranscriptIndexRepository', () => {
  it('asks for transcripts on this board, scoped by the representation being present', async () => {
    const { client, calls } = clientReturning([row()]);
    await new SupabaseKnowledgeTranscriptIndexRepository(client as never).listTranscriptsByBoardId(
      BOARD,
    );

    expect(calls.table).toBe('knowledge_documents');
    expect(calls.eqColumn).toBe('board_id');
    expect(calls.eqValue).toBe('board-1');
    // A transcript is an ordinary kind='text' document carrying a
    // representation. Filtering on `kind` would return every pasted note.
    expect(calls.notColumn).toBe('transcript_representation');
    expect(calls.notOperator).toBe('is');
    expect(calls.notValue).toBeNull();
  });

  it('does NOT ask for the cues or the canonical text', async () => {
    const { client, calls } = clientReturning([row()]);
    await new SupabaseKnowledgeTranscriptIndexRepository(client as never).listTranscriptsByBoardId(
      BOARD,
    );
    const columns = String(calls.columns);
    // The card needs to know THAT a transcript exists and which video it
    // claims. Shipping a 324-cue table to decorate a card is page weight paid
    // on every board load for something nothing on screen reads.
    expect(columns).not.toContain('extracted_text');
    expect(columns).not.toContain('storage_path');
    expect(columns).not.toContain('content_sha256');
    expect(columns).toContain('transcript_representation');
  });

  it('maps a row to the entry the card policy consumes', async () => {
    const { client } = clientReturning([row()]);
    const result = await new SupabaseKnowledgeTranscriptIndexRepository(
      client as never,
    ).listTranscriptsByBoardId(BOARD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      {
        documentId: 'doc-1',
        title: 'A talk',
        videoIdentity: 'yt:dQw4w9WgXcQ',
        format: 'youtube-panel',
        processingStatus: 'ready',
        updatedAt: '2026-09-22T10:00:00.000Z',
      },
    ]);
  });

  describe('a representation is JSON the database does not constrain, so every field is narrowed', () => {
    it('reads no video identity from a representation that has none', async () => {
      const { client } = clientReturning([
        row({ transcript_representation: { representationVersion: 1, format: 'srt' } }),
      ]);
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        client as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok && result.value[0].videoIdentity).toBeNull();
    });

    it('treats an empty video identity as absent, never as a key to match on', async () => {
      // '' would compare equal to '' and let two transcripts with no claimed
      // video be treated as the same video.
      const { client } = clientReturning([
        row({ transcript_representation: { videoIdentity: '', format: 'srt' } }),
      ]);
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        client as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok && result.value[0].videoIdentity).toBeNull();
    });

    it('SURVIVES a row written by a later version rather than failing the whole read', async () => {
      // One unreadable row must not take out the index for every card on the
      // board. The card shows a transcript it cannot classify precisely --
      // a smaller lie than showing none at all.
      const { client } = clientReturning([
        row({ transcript_representation: { format: 'some-future-format' } }),
        row({ id: 'doc-2', processing_status: 'who-knows' }),
      ]);
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        client as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0].format).toBe('plain');
      // An unknown status reads as 'processing', never as 'ready': the card
      // must not invite a citation of something it cannot vouch for.
      expect(result.value[1].processingStatus).toBe('processing');
    });

    it('survives a representation that is not an object at all', async () => {
      const { client } = clientReturning([row({ transcript_representation: 'nonsense' })]);
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        client as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok && result.value[0].videoIdentity).toBeNull();
    });
  });

  describe('a failed read is a failure, not an empty board', () => {
    it('returns unavailable when the query errors', async () => {
      const { client } = clientReturning(null, { message: 'connection reset' });
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        client as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('unavailable');
    });

    it('returns unavailable when the client throws', async () => {
      const throwing = {
        from() {
          throw new Error('boom');
        },
      };
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        throwing as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('unavailable');
    });

    it('returns an empty list for null data with no error, which is a real empty board', async () => {
      const { client } = clientReturning(null);
      const result = await new SupabaseKnowledgeTranscriptIndexRepository(
        client as never,
      ).listTranscriptsByBoardId(BOARD);
      expect(result.ok && result.value).toEqual([]);
    });
  });
});
