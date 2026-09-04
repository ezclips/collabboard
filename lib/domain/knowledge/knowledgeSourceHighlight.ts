import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type {
  KnowledgeDocumentId,
  KnowledgeSourceHighlightId,
  SourceReferenceId,
  UserId,
} from '../core/ids';
import { isKnowledgeHighlightColor } from './knowledgeSourceHighlightColor';
import type { KnowledgeSourceSpanReference } from './knowledgeSourceSpanResolver';

/**
 * PDF-R6K-H2A -- the standalone PDF text highlight.
 *
 * A highlight is a VISUAL ANNOTATION of one exact passage. It is not a
 * citation and it is not a projection of one. `source_references` continues to
 * answer "which Note cites this source"; this answers "what did someone mark on
 * the page". The two may describe the same text and are deleted independently.
 *
 * The span is the existing one, unchanged and unforked: page-relative UTF-16
 * code units, half-open [charStart, charEnd), addressable with String.slice.
 */

export interface KnowledgeSourceHighlight {
  readonly id: KnowledgeSourceHighlightId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly quoteText: string;
  readonly quoteHash: string | null;
  readonly color: string;
  readonly createdBy: UserId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * The citation this highlight was born with, where it was born with one.
   * Null for a highlight created on its own AND for one whose origin citation
   * has since been deleted -- the column is ON DELETE SET NULL, which is what
   * lets a Note be deleted without taking the annotation with it.
   */
  readonly sourceReferenceId: SourceReferenceId | null;
}

/**
 * The highlight as the EXISTING span resolver already understands it.
 *
 * This adapter is the whole reason no resolver logic is duplicated: a highlight
 * is single-page, so it presents itself as a one-page reference and gets
 * `offset` resolution, `quote_fallback` drift recovery and every rejection rule
 * for free. Forking `resolveKnowledgeSourceSpan` would create a second opinion
 * about what "exact" means, and the reader would eventually disagree with the
 * writer about which characters a highlight covers.
 */
export function knowledgeSourceHighlightSpanReference(
  highlight: Pick<
    KnowledgeSourceHighlight,
    'pageNumber' | 'charStart' | 'charEnd' | 'quoteText'
  >,
): KnowledgeSourceSpanReference {
  return {
    pageStart: highlight.pageNumber,
    pageEnd: highlight.pageNumber,
    quoteText: highlight.quoteText,
    charStart: highlight.charStart,
    charEnd: highlight.charEnd,
  };
}

/** Everything a caller may state when creating a highlight. */
export interface CreateKnowledgeSourceHighlightInput {
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly quoteText: string;
  readonly color: string;
  readonly sourceReferenceId: SourceReferenceId | null;
}

/**
 * The quote length ceiling `source_references` already applies, repeated rather
 * than imported so the two limits can diverge if the products ever do. A
 * highlight is a passage a person selected, not a document.
 */
export const KNOWLEDGE_HIGHLIGHT_QUOTE_MAX_LENGTH = 4000;

const isInteger = (value: number): boolean => Number.isInteger(value);

/**
 * Every invariant the column constraints also enforce, checked here first so
 * the caller gets a `validation` error rather than a database exception -- and
 * so the rules are stated once, in the layer that owns meaning.
 */
export function validateCreateKnowledgeSourceHighlight(
  input: CreateKnowledgeSourceHighlightInput,
): DomainError | null {
  if (!isInteger(input.pageNumber) || input.pageNumber < 1) {
    return domainError('validation', 'Highlight page must be a positive integer');
  }
  if (!isInteger(input.charStart) || !isInteger(input.charEnd)) {
    return domainError('validation', 'Highlight char offsets must be integers');
  }
  if (input.charStart < 0) {
    return domainError('validation', 'Highlight char offsets must not be negative');
  }
  // Empty is rejected as well as inverted: a span nobody can see annotates
  // nothing, which is the same rule the span resolver applies to citations.
  if (input.charEnd <= input.charStart) {
    return domainError('validation', 'Highlight char offsets must be a non-empty range');
  }
  if (input.quoteText.length === 0) {
    return domainError('validation', 'Highlight quote must not be empty');
  }
  if (input.quoteText.length > KNOWLEDGE_HIGHLIGHT_QUOTE_MAX_LENGTH) {
    return domainError('validation', 'Highlight quote is too long');
  }
  // The quote is the passage the offsets cover, so its length is not free to
  // disagree with them. Without this a highlight could store one passage and
  // paint a different one after any drift recovery.
  if (input.quoteText.length !== input.charEnd - input.charStart) {
    return domainError('validation', 'Highlight quote length must match its char range');
  }
  if (!isKnowledgeHighlightColor(input.color)) {
    return domainError('validation', 'Highlight colour must be a hex colour');
  }
  return null;
}

/** The only field a highlight exposes for update in H2A. */
export interface UpdateKnowledgeSourceHighlightColorInput {
  readonly highlightId: KnowledgeSourceHighlightId;
  readonly color: string;
}

export function validateUpdateKnowledgeSourceHighlightColor(
  input: UpdateKnowledgeSourceHighlightColorInput,
): DomainError | null {
  if (!isKnowledgeHighlightColor(input.color)) {
    return domainError('validation', 'Highlight colour must be a hex colour');
  }
  return null;
}
