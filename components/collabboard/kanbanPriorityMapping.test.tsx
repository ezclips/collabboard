// PATCH-321. One priority mapping used by every path: 0/null ↔ None (undefined),
// 1 low, 2 medium, >= 3 high.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }));

import { toDbPriority, fromDbPriority } from '@/lib/kanban/supabaseAdapter';

describe('PATCH-321: the priority mapping', () => {
  it('toDbPriority maps None to 0', () => {
    expect(toDbPriority(undefined)).toBe(0);
    expect(toDbPriority(null)).toBe(0);
    expect(toDbPriority('low')).toBe(1);
    expect(toDbPriority('medium')).toBe(2);
    expect(toDbPriority('high')).toBe(3);
  });

  it('fromDbPriority maps 0/null to None', () => {
    expect(fromDbPriority(0)).toBeUndefined();
    expect(fromDbPriority(null)).toBeUndefined();
    expect(fromDbPriority(undefined)).toBeUndefined();
    expect(fromDbPriority(1)).toBe('low');
    expect(fromDbPriority(2)).toBe('medium');
    expect(fromDbPriority(3)).toBe('high');
    expect(fromDbPriority(5)).toBe('high');
  });
});