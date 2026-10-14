import { describe, expect, it } from 'vitest';

import { GUEST_ALIAS_SQL, displayNameFor, guestAlias } from './guestAlias';

describe('PATCH-368 guestAlias', () => {
  it('derives a stable number from the first 4 hex chars', () => {
    expect(guestAlias('a1000000-0000-4000-8000-0000000000b1')).toBe('Guest 33');
    expect(guestAlias('b1000000-0000-4000-8000-0000000000b2')).toBe('Guest 70');
    expect(guestAlias('00000000-0000-0000-0000-000000000000')).toBe('Guest 1');
    expect(guestAlias('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe('Guest 97');
  });

  it('is stable for the same id and stays in 1..99', () => {
    const ids = [
      'a1000000-0000-4000-8000-0000000000b1',
      'b1000000-0000-4000-8000-0000000000b2',
      '12345678-1234-1234-1234-1234567890ab',
      'deadbeef-0000-0000-0000-000000000000',
      '0f0f0f0f-0000-0000-0000-000000000000',
    ];
    for (const id of ids) {
      const first = guestAlias(id);
      expect(guestAlias(id)).toBe(first);
      const n = Number(first.replace('Guest ', ''));
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it('falls back to Guest 1 for an unusable id', () => {
    expect(guestAlias('')).toBe('Guest 1');
    expect(guestAlias('zzzz')).toBe('Guest 1');
  });

  it('pins the SQL twin to the same rule', () => {
    // The migration must carry exactly this expression.
    expect(GUEST_ALIAS_SQL).toBe(
      "'Guest ' || ((('x' || substr(u.id::text, 1, 4))::bit(16)::int % 99) + 1)",
    );
  });
});

describe('PATCH-368 displayNameFor', () => {
  const base = { userId: 'a1000000-0000-4000-8000-0000000000b1', isGuest: true, isMe: false, hideGuestNames: false };

  it('shows the alias for another guest while hidden', () => {
    expect(displayNameFor({ ...base, name: 'Ada', hideGuestNames: true })).toBe('Guest 33');
  });

  it('shows the real name for another guest while not hidden', () => {
    expect(displayNameFor({ ...base, name: 'Ada' })).toBe('Ada');
  });

  it('falls back to "Guest" for another guest with no name and the flag off', () => {
    expect(displayNameFor({ ...base, name: null })).toBe('Guest');
    expect(displayNameFor({ ...base, name: '   ' })).toBe('Guest');
  });

  it('never hides me from myself', () => {
    expect(displayNameFor({ ...base, name: 'Ada', isMe: true, hideGuestNames: true })).toBe('Ada');
    expect(displayNameFor({ ...base, name: null, isMe: true, hideGuestNames: true })).toBe('Member');
  });

  it('never hides a registered user', () => {
    expect(displayNameFor({ ...base, name: 'Ada', isGuest: false, hideGuestNames: true })).toBe('Ada');
  });

  it('falls back to "Member" when a non-guest has no name', () => {
    expect(displayNameFor({ ...base, name: null, isGuest: false })).toBe('Member');
  });
});
