// Reading every transcript a board holds, for the media cards on that board.
//
// A SEPARATE FILE FROM knowledgeReadAdapters.ts ON PURPOSE. That module's
// Supabase client interface is typed to exactly one call chain -- select, eq,
// order -- which is what makes it impossible to call wrongly. This query needs
// a different chain, and widening the shared interface to fit both would loosen
// the guarantee for the query that already has it.
//
// WHAT THIS DELIBERATELY DOES NOT RETURN. Not the cues, not the canonical text,
// not the storage path, not the content hash, not the mutation revision. The
// card needs to know THAT a transcript exists, which video it claims and
// whether it is usable. Sending the cue table of a 324-cue transcript to
// decorate a card is a page-weight cost paid on every board load for
// information nothing on screen reads.

import { domainError, type DomainError } from '../../domain/core/errors';
import type { BoardId } from '../../domain/core/ids';
import { err, ok, type Result } from '../../domain/core/result';
import type { BoardTranscriptIndexEntry } from '../../domain/knowledge/boardTranscriptIndex';
import type { KnowledgeDocumentProcessingStatus } from '../../domain/knowledge/knowledgePersistence';
import type { KnowledgeTranscriptFormat } from '../../domain/knowledge/knowledgeTranscriptCues';

interface SupabaseErrorLike {
  readonly message?: string;
}

interface TranscriptIndexRow {
  readonly id: string;
  readonly original_filename: string;
  readonly processing_status: string;
  readonly updated_at: string;
  readonly transcript_representation: unknown;
}

export interface KnowledgeTranscriptIndexSupabaseClient {
  from(table: 'knowledge_documents'): {
    select(columns: string): {
      eq(
        column: 'board_id',
        value: string,
      ): {
        not(
          column: 'transcript_representation',
          operator: 'is',
          value: null,
        ): {
          order(
            column: 'updated_at',
            options: { ascending: boolean },
          ): PromiseLike<{ data: TranscriptIndexRow[] | null; error: SupabaseErrorLike | null }>;
        };
      };
    };
  };
}

/**
 * `transcript_representation` IS THE FILTER, not `kind`.
 *
 * A transcript is stored as an ordinary `kind = 'text'` document that happens
 * to carry a representation -- that identity is what lets chunking,
 * fingerprinting and citation stay untouched. So "is it a transcript" is
 * exactly "is the representation present", and filtering on `kind` would
 * return every pasted note on the board.
 */
const TRANSCRIPT_INDEX_COLUMNS =
  'id, original_filename, processing_status, updated_at, transcript_representation';

const PROCESSING_STATUSES: readonly KnowledgeDocumentProcessingStatus[] = [
  'uploaded',
  'processing',
  'ready',
  'failed',
];

const FORMATS: readonly KnowledgeTranscriptFormat[] = ['srt', 'vtt', 'plain', 'youtube-panel'];

/**
 * A stored representation is JSON the database does not constrain field by
 * field, so every field read out of it is narrowed here rather than asserted.
 *
 * AN UNRECOGNISED VALUE FALLS BACK RATHER THAN THROWING. A row written by a
 * later version of this application must not take out the whole index read for
 * every card on the board; the card simply shows a transcript it cannot
 * classify precisely, which is a smaller lie than showing none at all.
 */
function narrowRepresentation(value: unknown): {
  videoIdentity: string | null;
  format: KnowledgeTranscriptFormat;
} {
  if (value === null || typeof value !== 'object') {
    return { videoIdentity: null, format: 'plain' };
  }
  const record = value as Record<string, unknown>;
  const videoIdentity =
    typeof record.videoIdentity === 'string' && record.videoIdentity.length > 0
      ? record.videoIdentity
      : null;
  const format =
    typeof record.format === 'string' && (FORMATS as readonly string[]).includes(record.format)
      ? (record.format as KnowledgeTranscriptFormat)
      : 'plain';
  return { videoIdentity, format };
}

function narrowStatus(value: string): KnowledgeDocumentProcessingStatus {
  return (PROCESSING_STATUSES as readonly string[]).includes(value)
    ? (value as KnowledgeDocumentProcessingStatus)
    : 'processing';
}

function mapRow(row: TranscriptIndexRow): BoardTranscriptIndexEntry {
  const { videoIdentity, format } = narrowRepresentation(row.transcript_representation);
  return {
    documentId: row.id,
    title: row.original_filename,
    videoIdentity,
    format,
    processingStatus: narrowStatus(row.processing_status),
    updatedAt: row.updated_at,
  };
}

export interface KnowledgeTranscriptIndexRepository {
  listTranscriptsByBoardId(
    boardId: BoardId,
  ): Promise<Result<readonly BoardTranscriptIndexEntry[], DomainError>>;
}

export class SupabaseKnowledgeTranscriptIndexRepository
  implements KnowledgeTranscriptIndexRepository
{
  constructor(private readonly client: KnowledgeTranscriptIndexSupabaseClient) {}

  async listTranscriptsByBoardId(
    boardId: BoardId,
  ): Promise<Result<readonly BoardTranscriptIndexEntry[], DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .select(TRANSCRIPT_INDEX_COLUMNS)
        .eq('board_id', boardId)
        .not('transcript_representation', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) {
        return err(domainError('unavailable', 'Could not list transcripts', { cause: error }));
      }
      return ok((data ?? []).map(mapRow));
    } catch (cause) {
      return err(domainError('unavailable', 'Could not list transcripts', { cause }));
    }
  }
}
