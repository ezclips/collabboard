import { describe, expect, it } from 'vitest';

import type { MindmapTree } from './mindmapLayout';
import { mindmapCodeFromTree } from './outlineToVisuals';
import { parseMindmapCode } from './mermaidMindmapParse';

describe('PATCH-239 parseMindmapCode', () => {
  const tree: MindmapTree = {
    label: 'Water cycle',
    children: [
      { label: 'Evaporation', children: [{ label: 'Oceans' }, { label: 'Lakes' }] },
      { label: 'Condensation' },
    ],
  };

  it('round-trips our generated code', () => {
    expect(parseMindmapCode(mindmapCodeFromTree(tree))).toEqual(tree);
  });

  it('unwraps every shape and surrounding quotes, and drops ids', () => {
    const code = [
      'mindmap',
      '  root((Seasons))',
      '    a[Spring]',
      '      a1("Warm days")',
      '    b{Winter}',
      '    c{{Autumn}}',
      '    d))Summer((',
      '    e(June)',
    ].join('\n');
    expect(parseMindmapCode(code)).toEqual({
      label: 'Seasons',
      children: [
        { label: 'Spring', children: [{ label: 'Warm days' }] },
        { label: 'Winter' },
        { label: 'Autumn' },
        { label: 'Summer' },
        { label: 'June' },
      ],
    });
  });

  it('ignores ::icon(...) and :::class lines', () => {
    const code = [
      'mindmap',
      '  root((Seasons))',
      '    a[Spring]',
      '      ::icon(fa fa-sun)',
      '      :::highlight',
      '    b[Winter]',
    ].join('\n');
    expect(parseMindmapCode(code)).toEqual({
      label: 'Seasons',
      children: [{ label: 'Spring' }, { label: 'Winter' }],
    });
  });

  it('folds deeper than three levels into the leaf level', () => {
    const code = ['mindmap', '  root((Root))', '    a[Branch]', '      a1[Leaf]', '        deep[Too deep]'].join('\n');
    expect(parseMindmapCode(code)).toEqual({
      label: 'Root',
      children: [{ label: 'Branch', children: [{ label: 'Leaf' }, { label: 'Too deep' }] }],
    });
  });

  it('returns null for junk', () => {
    expect(parseMindmapCode('flowchart LR\n  A --> B')).toBeNull();
    expect(parseMindmapCode('')).toBeNull();
    expect(parseMindmapCode('mindmap')).toBeNull();
  });
});
