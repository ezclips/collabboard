import { describe, expect, it } from 'vitest';

import {
  PRESENCE_COLORS,
  guestPostStripColor,
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

describe('PATCH-368 presencePeople names', () => {
  const A = 'a1000000-0000-4000-8000-0000000000b1';
  const B = 'b1000000-0000-4000-8000-0000000000b2';

  it('shows another guest as the alias while hidden', () => {
    const state: PresenceState = { [A]: [{ name: 'Ada', isGuest: true, joinedAt: 'x' }] };
    expect(presencePeople(state, B, true)[0].name).toBe('Guest 33');
    expect(presencePeople(state, B, false)[0].name).toBe('Ada');
  });

  it('falls back to "Guest" for a guest with name: null and the flag off', () => {
    const state: PresenceState = { [A]: [{ name: null as unknown as string, isGuest: true, joinedAt: 'x' }] };
    expect(presencePeople(state, B, false)[0].name).toBe('Guest');
  });

  it('never hides me from myself, and never hides a registered user', () => {
    const state: PresenceState = {
      [A]: [{ name: 'Ada', isGuest: true, joinedAt: 'x' }],
      [B]: [{ name: 'Bob', isGuest: false, joinedAt: 'y' }],
    };
    const people = presencePeople(state, A, true);
    expect(people.find((p) => p.userId === A)?.name).toBe('Ada');
    expect(people.find((p) => p.userId === B)?.name).toBe('Bob');
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

describe('PATCH-364 guestPostStripColor', () => {
  it('is the guest’s own presence colour for a guest-stamped post', () => {
    expect(guestPostStripColor({ createdBy: 'guest-1', createdByGuest: true }))
      .toBe(presenceColor('guest-1'));
  });

  it('is null when not a guest, or the stamp is missing or invalid', () => {
    expect(guestPostStripColor({ createdBy: 'u1', createdByGuest: false })).toBeNull();
    expect(guestPostStripColor({ createdBy: 'u1' })).toBeNull();
    expect(guestPostStripColor({ createdByGuest: true })).toBeNull();
    expect(guestPostStripColor({ createdBy: '', createdByGuest: true })).toBeNull();
    expect(guestPostStripColor({ createdBy: 5, createdByGuest: true })).toBeNull();
    expect(guestPostStripColor(null)).toBeNull();
    expect(guestPostStripColor(undefined)).toBeNull();
  });
});
