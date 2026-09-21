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
// behind it is an RPC. There is no compensation logic here because there is
// nothing to compensate -- the database either moved to the new version or
// stayed on the old one.
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
// version of the transcript and anything citing a timestamp in it is stale.
//
// THE STORAGE KIND IS SHARED, THE REPRESENTATION IS NOT. A transcript is
// stored with kind 'text' like any other text source; what makes it a
// transcript is a non-null transcript_representation. The hash difference
// between a .txt of the same words and a pasted transcript is a REPRESENTATION
// distinction, not a claim that they are different kinds of thing.
//
// THAT SHARING IS ALSO THE RISK. An ordinary text update path, seeing kind
// 'text', would happily rewrite the text of a transcript and leave its cues
// and representation describing the previous words. `transcriptConsistency`
// below is the domain half of the guard; the database half is a CHECK the
// migration owns, and until that is applied and verified the guard is enforced
// in one process only. Stated, not assumed.
//
// ============================================================================
// WHY THE ORIGINAL IS WRITTEN TO A VERSION-SCOPED PATH
// ============================================================================
//
// Overwriting `original.vtt` in place would destroy the previous version's
// bytes BEFORE the row that still points at them has moved. A failed replace
// would then leave a perfectly good old row whose original no longer exists.
// So each version's payload goes to its own key, the row points at that key,
// and a failed replace leaves an unreferenced object behind instead of a
// referenced hole. Residue is recoverable; a hole is not.

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
 * ONE VERSION, as the repository receives it.
 *
 * Every field here is derived from the same parse. They are passed together
 * because they must be WRITTEN together -- a port that accepted them in
 * separate calls would be an invitation to the half-written state this module
 * exists to rule out.
 */
export interface KnowledgeTranscriptVersionWrite {
  readonly documentId: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly createdBy: UserId;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
  readonly contentSha256: string;
  readonly kind: typeof KNOWLEDGE_TEXT_KIND;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly parserOptionsHash: string;
  readonly canonicalText: string;
  readonly representation: KnowledgeTranscriptStoredRepresentation;
  readonly chunks: readonly KnowledgeTranscriptChunkInsert[];
}

/** What the caller believed it was replacing. */
export interface KnowledgeTranscriptTarget {
  readonly documentId: KnowledgeDocumentId;
  readonly kind: string;
  /** Non-null exactly when the target is already a transcript. */
  readonly transcriptRepresentation: KnowledgeTranscriptStoredRepresentation | null;
  readonly contentSha256: string;
}

export interface KnowledgeTranscriptRepository {
  /** The document being replaced, or null when it does not exist. */
  loadTranscriptTarget(
    documentId: KnowledgeDocumentId,
  ): Promise<Result<KnowledgeTranscriptTarget | null, DomainError>>;
  /** Creates document, cues, chunks and readiness in ONE transaction. */
  createTranscriptVersion(
    write: KnowledgeTranscriptVersionWrite,
  ): Promise<Result<KnowledgeDocument, DomainError>>;
  /**
   * Replaces ONE version with another in ONE transaction, and only if the
   * stored hash is still `expectedContentSha256`. A mismatch means somebody
   * else re-imported in the meantime; the write is refused and the stored
   * version is left exactly as it was.
   */
  replaceTranscriptVersion(
    write: KnowledgeTranscriptVersionWrite,
    expectedContentSha256: string,
  ): Promise<Result<KnowledgeDocument, DomainError>>;
}

export interface KnowledgeTranscriptImportDeps {
  readonly authorizer: KnowledgeBoardAuthorizer;
  readonly repository: KnowledgeTranscriptRepository;
  readonly storage: Pick<KnowledgeStorageGateway, 'upload' | 'remove'>;
  readonly hasher: KnowledgeContentHasher;
  readonly ids: KnowledgeDocumentIdFactory;
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
   * The document to replace, or null to create a new one.
   *
   * `expectedContentSha256` is the version the user was looking at when they
   * started. See replaceTranscriptVersion.
   */
  readonly replaces: {
    readonly documentId: KnowledgeDocumentId;
    readonly expectedContentSha256: string;
  } | null;
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
 * The key this version's payload is written to.
 *
 * VERSION-SCOPED BY HASH, so a failed replace cannot destroy the bytes the
 * surviving row points at. The hash is hex from the hasher and is length- and
 * character-checked before it reaches a storage key, because a key is not the
 * place to find out that an input was not what it claimed.
 */
export function buildKnowledgeTranscriptStoragePath(
  boardId: BoardId,
  documentId: KnowledgeDocumentId,
  contentSha256: string,
  format: KnowledgeTranscriptFormat,
): string {
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new Error('a transcript storage key needs a 64-character lowercase hex hash');
  }
  return `knowledge/${boardId}/${documentId}/transcript-${contentSha256}${EXTENSION_BY_FORMAT[format]}`;
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
 * The domain half of the transcript consistency guard.
 *
 * A transcript shares kind 'text' with ordinary text sources, so a caller
 * holding a text-update path could reach one. This refuses the crossing in
 * both directions, and says which crossing it refused: rewriting a transcript
 * as plain text would leave its cues describing words that are no longer
 * there, and replacing a plain text document with a transcript version would
 * attach cues to a document nothing else treats as timed.
 *
 * THE DATABASE HALF IS NOT IN FORCE YET. This runs in one process; a second
 * writer -- another deployment, a script, the SQL console -- is not subject to
 * it until the migration's CHECK is applied and verified.
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
): Promise<Result<KnowledgeDocument, DomainError>> {
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
  let expected: string | null = null;
  if (input.replaces === null) {
    documentId = deps.ids.newDocumentId();
  } else {
    const target = await deps.repository.loadTranscriptTarget(input.replaces.documentId);
    if (!target.ok) return target;
    if (target.value === null) {
      return err(domainError('not_found', 'That transcript no longer exists'));
    }
    const inconsistent = transcriptConsistencyBreak(target.value);
    if (inconsistent !== null) {
      return err(
        domainError('validation', 'That document cannot be replaced by a transcript', {
          details: { reason: inconsistent },
        }),
      );
    }
    // Read-time check, for a clear message. The WRITE is still conditional on
    // the same hash inside the transaction -- this one can go stale between
    // here and there, and only the transactional check cannot.
    if (target.value.contentSha256 !== input.replaces.expectedContentSha256) {
      return err(
        domainError('conflict', 'This transcript changed since you opened it', {
          details: { expected: input.replaces.expectedContentSha256 },
        }),
      );
    }
    documentId = target.value.documentId;
    expected = input.replaces.expectedContentSha256;
  }

  const storagePath = buildKnowledgeTranscriptStoragePath(
    input.boardId,
    documentId,
    contentSha256,
    document.format,
  );
  const mimeType = MIME_BY_FORMAT[document.format];

  // 5. The payload goes to a key NOTHING currently points at, so this cannot
  //    disturb the version already stored.
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

  const write: KnowledgeTranscriptVersionWrite = {
    documentId,
    boardId: input.boardId,
    createdBy: input.userId,
    originalFilename: title,
    mimeType,
    fileSizeBytes: payloadBytes.length,
    storagePath,
    contentSha256,
    kind: KNOWLEDGE_TEXT_KIND,
    parserName: KNOWLEDGE_TRANSCRIPT_PARSER_NAME,
    parserVersion: KNOWLEDGE_TRANSCRIPT_PARSER_VERSION,
    parserOptionsHash,
    canonicalText: document.canonicalText,
    representation,
    chunks,
  };

  // 6. ONE call. Either the database is on the new version entirely, or it is
  //    on the old one entirely. The only residue a failure can leave is the
  //    object uploaded at step 5, which nothing references -- removed here,
  //    and reported if the removal itself fails, because unreported residue is
  //    residue nobody knows exists.
  const written = expected === null
    ? await deps.repository.createTranscriptVersion(write)
    : await deps.repository.replaceTranscriptVersion(write, expected);

  if (!written.ok) {
    const removed = await deps.storage.remove(storagePath);
    if (removed.ok) return written;
    return err(
      domainError(written.error.code, written.error.message, {
        details: { ...(written.error.details ?? {}), cleanupFailed: ['stored file'] },
      }),
    );
  }
  return written;
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
