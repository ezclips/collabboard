import { describe, expect, it } from 'vitest';

import {
  PADLET_CHANGES_MAX,
  PADLET_CHANGE_INSTRUCTIONS,
  PADLET_CHANGE_LAYOUTS,
  padletPanelKindForLayout,
  parsePadletChangeBlock,
  resolvePadletChanges,
  type PadletResolveSources,
} from './padletChangeProposals';
import type { BoardAiCitablePassage } from './boardAiChatContext';

const passage = (padletId: string, label: string): BoardAiCitablePassage => ({ source: 'post', padletId, label });

const sources = (over: Partial<PadletResolveSources> = {}): PadletResolveSources => ({
  passages: [passage('p1', 'Ideas · First idea'), passage('p2', 'Ideas · Second idea')],
  panels: [
    { id: '197', name: 'Ideas', kind: 'section' },
    { id: '198', name: 'Done', kind: 'section' },
  ],
  layout: 'columns',
  ...over,
});

const block = (changes: unknown): string =>
  `<board-changes>${JSON.stringify({ changes })}</board-changes>`;

describe('PATCH-372 parsePadletChangeBlock', () => {
  it('reads a good block and strips it from the prose', () => {
    const parsed = parsePadletChangeBlock(`Here is my plan.\n${block([{ kind: 'create', panel: 'Ideas', title: 'New' }])}`);
    expect(parsed.prose).toBe('Here is my plan.');
    expect(parsed.raw).toEqual([{ kind: 'create', panel: 'Ideas', title: 'New' }]);
  });

  it('drops a bad entry, not the whole block', () => {
    const parsed = parsePadletChangeBlock(block([
      { kind: 'create', panel: 'Ideas' }, // no title -> dropped
      { kind: 'unknown' }, // unknown kind -> dropped
      { kind: 'move', post: 'S1.1', panel: 'Done' }, // good
    ]));
    expect(parsed.raw).toEqual([{ kind: 'move', post: 'S1.1', panel: 'Done' }]);
  });

  it('strips a broken block and yields no requests', () => {
    const parsed = parsePadletChangeBlock('Answer.\n<board-changes>{ not json }</board-changes>');
    expect(parsed.prose).toBe('Answer.');
    expect(parsed.raw).toBeNull();
  });

  it('is prose when there is no block at all', () => {
    const parsed = parsePadletChangeBlock('Just an answer.');
    expect(parsed.prose).toBe('Just an answer.');
    expect(parsed.raw).toBeNull();
  });

  it('caps the number of changes', () => {
    const many = Array.from({ length: PADLET_CHANGES_MAX + 5 }, (_, index) => (
      { kind: 'create', panel: 'Ideas', title: `Post ${index}` }
    ));
    expect(parsePadletChangeBlock(block(many)).raw).toHaveLength(PADLET_CHANGES_MAX);
  });

  it('rejects an over-long title and a bare (non-sub) token', () => {
    const parsed = parsePadletChangeBlock(block([
      { kind: 'create', panel: 'Ideas', title: 'x'.repeat(201) },
      { kind: 'update', post: 'S1', title: 'New' }, // bare token
      { kind: 'update', post: 'S1.2', title: 'New' }, // good
    ]));
    expect(parsed.raw).toEqual([{ kind: 'update', post: 'S1.2', title: 'New' }]);
  });

  it('an update needs at least one field', () => {
    expect(parsePadletChangeBlock(block([{ kind: 'update', post: 'S1.2' }])).raw).toBeNull();
  });
});

describe('PATCH-372 resolvePadletChanges', () => {
  it('resolves a token only through this turn passages', () => {
    const changes = resolvePadletChanges(
      [{ kind: 'update', post: 'S1.2', title: 'Renamed' }],
      sources(),
    );
    expect(changes).toEqual([
      { kind: 'update', label: 'Rename “Ideas · Second idea” to “Renamed”', postId: 'p2', postTitle: 'Ideas · Second idea', title: 'Renamed' },
    ]);
    // A token past the passages names nothing.
    expect(resolvePadletChanges([{ kind: 'update', post: 'S1.9', title: 'X' }], sources())).toEqual([]);
  });

  it('resolves a panel name case-insensitively', () => {
    const changes = resolvePadletChanges([{ kind: 'move', post: 'S1.1', panel: 'done' }], sources());
    expect(changes[0]).toMatchObject({ kind: 'move', panelId: '198', panelKind: 'section', postId: 'p1' });
    expect(changes[0].label).toBe('Move “Ideas · First idea” to “Done”');
  });

  it('drops a change naming an unknown panel', () => {
    expect(resolvePadletChanges([{ kind: 'move', post: 'S1.1', panel: 'Nope' }], sources())).toEqual([]);
  });

  it('a create-panel makes a panel later changes in the block can target', () => {
    const changes = resolvePadletChanges([
      { kind: 'create-panel', panel: 'Risks' },
      { kind: 'create', panel: 'Risks', title: 'Flaky tests' },
      { kind: 'move', post: 'S1.1', panel: 'Risks' },
    ], sources());

    expect(changes.map((change) => change.kind)).toEqual(['create-panel', 'create', 'move']);
    expect(changes[0]).toMatchObject({ panelKind: 'section', newPanelName: 'Risks' });
    expect(changes[0].label).toBe('New column “Risks”');
    // No id yet: the apply creates the panel first and maps the name to its id.
    expect(changes[1]).toMatchObject({ newPanelName: 'Risks', title: 'Flaky tests' });
    expect(changes[1].panelId).toBeUndefined();
    expect(changes[1].label).toBe('New post in “Risks”: “Flaky tests”');
    expect(changes[2]).toMatchObject({ newPanelName: 'Risks', postId: 'p1' });
  });

  it('a create-panel on Wall/Timeline makes a container card', () => {
    const changes = resolvePadletChanges([{ kind: 'create-panel', panel: 'Anna' }], sources({ layout: 'wall', panels: [] }));
    expect(changes[0]).toMatchObject({ panelKind: 'container', newPanelName: 'Anna' });
    expect(changes[0].label).toBe('New card “Anna”');
  });

  it('keeps order, so create-panel is applied before what targets it', () => {
    const changes = resolvePadletChanges([
      { kind: 'create', panel: 'Ideas', title: 'A' },
      { kind: 'create-panel', panel: 'Later' },
      { kind: 'create', panel: 'Later', title: 'B' },
    ], sources());
    expect(changes.map((change) => change.kind)).toEqual(['create', 'create-panel', 'create']);
  });

  it('a rewrite label names the post', () => {
    const changes = resolvePadletChanges([{ kind: 'update', post: 'S1.1', text: 'New body' }], sources());
    expect(changes[0].label).toBe('Rewrite the text of “Ideas · First idea”');
  });

  it('null / empty input yields nothing', () => {
    expect(resolvePadletChanges(null, sources())).toEqual([]);
    expect(resolvePadletChanges([], sources())).toEqual([]);
  });
});

describe('PATCH-372 layouts and instructions', () => {
  it('excludes Map', () => {
    expect(PADLET_CHANGE_LAYOUTS).toEqual(['wall', 'columns', 'grid', 'timeline']);
    expect(padletPanelKindForLayout('map')).toBeNull();
    expect(padletPanelKindForLayout('columns')).toBe('section');
    expect(padletPanelKindForLayout('wall')).toBe('container');
    expect(padletPanelKindForLayout('freeform')).toBeNull();
  });

  it('tells the model never to delete and to phrase a proposal', () => {
    const all = PADLET_CHANGE_INSTRUCTIONS.join('\n');
    expect(all).toContain('Never delete posts');
    expect(all).toContain('Never say a change is done');
    expect(all).toContain('nothing is written until the user approves it');
    expect(all).toContain('Refer to existing posts only by their overview id');
  });
});
