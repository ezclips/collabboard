import { describe, expect, it } from 'vitest';

import type { DrawnElement, DrawnPicture } from './format';
import { preferredAttempt, textElementCount } from './attemptRanking';
import type { DrawnIssue, RepairResult } from './repair';

/**
 * PATCH-283 Addendum 2, fix 3. The auditor round must never replace a picture
 * with one that dropped most of its text; otherwise rank missing labels first,
 * then other issues.
 */

function text(id: string): DrawnElement {
  return { id, type: 'text', text: 'x', x: 0, y: 0, w: 10, size: 14, color: '#111111' };
}

function result(textCount: number, issues: DrawnIssue[]): RepairResult {
  const picture: DrawnPicture = {
    version: 1,
    width: 100,
    height: 100,
    background: '#ffffff',
    elements: Array.from({ length: textCount }, (_, i) => text(`t${i}`)),
  };
  return { picture, fixes: [], issues };
}

const MISSING: DrawnIssue = { type: 'missing-label', message: 'missing' };
const OVERLAP: DrawnIssue = { type: 'overlap', message: 'overlap' };

describe('PATCH-283 addendum 2 fix 3 attemptRanking', () => {
  it('counts text elements', () => {
    expect(textElementCount(result(3, []).picture)).toBe(3);
  });

  it('never picks an attempt with fewer than half the first attempt texts', () => {
    const first = result(10, [MISSING, MISSING, MISSING, MISSING, OVERLAP]);
    const second = result(0, []);
    expect(preferredAttempt(first, second)).toBe(first);
  });

  it('picks the attempt with fewer missing labels', () => {
    const first = result(10, [MISSING, MISSING, OVERLAP, OVERLAP, OVERLAP]);
    const second = result(10, [OVERLAP, OVERLAP, OVERLAP, OVERLAP]);
    expect(preferredAttempt(first, second)).toBe(second);
  });

  it('picks the attempt with fewer other issues when missing labels tie', () => {
    const first = result(10, [MISSING, OVERLAP, OVERLAP]);
    const second = result(10, [MISSING]);
    expect(preferredAttempt(first, second)).toBe(second);
  });

  it('keeps the first attempt on a tie', () => {
    const first = result(10, [MISSING, OVERLAP]);
    const second = result(10, [OVERLAP, MISSING]);
    expect(preferredAttempt(first, second)).toBe(first);
  });
});
