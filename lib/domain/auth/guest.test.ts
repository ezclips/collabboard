import { describe, expect, it } from 'vitest';

import { GUEST_NAME_MAX, canGuestModifyPost, isGuestUser, normalizeGuestName } from './guest';

describe('PATCH-358 isGuestUser', () => {
  it('is true only for is_anonymous === true', () => {
    expect(isGuestUser({ is_anonymous: true })).toBe(true);
  });

  it('is false for a normal user, a false flag, or nothing', () => {
    expect(isGuestUser({ is_anonymous: false })).toBe(false);
    expect(isGuestUser({})).toBe(false);
    expect(isGuestUser(null)).toBe(false);
    expect(isGuestUser(undefined)).toBe(false);
  });
});

describe('PATCH-358 normalizeGuestName', () => {
  it('accepts a valid name unchanged', () => {
    expect(normalizeGuestName('Ada Lovelace')).toEqual({ ok: true, name: 'Ada Lovelace' });
  });

  it('trims and collapses inner whitespace', () => {
    expect(normalizeGuestName('  Ada   Lovelace \n')).toEqual({ ok: true, name: 'Ada Lovelace' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(normalizeGuestName('')).toEqual({ ok: false, error: 'Please type a name.' });
    expect(normalizeGuestName('   \t ')).toEqual({ ok: false, error: 'Please type a name.' });
  });

  it('rejects a name longer than 40 characters', () => {
    const long = 'a'.repeat(GUEST_NAME_MAX + 1);
    const result = normalizeGuestName(long);
    expect(result.ok).toBe(false);
    // Exactly 40 is fine.
    expect(normalizeGuestName('a'.repeat(GUEST_NAME_MAX))).toEqual({ ok: true, name: 'a'.repeat(GUEST_NAME_MAX) });
  });

  it('rejects angle brackets', () => {
    expect(normalizeGuestName('<b>Ada</b>').ok).toBe(false);
    expect(normalizeGuestName('a > b').ok).toBe(false);
  });

  it('rejects control characters', () => {
    expect(normalizeGuestName('Ada\u0000Lovelace').ok).toBe(false);
    expect(normalizeGuestName('Ada\u0007Lovelace').ok).toBe(false);
    expect(normalizeGuestName('Ada\u007fLovelace').ok).toBe(false);
  });
});

describe('PATCH-379 canGuestModifyPost', () => {
  const GUEST = { id: 'guest-1', is_anonymous: true };
  const MEMBER = { id: 'member-1', is_anonymous: false };
  const ownedBy = (createdBy: unknown) => ({ metadata: { createdBy } });

  it('lets a guest change a post the stamp says is theirs', () => {
    expect(canGuestModifyPost(ownedBy('guest-1'), GUEST)).toBe(true);
  });

  it('refuses a guest anyone else post', () => {
    expect(canGuestModifyPost(ownedBy('member-1'), GUEST)).toBe(false);
    expect(canGuestModifyPost(ownedBy('another-guest'), GUEST)).toBe(false);
  });

  it('refuses a guest a post with no stamp at all', () => {
    expect(canGuestModifyPost({ metadata: {} }, GUEST)).toBe(false);
    expect(canGuestModifyPost({ metadata: { createdBy: null } }, GUEST)).toBe(false);
    expect(canGuestModifyPost({ metadata: { createdBy: 42 } }, GUEST)).toBe(false);
    expect(canGuestModifyPost({ metadata: null }, GUEST)).toBe(false);
    expect(canGuestModifyPost({}, GUEST)).toBe(false);
    expect(canGuestModifyPost(null, GUEST)).toBe(false);
  });

  it('refuses a guest with no id of its own', () => {
    // No id means the stamp could never have matched.
    expect(canGuestModifyPost(ownedBy('guest-1'), { is_anonymous: true })).toBe(false);
  });

  it('leaves everyone who is not a guest exactly as they were', () => {
    // The board's own authority decides for them -- not this helper.
    expect(canGuestModifyPost(ownedBy('member-1'), MEMBER)).toBe(true);
    expect(canGuestModifyPost(ownedBy('someone-else'), MEMBER)).toBe(true);
    expect(canGuestModifyPost({ metadata: {} }, MEMBER)).toBe(true);
    expect(canGuestModifyPost(null, MEMBER)).toBe(true);
    expect(canGuestModifyPost(ownedBy('member-1'), null)).toBe(true);
    expect(canGuestModifyPost(ownedBy('member-1'), undefined)).toBe(true);
  });

  it('reads the STAMP, not a client-shaped guess, and never a nested one', () => {
    // `metadata.createdByGuest` is a separate key; only `createdBy` is the stamp.
    expect(canGuestModifyPost({ metadata: { createdByGuest: true } }, GUEST)).toBe(false);
    expect(canGuestModifyPost({ metadata: { createdBy: 'guest-1', createdByGuest: true } }, GUEST)).toBe(true);
  });
});
