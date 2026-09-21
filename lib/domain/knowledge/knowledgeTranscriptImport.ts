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

/** One chunk of a transcript. Bounded by cues, never mid-cue. */
export interface KnowledgeTranscriptChunkInsert {
  readonly chunkIndex: number;
  readonly text: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly startMs: number;
  readonly endMs: number;
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

/** What the caller believed it was replacing. */
export interface KnowledgeTranscriptTarget {
  readonly documentId: KnowledgeDocumentId;
  /** The board the STORED row belongs to, never the caller's claim. */
  readonly boardId: BoardId;
  readonly kind: string;
  /** Non-null exactly when the target is already a transcript. */
  readonly transcriptRepresentation: KnowledgeTranscriptStoredRepresentation | null;
  readonly contentSha256: string;
  /** The object the stored row points at. Superseded only after a commit. */
  readonly storagePath: string;
  readonly document: KnowledgeDocument;
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
  ): Promise<Result<KnowledgeDocument, DomainError>>;
  /**
   * Replaces ONE version with another in ONE transaction.
   *
   * THE TRANSACTION MUST, while holding the row locked: match `documentId` AND
   * `boardId`, match the stored hash against `expectedContentSha256`, and
   * confirm the row is still a transcript. Any mismatch refuses the write and
   * leaves the stored version exactly as it was. The checks this module
   * performs before calling are for clearer messages; they can all go stale
   * between here and the lock, and only the locked checks cannot.
   */
  replaceTranscriptVersion(
    write: KnowledgeTranscriptReplaceWrite,
    expectedContentSha256: string,
  ): Promise<Result<KnowledgeDocument, DomainError>>;
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
  } | null;
}

/** A replacement that changed nothing, and therefore wrote nothing. */
export interface KnowledgeTranscriptImportOutcome {
  readonly document: KnowledgeDocument;
  readonly written: boolean;
  /**
   * The object the PREVIOUS version pointed at, after a committed replacement.
   * Null when nothing was superseded. See the retention note on removal.
   */
  readonly supersededPath: string | null;
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
  let previousEnd = -1;
  for (const [index, chunk] of chunks.entries()) {
    if (chunk.chunkIndex !== index) return `chunk ${index} is indexed ${chunk.chunkIndex}`;
    if (chunk.charStart < 0 || chunk.charEnd < chunk.charStart) {
      return `chunk ${index} has an impossible range ${chunk.charStart}..${chunk.charEnd}`;
    }
    if (chunk.charStart < previousEnd) {
      return `chunk ${index} starts at ${chunk.charStart}, inside the previous chunk`;
    }
    if (chunk.text !== document.canonicalText.slice(chunk.charStart, chunk.charEnd)) {
      return `chunk ${index} text does not match its own character range`;
    }
    previousEnd = chunk.charEnd;
  }

  for (const cue of document.cues) {
    const home = chunks.find(
      (chunk) => cue.charStart >= chunk.charStart && cue.charEnd <= chunk.charEnd,
    );
    if (home === undefined) {
      return `the cue at ${cue.charStart}..${cue.charEnd} is not wholly inside any chunk`;
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
  let expected: string | null = null;
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
    if (loaded.value.contentSha256 !== input.replaces.expectedContentSha256) {
      return err(
        domainError('conflict', 'This transcript changed since you opened it', {
          details: { expected: input.replaces.expectedContentSha256 },
        }),
      );
    }

    // SAME VERSION, RE-PASTED. The hash is the version, and equivalent
    // formatting can produce the same version from different raw bytes. There
    // is nothing to write: writing would swap the stored original for bytes
    // that mean the same thing, change nothing anyone can observe, and put the
    // referenced object at risk for no gain. Nothing is uploaded either -- this
    // returns before step 5 -- so there is no object to clean up.
    //
    // THE CONSEQUENCE, stated rather than hidden: the retained original stays
    // the paste that FIRST produced this version, not the most recent one.
    if (contentSha256 === loaded.value.contentSha256) {
      return ok({ document: loaded.value.document, written: false, supersededPath: null });
    }

    documentId = loaded.value.documentId;
    target = loaded.value;
    expected = input.replaces.expectedContentSha256;
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
    // produced the same content hash owns a different key, so a loser cleaning
    // up cannot reach the winner's published object.
    const removed = await deps.storage.remove(storagePath);
    if (removed.ok) return written;
    return err(
      domainError(written.error.code, written.error.message, {
        details: { ...(written.error.details ?? {}), cleanupFailed: ['stored file'] },
      }),
    );
  }

  // 7. RETENTION OF THE SUPERSEDED PAYLOAD -- decided, not left open.
  //
  //    It is REMOVED, best effort, and only after the commit. Once the
  //    transaction has moved the row, nothing references those bytes: the
  //    previous version no longer exists as a row, so there is nothing to
  //    recover it TO, and keeping it would grow one orphan per re-import
  //    forever.
  //
  //    Best effort, and never fatal: the version IS committed, and failing the
  //    request over a leftover object would report a successful import as a
  //    failure. The path is returned so a caller can log or sweep it.
  //
  //    The one consequence, stated: a reader that read the row just before the
  //    commit and fetches the object just after gets a missing object. That is
  //    a transient failure on a version that no longer exists, not corruption
  //    of one that does.
  if (target !== null) {
    await deps.storage.remove(target.storagePath);
    return ok({ document: written.value, written: true, supersededPath: target.storagePath });
  }
  return ok({ document: written.value, written: true, supersededPath: null });
}

/** Windows become chunks, in order, with their own timings carried along. */
function transcriptChunks(
  document: KnowledgeTranscriptDocument,
): readonly KnowledgeTranscriptChunkInsert[] {
  const windows: readonly KnowledgeTranscriptWindow[] = groupKnowledgeTranscriptWindows(document);
  return windows.map((window, index) => ({
    chunkIndex: index,
    text: document.canonicalText.slice(window.charStart, window.charEnd),
    charStart: window.charStart,
    charEnd: window.charEnd,
    startMs: window.startMs,
    endMs: window.endMs,
  }));
}
