import { describe, expect, it } from 'vitest';

import {
  boardWikiPageFreshness,
  boardWikiPageSourcesFromStored,
  boardWikiSourceStates,
  type BoardWikiCurrentVersions,
  type BoardWikiPageSource,
  type BoardWikiSourceVersion,
} from './boardWikiPageSources';
import { boardAiCitationIdentityKey } from '../ai/boardAiChatCitation';

/**
 * THE EDIT-WINS DATA MODEL, at the level where it is decidable.
 *
 * Staleness and goneness are DERIVED at read time and never stored: a stored
 * flag goes stale itself the moment a source changes without anything writing
 * to the page. These cases pin the derivation, and in particular the two
 * decisions most likely to be "fixed" later -- the deliberately coarse version
 * comparison, and gone outranking stale.
 */

const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const docSource = (pageNumber: number, version: Partial<Extract<BoardWikiSourceVersion, { kind: 'document' }>> = {}): BoardWikiPageSource => ({
  item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber, label: `doc — page ${pageNumber}` },
  version: { kind: 'document', contentSha256: 'sha-1', updatedAt: '2026-09-01T00:00:00Z', ...version },
});

const postSource = (updatedAt = '2026-09-01T00:00:00Z'): BoardWikiPageSource => ({
  item: { type: 'padlet', padletId: POST, label: 'a board post' },
  version: { kind: 'post', updatedAt },
});

const now = (...entries: readonly (readonly [BoardWikiPageSource, BoardWikiSourceVersion])[]): BoardWikiCurrentVersions =>
  new Map(entries.map(([source, version]) => [boardAiCitationIdentityKey(source.item), version]));

describe('a source that has not changed is current', () => {
  it('matches a document by hash', () => {
    const source = docSource(6);
    const states = boardWikiSourceStates([source], now([source, { kind: 'document', contentSha256: 'sha-1', updatedAt: 'later' }]));
    // updated_at MOVED and the state is still current: a re-render, a status
    // transition or a backfill is not a content change.
    expect(states[0].state).toBe('current');
  });

  it('matches a post by updated_at', () => {
    const source = postSource();
    const states = boardWikiSourceStates([source], now([source, { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' }]));
    expect(states[0].state).toBe('current');
  });
});

describe('a changed source is stale', () => {
  it('a document whose hash moved', () => {
    const source = docSource(6);
    const states = boardWikiSourceStates([source], now([source, { kind: 'document', contentSha256: 'sha-2', updatedAt: '2026-09-01T00:00:00Z' }]));
    expect(states[0].state).toBe('stale');
  });

  it('a post whose updated_at moved', () => {
    const source = postSource();
    const states = boardWikiSourceStates([source], now([source, { kind: 'post', updatedAt: '2026-09-02T00:00:00Z' }]));
    expect(states[0].state).toBe('stale');
  });

  it('falls back to updated_at when either side has no hash, rather than reading as unchanged', () => {
    // A missing hash must never mean "same". Silence is not evidence.
    const source = docSource(6, { contentSha256: null });
    const same = boardWikiSourceStates([source], now([source, { kind: 'document', contentSha256: null, updatedAt: '2026-09-01T00:00:00Z' }]));
    const moved = boardWikiSourceStates([source], now([source, { kind: 'document', contentSha256: 'sha-9', updatedAt: '2026-09-02T00:00:00Z' }]));
    expect(same[0].state).toBe('current');
    expect(moved[0].state).toBe('stale');
  });
});

describe('THE COARSE COMPARISON, pinned so nobody narrows it to the cited page', () => {
  it('a document edit marks a page stale even when the CITED page did not change', () => {
    // Editing page 2 of a twelve-page PDF flags a wiki page that cites page 6.
    // Deliberate: per-cited-page comparison needs version tracking ingestion
    // does not produce, and its failure mode is a page that really did change
    // reading as current. Flag, do not bury.
    const citesPageSix = docSource(6);
    const states = boardWikiSourceStates(
      [citesPageSix],
      now([citesPageSix, { kind: 'document', contentSha256: 'sha-after-editing-page-2', updatedAt: '2026-09-02T00:00:00Z' }]),
    );
    expect(states[0].state).toBe('stale');
  });
});

describe('a source that no longer exists is gone, not stale', () => {
  it('is gone when the lookup has no entry for it', () => {
    const source = docSource(6);
    expect(boardWikiSourceStates([source], now())[0].state).toBe('gone');
  });

  it('is still RECORDED -- the page really did use it', () => {
    // The same rule item 15 settled for citations: a deleted source is shown as
    // gone, never removed. The answer was true when it was written.
    const source = docSource(6);
    const states = boardWikiSourceStates([source], now());
    expect(states).toHaveLength(1);
    expect(states[0].source.item.knowledgeDocumentId).toBe(DOC);
    expect(states[0].source.item.label).toBe('doc — page 6');
  });
});

describe('the page-level roll-up', () => {
  it('is current only when every source is', () => {
    const a = docSource(6);
    const b = postSource();
    const states = boardWikiSourceStates([a, b], now(
      [a, { kind: 'document', contentSha256: 'sha-1', updatedAt: 'x' }],
      [b, { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' }],
    ));
    expect(boardWikiPageFreshness(states)).toBe('current');
  });

  it('GONE OUTRANKS STALE, because they call for different things', () => {
    // A stale page can be refreshed from its sources; a page with a gone source
    // cannot be fully refreshed at all. The page should say the harder thing.
    const stale = docSource(6);
    const gone = postSource();
    const states = boardWikiSourceStates([stale, gone], now(
      [stale, { kind: 'document', contentSha256: 'sha-2', updatedAt: 'x' }],
    ));
    expect(states.map((s) => s.state)).toEqual(['stale', 'gone']);
    expect(boardWikiPageFreshness(states)).toBe('sources-gone');
  });

  it('a page with no sources is current, not stale', () => {
    // A page someone wrote from nothing is a legitimate page.
    expect(boardWikiPageFreshness([])).toBe('current');
  });
});

describe('UNIT 1 ACCEPTANCE, stated in code rather than implied', () => {
  it('a source edit moves the derived state and NOTHING about the page', () => {
    // The acceptance criterion: a page survives a source edit with its content
    // byte-identical. Nothing here can write content -- staleness is computed
    // from the recorded version against the current one, and the page is an
    // input to that computation, never an output of it.
    const source = docSource(6);
    const page = { content: '# Horn replacement\n\nAuthored by a person.', sources: [source] };

    const before = boardWikiSourceStates(page.sources, now([source, { kind: 'document', contentSha256: 'sha-1', updatedAt: 't' }]));
    const after = boardWikiSourceStates(page.sources, now([source, { kind: 'document', contentSha256: 'sha-2', updatedAt: 't' }]));

    expect(before[0].state).toBe('current');
    expect(after[0].state).toBe('stale');
    // The page is untouched, byte for byte, and still claims the same source.
    expect(page.content).toBe('# Horn replacement\n\nAuthored by a person.');
    expect(page.sources).toEqual([source]);
  });

  it('a deleted source leaves the page intact and the source resolvable as gone', () => {
    const kept = postSource();
    const deleted = docSource(6);
    const page = { content: 'still here', sources: [kept, deleted] };

    const states = boardWikiSourceStates(page.sources, now([kept, { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' }]));

    expect(page.content).toBe('still here');
    expect(states.map((s) => s.state)).toEqual(['current', 'gone']);
    // Resolvable: the gone entry still carries the identity needed to say WHAT
    // was lost, rather than leaving an unexplained hole in the chain.
    expect(states[1].source.item.knowledgeDocumentId).toBe(DOC);
    expect(states[1].source.item.pageNumber).toBe(6);
  });
});

describe('the stored array is untrusted input', () => {
  it('reads a well-formed entry of each kind', () => {
    const parsed = boardWikiPageSourcesFromStored([
      { item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6, label: 'p6' }, version: { kind: 'document', contentSha256: 'sha-1', updatedAt: 't' } },
      { item: { type: 'padlet', padletId: POST, label: 'post' }, version: { kind: 'post', updatedAt: 't' } },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].version).toEqual({ kind: 'document', contentSha256: 'sha-1', updatedAt: 't' });
  });

  it('drops a malformed entry WITHOUT disturbing the ones around it', () => {
    // One bad row an editor wrote by hand must not brick a page, and must not
    // lend its identity to the entry behind it.
    const parsed = boardWikiPageSourcesFromStored([
      { item: { type: 'padlet', padletId: POST, label: 'first' }, version: { kind: 'post', updatedAt: 't' } },
      { item: { type: 'padlet', label: 'no identity at all' }, version: { kind: 'post', updatedAt: 't' } },
      { item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1, label: 'third' }, version: { kind: 'document', contentSha256: null, updatedAt: 't' } },
    ]);
    expect(parsed.map((p) => p.item.label)).toEqual(['first', 'third']);
  });

  it('drops entries with an unusable version rather than inventing one', () => {
    // A source with no version cannot be compared, and defaulting it would make
    // it permanently "current" -- the confident-wrong direction.
    for (const bad of [
      { item: { type: 'padlet', padletId: POST, label: 'x' }, version: { kind: 'post' } },
      { item: { type: 'padlet', padletId: POST, label: 'x' }, version: { kind: 'nonsense', updatedAt: 't' } },
      { item: { type: 'padlet', padletId: POST, label: 'x' } },
    ]) {
      expect(boardWikiPageSourcesFromStored([bad]), JSON.stringify(bad)).toEqual([]);
    }
  });

  it('returns empty for anything that is not an array', () => {
    for (const bad of [null, undefined, {}, 'sources', 7]) {
      expect(boardWikiPageSourcesFromStored(bad)).toEqual([]);
    }
  });

  it('does not carry extra keys inward from a stored object', () => {
    const parsed = boardWikiPageSourcesFromStored([{
      item: { type: 'padlet', padletId: POST, label: 'x', proof: 'forged', boardId: 'other' },
      version: { kind: 'post', updatedAt: 't' },
    }]);
    expect(Object.keys(parsed[0].item).sort()).toEqual(['label', 'padletId', 'type']);
  });
});
