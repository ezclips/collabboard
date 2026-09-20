/**
 * WHAT THE EXTRACTION DID NOT KEEP, said to the person who uploaded it.
 *
 * A source is indexed once and cited many times afterwards, so anything the
 * extraction dropped or decided is invisible from then on: the search returns
 * what it has, the answer reads as complete, and nothing anywhere says that
 * the pictures were not read or that the deletions were taken out. The moment
 * to say so is the upload, because it is the only moment the person is still
 * looking at the document and can still act.
 *
 * These are NOTICES, not warnings. Nothing here failed. They exist so that
 * "indexed" never means more than it did.
 */

export interface KnowledgeExtractionFacts {
  readonly imageCount: number;
  readonly hasTrackedChanges: boolean;
}

/**
 * One sentence per thing worth knowing, or an empty list when the extraction
 * kept everything it saw.
 */
export function knowledgeExtractionNotices(
  facts: KnowledgeExtractionFacts,
): readonly string[] {
  const notices: string[] = [];

  if (facts.imageCount > 0) {
    // Counted, because "some images" and "sixty images" are different
    // documents. The second is one whose indexed text may be a small part of
    // what the author put in it.
    notices.push(
      facts.imageCount === 1
        ? 'This document contains 1 image. Text inside images is not read.'
        : `This document contains ${facts.imageCount} images. Text inside images is not read.`,
    );
  }

  if (facts.hasTrackedChanges) {
    // The policy, not just the fact. A reader who knows the document had
    // revisions still cannot tell which version was indexed unless told.
    notices.push(
      'This document has tracked changes. It was read with the changes accepted: '
      + 'insertions are included and deletions are not.',
    );
  }

  return notices;
}
