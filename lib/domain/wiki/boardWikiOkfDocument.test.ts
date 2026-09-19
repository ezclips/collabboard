import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OKF_CONCEPT_TYPE,
  OKF_SPEC_VERSION,
  boardWikiOkfDocument,
  boardWikiOkfFilename,
  boardWikiOkfIndex,
  okfLinkedContent,
  okfResourceUri,
  type BoardWikiOkfPage,
} from './boardWikiOkfDocument';
import type { BoardWikiPageSource } from './boardWikiPageSources';

/**
 * A WIKI PAGE, LEAVING THE PRODUCT INTACT.
 *
 * OKF v0.2 is a directory of markdown files with YAML frontmatter, one concept
 * per file, and only `type` is required. What these tests protect is not the
 * shape -- that is the spec's -- but the three judgements the exporter makes
 * about OUR data, each of which could be made wrongly in a way that reads as
 * correct:
 *
 *   1. `verified` means a HUMAN accepted the page. Never a compilation.
 *   2. `stale_after` is omitted, because ours is computed and theirs is a date.
 *   3. `generated.by` is omitted, because the compiling model is not stored and
 *      a guess in a provenance field is worse than a missing field.
 */

const BOARD = 'af02972f-dfde-4545-9fc8-5fcbccb007c3';
const USER = '11111111-2222-4333-8444-555555555555';

const postSource = (padletId: string, label: string, updatedAt: string): BoardWikiPageSource => ({
  item: { type: 'padlet', padletId, label },
  version: { kind: 'post', updatedAt },
});

const pageSource = (documentId: string, pageNumber: number, label: string): BoardWikiPageSource => ({
  item: { type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber, label },
  version: { kind: 'document', contentSha256: '62010c19', updatedAt: '2026-09-11T00:00:56.396Z' },
});

const page = (over: Partial<BoardWikiOkfPage> = {}): BoardWikiOkfPage => ({
  boardId: BOARD,
  slug: 'audi-a2-stossstange-und-hupe',
  title: 'Audi A2 Stossstange und Hupe',
  content: 'The bumper can be loosened on one side [S1.1]. The horn sits behind it [S1.2].',
  sources: [
    postSource('6d7044fe-a2b7-45b9-9a4d-16c729caa500', 'Bumper notes', '2026-09-19T13:31:11.526Z'),
    pageSource('a8f356ae-0084-4427-b74a-211713aa7464', 4, 'Manual — page 4'),
  ],
  compiledAt: '2026-09-19T13:38:19.483Z',
  updatedAt: '2026-09-19T13:38:19.483Z',
  updatedBy: USER,
  ...over,
});

const frontmatter = (doc: string) => doc.slice(0, doc.indexOf('\n---', 4));

describe('the concept file', () => {
  it('declares the one field OKF requires, and says which spec version it targets', () => {
    const doc = boardWikiOkfDocument(page());
    expect(doc.startsWith('---\n')).toBe(true);
    expect(doc).toContain(`type: ${OKF_CONCEPT_TYPE}`);
    // A bundle that does not say which version it was written against is
    // undebuggable the first time the format moves -- and OKF calls itself a
    // starting point rather than a finished standard.
    expect(doc).toContain(`okf_version: "${OKF_SPEC_VERSION}"`);
  });

  it('carries the page prose as the body, under its title', () => {
    const doc = boardWikiOkfDocument(page());
    const body = doc.slice(doc.indexOf('\n---', 4) + 4);
    expect(body).toContain('# Audi A2 Stossstange und Hupe');
    expect(body).toContain('The bumper can be loosened on one side');
  });

  it('records each source with the version the page was COMPILED against', () => {
    // Not the source's current state. Recording it as content is what lets a
    // deleted source still be shown as gone.
    const doc = boardWikiOkfDocument(page());
    expect(doc).toContain('last_modified: "2026-09-19T13:31:11.526Z"');
    expect(doc).toContain('title: "Bumper notes"');
    expect(doc).toContain('collabboard://board/' + BOARD + '/post/6d7044fe-a2b7-45b9-9a4d-16c729caa500');
    expect(doc).toContain('/document/a8f356ae-0084-4427-b74a-211713aa7464/page/4');
  });

  it('is deterministic -- the same page produces the same bytes', () => {
    expect(boardWikiOkfDocument(page())).toBe(boardWikiOkfDocument(page()));
  });
});

describe('the three judgements', () => {
  it('`verified` comes from a HUMAN save, in OKF\'s actor form', () => {
    const doc = boardWikiOkfDocument(page());
    expect(doc).toContain('verified:');
    expect(doc).toContain(`- by: "human:${USER}"`);
  });

  it('a page nobody has saved carries NO verified block', () => {
    // OKF treats human verification as a trust tier. A page that exists only
    // because a compilation ran has not been verified by anyone.
    const doc = boardWikiOkfDocument(page({ updatedBy: null }));
    expect(doc).not.toContain('verified:');
  });

  it('a compilation is reported as `generated`, and never as `verified`', () => {
    const doc = boardWikiOkfDocument(page({ updatedBy: null }));
    expect(doc).toContain('generated:');
    expect(doc).toContain('at: "2026-09-19T13:38:19.483Z"');
    expect(doc).not.toContain('verified');
  });

  it('`generated.by` is absent -- the compiling model is not stored', () => {
    // A guess in a provenance field is worse than a missing field.
    expect(boardWikiOkfDocument(page())).not.toContain('by: "board-ai');
    expect(frontmatter(boardWikiOkfDocument(page()))).not.toMatch(/^\s+by: "(?!human:)/m);
  });

  it('`stale_after` is never emitted', () => {
    // OKF wants an absolute instant; ours is computed by comparing each
    // recorded source version against the live one. A guessed date would be
    // worse than the empty field AND worse than the truth we have.
    expect(boardWikiOkfDocument(page())).not.toContain('stale_after');
    expect(boardWikiOkfDocument(page({ sources: [] }))).not.toContain('stale_after');
  });

  it('a page that was never compiled reports no generation at all', () => {
    const doc = boardWikiOkfDocument(page({ compiledAt: null }));
    expect(doc).not.toContain('generated:');
  });
});

describe('markers become links', () => {
  it('each marker resolves to its source, by position', () => {
    const doc = boardWikiOkfDocument(page());
    expect(doc).toContain('[S1.1](collabboard://board/' + BOARD + '/post/6d7044fe-a2b7-45b9-9a4d-16c729caa500)');
    expect(doc).toContain('[S1.2](collabboard://board/' + BOARD + '/document/a8f356ae-0084-4427-b74a-211713aa7464/page/4)');
  });

  it('a marker with no source behind it is LEFT ALONE, not dropped', () => {
    // A page that says more than its chain can support should look that way in
    // the export too, rather than be quietly tidied into looking sound.
    const linked = okfLinkedContent('One [S1.1]. Two [S1.2]. Three [S1.3].', [
      postSource('6d7044fe-a2b7-45b9-9a4d-16c729caa500', 'A', '2026-09-19T00:00:00Z'),
    ], BOARD);
    expect(linked).toContain('[S1.1](collabboard://');
    expect(linked).toContain('Two [S1.2].');
    expect(linked).toContain('Three [S1.3].');
  });

  it('a page with no markers is passed through untouched', () => {
    expect(okfLinkedContent('Plain prose, no markers.', [], BOARD)).toBe('Plain prose, no markers.');
  });
});

describe('a page with no sources, and a source that is gone', () => {
  it('no sources means no sources block -- not an empty one', () => {
    const doc = boardWikiOkfDocument(page({ sources: [], content: 'Written by hand.' }));
    expect(doc).not.toContain('sources:');
    expect(doc).toContain('Written by hand.');
  });

  it('a GONE source still exports, because the chain is content and not a join', () => {
    // The source row may be deleted; what the page recorded about it is not.
    // An export that dropped it would erase the evidence that the page once
    // leaned on something now unavailable.
    const doc = boardWikiOkfDocument(page({
      sources: [postSource('99999999-9999-4999-8999-999999999999', 'Deleted note', '2026-01-01T00:00:00Z')],
    }));
    expect(doc).toContain('Deleted note');
    expect(doc).toContain('last_modified: "2026-01-01T00:00:00Z"');
  });
});

describe('the URI scheme', () => {
  it('addresses every citable kind', () => {
    expect(okfResourceUri(BOARD, { type: 'padlet', padletId: 'p1', label: 'x' })).toContain('/post/p1');
    expect(okfResourceUri(BOARD, { type: 'padlet-image', padletId: 'p2', label: 'x' })).toContain('/post/p2');
    expect(okfResourceUri(BOARD, { type: 'knowledge-document', knowledgeDocumentId: 'd1', label: 'x' }))
      .toContain('/document/d1');
    expect(okfResourceUri(BOARD, {
      type: 'knowledge-selection', knowledgeDocumentId: 'd1', pageNumber: 2, charStart: 10, charEnd: 20, label: 'x',
    })).toContain('/document/d1/page/2?chars=10-20');
  });

  it('is a custom scheme, not an https link that would promise a public page', () => {
    // Every one of these resources is behind the board's authorization. An
    // https URL would hand a consumer a sign-in page and call it a source.
    expect(okfResourceUri(BOARD, { type: 'padlet', padletId: 'p1', label: 'x' })).toMatch(/^collabboard:\/\//);
  });

  it('lives in ONE place, so changing it is one edit', () => {
    // It becomes the identity these pages present to the outside world, and it
    // is expensive to change once anything has consumed an export.
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/wiki/boardWikiOkfDocument.ts'), 'utf8',
    );
    expect(source.match(/collabboard:\/\//g) ?? [], 'two literals means two schemes').toHaveLength(2);
  });
});

describe('the bundle index', () => {
  it('lists every page with a bundle-relative link', () => {
    const index = boardWikiOkfIndex([
      { slug: 'one', title: 'Page one' },
      { slug: 'two', title: 'Page two' },
    ]);
    expect(index).toContain('- [Page one](/one.md)');
    expect(index).toContain('- [Page two](/two.md)');
  });

  it('says so plainly when a board has no pages', () => {
    expect(boardWikiOkfIndex([])).toContain('This board has no wiki pages.');
  });

  it('names each file by its slug', () => {
    expect(boardWikiOkfFilename('audi-a2')).toBe('audi-a2.md');
  });
});

describe('what the exporter is NOT', () => {
  it('is a one-way projection: it reads a page and returns text', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/wiki/boardWikiOkfDocument.ts'), 'utf8',
    );
    // OKF as our SCHEMA would put client-writable frontmatter where the server
    // resolves versions. Nothing here parses OKF back into a page, and nothing
    // here writes.
    expect(source).not.toMatch(/\bfetch\(|supabase|from\('board_wiki/);
    expect(source).not.toMatch(/export function .*parseOkf|okfToPage|fromOkf/);
  });
});
