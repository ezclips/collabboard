// @vitest-environment jsdom
/**
 * P6J-F6-B2H -- the freeform render-site gap that escaped B2 review.
 *
 * B2 mounted KnowledgeSourceMarker inside PostCardContent's TEXT/DEFAULT
 * branch and was reviewed by checking that component's internal branches. But
 * the freeform layout hand-writes its own generic/Note markup and only routes
 * `drawing` through PostCardContent, so freeform Notes never reached the
 * marker. Runtime proved it: the editor showed "Source · p. 2" while the card
 * showed nothing.
 *
 * This file is MIXED by design:
 *  - STRUCTURAL for the freeform call site. FreeformPadletCards.tsx is ~300 KB
 *    and mounting it would require a large fake canvas environment unrelated to
 *    this defect, which would prove less than it appears to.
 *  - BEHAVIORAL for the marker itself, which is cheap and real now that the
 *    shared component is exported: it is rendered against the actual provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }) }));

import { KnowledgeSourceMarker } from './PostCardContent';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

// Line comments only. The naive block-comment regex has previously deleted
// ~130 KB of live TSX in this repo and produced vacuous assertions.
const sourceOf = (relativePath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8').replace(/^\s*\/\/.*$/gm, '');

const freeform = sourceOf('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const postCardContent = sourceOf('components/collabboard/PostCardContent.tsx');

/** Bounded slice starting at an anchor, so proofs cannot drift across the file. */
function sliceFrom(text: string, anchor: string, length: number): string {
  const index = text.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return text.slice(index, index + anchor.length + length);
}

const GENERIC_NOTE_BRANCH_ANCHOR =
  "{(!['link', 'todo', 'table', 'container', 'drawing', 'ai-component'].includes(padlet.type)";
// KNI-R1-F/G/I: the one shared invocation both call sites must use verbatim.
const CALL_SITE = '<KnowledgeSourceMarker padletId={padlet.id} noteContent={padlet.content} />';

// ---------------------------------------------------------------------------
// A-F: the freeform call site
// ---------------------------------------------------------------------------
describe('P6J-F6-B2H freeform marker call site', () => {
  it('A: FreeformPadletCards reuses the SHARED marker from PostCardContent', () => {
    expect(freeform).toContain(
      "import PostCardContent, { KnowledgeSourceMarker } from '@/components/collabboard/PostCardContent';",
    );
    expect(postCardContent).toContain(
      'export function KnowledgeSourceMarker({ padletId, noteContent }: { padletId: string; noteContent: string }) {',
    );
  });

  it('B: the handwritten generic/Note branch mounts the marker with padlet.id', () => {
    // Bounded to this one branch: the marker sits ~4.85 KB in (the branch
    // carries a long comment-mark click handler) and the fragment closes right
    // after it, so this window covers the branch and little else.
    const branch = sliceFrom(freeform, GENERIC_NOTE_BRANCH_ANCHOR, 5600);

    expect(branch).toContain(CALL_SITE);
    // It belongs to the hand-written body, not some unrelated later branch:
    // the sanitized note markup must appear before it inside the same slice.
    const body = branch.indexOf('dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(padlet.content');
    const marker = branch.indexOf('<KnowledgeSourceMarker');
    expect(body).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(body);
  });

  it('C: the marker sits inside the branch that bypasses PostCardContent, not around every card', () => {
    // Exactly one direct marker call in the whole freeform renderer.
    expect((freeform.match(/<KnowledgeSourceMarker/g) ?? []).length).toBe(1);

    // That call must be inside the generic/Note conditional, which is closed by
    // the fragment terminator immediately after it.
    // Bounded to this one branch: the marker sits ~4.85 KB in (the branch
    // carries a long comment-mark click handler) and the fragment closes right
    // after it, so this window covers the branch and little else.
    const branch = sliceFrom(freeform, GENERIC_NOTE_BRANCH_ANCHOR, 5600);
    const marker = branch.indexOf(CALL_SITE);
    const closes = branch.indexOf('</>', marker);
    expect(closes).toBeGreaterThan(marker);
    expect(branch.slice(marker, closes)).not.toContain('padlet.type ===');
  });

  it('D: the Drawing/PostCardContent path gains no second, direct marker', () => {
    // The branch condition itself still excludes every PostCardContent-routed
    // type, so those cards keep getting exactly one marker (from inside
    // PostCardContent) and never two.
    const condition = sliceFrom(freeform, GENERIC_NOTE_BRANCH_ANCHOR, 120);
    for (const routed of ['drawing', 'container', 'link', 'todo', 'table', 'ai-component']) {
      expect(condition).toContain(`'${routed}'`);
    }

    // Drawing still renders through PostCardContent, with no marker of its own.
    const drawingBranch = sliceFrom(freeform, "{padlet.type === 'drawing' && (", 320);
    expect(drawingBranch).toContain('<PostCardContent');
    expect(drawingBranch).not.toContain('KnowledgeSourceMarker');
  });

  it('E: no source-reference fetch, query or state was added to the freeform renderer', () => {
    for (const forbidden of [
      'source_references',
      'listReferencesByTargetPadletId',
      'listReferencesByTargetPadletIds',
      'knowledge/references',
      'SupabaseKnowledgeSourceReferenceReader',
      'buildKnowledgeSourceReferenceIndex',
      'KnowledgeSourceReferenceProvider',
    ]) {
      expect(freeform).not.toContain(forbidden);
    }
  });

  it('F: no duplicate marker formatter exists in the freeform renderer', () => {
    // Label formatting stays in the one domain helper; freeform must not grow
    // its own "Source · p. N" / "N sources" implementation.
    for (const forbidden of ['knowledgeSourceCardLabel', 'Source · p.', 'sources`', "sources'"]) {
      expect(freeform).not.toContain(forbidden);
    }
    expect(freeform).not.toContain('data-knowledge-source-marker');
    expect(postCardContent).toContain('data-knowledge-source-marker="true"');
  });

  it('F2: the marker stays display-only at the new call site', () => {
    const branch = sliceFrom(freeform, CALL_SITE, 60);
    for (const forbidden of ['onClick', 'onPointerDown', 'onMouseDown', 'role=', 'tabIndex']) {
      expect(branch).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Behavioral: the shared marker against the real provider
// ---------------------------------------------------------------------------
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const PADLET = 'f1a5c1d0-0000-4000-8000-000000000001';

function reference(id: string, pageStart: number, pageEnd: number, createdAt: string): SourceReference {
  return {
    id,
    targetPadletId: PADLET,
    sourceDocumentId: 'doc-1',
    pageStart,
    pageEnd,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt,
  } as unknown as SourceReference;
}

function mountMarker(references: readonly SourceReference[], padletId = PADLET, noteContent = '') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeSourceReferenceProvider index={buildKnowledgeSourceReferenceIndex(references)}>
        <KnowledgeSourceMarker padletId={padletId} noteContent={noteContent} />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  return host!;
}

describe('P6J-F6-B2H shared marker rendering (freeform contract)', () => {
  it('zero references render no marker at all', () => {
    const container = mountMarker([]);
    expect(container.querySelector('[data-knowledge-source-marker]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('one reference on page 2 renders "Source · p. 2" -- the exact runtime fixture', () => {
    const container = mountMarker([reference('ref-1', 2, 2, '2026-01-01T00:00:00.000Z')]);
    const marker = container.querySelector('[data-knowledge-source-marker]');
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toBe('Source · p. 2');
    expect(marker!.getAttribute('title')).toBe('Source · p. 2');
  });

  it('two references render "2 sources"', () => {
    const container = mountMarker([
      reference('ref-1', 2, 2, '2026-01-01T00:00:00.000Z'),
      reference('ref-2', 5, 7, '2026-01-02T00:00:00.000Z'),
    ]);
    expect(container.querySelector('[data-knowledge-source-marker]')!.textContent).toBe('2 sources');
  });

  it('a page range keeps B2 range formatting unchanged', () => {
    const container = mountMarker([reference('ref-1', 3, 5, '2026-01-01T00:00:00.000Z')]);
    expect(container.querySelector('[data-knowledge-source-marker]')!.textContent).toBe('Source · pp. 3–5');
  });

  it('an unrelated padlet id renders nothing (ordinary freeform Note)', () => {
    const container = mountMarker(
      [reference('ref-1', 2, 2, '2026-01-01T00:00:00.000Z')],
      'f1a5c1d0-0000-4000-8000-00000000ffff',
    );
    expect(container.querySelector('[data-knowledge-source-marker]')).toBeNull();
  });

  it('the marker adds no interactive element', () => {
    const container = mountMarker([reference('ref-1', 2, 2, '2026-01-01T00:00:00.000Z')]);
    expect(container.querySelector('button, a, [role="button"], [tabindex]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P6J-F8-B2 -- the read-only source excerpt, rendered by the SAME component
// ---------------------------------------------------------------------------

/** An exact-span citation: offsets present, quote server-derived from the page. */
function exactSpanReference(quoteText: string, id = 'ref-1'): SourceReference {
  return {
    ...reference(id, 2, 2, '2026-01-01T00:00:00.000Z'),
    quoteText,
    quoteHash: 'hash',
    charStart: 1329,
    charEnd: 1329 + quoteText.length,
  } as unknown as SourceReference;
}

const EXCERPT = '[data-knowledge-source-excerpt]';
const MARKER = '[data-knowledge-source-marker]';

describe('P6J-F8-B2 card source excerpt', () => {
  it('an exact-span citation shows its canonical text on the card', () => {
    const container = mountMarker([exactSpanReference('Opening are prime examples')]);
    const excerpt = container.querySelector(EXCERPT);

    expect(excerpt).not.toBeNull();
    expect(excerpt!.textContent).toBe('Opening are prime examples');
  });

  it('the excerpt is a SIBLING of the marker, and the marker still reads its label alone', () => {
    const container = mountMarker([exactSpanReference('Opening are prime examples')]);
    const excerpt = container.querySelector(EXCERPT)!;
    const marker = container.querySelector(MARKER)!;

    // Structural, not textual: nesting would silently fold provenance text into
    // the label element every other surface reads.
    expect(marker.contains(excerpt)).toBe(false);
    expect(excerpt.contains(marker)).toBe(false);
    expect(excerpt.parentElement).toBe(marker.parentElement);
    // The B2 contract, unchanged: the marker's own text is exactly its label.
    expect(marker.textContent).toBe('Source · p. 2');
  });

  it('a page-only citation shows NO excerpt but keeps its Source marker', () => {
    // Page-only rows carry a client-supplied whole page as their quote. The
    // card must fail closed on the text while provenance stays visible.
    const pageOnly = {
      ...reference('ref-1', 1, 1, '2026-01-01T00:00:00.000Z'),
      quoteText: 'A'.repeat(1591),
    } as unknown as SourceReference;
    const container = mountMarker([pageOnly]);

    expect(container.querySelector(EXCERPT)).toBeNull();
    expect(container.querySelector(MARKER)!.textContent).toBe('Source · p. 1');
    expect(container.textContent).not.toContain('AAAA');
  });

  it('HTML-shaped source text is rendered as literal characters, never parsed', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const container = mountMarker([exactSpanReference(hostile)]);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector(EXCERPT)!.textContent).toBe(hostile);
    // The angle brackets survived as text rather than becoming an element.
    expect(container.innerHTML).toContain('&lt;img');
  });

  it('a Note with no citation renders neither excerpt nor marker', () => {
    const container = mountMarker([]);

    expect(container.querySelector(EXCERPT)).toBeNull();
    expect(container.querySelector(MARKER)).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('a citation belonging to another padlet produces nothing on this card', () => {
    const container = mountMarker(
      [exactSpanReference('Opening are prime examples')],
      'f1a5c1d0-0000-4000-8000-00000000ffff',
    );

    expect(container.querySelector(EXCERPT)).toBeNull();
    expect(container.querySelector(MARKER)).toBeNull();
  });

  it('two citations show the collapsed label and no excerpt', () => {
    const container = mountMarker([
      exactSpanReference('First quote', 'ref-1'),
      exactSpanReference('Second quote', 'ref-2'),
    ]);

    expect(container.querySelector(EXCERPT)).toBeNull();
    expect(container.querySelector(MARKER)!.textContent).toBe('2 sources');
  });

  it('the excerpt adds no interactive element', () => {
    const container = mountMarker([exactSpanReference('Opening are prime examples')]);
    expect(container.querySelector('button, a, [role="button"], [tabindex]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// KNI-R1-F/G/I -- noteContent decides excerpt eligibility, not the call site
// ---------------------------------------------------------------------------
describe('KNI-R1-F/G/I noteContent display contract', () => {
  it('A/D: a genuinely authored body suppresses the excerpt but keeps the marker', () => {
    const container = mountMarker(
      [exactSpanReference('Opening are prime examples')], PADLET, '<p>Opening are prime examples</p>',
    );
    expect(container.querySelector(EXCERPT)).toBeNull();
    expect(container.querySelector(MARKER)!.textContent).toBe('Source · p. 2');
  });

  it.each([
    ['empty string', ''], ['whitespace only', '   '],
    ['empty paragraph', '<p></p>'], ['paragraph with only a line break', '<p><br></p>'],
  ])('C: structural-empty body (%s) still allows the legacy excerpt fallback', (_label, noteContent) => {
    const container = mountMarker([exactSpanReference('Opening are prime examples')], PADLET, noteContent);
    expect(container.querySelector(EXCERPT)!.textContent).toBe('Opening are prime examples');
    expect(container.querySelector(MARKER)).not.toBeNull();
  });

  it('H: PostCardContent and the Freeform handwritten branch call the identical marker invocation', () => {
    expect(postCardContent).toContain(CALL_SITE);
    expect(freeform).toContain(CALL_SITE);
  });
});

// ---------------------------------------------------------------------------
// P6J-F9-C2 -- the region crop, mounted by the SAME shared marker component
// ---------------------------------------------------------------------------

const CROP = '[data-knowledge-source-region-crop]';

function pageRegionReference(id: string): SourceReference {
  return {
    ...reference(id, 3, 3, '2026-01-01T00:00:00.000Z'),
    region: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 },
  } as unknown as SourceReference;
}

describe('P6J-F9-C2 card region crop (shared marker mount)', () => {
  it('P1: one valid PAGE_REGION reference renders the crop, and the marker still renders alongside it', () => {
    const container = mountMarker([pageRegionReference('ref-1')]);
    expect(container.querySelector(CROP)).not.toBeNull();
    expect(container.querySelector(MARKER)).not.toBeNull();
  });

  it('P2: the crop appears before the marker in document order', () => {
    const container = mountMarker([pageRegionReference('ref-1')]);
    const crop = container.querySelector(CROP)!;
    const marker = container.querySelector(MARKER)!;
    expect(crop.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('P3: PAGE_ONLY renders no crop but keeps the marker', () => {
    const pageOnly = {
      ...reference('ref-1', 1, 1, '2026-01-01T00:00:00.000Z'),
      quoteText: 'A'.repeat(1591),
    } as unknown as SourceReference;
    const container = mountMarker([pageOnly]);
    expect(container.querySelector(CROP)).toBeNull();
    expect(container.querySelector(MARKER)).not.toBeNull();
  });

  it('P4: EXACT_SPAN renders no crop, and the existing excerpt still renders', () => {
    const container = mountMarker([exactSpanReference('Opening are prime examples')]);
    expect(container.querySelector(CROP)).toBeNull();
    expect(container.querySelector(EXCERPT)).not.toBeNull();
  });

  it('P5: two references -- even when one alone would be a valid PAGE_REGION -- render no crop', () => {
    const container = mountMarker([
      pageRegionReference('ref-1'),
      reference('ref-2', 5, 5, '2026-01-02T00:00:00.000Z'),
    ]);
    expect(container.querySelector(CROP)).toBeNull();
    expect(container.querySelector(MARKER)!.textContent).toBe('2 sources');
  });

  it('P9: exactly one crop element is mounted, never a duplicate', () => {
    const container = mountMarker([pageRegionReference('ref-1')]);
    expect(container.querySelectorAll(CROP).length).toBe(1);
  });

  it('P10/P11: the crop rides the identical shared call site every layout already uses -- Drawing gains no marker or crop of its own', () => {
    // The same call site assertion A/B/D above already pin for the marker:
    // PostCardContent's TEXT/DEFAULT branch and FreeformPadletCards' generic/
    // Note branch both call this exact component, and the Drawing branch
    // calls no marker at all -- so crop rides along by construction, with no
    // separate per-layout implementation.
    expect(postCardContent).toContain(CALL_SITE);
    expect(freeform).toContain(CALL_SITE);
    expect(mountMarker([pageRegionReference('ref-1')]).querySelector(CROP)).not.toBeNull();
    // No separate/duplicate mount: freeform never references the crop
    // component directly, only through the shared marker above.
    expect(freeform).not.toContain('KnowledgeSourceRegionCrop');
  });
});
