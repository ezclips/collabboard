import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';
import type { BoardId, KnowledgeDocumentId, PostId, UserId } from '../core/ids';
import type { SourceReference } from './knowledgePersistence';

/** UTF-16 code units, matching `String.prototype.length`. */
export const MAX_SOURCE_REFERENCE_QUOTE_LENGTH = 100_000;

export interface CreateKnowledgeSourceReferenceInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly targetPadletId: PostId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
}

export interface KnowledgeSourceReferenceSourceDocument {
  readonly boardId: BoardId;
  readonly pageCount: number | null;
  readonly processingStatus: string;
}

export interface KnowledgeSourceReferenceTargetPadlet {
  readonly boardId: BoardId;
}

/**
 * The insert payload deliberately has no char offset or locator field. V1 owns
 * those as null, and leaving them off the type means no caller — now or after a
 * later refactor — can route highlight geometry into the write path by mistake.
 */
export interface KnowledgeSourceReferenceInsert {
  readonly targetPadletId: PostId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly quoteHash: string | null;
}

export interface KnowledgeSourceReferenceBoardWriteAuthorizer {
  canWriteBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeSourceReferenceValidationRepository {
  findSourceDocument(
    id: KnowledgeDocumentId,
    boardId: BoardId,
  ): Promise<Result<KnowledgeSourceReferenceSourceDocument | null, DomainError>>;
  findTargetPadlet(
    id: PostId,
    boardId: BoardId,
  ): Promise<Result<KnowledgeSourceReferenceTargetPadlet | null, DomainError>>;
}

export interface KnowledgeSourceReferenceWriter {
  insertSourceReference(
    row: KnowledgeSourceReferenceInsert,
  ): Promise<Result<SourceReference, DomainError>>;
}

export interface KnowledgeQuoteHasher {
  hashQuoteText(text: string): string;
}

export interface CreateKnowledgeSourceReferenceDependencies {
  readonly authorizer: KnowledgeSourceReferenceBoardWriteAuthorizer;
  readonly repository: KnowledgeSourceReferenceValidationRepository;
  readonly writer: KnowledgeSourceReferenceWriter;
  readonly hasher: KnowledgeQuoteHasher;
}

function validateInput(input: CreateKnowledgeSourceReferenceInput): DomainError | null {
  if (!Number.isInteger(input.pageStart) || input.pageStart < 1) {
    return domainError('validation', 'Source reference page start must be a positive integer');
  }
  if (!Number.isInteger(input.pageEnd) || input.pageEnd < input.pageStart) {
    return domainError('validation', 'Source reference page end must not precede page start');
  }
  if (input.quoteText !== null) {
    // The quote is evidence: an empty snapshot proves nothing, and trimming it
    // would break the byte-for-byte correspondence with its hash.
    if (typeof input.quoteText !== 'string' || input.quoteText.length === 0) {
      return domainError('validation', 'Source reference quote must not be empty');
    }
    if (input.quoteText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) {
      return domainError('validation', 'Source reference quote is too long');
    }
  }
  return null;
}

/**
 * Page-level citation write. Every check runs before the insert, and the board
 * is re-derived from the stored document and padlet rather than trusted from
 * the caller, so a cross-board pairing cannot be fabricated even by a client
 * that supplies a consistent-looking boardId.
 */
export function createCreateKnowledgeSourceReferenceCommand(
  dependencies: CreateKnowledgeSourceReferenceDependencies,
) {
  return async function createKnowledgeSourceReference(
    input: CreateKnowledgeSourceReferenceInput,
  ): Promise<Result<SourceReference, DomainError>> {
    const invalid = validateInput(input);
    if (invalid) return err(invalid);

    const authorized = await dependencies.authorizer.canWriteBoard(input.boardId, input.userId);
    if (!authorized.ok) return authorized;
    if (!authorized.value) {
      return err(domainError('permission_denied', 'You cannot add sources to this board'));
    }

    const document = await dependencies.repository.findSourceDocument(input.sourceDocumentId, input.boardId);
    if (!document.ok) return document;
    if (document.value === null) {
      return err(domainError('not_found', 'Source document was not found on this board'));
    }
    if (document.value.boardId !== input.boardId) {
      return err(domainError('validation', 'Source document belongs to another board'));
    }
    if (document.value.processingStatus !== 'ready') {
      return err(domainError('validation', 'Source document is not ready'));
    }
    if (document.value.pageCount === null) {
      return err(domainError('validation', 'Source document page count is unknown'));
    }
    if (input.pageEnd > document.value.pageCount) {
      return err(domainError('validation', 'Source reference page range exceeds the document'));
    }

    const padlet = await dependencies.repository.findTargetPadlet(input.targetPadletId, input.boardId);
    if (!padlet.ok) return padlet;
    if (padlet.value === null) {
      return err(domainError('not_found', 'Target post was not found on this board'));
    }
    if (padlet.value.boardId !== input.boardId) {
      return err(domainError('validation', 'Target post belongs to another board'));
    }

    return dependencies.writer.insertSourceReference({
      targetPadletId: input.targetPadletId,
      sourceDocumentId: input.sourceDocumentId,
      pageStart: input.pageStart,
      pageEnd: input.pageEnd,
      quoteText: input.quoteText,
      // Never read from the caller: the hash must describe the stored snapshot.
      quoteHash: input.quoteText === null ? null : dependencies.hasher.hashQuoteText(input.quoteText),
    });
  };
}
