// Ingesting one text source, end to end.
//
// A SIBLING OF createKnowledgePdfUpload, and the differences are all
// consequences of one fact: THERE IS NO EXTRACTION STEP. A PDF is uploaded,
// recorded as 'uploaded', and a worker later turns it into pages and chunks. A
// text file already IS its text, so this path produces the chunks itself and
// the document is 'ready' when it returns -- there is nothing to wait for, and
// leaving it 'uploaded' would hide it from search behind a worker that will
// never claim it.
//
// ORDERING, for the same reason the PDF path states its own: no failure may
// leave an inconsistent pair.
//
//   1. authorize the board mutation          (cheapest rejection first)
//   2. validate, decode, chunk               (no external effect yet)
//   3. assert the losslessness invariant     (still no external effect)
//   4. hash the CANONICAL TEXT
//   5. upload the original bytes
//   6. insert the document row, NOT READY
//   7. insert the chunks
//   8. promote the document to ready
//
// Steps 6 and 7 can each fail after an external effect exists, and each
// compensates for everything before it. A document row with no chunks is the
// state worth ruling out: it is a source that appears in the library and can
// never be found or cited.
//
// READINESS IS STEP 8 AND NOT PART OF STEP 6. Written on the insert, there is
// a window between the row and its chunks in which a crash leaves a document
// claiming to be searchable with nothing in it -- and compensation cannot run,
// because the process that would have run it is the one that died. In this
// order the state that survives a crash is a document stuck at 'uploaded':
// invisible to search, shown as still processing. Wrong, but wrong in the
// direction that tells the truth about what can be found in it.
//
// One transaction would remove the window rather than making it survivable,
// and that is the end state: an RPC writing document, chunks and readiness
// together. It needs a migration, so it is not this shape's to do yet.
//
// UNTIL THEN, THE LIMITATION IS RECOVERY, AND IT IS NOT SELF-HEALING. A
// document left at 'uploaded' by a failed promotion stays there: nothing
// retries it, no worker sweeps for it, and the chunks it already has are not
// reachable through search. Recovery today means uploading the source again.
// Deleting the real chunks to tidy the flag would be the worse outcome, so
// the stuck state is kept rather than cleaned.
//
// THE INVARIANT IS CHECKED BEFORE ANYTHING IS WRITTEN, not after. A source
// whose chunks do not reproduce it is refused as an upload -- which the user
// can act on -- rather than stored as a corpus of citations that each land a
// little way from what they quote.

import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';
import type { BoardId, KnowledgeDocumentId, UserId } from '../core/ids';
import type { KnowledgeDocument } from './knowledgePersistence';

import { knowledgeTextHashInput } from './knowledgeTextCanonical';
import {
  canonicalExtractionContractJson,
  KNOWLEDGE_DOCX_CONTRACT_V1,
  KNOWLEDGE_TEXT_CONTRACT_V1,
  KNOWLEDGE_TEXT_EXTRACTOR_NAME,
  KNOWLEDGE_TEXT_EXTRACTOR_VERSION,
} from './knowledgeExtractionContract';
import { assertLosslessChunking, type KnowledgeTextChunkDraft } from './knowledgeTextChunking';
import {
  KNOWLEDGE_TEXT_KIND,
  validateKnowledgeTextSource,
  type KnowledgeTextCandidate,
} from './knowledgeTextIngestion';
import type {
  KnowledgeBoardAuthorizer,
  KnowledgeContentHasher,
  KnowledgeDocumentIdFactory,
  KnowledgeStorageGateway,
} from './knowledgeIngestion';

/** One chunk as it is written. Pageless by construction: see Decision (A). */
export interface KnowledgeTextChunkInsert {
  readonly documentId: KnowledgeDocumentId;
  readonly chunkIndex: number;
  readonly text: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly textHash: string;
}

export interface KnowledgeTextDocumentInsert {
  readonly id: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly createdBy: UserId;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
  readonly contentSha256: string;
  readonly kind: typeof KNOWLEDGE_TEXT_KIND;
  /** What produced the text, and under which extraction contract. */
  readonly parserName: string;
  readonly parserVersion: string;
  readonly parserOptionsHash: string;
}

export interface KnowledgeTextRepository {
  /** Writes the document NOT ready. Readiness is a separate, later step. */
  insertTextDocument(record: KnowledgeTextDocumentInsert): Promise<Result<KnowledgeDocument, DomainError>>;
  insertTextChunks(chunks: readonly KnowledgeTextChunkInsert[]): Promise<Result<void, DomainError>>;
  /** The promotion, run only once the chunks exist. See step 8 below. */
  markDocumentReady(documentId: KnowledgeDocumentId): Promise<Result<KnowledgeDocument, DomainError>>;
  /** Compensation for a chunk write that failed after the row existed. */
  deleteDocument(documentId: KnowledgeDocumentId): Promise<Result<void, DomainError>>;
}

export interface KnowledgeTextUploadDeps {
  readonly authorizer: KnowledgeBoardAuthorizer;
  readonly repository: KnowledgeTextRepository;
  readonly storage: Pick<KnowledgeStorageGateway, 'upload' | 'remove'>;
  readonly hasher: KnowledgeContentHasher;
  readonly ids: KnowledgeDocumentIdFactory;
}

export interface CreateKnowledgeTextUploadInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly file: KnowledgeTextCandidate;
}

/**
 * Where the original bytes live.
 *
 * THIS USED TO SAY the extension is taken from the kind and never from the
 * user's filename, because a filename is caller-controlled and a path built
 * from one can escape its prefix. The reasoning still holds; the conclusion
 * changed, because `.txt` for every source became false the moment a .docx was
 * retained.
 *
 * So the filename now contributes the extension and is NOT trusted to: only a
 * short, lowercase, alphanumeric suffix is accepted, and anything else falls
 * back to `.txt`. No dots, no slashes and no traversal can reach the key --
 * see knowledgeSourceExtension, where that is the whole job.
 */
export function buildKnowledgeTextStoragePath(
  boardId: BoardId,
  documentId: KnowledgeDocumentId,
  originalFilename = '',
): string {
  // THE RETAINED BLOB KEEPS THE SOURCE'S OWN EXTENSION. It used to be `.txt`
  // for everything, which was true while everything was text and became a lie
  // the moment a .docx was retained: the original bytes would sit in storage
  // under a name claiming to be plain text, and anything that later serves
  // them -- a download, a re-extraction -- would start from that claim.
  const extension = knowledgeSourceExtension(originalFilename);
  return `knowledge/${boardId}/${documentId}/original${extension}`;
}

/** The source's own extension, lowercased, or `.txt` when it has none. */
export function knowledgeSourceExtension(originalFilename: string): string {
  const dot = originalFilename.lastIndexOf('.');
  if (dot <= 0 || dot === originalFilename.length - 1) return '.txt';
  const extension = originalFilename.slice(dot).toLowerCase();
  // Bounded and character-checked: this string becomes part of a storage KEY,
  // and a filename is caller-controlled. Anything unexpected falls back
  // rather than travelling into the path.
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : '.txt';
}

/** The per-chunk hash, mirroring what the PDF chunker stores. */
export type KnowledgeTextChunkHasher = (text: string) => string;

export async function createKnowledgeTextUpload(
  deps: KnowledgeTextUploadDeps,
  input: CreateKnowledgeTextUploadInput,
  hashChunk: KnowledgeTextChunkHasher,
): Promise<Result<KnowledgeDocument, DomainError>> {
  const authorized = await deps.authorizer.canMutateBoard(input.boardId, input.userId);
  if (!authorized.ok) return authorized;
  if (!authorized.value) {
    return err(
      domainError('permission_denied', 'You do not have permission to add files to this board'),
    );
  }

  const validated = validateKnowledgeTextSource(input.file);
  if (!validated.ok) return validated;

  const { canonicalText, chunks } = validated.value;

  const broken = assertLosslessChunking(canonicalText, chunks);
  if (broken !== null) {
    // Refused as an upload rather than stored. Every citation into this source
    // would name offsets that do not describe it.
    return err(domainError('validation', 'This file could not be indexed reliably', {
      details: { reason: broken },
    }));
  }

  // The hash is over the CANONICAL text, so the same document saved with
  // different line endings is the same version. See knowledgeTextCanonical.
  const contentSha256 = await deps.hasher.sha256(knowledgeTextHashInput(canonicalText));
  const documentId = deps.ids.newDocumentId();
  const storagePath = buildKnowledgeTextStoragePath(
    input.boardId,
    documentId,
    validated.value.originalFilename,
  );

  // THE REAL MEDIA TYPE, not 'text/plain'. A .docx stored as text/plain would
  // be served as text/plain, and the first thing to fetch it back would have
  // to disbelieve the storage layer to read it.
  const storedMimeType = validated.value.mimeType.trim() || 'text/plain';
  const uploaded = await deps.storage.upload(storagePath, input.file.bytes, storedMimeType);
  if (!uploaded.ok) return uploaded;

  // WHAT PRODUCED THIS TEXT, recorded per document.
  //
  // The contract is hashed rather than named: parser_options_hash is a hash in
  // every other kind that writes it, and a bare version string there would be
  // a second meaning for one column. The version travels inside the hashed
  // options, so the hash moves when any rule moves -- including a rule edited
  // without remembering to bump the version. The committed contract registry
  // is what turns a stored hash back into a name and a number.
  //
  // Text sources start recording this too, from now on. Rows written before
  // this keep NULL: nothing was captured for them, and filling it in now would
  // be claiming metadata that never existed.
  const extraction = validated.value.extraction;
  const contract = extraction === undefined
    ? KNOWLEDGE_TEXT_CONTRACT_V1
    : KNOWLEDGE_DOCX_CONTRACT_V1;
  const parserOptionsHash = await deps.hasher.sha256(
    new TextEncoder().encode(canonicalExtractionContractJson(contract)),
  );

  const inserted = await deps.repository.insertTextDocument({
    id: documentId,
    boardId: input.boardId,
    createdBy: input.userId,
    originalFilename: validated.value.originalFilename,
    mimeType: validated.value.mimeType,
    fileSizeBytes: validated.value.fileSizeBytes,
    storagePath,
    contentSha256,
    kind: KNOWLEDGE_TEXT_KIND,
    parserName: extraction?.parserName ?? KNOWLEDGE_TEXT_EXTRACTOR_NAME,
    parserVersion: extraction?.parserVersion ?? KNOWLEDGE_TEXT_EXTRACTOR_VERSION,
    parserOptionsHash,
  });
  if (!inserted.ok) {
    await deps.storage.remove(storagePath);
    return inserted;
  }

  // A blank file is a legitimate upload that contributes nothing. There is
  // nothing to write, and nothing to compensate for.
  if (chunks.length > 0) {
    const written = await deps.repository.insertTextChunks(
      chunks.map((chunk: KnowledgeTextChunkDraft) => ({
        documentId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        textHash: hashChunk(chunk.text),
      })),
    );
    if (!written.ok) {
      // COMPENSATE BOTH WAYS. A document row with no chunks is worse than no
      // document at all: it appears in the library and can never be found or
      // cited. Cleanup failures are discarded deliberately so they cannot mask
      // the original error -- but they are REPORTED, below, because a failed
      // cleanup leaves real residue and a silent one leaves it unexplained.
      const removedRow = await deps.repository.deleteDocument(documentId);
      const removedFile = await deps.storage.remove(storagePath);
      return err(compensationAwareError(written.error, removedRow, removedFile));
    }
  }

  // 8. READINESS LAST. Only now is there something to find, so only now does
  //    the document say it can be found. If this fails the row stays at
  //    'uploaded' -- invisible to search, shown as still processing -- which
  //    is wrong in the direction that tells the truth about its contents. It
  //    is NOT compensated away: the chunks are real and correct, and deleting
  //    a complete document because its last status write failed would destroy
  //    good work to tidy a flag.
  const ready = await deps.repository.markDocumentReady(documentId);
  if (!ready.ok) return ready;
  return ok(ready.value);
}

/**
 * The original failure, plus what could not be cleaned up after it.
 *
 * The cause of the upload failing is never replaced -- that is the thing the
 * caller has to act on. But a compensation that itself failed has left a row
 * or a stored object behind, and saying so in `details` is the difference
 * between residue someone can find and residue nobody knows exists.
 */
function compensationAwareError(
  cause: DomainError,
  removedRow: Result<void, DomainError>,
  removedFile: Result<void, DomainError>,
): DomainError {
  const orphans = [
    ...(removedRow.ok ? [] : ['document row']),
    ...(removedFile.ok ? [] : ['stored file']),
  ];
  if (orphans.length === 0) return cause;
  return domainError(cause.code, cause.message, {
    details: { ...(cause.details ?? {}), cleanupFailed: orphans },
  });
}
