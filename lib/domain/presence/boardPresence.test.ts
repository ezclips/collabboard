import { describe, expect, it } from 'vitest';

import {
  PRESENCE_COLORS,
  initials,
  overflow,
  presenceColor,
  presenceIdentity,
  presencePeople,
  type PresenceState,
} from './boardPresence';

describe('PATCH-363 presenceIdentity', () => {
  it('reads full_name, then name, then display_name', () => {
    expect(presenceIdentity({ id: 'u1', user_metadata: { full_name: 'Ada Lovelace' } }).name).toBe('Ada Lovelace');
    expect(presenceIdentity({ id: 'u1', user_metadata: { name: 'Ada' } }).name).toBe('Ada');
    expect(presenceIdentity({ id: 'u1', user_metadata: { display_name: 'Ada L' } }).name).toBe('Ada L');
    expect(presenceIdentity({ id: 'u1', user_metadata: {} }).name).toBe('Member');
    expect(presenceIdentity({ id: 'u1' }).name).toBe('Member');
  });

  it('never falls back to the email', () => {
    const identity = presenceIdentity({ id: 'u1', user_metadata: { email: 'ada@example.com' } });
    expect(identity.name).toBe('Member');
    expect(identity.name).not.toContain('@');
  });

  it('trims and caps the name at 40 characters', () => {
    expect(presenceIdentity({ id: 'u1', user_metadata: { full_name: '  Ada  ' } }).name).toBe('Ada');
    expect(presenceIdentity({ id: 'u1', user_metadata: { full_name: 'a'.repeat(60) } }).name).toHaveLength(40);
  });

  it('flags a guest', () => {
    expect(presenceIdentity({ id: 'u1', is_anonymous: true }).isGuest).toBe(true);
    expect(presenceIdentity({ id: 'u1', is_anonymous: false }).isGuest).toBe(false);
    expect(presenceIdentity(null).isGuest).toBe(false);
  });
});

describe('PATCH-363 presenceColor', () => {
  it('is stable for one id and always from the palette', () => {
    expect(presenceColor('u1')).toBe(presenceColor('u1'));
    expect(PRESENCE_COLORS).toContain(presenceColor('u1'));
    expect(PRESENCE_COLORS).toContain(presenceColor('a-very-long-user-id-1234'));
    expect(PRESENCE_COLORS).toContain(presenceColor(''));
  });
});

describe('PATCH-363 initials', () => {
  it('takes up to two letters', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Ada')).toBe('AD');
    expect(initials('  Ada   B  C ')).toBe('AC');
    expect(initials('')).toBe('?');
  });
});

describe('PATCH-363 presencePeople', () => {
  const state: PresenceState = {
    u2: [{ name: 'Bob', joinedAt: '2026-01-02T00:00:00Z' }],
    me: [{ name: 'Me', joinedAt: '2026-01-03T00:00:00Z' }],
    u1: [{ name: 'Ada', joinedAt: '2026-01-01T00:00:00Z' }],
  };

  it('puts me first, then the rest by joinedAt', () => {
    expect(presencePeople(state, 'me').map((person) => person.userId)).toEqual(['me', 'u1', 'u2']);
  });

  it('counts several tabs of one user once, keeping the earliest joinedAt', () => {
    const multi: PresenceState = {
      u1: [
        { name: 'Ada', joinedAt: '2026-01-05T00:00:00Z' },
        { name: 'Ada', joinedAt: '2026-01-01T00:00:00Z' },
      ],
    };
    const people = presencePeople(multi, 'me');
    expect(people).toHaveLength(1);
    expect(people[0].joinedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('fills a colour when the meta has none, and defaults a missing name', () => {
    const people = presencePeople({ u9: [{}] }, 'me');
    expect(people[0].name).toBe('Member');
    expect(PRESENCE_COLORS).toContain(people[0].color);
  });
});

describe('PATCH-363 overflow', () => {
  it('splits into visible and hidden at the cap', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(overflow(list, 5)).toEqual({ visible: ['a', 'b', 'c', 'd', 'e'], hidden: ['f', 'g'] });
    expect(overflow(['a'], 5)).toEqual({ visible: ['a'], hidden: [] });
    expect(overflow([], 5)).toEqual({ visible: [], hidden: [] });
  });
});
