import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeSourceBacklinkIndex,
  isKnowledgeBacklinkNote,
  knowledgeBacklinkCoversPage,
  knowledgeBacklinkLabel,
  knowledgeSourceBacklinkTargets,
  knowledgeSourceBacklinkTargetsOnPage,
  knowledgeSourceBacklinksForDocument,
  MAX_KNOWLEDGE_BACKLINK_LABEL_LENGTH,
  type KnowledgeBacklinkPost,
} from './knowledgeSourceBacklinks';
import type { SourceReference } from './knowledgePersistence';

const DOC_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const DOC_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const N1 = '11111111-0000-4000-8000-000000000001';
const N2 = '22222222-0000-4000-8000-000000000002';
const DRAWING = 'dddddddd-0000-4000-8000-000000000003';

let sequence = 0;
function reference(
  targetPadletId: string,
  sourceDocumentId: string,
  pageStart: number,
  pageEnd = pageStart,
): SourceReference {
  sequence += 1;
  return {
    id: `ref-${sequence}`,
    targetPadletId,
    sourceDocumentId,
    pageStart,
    pageEnd,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt: `2026-01-01T00:00:0${sequence}.000Z`,
  } as unknown as SourceReference;
}

function post(id: string, type: string, title = '', content = ''): KnowledgeBacklinkPost {
  return { id, type, title, content };
}

const NOTE_1 = post(N1, 'text', 'First note');
const NOTE_2 = post(N2, 'note', 'Second note');
const DRAWING_POST = post(DRAWING, 'drawing', 'A drawing');

const forDocument = (
  references: readonly SourceReference[],
  posts: readonly KnowledgeBacklinkPost[],
  documentId: string,
) => knowledgeSourceBacklinksForDocument(buildKnowledgeSourceBacklinkIndex(references, posts), documentId);

describe('note target filtering', () => {
  it('treats exactly the canonical note/text padlet types as Notes', () => {
    expect(isKnowledgeBacklinkNote(post(N1, 'text'))).toBe(true);
    expect(isKnowledgeBacklinkNote(post(N1, 'note'))).toBe(true);
    for (const other of ['drawing', 'image', 'link', 'file', 'table', 'card', 'todo', 'container', 'ai-component']) {
      expect(isKnowledgeBacklinkNote(post(N1, other)), other).toBe(false);
    }
  });

  it('H: a non-Note target holding a reference is never counted', () => {
    const backlinks = forDocument(
      [reference(DRAWING, DOC_A, 2), reference(N1, DOC_A, 2)],
      [DRAWING_POST, NOTE_1],
      DOC_A,
    );

    expect(backlinks.map((b) => b.targetPadletId)).toEqual([N1]);
  });

  it('a document cited only by non-Note targets yields nothing at all', () => {
    expect(forDocument([reference(DRAWING, DOC_A, 1)], [DRAWING_POST], DOC_A)).toEqual([]);
  });
});

describe('document-level backlinks', () => {
  it('A: a document with no references has no backlinks', () => {
    expect(forDocument([], [NOTE_1], DOC_A)).toEqual([]);
    expect(forDocument([reference(N1, DOC_B, 1)], [NOTE_1], DOC_A)).toEqual([]);
  });

  it('B: one reference yields exactly one target', () => {
    const targets = knowledgeSourceBacklinkTargets(forDocument([reference(N1, DOC_A, 2)], [NOTE_1], DOC_A));

    expect(targets).toHaveLength(1);
    expect(targets[0].targetPadletId).toBe(N1);
    expect(targets[0].label).toBe('First note');
  });

  it('C: two Notes citing one document yield two unique targets', () => {
    const targets = knowledgeSourceBacklinkTargets(
      forDocument([reference(N1, DOC_A, 1), reference(N2, DOC_A, 4)], [NOTE_1, NOTE_2], DOC_A),
    );

    expect(targets.map((t) => t.targetPadletId)).toEqual([N1, N2]);
  });

  it('D: duplicate rows for one Note collapse to a single target', () => {
    const backlinks = forDocument(
      [reference(N1, DOC_A, 2), reference(N1, DOC_A, 2), reference(N1, DOC_A, 7)],
      [NOTE_1],
      DOC_A,
    );

    // All three citations are kept as rows -- only the display collapses.
    expect(backlinks).toHaveLength(3);
    expect(knowledgeSourceBacklinkTargets(backlinks).map((t) => t.targetPadletId)).toEqual([N1]);
  });

  it('F: identity is the document id, so a shared filename never merges two documents', () => {
    // Both documents would render the same filename in the reader; only the id
    // decides which Notes belong to which.
    const index = buildKnowledgeSourceBacklinkIndex([reference(N1, DOC_A, 2)], [NOTE_1]);

    expect(knowledgeSourceBacklinksForDocument(index, DOC_A).map((b) => b.targetPadletId)).toEqual([N1]);
    expect(knowledgeSourceBacklinksForDocument(index, DOC_B)).toEqual([]);
  });

  it('G: two Notes with identical text stay distinct, resolved by id', () => {
    const twin1 = post(N1, 'text', 'Same visible title', '<p>Same body</p>');
    const twin2 = post(N2, 'text', 'Same visible title', '<p>Same body</p>');
    const targets = knowledgeSourceBacklinkTargets(forDocument([reference(N1, DOC_A, 1)], [twin1, twin2], DOC_A));

    expect(targets).toHaveLength(1);
    expect(targets[0].targetPadletId).toBe(N1);
    // The label alone cannot tell them apart -- which is exactly why the target
    // id, not the text, is the identity.
    expect(targets[0].label).toBe('Same visible title');
  });

  it('I: a reference to a target absent from the board is omitted safely', () => {
    expect(() => forDocument([reference('missing-id', DOC_A, 1)], [NOTE_1], DOC_A)).not.toThrow();
    expect(forDocument([reference('missing-id', DOC_A, 1), reference(N1, DOC_A, 1)], [NOTE_1], DOC_A))
      .toHaveLength(1);
  });

  it('an empty board yields an empty index rather than throwing', () => {
    expect(forDocument([reference(N1, DOC_A, 1)], [], DOC_A)).toEqual([]);
  });

  it('a missing or empty document id resolves to nothing', () => {
    const index = buildKnowledgeSourceBacklinkIndex([reference(N1, DOC_A, 1)], [NOTE_1]);

    expect(knowledgeSourceBacklinksForDocument(index, null)).toEqual([]);
    expect(knowledgeSourceBacklinksForDocument(index, undefined)).toEqual([]);
    expect(knowledgeSourceBacklinksForDocument(index, '')).toEqual([]);
  });
});

describe('page-level membership', () => {
  it('E: an inclusive range covers its first, middle and last page only', () => {
    const range = { pageStart: 2, pageEnd: 4 };

    expect(knowledgeBacklinkCoversPage(range, 1)).toBe(false);
    expect(knowledgeBacklinkCoversPage(range, 2)).toBe(true);
    expect(knowledgeBacklinkCoversPage(range, 3)).toBe(true);
    expect(knowledgeBacklinkCoversPage(range, 4)).toBe(true);
    expect(knowledgeBacklinkCoversPage(range, 5)).toBe(false);
  });

  it('a single-page citation matches only that page', () => {
    const single = { pageStart: 2, pageEnd: 2 };

    expect(knowledgeBacklinkCoversPage(single, 2)).toBe(true);
    expect(knowledgeBacklinkCoversPage(single, 5)).toBe(false);
  });

  it('E: a pp.2-4 citation appears under pages 2, 3 and 4 and not page 5', () => {
    const backlinks = forDocument([reference(N1, DOC_A, 2, 4)], [NOTE_1], DOC_A);

    for (const page of [2, 3, 4]) {
      expect(knowledgeSourceBacklinkTargetsOnPage(backlinks, page).map((t) => t.targetPadletId), `page ${page}`)
        .toEqual([N1]);
    }
    for (const page of [1, 5]) {
      expect(knowledgeSourceBacklinkTargetsOnPage(backlinks, page), `page ${page}`).toEqual([]);
    }
  });

  it('D: two citations of one Note on the same page show that Note once', () => {
    const backlinks = forDocument([reference(N1, DOC_A, 2), reference(N1, DOC_A, 2)], [NOTE_1], DOC_A);

    expect(knowledgeSourceBacklinkTargetsOnPage(backlinks, 2).map((t) => t.targetPadletId)).toEqual([N1]);
  });

  it('page filtering keeps distinct Notes on a shared page', () => {
    const backlinks = forDocument(
      [reference(N1, DOC_A, 2), reference(N2, DOC_A, 2, 3)],
      [NOTE_1, NOTE_2],
      DOC_A,
    );

    expect(knowledgeSourceBacklinkTargetsOnPage(backlinks, 2).map((t) => t.targetPadletId)).toEqual([N1, N2]);
    expect(knowledgeSourceBacklinkTargetsOnPage(backlinks, 3).map((t) => t.targetPadletId)).toEqual([N2]);
  });
});

describe('J: label derivation', () => {
  it('prefers a non-empty trimmed title', () => {
    expect(knowledgeBacklinkLabel(post(N1, 'text', '  Spaced title  ', '<p>body</p>'))).toBe('Spaced title');
  });

  it('falls back to plain text derived from HTML content', () => {
    expect(knowledgeBacklinkLabel(post(N1, 'text', '', '<p>Hello <strong>world</strong></p>')))
      .toBe('Hello world');
  });

  it('never emits raw tags or markup from content', () => {
    const label = knowledgeBacklinkLabel(
      post(N1, 'text', '', '<p>safe</p><script>alert(1)</script><img src=x onerror=y>'),
    );

    expect(label).not.toContain('<script');
    expect(label).not.toContain('<img');
    expect(label).not.toContain('onerror');
    expect(label).toContain('safe');
  });

  it('decodes entities and normalizes whitespace', () => {
    expect(knowledgeBacklinkLabel(post(N1, 'text', '', '<p>a&nbsp;&nbsp;b</p>\n\n<p>c</p>'))).toBe('a b c');
    expect(knowledgeBacklinkLabel(post(N1, 'text', '', '<p>Tom &amp; Jerry</p>'))).toBe('Tom & Jerry');
  });

  it('truncates a long label with an ellipsis, staying within the cap', () => {
    const label = knowledgeBacklinkLabel(post(N1, 'text', 'x'.repeat(400)));

    expect(label.length).toBeLessThanOrEqual(MAX_KNOWLEDGE_BACKLINK_LABEL_LENGTH);
    expect(label.endsWith('…')).toBe(true);
  });

  it('falls back to the generic word when there is no title and no text', () => {
    expect(knowledgeBacklinkLabel(post(N1, 'text', '', '<p></p>'))).toBe('Note');
    expect(knowledgeBacklinkLabel(post(N1, 'text'))).toBe('Note');
    expect(knowledgeBacklinkLabel({ id: N1, type: 'text', title: null, content: null })).toBe('Note');
  });

  it('never uses the padlet id as a label', () => {
    expect(knowledgeBacklinkLabel(post(N1, 'text'))).not.toContain(N1);
  });
});

describe('purity', () => {
  it('does not mutate the inputs it is given', () => {
    const references = [reference(N1, DOC_A, 2)];
    const posts = [NOTE_1];
    const snapshot = JSON.stringify({ references, posts });

    buildKnowledgeSourceBacklinkIndex(references, posts);

    expect(JSON.stringify({ references, posts })).toBe(snapshot);
  });

  it('is deterministic for the same input', () => {
    const references = [reference(N1, DOC_A, 2), reference(N2, DOC_A, 3)];
    const posts = [NOTE_1, NOTE_2];

    expect(JSON.stringify(Array.from(buildKnowledgeSourceBacklinkIndex(references, posts))))
      .toBe(JSON.stringify(Array.from(buildKnowledgeSourceBacklinkIndex(references, posts))));
  });
});
