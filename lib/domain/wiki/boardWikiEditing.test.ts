import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  applyProposalToDraft,
  boardWikiDraftFromPage,
  boardWikiDraftIsDirty,
  boardWikiDraftWithContent,
  boardWikiDraftWithTitle,
  boardWikiProposalWarnings,
  boardWikiSaveRequestFromDraft,
  boardWikiSlugFromTitle,
  boardWikiTitleIsUsable,
  type BoardWikiPage,
  type BoardWikiProposal,
} from './boardWikiEditing';
import type { BoardWikiPageSource } from './boardWikiPageSources';

/**
 * UNIT 2's acceptance criterion, stated where it is decidable.
 *
 * "There is no code path from a compile result to stored content that does not
 * pass through an explicit user action" is a claim about what functions exist,
 * so the last describe block reads the module's own source and checks that the
 * function which would break it is absent. A behavioural test cannot prove the
 * absence of a path; a source scan can.
 */

const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const docSource = (sha = 'sha-1'): BoardWikiPageSource => ({
  item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6, label: 'doc — page 6' },
  version: { kind: 'document', contentSha256: sha, updatedAt: '2026-09-01T00:00:00Z' },
});

const postSource = (): BoardWikiPageSource => ({
  item: { type: 'padlet', padletId: POST, label: 'a board post' },
  version: { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' },
});

const page = (overrides: Partial<BoardWikiPage> = {}): BoardWikiPage => ({
  id: 'page-1',
  slug: 'horn-replacement',
  title: 'Horn replacement',
  content: 'Authored by a person.',
  sources: [docSource()],
  compiledAt: null,
  updatedAt: '2026-09-19T10:00:00Z',
  ...overrides,
});

const proposal = (overrides: Partial<BoardWikiProposal> = {}): BoardWikiProposal => ({
  id: 'proposal-1',
  content: 'Compiled text. S1.2',
  sources: [postSource()],
  basedOnContent: 'Authored by a person.',
  createdAt: '2026-09-19T11:00:00Z',
  ...overrides,
});

describe('dirtiness is derived, not tracked', () => {
  it('a fresh draft of a page is clean', () => {
    expect(boardWikiDraftIsDirty(boardWikiDraftFromPage(page()))).toBe(false);
  });

  it('typing and undoing leaves the draft clean again', () => {
    // A tracked flag would warn about work that no longer exists, and a user
    // who is warned about nothing twice stops reading the warning.
    const draft = boardWikiDraftFromPage(page());
    const typed = boardWikiDraftWithContent(draft, 'Authored by a person. And more.');
    expect(boardWikiDraftIsDirty(typed)).toBe(true);
    expect(boardWikiDraftIsDirty(boardWikiDraftWithContent(typed, 'Authored by a person.'))).toBe(false);
  });

  it('a changed title counts, not only changed prose', () => {
    expect(boardWikiDraftIsDirty(boardWikiDraftWithTitle(boardWikiDraftFromPage(page()), 'Horn swap'))).toBe(true);
  });

  it('a changed sources chain counts even when the prose is identical', () => {
    // Applying a proposal whose text happens to match still moves the chain,
    // and an unsaved chain is unsaved work.
    const draft = boardWikiDraftFromPage(page());
    const applied = applyProposalToDraft(draft, proposal({ content: draft.content }));
    expect(applied.content).toBe(draft.content);
    expect(boardWikiDraftIsDirty(applied)).toBe(true);
  });
});

describe('THE TITLE CHANGES ONLY WHEN A PERSON TYPES ONE', () => {
  it('a proposal has no title to offer -- structurally', () => {
    // Unit 0 finding 4: the title is the overclaim surface. Every sentence of
    // the compiled Audi page traced to a passage; the TITLE promised a removal
    // procedure the page did not contain, and the page that correctly declined
    // to answer still emitted a confident heading. A prompt instruction is a
    // request; a type with no field is a fact.
    expect(Object.keys(proposal())).not.toContain('title');
  });

  it('applying a proposal leaves the title exactly as it was', () => {
    const draft = boardWikiDraftWithTitle(boardWikiDraftFromPage(page()), 'A title a person chose');
    expect(applyProposalToDraft(draft, proposal()).title).toBe('A title a person chose');
  });

  it('a blank or whitespace title is not usable, matching the schema check', () => {
    expect(boardWikiTitleIsUsable('Horn replacement')).toBe(true);
    for (const bad of ['', '   ', '\n\t']) expect(boardWikiTitleIsUsable(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe('the slug, derived from a title someone typed', () => {
  it('matches the schema CHECK for an ordinary title', () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const title of ['Horn replacement', '  Bumper  removal  ', 'A2 8Z 2003']) {
      expect(boardWikiSlugFromTitle(title), title).toMatch(pattern);
    }
  });

  it('transliterates German rather than dropping it', () => {
    // The reference corpus is German. "Stoßstange" becoming "sto-stange" is a
    // broken address that still passes every check.
    // Three s: "Stoß" expands to "stoss" and "stange" follows it. Correct, and
    // it looks like a typo, so it is spelled out here rather than "fixed".
    expect(boardWikiSlugFromTitle('Stoßstange')).toBe('stossstange');
    expect(boardWikiSlugFromTitle('Öffnung des Horns')).toBe('offnung-des-horns');
    expect(boardWikiSlugFromTitle('Lasche für Aluprofil')).toBe('lasche-fur-aluprofil');
  });

  it('returns null when nothing addressable survives, rather than inventing one', () => {
    // "page-1" would be an address that says nothing about the page.
    for (const bad of ['', '   ', '—', '???']) expect(boardWikiSlugFromTitle(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('applying a proposal produces a DRAFT, and storage is a separate act', () => {
  it('moves content and the sources chain together', () => {
    // A chain describing different text than the page shows is worse than no
    // chain: it is provenance for something the reader is not reading.
    const applied = applyProposalToDraft(boardWikiDraftFromPage(page()), proposal());
    expect(applied.content).toBe('Compiled text. S1.2');
    expect(applied.sources).toEqual([postSource()]);
  });

  it('leaves the page unsaved, so discarding costs nothing', () => {
    const applied = applyProposalToDraft(boardWikiDraftFromPage(page()), proposal());
    expect(boardWikiDraftIsDirty(applied)).toBe(true);
    // And the base snapshot still holds the stored page, so a discard is a
    // return to it rather than a re-fetch that might have moved.
    expect(applied.baseContent).toBe('Authored by a person.');
  });

  it('carries the base token forward, so applying does not silently claim a newer base', () => {
    // Applying must not make a stale save look fresh: the concurrency token is
    // the one the draft started from, not the proposal's compile time.
    const applied = applyProposalToDraft(boardWikiDraftFromPage(page()), proposal());
    expect(boardWikiSaveRequestFromDraft(applied).baseUpdatedAt).toBe('2026-09-19T10:00:00Z');
  });
});

describe('A RECOMPILE ARRIVING WHILE THE USER HAS UNSAVED EDITS', () => {
  it('warns, and does not touch the draft', () => {
    const draft = boardWikiDraftWithContent(boardWikiDraftFromPage(page()), 'Half a sentence the user is still writ');
    const warnings = boardWikiProposalWarnings(page(), draft, proposal());
    expect(warnings).toEqual(['unsaved-edits']);
    // The proposal's arrival is not an event that edits anything.
    expect(draft.content).toBe('Half a sentence the user is still writ');
  });

  it('reports BOTH conditions when both hold, rather than picking one', () => {
    // They are lost in different ways and neither is recoverable: unsaved edits
    // exist only in this tab, and Unit 1 stores no version history, so the
    // saved text a proposal would overwrite is gone too. Ranking them would
    // hide a real cost.
    const moved = page({ content: 'someone else saved this' });
    const draft = boardWikiDraftWithContent(boardWikiDraftFromPage(moved), 'and I am editing it');
    expect(boardWikiProposalWarnings(moved, draft, proposal())).toEqual(['unsaved-edits', 'page-moved']);
  });

  it('warns about a page that moved under a pending proposal even with a clean draft', () => {
    const moved = page({ content: 'someone else saved this' });
    expect(boardWikiProposalWarnings(moved, boardWikiDraftFromPage(moved), proposal())).toEqual(['page-moved']);
  });

  it('warns about nothing when the draft is clean and the page has not moved', () => {
    expect(boardWikiProposalWarnings(page(), boardWikiDraftFromPage(page()), proposal())).toEqual([]);
  });

  it('a warning never blocks the decision -- applying still works', () => {
    // The surface informs; the user decides. A block would make the only escape
    // from a stale page "discard your edits first", which is worse.
    const draft = boardWikiDraftWithContent(boardWikiDraftFromPage(page()), 'mine');
    expect(applyProposalToDraft(draft, proposal()).content).toBe('Compiled text. S1.2');
  });
});

describe('the save request', () => {
  it('carries the base the draft started from, so a concurrent save is a conflict rather than a silent loss', () => {
    // P3 rules out merge semantics. It does not rule out NOTICING.
    const request = boardWikiSaveRequestFromDraft(boardWikiDraftFromPage(page()));
    expect(request.baseUpdatedAt).toBe('2026-09-19T10:00:00Z');
  });

  it('sends source IDENTITIES and no versions, so a page cannot declare itself fresh', () => {
    // The version is the input to the staleness comparison. A browser that
    // could send one could publish a page that reads "current" over sources it
    // never re-read -- and the chain is P1's whole mitigation for compiling on
    // lexical retrieval.
    const request = boardWikiSaveRequestFromDraft(boardWikiDraftFromPage(page()));
    expect(request.sources).toEqual([docSource().item]);
    for (const item of request.sources) expect(item).not.toHaveProperty('version');
  });

  it('carries exactly what a person can change, and nothing else', () => {
    // No page id, no board id, no author, no compiled_at: those are the
    // server's to decide, and a request that carried them would be a request
    // the server had to distrust field by field.
    const request = boardWikiSaveRequestFromDraft(boardWikiDraftFromPage(page()));
    expect(Object.keys(request).sort()).toEqual(['baseUpdatedAt', 'content', 'sources', 'title']);
  });
});

describe('NO AUTOMATIC WRITE PATH EXISTS, checked in the source', () => {
  const source = readFileSync(resolve(process.cwd(), 'lib/domain/wiki/boardWikiEditing.ts'), 'utf8');
  const signatures = [...source.matchAll(/export function (\w+)\(([\s\S]*?)\):\s*([\w<>\[\] |]+)\s*\{/g)]
    .map(([, name, parameters, returns]) => ({ name, parameters, returns }));

  it('no exported function takes a proposal and returns a save request', () => {
    // THE ACCEPTANCE CRITERION. Such a function is the automatic write path,
    // whatever it were called and however carefully its callers behaved -- and
    // the next person to add one would be making an ordinary-looking
    // convenience helper.
    const offenders = signatures.filter(
      (signature) => /BoardWikiProposal\b/.test(signature.parameters) && /SaveRequest/.test(signature.returns),
    );
    expect(offenders.map((offender) => offender.name)).toEqual([]);
  });

  it('exactly one function produces a save request, and it takes a draft', () => {
    const producers = signatures.filter((signature) => /SaveRequest/.test(signature.returns));
    expect(producers.map((producer) => producer.name)).toEqual(['boardWikiSaveRequestFromDraft']);
    expect(producers[0].parameters).toContain('BoardWikiDraft');
  });

  it('every function taking a proposal returns a draft', () => {
    const consumers = signatures.filter((signature) => /BoardWikiProposal\b/.test(signature.parameters));
    expect(consumers.length).toBeGreaterThan(0);
    for (const consumer of consumers) {
      expect(consumer.returns, consumer.name).toMatch(/BoardWikiDraft|BoardWikiProposalWarning/);
    }
  });

  it('the proposal type declares no title field', () => {
    const type = source.slice(
      source.indexOf('export interface BoardWikiProposal {'),
      source.indexOf('export interface BoardWikiDraft {'),
    );
    expect(type).not.toMatch(/^\s*readonly title/m);
  });
});
