// Importing one transcript, and RE-importing it over itself.
//
// A SIBLING OF createKnowledgeTextUpload, and every difference comes from one
// fact: A TRANSCRIPT IS RE-IMPORTED OVER AN EXISTING DOCUMENT. The text path
// only ever creates, so its worst failure leaves a new document stuck at
// 'uploaded' -- wrong, but invisible to search and harmless to what already
// existed. A replacement has no such comfortable failure: halfway between two
// versions is a document whose stored text, chunks, cues and hash describe
// DIFFERENT transcripts, and every citation into it lands somewhere that is
// not what it quotes.
//
// SO REPLACEMENT IS ONE CALL, NOT A SEQUENCE. The text path documents its own
// document-then-chunks-then-ready window as a known limitation with a stated
// end state ("an RPC writing document, chunks and readiness together"). That
// limitation is survivable for a create and is NOT survivable for a replace,
// so this path requires the transaction rather than deferring it: the
// repository port below exposes exactly one write per outcome, and the adapter
// behind it is an RPC.
//
// ============================================================================
// SCOPE IS PART OF IDENTITY, NOT A LOOKUP DETAIL
// ============================================================================
//
// CORRECTED, and this was a real privilege escalation. The target used to be
// loaded by document id alone. The RPC behind these ports runs as service_role
// -- RLS does not narrow it -- so a caller authorized on board A could name a
// document id belonging to board B and have its content replaced. The board
// authorization check passed, because it was asked about the caller's OWN
// board, and then a different board's document was written.
//
// Every read and every write is therefore scoped by BOTH board and document,
// and the transaction must re-check the board while it holds the row. A check
// performed before the lock is a check about the past.
//
// ============================================================================
// A REPLACEMENT HAS NO AUTHOR
// ============================================================================
//
// CORRECTED for the same reason. One write record carried boardId and
// createdBy for both outcomes, so a replacement stamped the CURRENT actor as
// the document's original creator -- silently rewriting provenance on someone
// else's document, which is exactly the kind of claim the rest of this system
// refuses to fabricate.
//
// The two outcomes now have two different types, and the replace type HAS NO
// AUTHOR FIELD AT ALL. `id`, `board_id`, `created_by` and `created_at` are
// preserved by the transaction; nothing in the replace path can express
// changing them. `boardId` on the replace record is the SCOPE TO MATCH, never
// a value to write.
//
// ============================================================================
// ONE OBJECT PER ATTEMPT
// ============================================================================
//
// CORRECTED, and this one could destroy a published version. The storage key
// used to be derived from board, document, hash and format, so two concurrent
// imports producing the SAME new hash produced the SAME key -- and the loser's
// cleanup would then delete the object the winner's committed row points at.
//
// Every attempt now owns its object: the key carries a fresh upload id, so no
// two requests can ever name the same one, and cleanup can only ever remove an
// object this request created. The same change removes the other half of the
// problem: an equivalent re-import can no longer overwrite an object the
// current row still references.
//
// ============================================================================
// WHAT "ONE VERSION" MEANS
// ============================================================================
//
// The canonical text, the cue table, the chunk rows and content_sha256 are ONE
// version of ONE source. The hash covers the text, every cue's character range
// and start/end in integer milliseconds, cue order including overlaps, and the
// claimed video identity -- so a re-import that changes ONLY timings changes
// the hash, which is the whole point: a timing-only correction is a new
// version and anything citing a timestamp in it is stale.
//
// THE STORAGE KIND IS SHARED, THE REPRESENTATION IS NOT. A transcript is
// stored with kind 'text' like any other text source; what makes it a
// transcript is a non-null transcript_representation. The hash difference
// between a .txt of the same words and a pasted transcript is a REPRESENTATION
// distinction, not a claim that they are different kinds of thing.

import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';
import type { BoardId, KnowledgeDocumentId, UserId } from '../core/ids';
import type { KnowledgeDocument } from './knowledgePersistence';
import type {
  KnowledgeBoardAuthorizer,
  KnowledgeContentHasher,
  KnowledgeDocumentIdFactory,
  KnowledgeStorageGateway,
} from './knowledgeIngestion';
import { KNOWLEDGE_TEXT_KIND } from './knowledgeTextIngestion';
import { parseKnowledgeTranscript, type KnowledgeTranscriptFormat } from './knowledgeTranscriptCues';
import {
  buildKnowledgeTranscriptDocument,
  enforceKnowledgeTranscriptLimits,
  groupKnowledgeTranscriptWindows,
  type KnowledgeTranscriptDocument,
  type KnowledgeTranscriptWindow,
} from './knowledgeTranscriptDocument';
import {
  knowledgeTranscriptStoredRepresentation,
  knowledgeTranscriptVersionBytes,
  type KnowledgeTranscriptStoredRepresentation,
} from './knowledgeTranscriptVersion';

export const KNOWLEDGE_TRANSCRIPT_PARSER_NAME = 'knowledge-transcript';
export const KNOWLEDGE_TRANSCRIPT_PARSER_VERSION = '1';

/**
 * One chunk of a transcript.
 *
 * A CONTIGUOUS PARTITION OF THE CANONICAL TEXT, not a selection from it. The
 * chunks start at offset 0, each begins exactly where the previous one ended,
 * the last ends at the text's length, and concatenating them in order
 * reproduces the canonical text exactly.
 *
 * WHY THAT MATTERS AND IS NOT TIDINESS. The version fingerprint is computed
 * over the canonical text, and the canonical text is not stored anywhere else.
 * When chunks merely covered the cues, the separators between two windows
 * belonged to no chunk, the stored rows could not reproduce the string that
 * was hashed, and a stored transcript could never be re-verified. Lossless
 * chunks make the fingerprint reproducible from what is stored -- without
 * duplicating up to four million characters into a second column.
 *
 * Cues are still never split: a boundary is always at a cue edge, so an offset
 * resolves to one chunk and one cue.
 */
export interface KnowledgeTranscriptChunkInsert {
  readonly chunkIndex: number;
  readonly text: string;
  readonly charStart: number;
  readonly charEnd: number;
  /**
   * Null exactly when the chunk contains no cue -- a plain transcript, which
   * has no timings at all. NOT zero, which would claim a time was known and
   * found to be the start.
   */
  readonly startMs: number | null;
  readonly endMs: number | null;
}

/**
 * The content of one version, with nothing in it that identifies WHO or WHICH
 * BOARD. Both outcomes write this; only a create may accompany it with
 * authorship.
 */
export interface KnowledgeTranscriptVersionBody {
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
  readonly contentSha256: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly parserOptionsHash: string;
  readonly canonicalText: string;
  readonly representation: KnowledgeTranscriptStoredRepresentation;
  readonly chunks: readonly KnowledgeTranscriptChunkInsert[];
}

/** A NEW document. This is the only shape that may name an author. */
export interface KnowledgeTranscriptCreateWrite extends KnowledgeTranscriptVersionBody {
  readonly documentId: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly createdBy: UserId;
  readonly kind: typeof KNOWLEDGE_TEXT_KIND;
}

/**
 * A NEW VERSION of an existing document.
 *
 * NO AUTHOR, BY CONSTRUCTION. `board_id`, `created_by` and `created_at` are
 * preserved by the transaction, and this type cannot express changing them.
 * `boardId` here is the scope the transaction must MATCH while holding the
 * row -- if the stored row belongs to another board the write is refused, not
 * re-homed.
 */
export interface KnowledgeTranscriptReplaceWrite extends KnowledgeTranscriptVersionBody {
  readonly documentId: KnowledgeDocumentId;
  readonly boardId: BoardId;
}

/**
 * A token that changes on EVERY mutation of the document, content or not.
 *
 * WHY THE CONTENT HASH IS NOT ENOUGH, and this was a real lost update. Both
 * transactional ports used content_sha256 as their only compare-and-swap
 * token, and the two same-hash paths -- the metadata-only update and the
 * format replacement -- deliberately leave that hash unchanged. So two
 * operations that began from the SAME observed version both matched the locked
 * check, and the second silently overwrote the first: two people correcting the
 * track kind and the title, and only one correction survives, with nothing
 * saying so.
 *
 * OPAQUE HERE, BY DESIGN. The domain compares it for equality and never
 * interprets it. `updated_at` is acceptable ONLY if the database guarantees it
 * moves on every relevant mutation of the document AND the RPC compares it
 * under the row lock; otherwise a dedicated monotonically changing column is
 * required. That choice belongs to the migration, which is why nothing here
 * assumes a shape.
 *
 * THE WRITE MUST MOVE IT. Every successful mutation -- including a
 * metadata-only update and a same-hash format replacement -- has to produce a
 * new revision, or the next writer inherits the same lost update. That is an
 * obligation on the RPC, and `assertRevisionAdvanced` below refuses a result
 * that breaks it rather than passing it on.
 */
export type KnowledgeTranscriptMutationRevision = string;

/** The exact version a caller is acting on. BOTH halves are compared. */
export interface KnowledgeTranscriptExpectedVersion {
  readonly contentSha256: string;
  readonly mutationRevision: KnowledgeTranscriptMutationRevision;
}

/** What a transactional write returns: the row, and its NEW revision. */
export interface KnowledgeTranscriptWriteResult {
  readonly document: KnowledgeDocument;
  readonly mutationRevision: KnowledgeTranscriptMutationRevision;
}

/** What the caller believed it was replacing. */
export interface KnowledgeTranscriptTarget {
  readonly documentId: KnowledgeDocumentId;
  /** The board the STORED row belongs to, never the caller's claim. */
  readonly boardId: BoardId;
  readonly kind: string;
  /** Non-null exactly when the target is already a transcript. */
  readonly transcriptRepresentation: KnowledgeTranscriptStoredRepresentation | null;
  readonly contentSha256: string;
  /** Moves on every mutation, including ones that leave the hash alone. */
  readonly mutationRevision: KnowledgeTranscriptMutationRevision;
  /** The object the stored row points at, until a replacement commits. */
  readonly storagePath: string;
  /** Metadata the import can change without changing the version. */
  readonly originalFilename: string;
  readonly document: KnowledgeDocument;
}

/**
 * The fields an import can change WITHOUT changing the version.
 *
 * The hash covers text, cue ranges, timings and the claimed video. It does not
 * cover the name, the language, the track kind or the source format -- so an
 * identical hash does NOT mean an identical import request, and treating it
 * that way silently discarded corrections. Someone fixing `unknown` to `human`
 * is telling the truth about provenance; dropping that is worse than refusing
 * it, because nothing says it was dropped.
 */
export interface KnowledgeTranscriptMetadata {
  readonly originalFilename: string;
  readonly language: string | null;
  readonly trackKind: 'human' | 'machine' | 'unknown';
  readonly format: KnowledgeTranscriptFormat;
}

export type KnowledgeTranscriptMetadataField = keyof KnowledgeTranscriptMetadata;

/** Which of them the request would change. Empty means a true no-op. */
export function transcriptMetadataChanges(
  target: KnowledgeTranscriptTarget,
  requested: KnowledgeTranscriptMetadata,
): readonly KnowledgeTranscriptMetadataField[] {
  const stored = target.transcriptRepresentation;
  const changed: KnowledgeTranscriptMetadataField[] = [];
  if (target.originalFilename !== requested.originalFilename) changed.push('originalFilename');
  if ((stored?.language ?? null) !== requested.language) changed.push('language');
  if (stored !== null && stored.trackKind !== requested.trackKind) changed.push('trackKind');
  if (stored !== null && stored.format !== requested.format) changed.push('format');
  return changed;
}

export interface KnowledgeTranscriptRepository {
  /**
   * The document being replaced, or null when no such document exists ON THAT
   * BOARD. Scoped by both, so a document id from another board reads as
   * absent rather than as a target.
   */
  loadTranscriptTarget(
    boardId: BoardId,
    documentId: KnowledgeDocumentId,
  ): Promise<Result<KnowledgeTranscriptTarget | null, DomainError>>;
  /** Creates document, cues, chunks and readiness in ONE transaction. */
  createTranscriptVersion(
    write: KnowledgeTranscriptCreateWrite,
  ): Promise<Result<KnowledgeTranscriptWriteResult, DomainError>>;
  /**
   * Replaces ONE version with another in ONE transaction.
   *
   * THE TRANSACTION MUST, while holding the row locked, match ALL FIVE:
   * `documentId`, `boardId`, the stored content hash, the stored mutation
   * revision, and that the row is still a transcript. Any mismatch refuses the
   * write and leaves the stored version exactly as it was. The checks this
   * module performs before calling are for clearer messages; they can all go
   * stale between here and the lock, and only the locked checks cannot.
   *
   * The hash alone is NOT sufficient: a same-hash path leaves it unchanged, so
   * two callers starting from one observed version would both match it.
   *
   * On success it must return a revision DIFFERENT from the expected one.
   */
  replaceTranscriptVersion(
    write: KnowledgeTranscriptReplaceWrite,
    expected: KnowledgeTranscriptExpectedVersion,
  ): Promise<Result<KnowledgeTranscriptWriteResult, DomainError>>;
  /**
   * Changes metadata ONLY, when the version is unchanged.
   *
   * THE SAME FIVE LOCKED CHECKS as a replacement -- document id, board id,
   * content hash, mutation revision, still a transcript -- because a metadata
   * write is no less able to land on the wrong row, and because THIS is the
   * path where the hash cannot distinguish two callers at all: it leaves the
   * hash exactly as it found it. The revision is the only thing separating two
   * corrections made from one observed version.
   *
   * It must not touch the text, the cues, the chunks, the hash or the stored
   * original: the version is not changing, which is precisely why this exists
   * instead of a replacement. It MUST still move the revision.
   */
  updateTranscriptMetadata(
    scope: { readonly documentId: KnowledgeDocumentId; readonly boardId: BoardId },
    metadata: Omit<KnowledgeTranscriptMetadata, 'format'>,
    expected: KnowledgeTranscriptExpectedVersion,
  ): Promise<Result<KnowledgeTranscriptWriteResult, DomainError>>;
}

/**
 * A fresh id per upload ATTEMPT, not per version.
 *
 * Two concurrent imports can legitimately produce the same content hash. What
 * they must never share is a storage key, because cleanup deletes by key and a
 * shared key makes one request's cleanup the other request's data loss.
 */
export interface KnowledgeTranscriptUploadIdFactory {
  newUploadId(): string;
}

export interface KnowledgeTranscriptImportDeps {
  readonly authorizer: KnowledgeBoardAuthorizer;
  readonly repository: KnowledgeTranscriptRepository;
  readonly storage: Pick<KnowledgeStorageGateway, 'upload' | 'remove'>;
  readonly hasher: KnowledgeContentHasher;
  readonly ids: KnowledgeDocumentIdFactory;
  readonly uploads: KnowledgeTranscriptUploadIdFactory;
}

export interface KnowledgeTranscriptImportInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  /** What the user pasted, verbatim. */
  readonly payload: string;
  /**
   * DECLARED, NEVER SNIFFED. The parser refuses to guess a format, and this
   * module does not guess on its behalf: reading a nearly-SRT paste as SRT
   * would silently drop the lines that did not fit, and a transcript missing
   * cues looks exactly like a transcript that never had them.
   */
  readonly format: KnowledgeTranscriptFormat;
  readonly title: string;
  /** Provenance, recorded and never inferred from the text. */
  readonly language: string | null;
  readonly trackKind: 'human' | 'machine' | 'unknown';
  /**
   * The video this transcript CLAIMS to describe.
   *
   * The importer cannot verify the association -- it has no access to the
   * video -- but a PERSON can, by opening a timestamp and reading along. It is
   * recorded as a claim, and it is in the hash, so changing it is a new
   * version rather than a quiet re-labelling.
   */
  readonly videoIdentity: string | null;
  /**
   * The document to replace, or null to create a new one. The document is
   * looked up ON `boardId`; an id from another board is not found.
   */
  readonly replaces: {
    readonly documentId: KnowledgeDocumentId;
    readonly expectedContentSha256: string;
    /**
     * OBSERVED WHEN EDITING BEGAN, and carried by the client.
     *
     * Re-loading the current row inside the request cannot substitute for it:
     * an intervening metadata change does not move content_sha256, so a fresh
     * read would simply agree with whatever just happened and the earlier edit
     * would be lost without a word.
     */
    readonly expectedMutationRevision: KnowledgeTranscriptMutationRevision;
  } | null;
}

export interface KnowledgeTranscriptImportOutcome {
  readonly document: KnowledgeDocument;
  /** True when a new VERSION was written. False for a no-op or metadata-only. */
  readonly written: boolean;
  /** True when only name/language/track-kind changed; the version did not. */
  readonly metadataOnly: boolean;
  /** Which metadata fields the request changed. Empty on a pure no-op. */
  readonly metadataChanged: readonly KnowledgeTranscriptMetadataField[];
  /**
   * The object the PREVIOUS version pointed at, RETAINED for delayed
   * collection. Null when nothing was superseded.
   *
   * IT IS NOT RESIDUE AND IT HAS NOT BEEN DELETED. Deleting it here would
   * break a reader that resolved the old row moments before the commit and
   * fetches its object moments after -- a live request failing on an object
   * that existed when it was told about it. Retention removes that race
   * instead of documenting it; a sweep that knows nothing references the path
   * can collect it later, when no request is mid-flight against it.
   */
  readonly supersededCleanupCandidate: string | null;
  /** The revision now stored. A caller editing on must carry this one next. */
  readonly mutationRevision: KnowledgeTranscriptMutationRevision;
}

/**
 * A write that reports success without moving the revision is a lost update
 * waiting to happen, so it is refused here rather than passed on.
 *
 * It cannot be undone -- the transaction has committed -- and this does not
 * pretend otherwise. What it does is stop the caller being handed a revision
 * that the next writer would also match, and name the contract that was
 * broken, which is the difference between a bug found in the isolated database
 * and a bug found as two silently merged corrections in production.
 */
export function revisionAdvanceBreak(
  expected: KnowledgeTranscriptMutationRevision,
  observed: KnowledgeTranscriptMutationRevision,
): string | null {
  return expected === observed
    ? `the write committed but left the mutation revision at ${observed}`
    : null;
}

/**
 * The reason code a caller keys off when the revision did not advance.
 *
 * NOT A FAILED SAVE, AND NOT SAFE TO RETRY. The transaction COMMITTED -- the
 * change is stored -- but the token that separates concurrent edits did not
 * move, so this process can no longer tell what the stored state is or whether
 * anyone else's edit was lost. A blind retry would re-send the same expected
 * revision, match again, and overwrite again.
 *
 * The honest instruction to the user is to RELOAD before editing further, and
 * the honest instruction to the code is to surface it distinctly from an
 * ordinary conflict, which IS safe to retry after re-reading.
 *
 * Primary enforcement belongs in the RPC: it must assert advancement inside
 * the transaction and raise, so the whole mutation rolls back and this state
 * never reaches a caller. This is defence against adapter or RPC drift.
 */
export const KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN = 'transcript_saved_state_uncertain';

function savedStateUncertain(reason: string): DomainError {
  return domainError(
    'unknown',
    'Your change was saved, but the transcript could not confirm its new version. Reload it before editing again.',
    {
      details: {
        reason,
        code: KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN,
        // Explicit, because "unknown" alone invites a retry loop.
        safeToRetry: false,
        refreshRequired: true,
      },
    },
  );
}

const MIME_BY_FORMAT: Record<KnowledgeTranscriptFormat, string> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  plain: 'text/plain',
};

const EXTENSION_BY_FORMAT: Record<KnowledgeTranscriptFormat, string> = {
  srt: '.srt',
  vtt: '.vtt',
  plain: '.txt',
};

/**
 * The key THIS ATTEMPT's payload is written to.
 *
 * UNIQUE PER ATTEMPT, by an upload id that no other request holds. The hash
 * stays in the key because it is useful to a human reading a bucket listing,
 * but it is the upload id that makes the key safe: cleanup removes exactly the
 * object this request created and can never reach another request's object, or
 * the object a committed row points at.
 *
 * Both components are length- and character-checked before they reach a key. A
 * storage key is not the place to discover that an input was not what it
 * claimed.
 */
export function buildKnowledgeTranscriptStoragePath(
  boardId: BoardId,
  documentId: KnowledgeDocumentId,
  contentSha256: string,
  uploadId: string,
  format: KnowledgeTranscriptFormat,
): string {
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new Error('a transcript storage key needs a 64-character lowercase hex hash');
  }
  if (!/^[0-9a-z]{8,64}$/.test(uploadId)) {
    throw new Error('a transcript upload id must be 8-64 lowercase alphanumerics');
  }
  return `knowledge/${boardId}/${documentId}/transcript-${contentSha256}-${uploadId}${EXTENSION_BY_FORMAT[format]}`;
}

/**
 * THE INVARIANT, and it is NOT the text path's invariant.
 *
 * assertLosslessChunking requires the chunks to reproduce the source exactly,
 * because a text chunker partitions the text. A transcript chunker partitions
 * the CUES, and the separator between two cues that fall in different windows
 * belongs to neither -- so a byte-for-byte reconstruction would fail for a
 * correct chunking, and asserting it would be asserting the wrong thing.
 *
 * What must hold instead: every cue lies inside exactly one chunk, chunks are
 * ordered, and no two overlap in characters. That is what citations depend on
 * -- a character offset resolves to one chunk and one cue, so a quotation can
 * always name a time.
 */
export function transcriptChunkingBreak(
  document: KnowledgeTranscriptDocument,
  chunks: readonly KnowledgeTranscriptChunkInsert[],
): string | null {
  const total = document.canonicalText.length;

  if (chunks.length === 0) {
    return total === 0 ? null : `no chunks were produced for ${total} characters of text`;
  }
  if (chunks[0].charStart !== 0) {
    return `the first chunk starts at ${chunks[0].charStart}, not 0`;
  }

  let previousEnd = 0;
  for (const [index, chunk] of chunks.entries()) {
    if (chunk.chunkIndex !== index) return `chunk ${index} is indexed ${chunk.chunkIndex}`;
    if (chunk.charEnd < chunk.charStart) {
      return `chunk ${index} has an impossible range ${chunk.charStart}..${chunk.charEnd}`;
    }
    // CONTIGUOUS, not merely non-overlapping. A gap here is a run of
    // characters no chunk holds, and the canonical text could not be rebuilt.
    if (chunk.charStart !== previousEnd) {
      return `chunk ${index} starts at ${chunk.charStart}, but the previous chunk ended at ${previousEnd}`;
    }
    if (chunk.text !== document.canonicalText.slice(chunk.charStart, chunk.charEnd)) {
      return `chunk ${index} text does not match its own character range`;
    }
    if ((chunk.startMs === null) !== (chunk.endMs === null)) {
      return `chunk ${index} has only one of its two timings`;
    }
    if (chunk.startMs !== null && chunk.endMs !== null && chunk.endMs < chunk.startMs) {
      return `chunk ${index} ends at ${chunk.endMs} before it starts at ${chunk.startMs}`;
    }
    previousEnd = chunk.charEnd;
  }

  if (previousEnd !== total) {
    return `the last chunk ends at ${previousEnd}, but the text is ${total} characters long`;
  }

  // THE PROPERTY THAT ACTUALLY MATTERS, asserted directly rather than inferred
  // from the ones above: the stored chunks must rebuild what was hashed.
  if (chunks.map((chunk) => chunk.text).join('') !== document.canonicalText) {
    return 'the ordered chunk text does not reproduce the canonical text';
  }

  for (const cue of document.cues) {
    const homes = chunks.filter(
      (chunk) => cue.charStart >= chunk.charStart && cue.charEnd <= chunk.charEnd,
    );
    if (homes.length === 0) {
      return `the cue at ${cue.charStart}..${cue.charEnd} is not wholly inside any chunk`;
    }
    // A ZERO-LENGTH CUE SITS EXACTLY ON A BOUNDARY and is therefore inside
    // both neighbours. That is genuinely ambiguous and genuinely harmless: it
    // selects no characters, so no citation can land in it. Only a cue that
    // covers text must resolve to one chunk.
    if (homes.length > 1 && cue.charEnd > cue.charStart) {
      return `the cue at ${cue.charStart}..${cue.charEnd} is inside ${homes.length} chunks, not exactly one`;
    }
  }
  return null;
}

/**
 * ONE HALF OF ONE CROSSING, and the claim is narrowed to what this is.
 *
 * CORRECTED. This was described as refusing "both crossings". IT DOES NOT. It
 * stops THIS IMPORTER from replacing a plain text document with a transcript
 * version. It does NOTHING about the other direction: an ordinary text write
 * path, running as service_role and seeing kind 'text', can still rewrite a
 * transcript's text and leave its cues and representation describing words
 * that are no longer there. That guard does not live here and cannot: it has
 * to be in the transactional write path that touches the document and its
 * chunks together.
 *
 * A ROW CHECK CANNOT DO IT EITHER. A CHECK constraint sees one row; the
 * inconsistency it would have to detect is between a document's text and its
 * CHILD chunk and cue rows. Only the transaction that writes them can hold
 * that invariant.
 *
 * knowledgeTranscriptWriters.source.test.ts pins the writers that exist today,
 * so a new one has to be considered rather than discovered later.
 */
export function transcriptConsistencyBreak(target: KnowledgeTranscriptTarget): string | null {
  if (target.kind !== KNOWLEDGE_TEXT_KIND) {
    return `document is kind '${target.kind}', which a transcript import cannot replace`;
  }
  if (target.transcriptRepresentation === null) {
    return 'document is a plain text source, not a transcript';
  }
  return null;
}

export async function importKnowledgeTranscript(
  deps: KnowledgeTranscriptImportDeps,
  input: KnowledgeTranscriptImportInput,
): Promise<Result<KnowledgeTranscriptImportOutcome, DomainError>> {
  // 1. Cheapest rejection first, and before anything is parsed or stored.
  const authorized = await deps.authorizer.canMutateBoard(input.boardId, input.userId);
  if (!authorized.ok) return authorized;
  if (!authorized.value) {
    return err(
      domainError('permission_denied', 'You do not have permission to add files to this board'),
    );
  }

  const title = input.title.trim();
  if (title.length === 0) {
    return err(domainError('validation', 'A transcript needs a name'));
  }

  // 2. Parse and bound. No external effect yet, so every refusal here is free.
  const payloadBytes = new TextEncoder().encode(input.payload);
  const withinLimits = enforceKnowledgeTranscriptLimits({
    payloadBytes: payloadBytes.length,
    cueCount: 0,
    textUnits: input.payload.length,
  });
  if (!withinLimits.ok) return withinLimits;

  const parsed = parseKnowledgeTranscript(input.payload, input.format);
  if (!parsed.ok) return parsed;

  const document = buildKnowledgeTranscriptDocument(
    parsed.value.cues,
    parsed.value.format,
    input.payload,
  );

  const bounded = enforceKnowledgeTranscriptLimits({
    payloadBytes: payloadBytes.length,
    cueCount: document.cues.length,
    textUnits: document.canonicalText.length,
  });
  if (!bounded.ok) return bounded;

  const chunks = transcriptChunks(document);
  const broken = transcriptChunkingBreak(document, chunks);
  if (broken !== null) {
    return err(
      domainError('validation', 'This transcript could not be indexed reliably', {
        details: { reason: broken },
      }),
    );
  }

  // 3. The hash IS the version: text, every cue range, every timing, cue order
  //    with overlaps intact, and the claimed video. A timing-only re-import
  //    moves it, which is what makes a timing-only correction detectable.
  const representation = knowledgeTranscriptStoredRepresentation({
    cues: document.cues,
    videoIdentity: input.videoIdentity,
    // The file's own declaration is provenance and is preferred when the
    // caller states nothing. It is never INFERRED from the words.
    language: input.language ?? parsed.value.declaredLanguage,
    trackKind: input.trackKind,
    format: document.format,
  });
  const contentSha256 = await deps.hasher.sha256(
    knowledgeTranscriptVersionBytes({
      canonicalText: document.canonicalText,
      cues: document.cues,
      videoIdentity: input.videoIdentity,
    }),
  );

  // 4. Resolve the target BEFORE writing anything, so a refused replacement
  //    costs nothing and leaves nothing.
  let documentId: KnowledgeDocumentId;
  let target: KnowledgeTranscriptTarget | null = null;
  let expected: KnowledgeTranscriptExpectedVersion | null = null;
  if (input.replaces === null) {
    documentId = deps.ids.newDocumentId();
  } else {
    // SCOPED BY BOARD. An id belonging to another board is not found here, so
    // it never becomes a target, and the write below re-checks the same scope
    // while holding the row.
    const loaded = await deps.repository.loadTranscriptTarget(
      input.boardId,
      input.replaces.documentId,
    );
    if (!loaded.ok) return loaded;
    if (loaded.value === null) {
      return err(domainError('not_found', 'That transcript no longer exists'));
    }
    if (loaded.value.boardId !== input.boardId) {
      // Belt as well as braces: a repository that ignored its scope argument
      // must not be able to hand this path a document from another board.
      return err(domainError('not_found', 'That transcript no longer exists'));
    }

    const inconsistent = transcriptConsistencyBreak(loaded.value);
    if (inconsistent !== null) {
      return err(
        domainError('validation', 'That document cannot be replaced by a transcript', {
          details: { reason: inconsistent },
        }),
      );
    }
    // BOTH HALVES. The hash alone cannot separate two callers who started from
    // one observed version, because the same-hash paths below leave it exactly
    // where they found it.
    if (loaded.value.contentSha256 !== input.replaces.expectedContentSha256) {
      return err(
        domainError('conflict', 'This transcript changed since you opened it', {
          details: { expected: input.replaces.expectedContentSha256 },
        }),
      );
    }
    if (loaded.value.mutationRevision !== input.replaces.expectedMutationRevision) {
      return err(
        domainError('conflict', 'This transcript was edited since you opened it', {
          details: { expectedRevision: input.replaces.expectedMutationRevision },
        }),
      );
    }

    const expectedVersion: KnowledgeTranscriptExpectedVersion = {
      contentSha256: input.replaces.expectedContentSha256,
      mutationRevision: input.replaces.expectedMutationRevision,
    };

    // SAME VERSION, RE-PASTED -- WHICH IS NOT THE SAME AS AN IDENTICAL REQUEST.
    //
    // CORRECTED. This used to return immediately on a matching hash, before
    // anything compared the name, the language, the track kind or the format.
    // So a user correcting `unknown` to `human`, fixing a language, renaming
    // the transcript, or re-pasting the same cues in another format got a
    // silent no-op: the correction was discarded and NOTHING SAID SO. A
    // dropped truth that reports success is worse than a refusal.
    //
    // The hash covers text, cue ranges, timings and the claimed video. It does
    // NOT cover these four, so they are compared explicitly.
    if (contentSha256 === loaded.value.contentSha256) {
      const requested: KnowledgeTranscriptMetadata = {
        originalFilename: title,
        language: representation.language,
        trackKind: input.trackKind,
        format: document.format,
      };
      const changed = transcriptMetadataChanges(loaded.value, requested);

      if (changed.length === 0) {
        // Genuinely identical. Nothing uploaded, nothing written, and the
        // retained original stays the paste that first produced this version.
        return ok({
          document: loaded.value.document,
          written: false,
          metadataOnly: false,
          metadataChanged: [],
          supersededCleanupCandidate: null,
          mutationRevision: loaded.value.mutationRevision,
        });
      }

      // A FORMAT CHANGE IS NOT METADATA-ONLY. The declared format describes
      // the RETAINED ORIGINAL, so changing it while keeping the old object
      // would leave the row claiming a format its stored bytes are not in.
      // That case falls through to the full path below, which uploads the new
      // paste and replaces the version -- with the same hash, because the
      // content genuinely did not change.
      if (!changed.includes('format')) {
        const updated = await deps.repository.updateTranscriptMetadata(
          { documentId: loaded.value.documentId, boardId: input.boardId },
          {
            originalFilename: requested.originalFilename,
            language: requested.language,
            trackKind: requested.trackKind,
          },
          expectedVersion,
        );
        if (!updated.ok) return updated;
        const stalled = revisionAdvanceBreak(
          expectedVersion.mutationRevision,
          updated.value.mutationRevision,
        );
        if (stalled !== null) {
          return err(savedStateUncertain(stalled));
        }
        return ok({
          document: updated.value.document,
          written: false,
          metadataOnly: true,
          metadataChanged: changed,
          supersededCleanupCandidate: null,
          mutationRevision: updated.value.mutationRevision,
        });
      }
    }

    documentId = loaded.value.documentId;
    target = loaded.value;
    expected = expectedVersion;
  }

  // 5. This attempt's own object, at a key no other request can name.
  const storagePath = buildKnowledgeTranscriptStoragePath(
    input.boardId,
    documentId,
    contentSha256,
    deps.uploads.newUploadId(),
    document.format,
  );
  const mimeType = MIME_BY_FORMAT[document.format];
  const uploaded = await deps.storage.upload(storagePath, payloadBytes, mimeType);
  if (!uploaded.ok) return uploaded;

  const parserOptionsHash = await deps.hasher.sha256(
    new TextEncoder().encode(
      JSON.stringify({
        parser: KNOWLEDGE_TRANSCRIPT_PARSER_NAME,
        version: KNOWLEDGE_TRANSCRIPT_PARSER_VERSION,
        representationVersion: representation.representationVersion,
        format: document.format,
      }),
    ),
  );

  const body: KnowledgeTranscriptVersionBody = {
    originalFilename: title,
    mimeType,
    fileSizeBytes: payloadBytes.length,
    storagePath,
    contentSha256,
    parserName: KNOWLEDGE_TRANSCRIPT_PARSER_NAME,
    parserVersion: KNOWLEDGE_TRANSCRIPT_PARSER_VERSION,
    parserOptionsHash,
    canonicalText: document.canonicalText,
    representation,
    chunks,
  };

  // 6. ONE call. Either the database is on the new version entirely, or it is
  //    on the old one entirely.
  const written = expected === null
    ? await deps.repository.createTranscriptVersion({
        ...body,
        documentId,
        boardId: input.boardId,
        createdBy: input.userId,
        kind: KNOWLEDGE_TEXT_KIND,
      })
    : await deps.repository.replaceTranscriptVersion(
        { ...body, documentId, boardId: input.boardId },
        expected,
      );

  if (!written.ok) {
    // THIS request's object, and only this request's. A concurrent import that
    // produced the same content hash owns a different key, so the loser of a
    // race cleans up its own upload and cannot reach the winner's published
    // object.
    const removed = await deps.storage.remove(storagePath);
    if (removed.ok) return written;
    return err(
      domainError(written.error.code, written.error.message, {
        details: { ...(written.error.details ?? {}), cleanupFailed: ['stored file'] },
      }),
    );
  }

  if (expected !== null) {
    const stalled = revisionAdvanceBreak(expected.mutationRevision, written.value.mutationRevision);
    if (stalled !== null) {
      return err(savedStateUncertain(stalled));
    }
  }

  // 7. RETENTION OF THE SUPERSEDED PAYLOAD -- corrected.
  //
  //    IT IS NOT DELETED HERE. An earlier version removed it immediately after
  //    the commit and discarded the result, which was wrong twice over: it
  //    created a race -- a reader that resolved the old row moments earlier
  //    fetches an object that has just been deleted -- and the outcome then
  //    reported the same path whether the removal had succeeded or failed, so
  //    a caller could not tell a clean cleanup from real residue.
  //
  //    The path is RETAINED and returned as a CLEANUP CANDIDATE. A sweep can
  //    collect it once nothing can still be mid-flight against it, which is a
  //    judgement this request cannot make.
  //
  //    WHAT THAT COSTS, stated accurately. Each retained object is bounded --
  //    KNOWLEDGE_TRANSCRIPT_MAX_PAYLOAD_BYTES -- but the ACCUMULATION IS NOT:
  //    one object per superseding re-import, forever, until a sweep exists. An
  //    earlier note said growth was "bounded by that sweep", which described a
  //    sweep that has not been written.
  //
  //    AND RETURNING THE PATH IS TELEMETRY, NOT GARBAGE COLLECTION. It tells
  //    one caller about one object, in one response, and nothing durable
  //    records it. A real sweep needs: a grace period long enough that no
  //    request begun before the commit can still be running, and a FRESH
  //    database check that no row references the path, performed at deletion
  //    time rather than inherited from whatever produced the candidate.
  //    Recorded as a followup; it is not done here.
  //
  //    Failed-attempt cleanup stays immediate and is unaffected: that object
  //    was never published, no reader can hold it, and nothing else can name
  //    its attempt-scoped key.
  return ok({
    document: written.value.document,
    mutationRevision: written.value.mutationRevision,
    written: true,
    metadataOnly: false,
    metadataChanged: target === null
      ? []
      : transcriptMetadataChanges(target, {
          originalFilename: title,
          language: representation.language,
          trackKind: input.trackKind,
          format: document.format,
        }),
    supersededCleanupCandidate: target?.storagePath ?? null,
  });
}

/**
 * Windows become chunks -- widened into a LOSSLESS CONTIGUOUS PARTITION.
 *
 * A window spans its own cues, so the separator between the last cue of one
 * window and the first cue of the next belongs to neither. Each chunk
 * therefore starts where the previous one ENDED rather than where its own
 * first cue begins, which hands every separator to the following chunk, and
 * the last chunk runs to the end of the text. Cue containment is unaffected:
 * a chunk only ever grows leftwards into a gap.
 */
function transcriptChunks(
  document: KnowledgeTranscriptDocument,
): readonly KnowledgeTranscriptChunkInsert[] {
  const total = document.canonicalText.length;

  // A transcript with no cues is a plain paste: one chunk, no timings, and
  // still the whole text.
  if (document.cues.length === 0) {
    return total === 0
      ? []
      : [{ chunkIndex: 0, text: document.canonicalText, charStart: 0, charEnd: total, startMs: null, endMs: null }];
  }

  const windows: readonly KnowledgeTranscriptWindow[] = groupKnowledgeTranscriptWindows(document);
  const chunks: KnowledgeTranscriptChunkInsert[] = [];
  let start = 0;
  for (const [index, window] of windows.entries()) {
    const end = index === windows.length - 1 ? total : window.charEnd;
    chunks.push({
      chunkIndex: index,
      text: document.canonicalText.slice(start, end),
      charStart: start,
      charEnd: end,
      startMs: window.startMs,
      endMs: window.endMs,
    });
    start = end;
  }
  return chunks;
}
