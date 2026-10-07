import { describe, expect, it } from 'vitest';
import { containerBadgeColors } from './containerBadgeColors';

describe('containerBadgeColors', () => {
  it('gives dark text and a dark tint on a light background', () => {
    expect(containerBadgeColors('#f8fafc')).toEqual({
      textColor: '#0f172a',
      badgeBg: 'rgba(15,23,42,0.08)',
    });
  });

  it('gives light text and a light tint on a dark background', () => {
    expect(containerBadgeColors('#2563eb')).toEqual({
      textColor: '#f8fafc',
      badgeBg: 'rgba(255,255,255,0.22)',
    });
  });
});
