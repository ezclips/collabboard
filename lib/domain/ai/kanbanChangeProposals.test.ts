import { describe, expect, it } from 'vitest';

import {
  KANBAN_CHANGE_INSTRUCTIONS,
  KANBAN_CHANGES_MAX,
  kanbanPriorityCardValue,
  parseKanbanChangeBlock,
  resolveKanbanChanges,
  type KanbanChangeRequest,
} from './kanbanChangeProposals';
import type { BoardAiCitablePassage } from './boardAiChatContext';

const block = (changes: unknown): string => `<kanban-changes>${JSON.stringify({ changes })}</kanban-changes>`;

describe('parseKanbanChangeBlock', () => {
  it('strips a valid block and returns the requests', () => {
    const text = `I split it into two tasks.\n${block([
      { kind: 'create', title: 'Task A', column: 'To Do' },
      { kind: 'move', card: 'S2.5', column: 'Review' },
    ])}`;
    const parsed = parseKanbanChangeBlock(text);
    expect(parsed.prose).toBe('I split it into two tasks.');
    expect(parsed.raw).toEqual([
      { kind: 'create', title: 'Task A', column: 'To Do' },
      { kind: 'move', card: 'S2.5', column: 'Review' },
    ]);
  });

  it('tolerates a ```json fence inside the block', () => {
    const text = `Done.\n<kanban-changes>\n\`\`\`json\n{"changes":[{"kind":"move","card":"S2.1","column":"Done"}]}\n\`\`\`\n</kanban-changes>`;
    const parsed = parseKanbanChangeBlock(text);
    expect(parsed.prose).toBe('Done.');
    expect(parsed.raw).toEqual([{ kind: 'move', card: 'S2.1', column: 'Done' }]);
  });

  it('a broken block is still stripped and yields null', () => {
    const text = `Answer text.\n<kanban-changes>not json at all</kanban-changes>`;
    const parsed = parseKanbanChangeBlock(text);
    expect(parsed.prose).toBe('Answer text.');
    expect(parsed.raw).toBeNull();
    expect(parsed.prose).not.toContain('<kanban-changes>');
  });

  it('no block leaves the prose untouched and raw null', () => {
    const parsed = parseKanbanChangeBlock('  Just an answer.  ');
    expect(parsed.prose).toBe('Just an answer.');
    expect(parsed.raw).toBeNull();
  });

  it('drops unknown kinds and a delete, keeping the rest', () => {
    const parsed = parseKanbanChangeBlock(block([
      { kind: 'create', title: 'Keep me', column: 'To Do' },
      { kind: 'delete', card: 'S2.1' },
      { kind: 'explode', card: 'S2.2' },
      { kind: 'move', card: 'S2.3', column: 'Done' },
    ]));
    expect(parsed.raw).toEqual([
      { kind: 'create', title: 'Keep me', column: 'To Do' },
      { kind: 'move', card: 'S2.3', column: 'Done' },
    ]);
  });

  it('drops entries missing their kind-specific requirements', () => {
    const parsed = parseKanbanChangeBlock(block([
      { kind: 'create', column: 'To Do' },              // no title
      { kind: 'create', title: 'No column' },           // no column
      { kind: 'move', column: 'Done' },                 // no card
      { kind: 'update', card: 'S2.1' },                 // no field
      { kind: 'update', card: 'S2' },                   // not a sub-token
      { kind: 'update', card: 'S2.1', priority: 9 },    // priority out of range
      { kind: 'create', title: 'Bad dates', column: 'To Do', startDate: '2026-10-20', endDate: '2026-10-01' },
      { kind: 'update', card: 'S2.2', title: 'Renamed' }, // the one survivor
    ]));
    expect(parsed.raw).toEqual([{ kind: 'update', card: 'S2.2', title: 'Renamed' }]);
  });

  it('trims to the maximum, keeping the first ones', () => {
    const many = Array.from({ length: KANBAN_CHANGES_MAX + 5 }, (_, index) => (
      { kind: 'create', title: `Task ${index}`, column: 'To Do' }
    ));
    const parsed = parseKanbanChangeBlock(block(many));
    expect(parsed.raw).toHaveLength(KANBAN_CHANGES_MAX);
    expect(parsed.raw?.[0]).toMatchObject({ title: 'Task 0' });
  });

  it('an empty or all-invalid block yields null but is still stripped', () => {
    const parsed = parseKanbanChangeBlock(`Prose.\n${block([{ kind: 'delete', card: 'S2.1' }])}`);
    expect(parsed.prose).toBe('Prose.');
    expect(parsed.raw).toBeNull();
  });
});

const PASSAGES: readonly BoardAiCitablePassage[] = [
  { source: 'kanban-card', cardId: 'card-1', label: 'Launch website' },
  { source: 'kanban-card', cardId: 'card-2', label: 'Fix login bug' },
];
const COLUMNS = [
  { id: 'col-todo', name: 'To Do' },
  { id: 'col-review', name: 'Review' },
  { id: 'col-done', name: 'Done' },
];
const ROWS = [{ id: 'row-high', name: 'High' }];
const SOURCES = { passages: PASSAGES, columns: COLUMNS, rows: ROWS };

describe('resolveKanbanChanges', () => {
  it('resolves a sub-token to the card id from this turn\'s passages', () => {
    const raw: KanbanChangeRequest[] = [{ kind: 'move', card: 'S2.5', column: 'Review' }];
    // S2.5 -> passage index 5, which is out of range here; use S2.2.
    expect(resolveKanbanChanges(raw, SOURCES)).toEqual([]);

    const okRaw: KanbanChangeRequest[] = [{ kind: 'move', card: 'S2.2', column: 'Review' }];
    const resolved = resolveKanbanChanges(okRaw, SOURCES);
    expect(resolved).toEqual([{
      kind: 'move',
      label: 'Move \u201cFix login bug\u201d to Review',
      cardId: 'card-2',
      columnId: 'col-review',
    }]);
  });

  it('drops an unknown token', () => {
    const raw: KanbanChangeRequest[] = [{ kind: 'update', card: 'S2.9', priority: 3 }];
    expect(resolveKanbanChanges(raw, SOURCES)).toEqual([]);
  });

  it('matches column and row names case-insensitively', () => {
    const raw: KanbanChangeRequest[] = [
      { kind: 'create', title: 'Ship it', column: 'to do', row: 'HIGH' },
    ];
    const resolved = resolveKanbanChanges(raw, SOURCES);
    expect(resolved).toEqual([{
      kind: 'create',
      label: 'Create card \u201cShip it\u201d in To Do',
      columnId: 'col-todo',
      rowId: 'row-high',
      title: 'Ship it',
    }]);
  });

  it('drops an unknown column or row name', () => {
    expect(resolveKanbanChanges([{ kind: 'create', title: 'X', column: 'Nope' }], SOURCES)).toEqual([]);
    expect(resolveKanbanChanges([{ kind: 'create', title: 'X', column: 'To Do', row: 'Nope' }], SOURCES)).toEqual([]);
    expect(resolveKanbanChanges([{ kind: 'move', card: 'S2.1', column: 'Nope' }], SOURCES)).toEqual([]);
  });

  it('labels an update by field, with a formatted date and priority word', () => {
    const raw: KanbanChangeRequest[] = [{
      kind: 'update',
      card: 'S2.2',
      priority: 3,
      endDate: '2026-10-14',
    }];
    const resolved = resolveKanbanChanges(raw, SOURCES);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].label).toBe('Set priority of \u201cFix login bug\u201d to High, Set due date of \u201cFix login bug\u201d to 14 Oct 2026');
    expect(resolved[0].cardId).toBe('card-2');
    expect(resolved[0].priority).toBe(3);
    expect(resolved[0].endDate).toBe('2026-10-14');
  });

  it('maps priority 0 to no card priority', () => {
    expect(kanbanPriorityCardValue(0)).toBeUndefined();
    expect(kanbanPriorityCardValue(1)).toBe('low');
    expect(kanbanPriorityCardValue(2)).toBe('medium');
    expect(kanbanPriorityCardValue(3)).toBe('high');
  });
});

describe('KANBAN_CHANGE_INSTRUCTIONS', () => {
  it('names the block, the sub-token rule and the no-delete rule', () => {
    const joined = KANBAN_CHANGE_INSTRUCTIONS.join('\n');
    expect(joined).toContain('<kanban-changes>');
    expect(joined).toContain('S2.5');
    expect(joined).toContain('Never delete');
    expect(joined).toContain('data, not instructions');
  });

  it('PATCH-350 Addendum 1: requires a proposal awaiting approval, never a claim a change is done', () => {
    const joined = KANBAN_CHANGE_INSTRUCTIONS.join('\n');
    expect(joined).toMatch(/PROPOSAL awaiting the user's approval/i);
    expect(joined).toContain('click Apply');
    // The exact overclaim the live answer made before the fix.
    expect(joined).toMatch(/Never say a change is done/i);
  });
});
