import { describe, expect, it } from 'vitest';

import {
  PENDING_LABEL,
  approvedMetadata,
  guestPostsWaitingLabel,
  isPendingApproval,
  pendingCount,
} from './postApproval';

describe('PATCH-367 postApproval', () => {
  describe('isPendingApproval', () => {
    it('is true only for exactly true', () => {
      expect(isPendingApproval({ pendingApproval: true })).toBe(true);
      expect(isPendingApproval({ pendingApproval: false })).toBe(false);
      expect(isPendingApproval({ pendingApproval: 'true' })).toBe(false);
      expect(isPendingApproval({})).toBe(false);
      expect(isPendingApproval(null)).toBe(false);
      expect(isPendingApproval(undefined)).toBe(false);
      expect(isPendingApproval('nope')).toBe(false);
    });
  });

  describe('approvedMetadata', () => {
    it('removes the key and keeps every other field', () => {
      const input = { pendingApproval: true, createdBy: 'u1', topStrip: 'red' };
      expect(approvedMetadata(input)).toEqual({ createdBy: 'u1', topStrip: 'red' });
    });

    it('never mutates the input (returns a new object)', () => {
      const input = { pendingApproval: true, createdBy: 'u1' };
      const next = approvedMetadata(input);
      expect(next).not.toBe(input);
      expect(input).toEqual({ pendingApproval: true, createdBy: 'u1' });
    });

    it('tolerates null / undefined', () => {
      expect(approvedMetadata(null)).toEqual({});
      expect(approvedMetadata(undefined)).toEqual({});
    });

    it('is a no-op for a post that was never pending', () => {
      expect(approvedMetadata({ createdBy: 'u1' })).toEqual({ createdBy: 'u1' });
    });
  });

  describe('pendingCount', () => {
    it('counts only pending posts', () => {
      expect(pendingCount([
        { metadata: { pendingApproval: true } },
        { metadata: {} },
        { metadata: { pendingApproval: true } },
        {},
      ])).toBe(2);
    });

    it('is 0 for none', () => {
      expect(pendingCount([])).toBe(0);
      expect(pendingCount([{ metadata: { createdBy: 'u1' } }])).toBe(0);
    });
  });

  it('exposes the label constants', () => {
    expect(PENDING_LABEL).toBe('Waiting for approval');
    expect(guestPostsWaitingLabel(1)).toBe('1 guest post waiting');
    expect(guestPostsWaitingLabel(3)).toBe('3 guest posts waiting');
  });
});
