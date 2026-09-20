/**
 * THE EXTRACTION CONTRACT -- what text a source becomes, stated once.
 *
 * Every offset this feature stores is an index into extracted text. Change any
 * rule below and the text changes, which silently invalidates every range
 * already stored against documents extracted under the old rules: the citation
 * still resolves, still highlights, and now points at the wrong words.
 *
 * So the rules are DATA, not code comments. Each named contract is frozen,
 * versioned, and recorded per document -- see `parser_options_hash` below.
 *
 * WHY parser_options_hash AND NOT A VERSION STRING. The column is a hash and
 * stays one; a bare version string in a field every other kind hashes would be
 * a second meaning for one column. The version travels INSIDE the hashed
 * options, so the hash changes when any rule changes -- including a rule
 * someone edits without remembering to bump the version.
 *
 * HOW THE VERSION STAYS INSPECTABLE. The hash is not meant to be read; it is
 * meant to be MATCHED. `KNOWLEDGE_EXTRACTION_CONTRACTS` below is the committed
 * registry of every contract this repository has ever shipped, so any stored
 * hash can be recomputed from the registry and identified by name and version.
 * A hash that matches nothing in the registry is itself the finding: that
 * document was extracted by rules this build no longer has.
 */

/** The identity of the thing that produced the text, for `parser_name`. */
export const KNOWLEDGE_DOCX_EXTRACTOR_NAME = 'knowledge-docx-mammoth';
export const KNOWLEDGE_TEXT_EXTRACTOR_NAME = 'knowledge-text-canonical';

/**
 * The extractor's OWN version, for `parser_version`. Separate from the
 * contract version on purpose: a bug fix inside the walker that changes no
 * rule bumps this and not the contract, and a rule change bumps both.
 */
export const KNOWLEDGE_DOCX_EXTRACTOR_VERSION = '1';
export const KNOWLEDGE_TEXT_EXTRACTOR_VERSION = '1';

/**
 * Every separator, declared. These are the characters that end up BETWEEN the
 * words of a citation, so they are part of the contract rather than an
 * implementation detail of the walker.
 */
export interface KnowledgeExtractionSeparators {
  /** Between two blocks -- paragraphs, headings, list items, table rows. */
  readonly block: string;
  /** A soft line break inside one paragraph (`<w:br/>`). */
  readonly lineBreak: string;
  /** Between the cells of one table row. */
  readonly tableCell: string;
  /** Emitted before and after a table, so prose never runs into a grid. */
  readonly tableBoundary: string;
  /** Between the footnote bodies collected at the end of the document. */
  readonly footnoteBlock: string;
}

export interface KnowledgeExtractionContract {
  readonly name: string;
  readonly version: number;
  readonly separators: KnowledgeExtractionSeparators;
  /** `#`-prefixed headings, at the level the document's styles declare. */
  readonly headings: 'markdown-atx' | 'none';
  /** `- ` / `N. `, indented per level. */
  readonly listMarkers: 'markdown' | 'none';
  /** Where footnote bodies go. */
  readonly footnotes: 'inline-reference-and-trailing-bodies' | 'dropped';
  /** Comments are discussion ABOUT the document, not the document. */
  readonly comments: 'excluded' | 'included';
  /** Insertions in, deletions out: the accepted state. */
  readonly trackedChanges: 'accepted' | 'original';
  /** Content with no text emits nothing -- never a placeholder. */
  readonly unsupportedContent: 'omitted' | 'placeholder';
  /**
   * Whether a paragraph with no text survives as an empty block.
   *
   * MEASURED, not chosen: mammoth's HTML omits empty paragraphs entirely,
   * while its raw-text mode keeps them as a blank line. The two modes
   * disagree, and the pinned route is the HTML one, so a blank line the author
   * left between two paragraphs is not represented in the text.
   *
   * This is a FIDELITY loss and not a correctness one, which is why it did not
   * defeat the pin: no content is missing, the offsets stay internally
   * consistent with the text actually stored, and a blank line carries nothing
   * a citation could quote. Recorded because it is a real difference from the
   * assessment's proposal, which expected empty paragraphs to survive.
   */
  readonly emptyParagraphs: 'preserved' | 'omitted-by-parser';
}

/**
 * DOCX, contract 1.
 *
 * `block: '\n'` and not `'\n\n'`: the canonical form has lines, not
 * paragraphs, and a doubled gap inflates every offset after it.
 */
export const KNOWLEDGE_DOCX_CONTRACT_V1: KnowledgeExtractionContract = Object.freeze({
  name: 'docx',
  version: 1,
  separators: Object.freeze({
    block: '\n',
    lineBreak: '\n',
    tableCell: ' | ',
    tableBoundary: '\n',
    footnoteBlock: '\n',
  }),
  headings: 'markdown-atx',
  listMarkers: 'markdown',
  footnotes: 'inline-reference-and-trailing-bodies',
  comments: 'excluded',
  trackedChanges: 'accepted',
  unsupportedContent: 'omitted',
  emptyParagraphs: 'omitted-by-parser',
});

/**
 * TXT/MD, contract 1 -- the IDENTITY extraction.
 *
 * Stage 1's behaviour, unchanged and stated. Recorded from now on so a text
 * document and a DOCX are distinguishable after the fact by more than their
 * filename. Historical rows keep NULL: they were not recorded, and writing a
 * value into them now would be claiming metadata that was never captured.
 */
export const KNOWLEDGE_TEXT_CONTRACT_V1: KnowledgeExtractionContract = Object.freeze({
  name: 'text',
  version: 1,
  separators: Object.freeze({
    block: '\n',
    lineBreak: '\n',
    tableCell: '',
    tableBoundary: '',
    footnoteBlock: '',
  }),
  headings: 'none',
  listMarkers: 'none',
  footnotes: 'dropped',
  comments: 'excluded',
  trackedChanges: 'accepted',
  unsupportedContent: 'omitted',
  // The identity extraction changes nothing, so a blank line in a .txt file
  // is still a blank line.
  emptyParagraphs: 'preserved',
});

/**
 * The registry. Every contract this repository has shipped, so a stored hash
 * can be recomputed and named. Entries are APPENDED, never edited -- editing
 * one would change the hash of documents already extracted under it, which is
 * the exact silent breakage the hash exists to detect.
 */
export const KNOWLEDGE_EXTRACTION_CONTRACTS: readonly KnowledgeExtractionContract[] =
  Object.freeze([KNOWLEDGE_DOCX_CONTRACT_V1, KNOWLEDGE_TEXT_CONTRACT_V1]);

/**
 * The exact bytes that get hashed.
 *
 * Deterministic by construction: keys are emitted in sorted order at every
 * level, so a hash never changes because someone reordered a field. This
 * function is part of the contract too -- changing it changes every hash.
 */
export function canonicalExtractionContractJson(contract: KnowledgeExtractionContract): string {
  const sorted = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sorted);
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sorted(v)]));
  };
  return JSON.stringify(sorted(contract));
}
