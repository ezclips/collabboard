import { describe, expect, it } from 'vitest';

import {
  boardPersonFromRow,
  boardPersonRoleLabel,
  sortBoardPeople,
  type BoardPerson,
} from './boardPeople';

describe('PATCH-362 boardPersonFromRow', () => {
  it('a guest with no email is a Guest and carries no email', () => {
    const person = boardPersonFromRow(
      { user_id: 'u1', role: 'editor', added_at: '2026-01-01T00:00:00Z' },
      { id: 'u1', email: null, full_name: null },
    );
    expect(person).toEqual({
      userId: 'u1',
      name: 'Guest',
      email: null,
      role: 'editor',
      isGuest: true,
      joinedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('prefers full_name, then name, then email, then Guest', () => {
    expect(boardPersonFromRow(
      { user_id: 'u1' },
      { id: 'u1', email: 'ada@example.com', full_name: 'Ada Lovelace', name: 'ada' },
    ).name).toBe('Ada Lovelace');

    expect(boardPersonFromRow(
      { user_id: 'u1' },
      { id: 'u1', email: 'ada@example.com', full_name: '   ', name: 'ada' },
    ).name).toBe('ada');

    expect(boardPersonFromRow(
      { user_id: 'u2' },
      { id: 'u2', email: 'ada@example.com', full_name: '   ', name: '  ' },
    ).name).toBe('ada@example.com');

    expect(boardPersonFromRow({ user_id: 'u3' }, null).name).toBe('Guest');
  });

  it('a registered person is not a guest and keeps their email', () => {
    const person = boardPersonFromRow(
      { user_id: 'u1', role: 'commenter' },
      { id: 'u1', email: 'ada@example.com' },
    );
    expect(person.isGuest).toBe(false);
    expect(person.email).toBe('ada@example.com');
  });

  it('defaults an unknown or missing role to viewer', () => {
    expect(boardPersonFromRow({ user_id: 'u1' }, null).role).toBe('viewer');
    expect(boardPersonFromRow({ user_id: 'u1', role: 'banana' }, null).role).toBe('banana');
  });
});

describe('PATCH-362 sortBoardPeople', () => {
  const person = (userId: string, joinedAt: string | null): BoardPerson => ({
    userId, name: userId, email: null, role: 'viewer', isGuest: true, joinedAt,
  });

  it('sorts oldest first, with a stable userId tiebreak', () => {
    const sorted = sortBoardPeople([
      person('b', '2026-01-02T00:00:00Z'),
      person('a', '2026-01-01T00:00:00Z'),
      person('c', '2026-01-02T00:00:00Z'),
    ]);
    expect(sorted.map((entry) => entry.userId)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const input = [person('b', '2026-01-02'), person('a', '2026-01-01')];
    const copy = [...input];
    sortBoardPeople(input);
    expect(input).toEqual(copy);
  });
});

describe('PATCH-362 boardPersonRoleLabel', () => {
  it('names the three roles', () => {
    expect(boardPersonRoleLabel('editor')).toBe('Can edit');
    expect(boardPersonRoleLabel('commenter')).toBe('Can comment');
    expect(boardPersonRoleLabel('viewer')).toBe('Can view');
    expect(boardPersonRoleLabel(null)).toBe('Can view');
    expect(boardPersonRoleLabel('banana')).toBe('Can view');
  });
});
