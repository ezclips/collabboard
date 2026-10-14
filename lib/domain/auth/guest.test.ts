import { describe, expect, it } from 'vitest';

import { GUEST_NAME_MAX, isGuestUser, normalizeGuestName } from './guest';

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
