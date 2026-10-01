// @vitest-environment jsdom
//
// PATCH-243. Our copy of AntV's `hierarchy-mindmap` keeps each branch on its
// stored side, and is identical to AntV's original when no side is stored.
import * as antv from '@antv/infographic';
import { getStructures } from '@antv/infographic';
import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { ANTV_TEMPLATES } from './catalog';
import { STABLE_MINDMAP_STRUCTURE, toAntvOptions } from './mapOutline';
import { configureAntv } from './setup';

const NAME = 'hierarchy-mindmap-branch-gradient-capsule-item';

function outline(over: Partial<VisualOutline> = {}): VisualOutline {
  return {
    title: 'Root',
    ordered: false,
    kind: 'list',
    items: [
      { label: 'Food' },
      { label: 'Venue' },
      { label: 'Travel' },
    ],
    ...over,
  };
}

async function render(options: object): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ig = new antv.Infographic({
    container,
    width: 1000,
    height: 700,
    ...(options as Record<string, unknown>),
  } as never);
  await new Promise<void>((resolve) => {
    let done = false;
    ig.on('loaded', () => { if (!done) { done = true; resolve(); } });
    ig.on('error', () => { if (!done) { done = true; resolve(); } });
    ig.render();
    setTimeout(() => { if (!done) { done = true; resolve(); } }, 3000);
  });
  return container;
}

/** The x of an item's placement group (the <g> that holds its shape), in SVG units. */
function nodeX(container: HTMLElement, indexes: string): number {
  const label = container.querySelector(
    `[data-indexes="${indexes}"][data-element-type="item-label"]`,
  );
  expect(label, `missing item ${indexes}`).not.toBeNull();
  let element: Element | null = label!.parentElement;
  while (element) {
    const hasShape = Array.from(element.children).some(
      (child) => child.getAttribute('data-element-type') === 'shape',
    );
    if (hasShape) return Number(element.getAttribute('x'));
    element = element.parentElement;
  }
  throw new Error(`no placement group for item ${indexes}`);
}

describe('PATCH-243 stable mind map', () => {
  it('is registered once under stable-hierarchy-mindmap', () => {
    configureAntv(antv);
    configureAntv(antv); // idempotent / StrictMode double-run safe
    expect(getStructures().filter((name) => name === STABLE_MINDMAP_STRUCTURE)).toHaveLength(1);
  });

  it('puts every branch on its stored side (left x < root x < right x)', async () => {
    const c = await render(
      toAntvOptions(
        outline({
          items: [
            { label: 'Food', side: 'right' },
            { label: 'Venue', side: 'left' },
            { label: 'Travel', side: 'right' },
          ],
        }),
        NAME,
        'classic' as never,
      ),
    );
    const root = nodeX(c, '0');
    expect(nodeX(c, '0,0')).toBeGreaterThan(root);
    expect(nodeX(c, '0,1')).toBeLessThan(root);
    expect(nodeX(c, '0,2')).toBeGreaterThan(root);
  });

  it('matches AntV\u2019s original layout when no side is stored', async () => {
    const original = toAntvOptions(outline(), NAME, 'classic' as never);
    delete original.design;
    const c = await render(original);
    const root = nodeX(c, '0');
    // AntV's rule: even rank -> left, odd rank -> right.
    expect(nodeX(c, '0,0')).toBeLessThan(root);
    expect(nodeX(c, '0,1')).toBeGreaterThan(root);
    expect(nodeX(c, '0,2')).toBeLessThan(root);
  });

  it('renders the identical SVG to AntV\u2019s own structure for every mind-map template', async () => {
    const names = ANTV_TEMPLATES.map((info) => info.name).filter((name) =>
      name.startsWith('hierarchy-mindmap-'),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const original = toAntvOptions(outline(), name, 'classic' as never);
      delete original.design;
      const a = await render(original);
      const b = await render(toAntvOptions(outline(), name, 'classic' as never));
      expect(b.innerHTML, name).toBe(a.innerHTML);
    }
  });
});
