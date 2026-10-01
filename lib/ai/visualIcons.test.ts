import { describe, expect, it } from 'vitest';

import { VISUAL_ICON_NAMES, isVisualIconName } from './visualIcons';

describe('PATCH-237 visualIcons', () => {
  it('lists a fixed set of kebab-case names', () => {
    expect(VISUAL_ICON_NAMES.length).toBeGreaterThan(50);
    for (const name of VISUAL_ICON_NAMES) {
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    // No duplicates.
    expect(new Set(VISUAL_ICON_NAMES).size).toBe(VISUAL_ICON_NAMES.length);
  });

  it('recognises listed names and rejects others', () => {
    expect(isVisualIconName('sun')).toBe(true);
    expect(isVisualIconName('snowflake')).toBe(true);
    expect(isVisualIconName('not-a-real-icon')).toBe(false);
    expect(isVisualIconName(7)).toBe(false);
  });
});
