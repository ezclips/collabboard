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
import { afterEach, describe, expect, it } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

// ---------------------------------------------------------------------------
// A-F: the freeform call site
// ---------------------------------------------------------------------------
describe('P6J-F6-B2H freeform marker call site', () => {
  it('A: FreeformPadletCards reuses the SHARED marker from PostCardContent', () => {
    expect(freeform).toContain(
      "import PostCardContent, { KnowledgeSourceMarker } from '@/components/collabboard/PostCardContent';",
    );
    expect(postCardContent).toContain('export function KnowledgeSourceMarker({ padletId }: { padletId: string }) {');
  });

  it('B: the handwritten generic/Note branch mounts the marker with padlet.id', () => {
    // Bounded to this one branch: the marker sits ~4.85 KB in (the branch
    // carries a long comment-mark click handler) and the fragment closes right
    // after it, so this window covers the branch and little else.
    const branch = sliceFrom(freeform, GENERIC_NOTE_BRANCH_ANCHOR, 5600);

    expect(branch).toContain('<KnowledgeSourceMarker padletId={padlet.id} />');
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
    const marker = branch.indexOf('<KnowledgeSourceMarker padletId={padlet.id} />');
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
    const branch = sliceFrom(freeform, '<KnowledgeSourceMarker padletId={padlet.id} />', 60);
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

function mountMarker(references: readonly SourceReference[], padletId = PADLET) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeSourceReferenceProvider index={buildKnowledgeSourceReferenceIndex(references)}>
        <KnowledgeSourceMarker padletId={padletId} />
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
