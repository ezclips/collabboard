import { describe, expect, it } from 'vitest';

import { knowledgeExtractionNotices } from './knowledgeExtractionNotices';

/**
 * DISCLOSURE, not warning. Nothing here failed; these sentences exist so that
 * "indexed" never means more than it did.
 */
describe('what the extraction did not keep', () => {
  it('says nothing when it kept everything it saw', () => {
    expect(knowledgeExtractionNotices({ imageCount: 0, hasTrackedChanges: false })).toEqual([]);
  });

  it('discloses unread images in a MIXED document, not only an image-only one', () => {
    // The case that would otherwise pass silently: text came through, so the
    // upload succeeds and looks complete, while whatever was in the pictures
    // is missing from everything downstream.
    const notices = knowledgeExtractionNotices({ imageCount: 3, hasTrackedChanges: false });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('3 images');
    expect(notices[0]).toContain('Text inside images is not read.');
  });

  it('counts, because some images and sixty images are different documents', () => {
    expect(knowledgeExtractionNotices({ imageCount: 1, hasTrackedChanges: false })[0])
      .toContain('1 image.');
    expect(knowledgeExtractionNotices({ imageCount: 60, hasTrackedChanges: false })[0])
      .toContain('60 images');
  });

  it('discloses the tracked-changes POLICY, not just that there were any', () => {
    // Knowing a document had revisions does not tell anyone which version was
    // indexed. The sentence has to say which.
    const notices = knowledgeExtractionNotices({ imageCount: 0, hasTrackedChanges: true });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('tracked changes');
    expect(notices[0]).toContain('insertions are included and deletions are not');
  });

  it('says both when both apply', () => {
    const notices = knowledgeExtractionNotices({ imageCount: 2, hasTrackedChanges: true });
    expect(notices).toHaveLength(2);
  });
});
