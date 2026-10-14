import { describe, expect, it } from 'vitest';

import {
  FROZEN_BANNER_OWNER,
  FROZEN_BANNER_VISITOR,
  isBoardFrozen,
  mayEditFrozenBoard,
} from './boardFreeze';

describe('PATCH-366 isBoardFrozen', () => {
  it('is true only for a set frozen_at', () => {
    expect(isBoardFrozen({ frozen_at: '2026-06-15T12:00:00Z' })).toBe(true);
    expect(isBoardFrozen({ frozen_at: null })).toBe(false);
    expect(isBoardFrozen({})).toBe(false);
    expect(isBoardFrozen({ frozen_at: '' })).toBe(false);
    expect(isBoardFrozen(null)).toBe(false);
    expect(isBoardFrozen(undefined)).toBe(false);
  });
});

describe('PATCH-366 mayEditFrozenBoard', () => {
  it('open boards are editable by anyone the other guards allow', () => {
    expect(mayEditFrozenBoard({ frozen: false, isOwnerOrAdmin: false })).toBe(true);
    expect(mayEditFrozenBoard({ frozen: false, isOwnerOrAdmin: true })).toBe(true);
  });

  it('frozen boards are editable by the owner/admin only', () => {
    expect(mayEditFrozenBoard({ frozen: true, isOwnerOrAdmin: true })).toBe(true);
    expect(mayEditFrozenBoard({ frozen: true, isOwnerOrAdmin: false })).toBe(false);
  });
});

describe('PATCH-366 banner text', () => {
  it('is the exact copy', () => {
    expect(FROZEN_BANNER_VISITOR).toBe('This board is frozen. You can look, but not change anything.');
    expect(FROZEN_BANNER_OWNER).toBe('Board frozen. Only you can change it.');
  });
});
