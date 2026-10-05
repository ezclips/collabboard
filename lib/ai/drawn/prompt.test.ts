import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

const h = vi.hoisted(() => ({
  examples: {} as Record<string, Array<{ template: string; outline: unknown; picture: unknown }>>,
}));

vi.mock('./examples.data', () => ({
  DRAWN_EXAMPLES: new Proxy({}, { get: (_target, key: string) => h.examples[key] ?? [] }),
  DRAWN_EXAMPLE_TEMPLATES: {},
}));

import { buildDrawPrompt, kindForOutline } from './prompt';

function outline(kind: VisualOutline['kind'], values?: (number | undefined)[]): VisualOutline {
  return {
    title: 'T',
    ordered: false,
    kind,
    items: (values ?? [1, 2]).map((value, index) => ({
      label: `Item ${index + 1}`,
      ...(value !== undefined ? { value } : {}),
    })),
  };
}

describe('PATCH-283 kindForOutline', () => {
  it('maps each outline kind to a drawn kind', () => {
    expect(kindForOutline(outline('steps'))).toBe('flowchart');
    expect(kindForOutline(outline('cycle'))).toBe('flowchart');
    expect(kindForOutline(outline('cause_effect'))).toBe('flowchart');
    expect(kindForOutline(outline('timeline'))).toBe('timeline');
    expect(kindForOutline(outline('comparison'))).toBe('comparison');
    expect(kindForOutline(outline('levels'))).toBe('mindmap');
    expect(kindForOutline(outline('parts', [undefined, undefined]))).toBe('mindmap');
    expect(kindForOutline(outline('parts', [10, 20]))).toBe('pie');
    expect(kindForOutline(outline('list', [10, 20]))).toBe('pie');
    expect(kindForOutline(outline('list', [undefined, undefined]))).toBe('flowchart');
  });
});

describe('PATCH-283 buildDrawPrompt', () => {
  beforeEach(() => {
    h.examples = {};
  });

  it('gives three different variant sentences and palettes for seeds 0, 1 and 2', () => {
    const base = { outline: outline('parts', [10, 20]), kind: 'pie' as const, examples: false };
    const users = [0, 1, 2].map((seed) => buildDrawPrompt({ ...base, seed }).user);
    expect(new Set(users).size).toBe(3);
  });

  it('works with zero examples', () => {
    const { user } = buildDrawPrompt({ outline: outline('parts'), kind: 'bar', seed: 0, examples: true });
    expect(user).not.toContain('An example of the STYLE');
    expect(user.length).toBeGreaterThan(0);
  });

  it('includes exactly one example when the pool has entries', () => {
    const example = (template: string) => ({
      template,
      outline: outline('parts'),
      picture: { version: 1, width: 10, height: 10, background: '#ffffff', elements: [] },
    });
    h.examples = { pie: [example('pie-a'), example('pie-b')] };
    const { user } = buildDrawPrompt({ outline: outline('parts'), kind: 'pie', seed: 0, examples: true });
    const included = ['pie-a', 'pie-b'].filter((template) => user.includes(template));
    expect(included).toHaveLength(1);
    expect(user).toContain('you must use wedge/bar');
  });

  it('omits the example when examples is false', () => {
    h.examples = {
      pie: [{ template: 'pie-a', outline: outline('parts'), picture: { version: 1, width: 10, height: 10, background: '#ffffff', elements: [] } }],
    };
    const { user } = buildDrawPrompt({ outline: outline('parts'), kind: 'pie', seed: 0, examples: false });
    expect(user).not.toContain('pie-a');
  });
});

describe('PATCH-283 addendum 2 fix 2a and 7 prompt', () => {
  it('gives the pie the real slice angles', () => {
    const { user } = buildDrawPrompt({ outline: outline('parts', [10, 20]), kind: 'pie', seed: 0, examples: false });
    expect(user).toContain("0° = 12 o'clock");
    expect(user).toContain('120.0');
    expect(user).toContain('360.0');
  });

  it('gives the bar the real length fractions', () => {
    const { user } = buildDrawPrompt({ outline: outline('parts', [10, 20]), kind: 'bar', seed: 0, examples: false });
    expect(user).toContain('fraction of the longest');
    expect(user).toContain('1.00');
    expect(user).toContain('0.50');
  });

  it('lists the allowed icon names', () => {
    const { system } = buildDrawPrompt({ outline: outline('parts'), kind: 'pie', seed: 0, examples: false });
    expect(system).toContain('sprout');
    expect(system).toContain('Allowed icons');
  });

  it('gives card fills and label text colours, not only accents', () => {
    const { user } = buildDrawPrompt({ outline: outline('parts'), kind: 'pie', seed: 0, examples: false });
    expect(user).toContain('card fills');
    expect(user).toContain('label text');
  });

  it('tells the model texts stack inside one card, label first', () => {
    const { system } = buildDrawPrompt({ outline: outline('parts'), kind: 'pie', seed: 0, examples: false });
    expect(system).toContain('stacked');
    expect(system.toLowerCase()).toContain('label first');
  });
});
