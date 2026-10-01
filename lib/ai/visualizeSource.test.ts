import { describe, expect, it } from 'vitest';

import type { Padlet } from '@/types/collabboard';
import { visualizeSourceText } from './visualizeSource';

const post = (title: string, content: string, type: Padlet['type'] = 'text') => ({ title, content, type });

describe('PATCH-235 visualizeSourceText', () => {
  it('converts an HTML note to plain text with line breaks', () => {
    expect(visualizeSourceText(post('', '<p>Alpha</p><p>Beta</p>'))).toBe('Alpha\nBeta');
    expect(visualizeSourceText(post('', 'Line<br/>Break'))).toBe('Line\nBreak');
  });

  it('decodes the common entities', () => {
    expect(visualizeSourceText(post('', '<p>Tom &amp; Jerry &lt;3 &quot;ok&quot;</p>')))
      .toBe('Tom & Jerry <3 "ok"');
    expect(visualizeSourceText(post('', '<p>a&nbsp;b</p>'))).toBe('a b');
  });

  it('prefixes a meaningful title and drops a placeholder one', () => {
    expect(visualizeSourceText(post('Water cycle', '<p>Body text</p>'))).toBe('Water cycle\n\nBody text');
    expect(visualizeSourceText(post('Untitled', '<p>Body text</p>'))).toBe('Body text');
  });

  it('drops the shared "New Note" placeholder (PATCH-235 Addendum 2)', () => {
    expect(visualizeSourceText(post('New Note', '<p>Only the body</p>'))).toBe('Only the body');
    expect(visualizeSourceText(post('New Post', '<p>Only the body</p>'))).toBe('Only the body');
    // A real title still comes through.
    expect(visualizeSourceText(post('Water cycle', '<p>Body</p>'))).toContain('Water cycle');
  });

  it('trims to 4000 characters at a word boundary', () => {
    const content = 'lorem '.repeat(1000); // 6000 chars
    const out = visualizeSourceText(post('', content));
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.endsWith('lorem')).toBe(true);
    expect(out.endsWith('lore')).toBe(false);
  });

  it('empty or short content is under the 20-char rule', () => {
    expect(visualizeSourceText(post('', '')).length).toBe(0);
    expect(visualizeSourceText(post('', '<p>short</p>')).length).toBeLessThan(20);
  });
});
