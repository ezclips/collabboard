import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';
import type {
  BoardId,
  KnowledgeDocumentId,
  KnowledgeSourceHighlightId,
  SourceReferenceId,
  UserId,
} from '../core/ids';
import {
  validateCreateKnowledgeSourceHighlight,
  validateUpdateKnowledgeSourceHighlightColor,
} from './knowledgeSourceHighlight';
import type {
  CreateKnowledgeSourceHighlightInput,
  KnowledgeSourceHighlight,
} from './knowledgeSourceHighlight';

/**
 * PDF-R6K-H2A -- the typed authority for standalone highlights.
 *
 * Every operation proves the same thing in the same order: the document belongs
 * to the board named by the ROUTE, and the caller may act on that board. Board
 * identity is never taken from the caller's payload, which is why a highlight
 * row carries no board_id to disagree with.
 *
 * These commands never name `source_references` as writable and never name
 * `padlets` at all. Deleting a highlight cannot reach a citation or a Note,
 * because nothing in this file can express that write.
 */

export interface KnowledgeSourceHighlightDocument {
  readonly id: KnowledgeDocumentId;
  readonly boardId: BoardId;
}

/** Proves the board relationship of a citation offered as a highlight's origin. */
export interface KnowledgeSourceHighlightOriginReference {
  readonly id: SourceReferenceId;
  readonly sourceDocumentId: KnowledgeDocumentId;
}

export interface KnowledgeSourceHighlightBoardAuthorizer {
  /** Board owner or editor collaborator. Never `is_board_member`. */
  canWriteBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
  canReadBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeSourceHighlightRepository {
  findDocument(
    documentId: KnowledgeDocumentId,
  ): Promise<Result<KnowledgeSourceHighlightDocument | null, DomainError>>;
  findOriginReference(
    referenceId: SourceReferenceId,
  ): Promise<Result<KnowledgeSourceHighlightOriginReference | null, DomainError>>;
  findHighlight(
    highlightId: KnowledgeSourceHighlightId,
  ): Promise<Result<KnowledgeSourceHighlight | null, DomainError>>;
  list(
    documentId: KnowledgeDocumentId,
    pageNumber: number | null,
  ): Promise<Result<readonly KnowledgeSourceHighlight[], DomainError>>;
  insert(
    row: KnowledgeSourceHighlightInsert,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>>;
  updateColor(
    highlightId: KnowledgeSourceHighlightId,
    color: string,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>>;
  remove(highlightId: KnowledgeSourceHighlightId): Promise<Result<true, DomainError>>;
}

/**
 * PDF-R6K-H2A-C1. There is deliberately NO `createdBy` here.
 *
 * Authorship is a database fact now: `created_by` defaults to `auth.uid()` and
 * an authenticated caller holds no INSERT privilege on the column, so naming it
 * -- with any value, including NULL -- is a permission error. Stating it here
 * would therefore break the write, and would also be a claim the application is
 * no longer the authority for. The session user is still used, for the
 * authorization check above.
 */
export interface KnowledgeSourceHighlightInsert {
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly quoteText: string;
  readonly quoteHash: string;
  readonly color: string;
  readonly sourceReferenceId: SourceReferenceId | null;
}

export interface KnowledgeQuoteHasher {
  hashQuoteText(text: string): string;
}

export interface KnowledgeSourceHighlightDependencies {
  readonly authorizer: KnowledgeSourceHighlightBoardAuthorizer;
  readonly repository: KnowledgeSourceHighlightRepository;
  readonly hasher: KnowledgeQuoteHasher;
}

const FORBIDDEN = domainError('permission_denied', 'Forbidden');
const NO_DOCUMENT = domainError('not_found', 'Source document not found');
const NO_HIGHLIGHT = domainError('not_found', 'Highlight not found');

/**
 * The document exists AND belongs to the board the route named. A document on
 * another board fails as `not_found` rather than `permission_denied`: the
 * caller has no business learning that an id they cannot reach exists.
 */
async function resolveDocumentOnBoard(
  repository: KnowledgeSourceHighlightRepository,
  documentId: KnowledgeDocumentId,
  boardId: BoardId,
): Promise<Result<KnowledgeSourceHighlightDocument, DomainError>> {
  const found = await repository.findDocument(documentId);
  if (!found.ok) return found;
  if (found.value === null) return err(NO_DOCUMENT);
  if (found.value.boardId !== boardId) return err(NO_DOCUMENT);
  return ok(found.value);
}

export interface ListKnowledgeSourceHighlightsInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageNumber: number | null;
}

export function createListKnowledgeSourceHighlightsQuery(
  deps: Pick<KnowledgeSourceHighlightDependencies, 'authorizer' | 'repository'>,
) {
  return async function list(
    input: ListKnowledgeSourceHighlightsInput,
  ): Promise<Result<readonly KnowledgeSourceHighlight[], DomainError>> {
    if (input.pageNumber !== null
      && (!Number.isInteger(input.pageNumber) || input.pageNumber < 1)) {
      return err(domainError('validation', 'Highlight page must be a positive integer'));
    }
    const document = await resolveDocumentOnBoard(
      deps.repository, input.sourceDocumentId, input.boardId,
    );
    if (!document.ok) return document;

    const allowed = await deps.authorizer.canReadBoard(document.value.boardId, input.userId);
    if (!allowed.ok) return allowed;
    if (!allowed.value) return err(FORBIDDEN);

    return deps.repository.list(input.sourceDocumentId, input.pageNumber);
  };
}

export interface CreateKnowledgeSourceHighlightCommandInput
  extends CreateKnowledgeSourceHighlightInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
}

export function createCreateKnowledgeSourceHighlightCommand(
  deps: KnowledgeSourceHighlightDependencies,
) {
  return async function create(
    input: CreateKnowledgeSourceHighlightCommandInput,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>> {
    const invalid = validateCreateKnowledgeSourceHighlight(input);
    if (invalid) return err(invalid);

    const document = await resolveDocumentOnBoard(
      deps.repository, input.sourceDocumentId, input.boardId,
    );
    if (!document.ok) return document;

    const allowed = await deps.authorizer.canWriteBoard(document.value.boardId, input.userId);
    if (!allowed.ok) return allowed;
    if (!allowed.value) return err(FORBIDDEN);

    // An origin citation must belong to the SAME document. The foreign key
    // alone would happily accept a citation of an unrelated document -- and a
    // highlight whose origin points somewhere else is a false provenance
    // record, not merely an untidy one.
    if (input.sourceReferenceId !== null) {
      const origin = await deps.repository.findOriginReference(input.sourceReferenceId);
      if (!origin.ok) return origin;
      if (origin.value === null) {
        return err(domainError('validation', 'Origin citation not found'));
      }
      if (origin.value.sourceDocumentId !== input.sourceDocumentId) {
        return err(domainError('validation', 'Origin citation belongs to another document'));
      }
    }

    return deps.repository.insert({
      sourceDocumentId: input.sourceDocumentId,
      pageNumber: input.pageNumber,
      charStart: input.charStart,
      charEnd: input.charEnd,
      quoteText: input.quoteText,
      // Server-produced, never accepted from the caller, exactly as the
      // citation writer treats it.
      quoteHash: deps.hasher.hashQuoteText(input.quoteText),
      color: input.color,
      // No author is sent: the column defaults to auth.uid(), which is the same
      // identity this command just authorized, and the database refuses any
      // attempt to state it. That is what makes authorship unforgeable rather
      // than merely correct here.
      sourceReferenceId: input.sourceReferenceId,
    });
  };
}

export interface UpdateKnowledgeSourceHighlightColorCommandInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly highlightId: KnowledgeSourceHighlightId;
  readonly color: string;
}

export function createUpdateKnowledgeSourceHighlightColorCommand(
  deps: Pick<KnowledgeSourceHighlightDependencies, 'authorizer' | 'repository'>,
) {
  return async function updateColor(
    input: UpdateKnowledgeSourceHighlightColorCommandInput,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>> {
    const invalid = validateUpdateKnowledgeSourceHighlightColor(input);
    if (invalid) return err(invalid);

    const authorized = await authorizeExistingHighlight(deps, input);
    if (!authorized.ok) return authorized;

    // Colour only. There is no general patch path, so a body carrying a span,
    // a document, an author or an origin has nothing to update.
    return deps.repository.updateColor(input.highlightId, input.color);
  };
}

export interface DeleteKnowledgeSourceHighlightCommandInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly highlightId: KnowledgeSourceHighlightId;
}

export function createDeleteKnowledgeSourceHighlightCommand(
  deps: Pick<KnowledgeSourceHighlightDependencies, 'authorizer' | 'repository'>,
) {
  return async function remove(
    input: DeleteKnowledgeSourceHighlightCommandInput,
  ): Promise<Result<true, DomainError>> {
    const authorized = await authorizeExistingHighlight(deps, input);
    if (!authorized.ok) return authorized;

    // Deletes ONE highlight row. The repository has no citation, padlet or Note
    // write to offer, so "Used in Notes", the Library backlink and the Note
    // itself are untouched by construction rather than by care.
    return deps.repository.remove(input.highlightId);
  };
}

/**
 * The shared mutation gate for an existing highlight: it must exist, its
 * document must be on the route's board, and the caller must be able to write
 * that board. Reaching a highlight through another board's id fails closed as
 * `not_found`.
 */
async function authorizeExistingHighlight(
  deps: Pick<KnowledgeSourceHighlightDependencies, 'authorizer' | 'repository'>,
  input: {
    readonly boardId: BoardId;
    readonly userId: UserId;
    readonly highlightId: KnowledgeSourceHighlightId;
  },
): Promise<Result<KnowledgeSourceHighlight, DomainError>> {
  const found = await deps.repository.findHighlight(input.highlightId);
  if (!found.ok) return found;
  if (found.value === null) return err(NO_HIGHLIGHT);

  const document = await resolveDocumentOnBoard(
    deps.repository, found.value.sourceDocumentId, input.boardId,
  );
  if (!document.ok) return err(NO_HIGHLIGHT);

  const allowed = await deps.authorizer.canWriteBoard(document.value.boardId, input.userId);
  if (!allowed.ok) return allowed;
  if (!allowed.value) return err(FORBIDDEN);

  return ok(found.value);
}
