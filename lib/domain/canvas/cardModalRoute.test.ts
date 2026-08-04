import { describe, expect, it } from 'vitest';
import { selectCardModalRoute } from './cardModalRoute';

describe('selectCardModalRoute', () => {
  it('returns editor when canEditWorkspace is true', () => {
    expect(selectCardModalRoute(true)).toBe('editor');
  });

  it('returns viewer when canEditWorkspace is false', () => {
    expect(selectCardModalRoute(false)).toBe('viewer');
  });

  it('is deterministic and side-effect free', () => {
    expect(selectCardModalRoute(true)).toBe(selectCardModalRoute(true));
    expect(selectCardModalRoute(false)).toBe(selectCardModalRoute(false));
  });
});
