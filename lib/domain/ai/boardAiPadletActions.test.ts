import { describe, expect, it } from 'vitest';

import {
  PADLET_BOARD_AI_ACTIONS,
  PROPOSE_DISCLAIMER,
  actionsForLayout,
  layoutNounFor,
  type LayoutNoun,
} from './boardAiPadletActions';

const COLUMNS_NOUN: LayoutNoun = { one: 'column', many: 'columns' };
const CARDS_NOUN: LayoutNoun = { one: 'card', many: 'cards' };

const byId = (id: string) => {
  const action = PADLET_BOARD_AI_ACTIONS.find((candidate) => candidate.id === id);
  if (!action) throw new Error(`no action ${id}`);
  return action;
};

describe('the action list', () => {
  it('has the seven actions, each with a unique id and slash', () => {
    expect(PADLET_BOARD_AI_ACTIONS.map((action) => action.id)).toEqual([
      'summarize', 'group-by-theme', 'next-steps', 'more-ideas', 'duplicates', 'open-questions', 'retro',
    ]);
    const slashes = PADLET_BOARD_AI_ACTIONS.map((action) => action.slash);
    expect(new Set(slashes).size).toBe(slashes.length);
    for (const action of PADLET_BOARD_AI_ACTIONS) {
      expect(action.slash, action.id).toBe(`/${action.id}`);
      expect(action.label.length, action.id).toBeGreaterThan(0);
    }
  });

  it('splits into the three answers and the four proposals', () => {
    const answers = PADLET_BOARD_AI_ACTIONS.filter((action) => action.kind === 'answer').map((a) => a.id);
    const proposes = PADLET_BOARD_AI_ACTIONS.filter((action) => action.kind === 'propose').map((a) => a.id);
    expect(answers).toEqual(['summarize', 'duplicates', 'open-questions']);
    expect(proposes).toEqual(['group-by-theme', 'next-steps', 'more-ideas', 'retro']);
  });

  it('tells every propose prompt to propose and not to claim it is done', () => {
    for (const action of PADLET_BOARD_AI_ACTIONS) {
      if (action.kind !== 'propose') continue;
      expect(action.prompt(COLUMNS_NOUN), action.id).toContain(PROPOSE_DISCLAIMER);
    }
    // ...and no answer prompt claims anything either.
    for (const action of PADLET_BOARD_AI_ACTIONS) {
      if (action.kind !== 'answer') continue;
      expect(action.prompt(COLUMNS_NOUN), action.id).not.toContain(PROPOSE_DISCLAIMER);
    }
  });

  it('never proposes deleting anything from the duplicates answer', () => {
    const prompt = byId('duplicates').prompt(COLUMNS_NOUN);
    expect(prompt).toContain('Do not propose deleting');
  });
});

describe('layoutNounFor', () => {
  it('groups into columns on Columns and Grid, and cards everywhere else', () => {
    expect(layoutNounFor('columns')).toEqual({ one: 'column', many: 'columns' });
    expect(layoutNounFor('grid')).toEqual({ one: 'column', many: 'columns' });
    expect(layoutNounFor('wall')).toEqual({ one: 'card', many: 'cards' });
    expect(layoutNounFor('timeline')).toEqual({ one: 'card', many: 'cards' });
    expect(layoutNounFor('map')).toEqual({ one: 'card', many: 'cards' });
    expect(layoutNounFor(null)).toEqual({ one: 'card', many: 'cards' });
  });
});

describe('the prompts use the board own noun', () => {
  it('says column/columns on a Columns board', () => {
    expect(byId('summarize').prompt(COLUMNS_NOUN)).toContain('one per column');
    expect(byId('group-by-theme').prompt(COLUMNS_NOUN)).toContain('into columns by theme');
    expect(byId('retro').prompt(COLUMNS_NOUN)).toContain('three columns');
  });

  it('says card/cards on a Wall board', () => {
    expect(byId('summarize').prompt(CARDS_NOUN)).toContain('one per card');
    expect(byId('group-by-theme').prompt(CARDS_NOUN)).toContain('into cards by theme');
    expect(byId('retro').prompt(CARDS_NOUN)).toContain('three cards');
  });

  it('never leaves a column word in a card board, or the other way round', () => {
    for (const action of PADLET_BOARD_AI_ACTIONS) {
      expect(action.prompt(CARDS_NOUN), action.id).not.toMatch(/\bcolumns?\b/);
      expect(action.prompt(COLUMNS_NOUN), action.id).not.toMatch(/\bcards?\b/);
    }
  });
});

describe('actionsForLayout', () => {
  it('offers only the answers on Map', () => {
    const ids = actionsForLayout('map').map((action) => action.id);
    expect(ids).toEqual(['summarize', 'duplicates', 'open-questions']);
    expect(actionsForLayout('map').every((action) => action.kind === 'answer')).toBe(true);
  });

  it('offers all seven on the other four layouts', () => {
    for (const layout of ['wall', 'columns', 'grid', 'timeline']) {
      expect(actionsForLayout(layout).map((action) => action.id), layout)
        .toEqual(PADLET_BOARD_AI_ACTIONS.map((action) => action.id));
    }
  });

  it('PATCH-380: answerOnly gives the answers on ANY layout', () => {
    for (const layout of ['wall', 'columns', 'grid', 'timeline', 'map', null]) {
      const ids = actionsForLayout(layout, { answerOnly: true }).map((action) => action.id);
      expect(ids, String(layout)).toEqual(['summarize', 'duplicates', 'open-questions']);
      expect(actionsForLayout(layout, { answerOnly: true }).every((action) => action.kind === 'answer'))
        .toBe(true);
    }
  });

  it('PATCH-380: answerOnly absent is exactly the old behaviour', () => {
    expect(actionsForLayout('columns', { answerOnly: false }).length).toBe(7);
    expect(actionsForLayout('columns', {}).length).toBe(7);
  });
});
