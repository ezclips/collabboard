import { describe, expect, it } from 'vitest';

import {
  GUEST_LINK_EXPIRY_OPTIONS,
  boardShareTargetRequiresAdmin,
  guestLinkExpiryLabel,
  guestLinkPermissionLabel,
  isGuestLinkActive,
  toGuestLink,
  type GuestLinkRow,
} from './guestLinks';

const NOW = new Date('2026-06-15T12:00:00Z');

const row = (over: Partial<GuestLinkRow> = {}): GuestLinkRow => ({
  id: 7,
  token: 'tok-abc',
  permission: 'edit',
  created_at: '2026-06-01T00:00:00Z',
  expires_at: '2026-06-21T00:00:00Z',
  password_hash: null,
  access_count: 3,
  ...over,
});

describe('PATCH-365 toGuestLink', () => {
  it('maps the row and never keeps the hash or a token key', () => {
    const link = toGuestLink(row({ password_hash: 'scrypt$...' }), 'https://app.test');
    expect(link).toEqual({
      id: '7',
      permission: 'edit',
      createdAt: '2026-06-01T00:00:00Z',
      expiresAt: '2026-06-21T00:00:00Z',
      isPasswordProtected: true,
      accessCount: 3,
      url: 'https://app.test/share/tok-abc',
    });
    // The hash and the bare token are NOT on the object.
    expect(Object.keys(link).sort()).toEqual(
      ['accessCount', 'createdAt', 'expiresAt', 'id', 'isPasswordProtected', 'permission', 'url'],
    );
    expect(JSON.stringify(link)).not.toContain('scrypt');
    expect(link).not.toHaveProperty('token');
    expect(link).not.toHaveProperty('password_hash');
  });

  it('is not password-protected without a hash, and defaults accessCount to 0', () => {
    const link = toGuestLink(row({ password_hash: null, access_count: null }), 'https://app.test');
    expect(link.isPasswordProtected).toBe(false);
    expect(link.accessCount).toBe(0);
  });

  it('normalizes an unknown permission to edit', () => {
    expect(toGuestLink(row({ permission: 'view' }), 'o').permission).toBe('view');
    expect(toGuestLink(row({ permission: 'comment' }), 'o').permission).toBe('comment');
    expect(toGuestLink(row({ permission: 'banana' }), 'o').permission).toBe('edit');
    expect(toGuestLink(row({ permission: null }), 'o').permission).toBe('edit');
  });
});

describe('PATCH-365 isGuestLinkActive', () => {
  it('null never expires; a future date is active; a past date is not', () => {
    expect(isGuestLinkActive({ expires_at: null }, NOW)).toBe(true);
    expect(isGuestLinkActive({ expires_at: '2026-06-21T00:00:00Z' }, NOW)).toBe(true);
    expect(isGuestLinkActive({ expires_at: '2026-06-01T00:00:00Z' }, NOW)).toBe(false);
  });

  it('an unparseable or missing row is not active', () => {
    expect(isGuestLinkActive({ expires_at: 'not-a-date' }, NOW)).toBe(false);
    expect(isGuestLinkActive(null, NOW)).toBe(false);
  });
});

describe('PATCH-365 guestLinkExpiryLabel', () => {
  it('rounds remaining days up; a partial day reads "within a day"', () => {
    expect(guestLinkExpiryLabel(null, NOW)).toBe('Never expires');
    expect(guestLinkExpiryLabel('not-a-date', NOW)).toBe('Never expires');
    // Exactly 7 days minus 2 seconds -> still "7 days", not 6.
    expect(guestLinkExpiryLabel('2026-06-22T11:59:58Z', NOW)).toBe('Expires in 7 days');
    // 23 hours -> within a day.
    expect(guestLinkExpiryLabel('2026-06-16T11:00:00Z', NOW)).toBe('Expires within a day');
    // 25 hours -> 2 days.
    expect(guestLinkExpiryLabel('2026-06-16T13:00:00Z', NOW)).toBe('Expires in 2 days');
  });
});

describe('PATCH-365 guestLinkPermissionLabel', () => {
  it('names the three permissions', () => {
    expect(guestLinkPermissionLabel('view')).toBe('Can view');
    expect(guestLinkPermissionLabel('comment')).toBe('Can comment');
    expect(guestLinkPermissionLabel('edit')).toBe('Can edit');
  });
});

describe('PATCH-365 GUEST_LINK_EXPIRY_OPTIONS', () => {
  it('is the four options, default 7 days', () => {
    expect(GUEST_LINK_EXPIRY_OPTIONS).toEqual([
      { label: 'Never', days: null },
      { label: '1 day', days: 1 },
      { label: '7 days', days: 7 },
      { label: '30 days', days: 30 },
    ]);
  });
});

describe('PATCH-365 boardShareTargetRequiresAdmin', () => {
  it('only a board-target link needs an admin', () => {
    expect(boardShareTargetRequiresAdmin('board')).toBe(true);
    expect(boardShareTargetRequiresAdmin('post')).toBe(false);
    expect(boardShareTargetRequiresAdmin('post-in-board')).toBe(false);
    expect(boardShareTargetRequiresAdmin(undefined)).toBe(false);
    expect(boardShareTargetRequiresAdmin(null)).toBe(false);
  });
});
