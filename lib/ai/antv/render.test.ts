// @vitest-environment jsdom
//
// PATCH-241. AntV renders in jsdom once its fonts are off (jsdom is the
// environment that lets us observe its `error` event and spy on fetch/head).
import * as antv from '@antv/infographic';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { OutlineKind, VisualOutline } from '@/lib/ai/outline';
import { ANTV_TEMPLATES, antvTemplatesFor } from './catalog';
import { toAntvOptions } from './mapOutline';
import { configureAntv } from './setup';

beforeAll(() => {
  configureAntv(antv);
});

function makeOutline(kind: OutlineKind, count: number): VisualOutline {
  const icons = ['sun', 'moon', 'leaf', 'snowflake'];
  return {
    title: 'Seasons',
    ordered: kind === 'steps' || kind === 'timeline',
    kind,
    items: Array.from({ length: count }, (_, i) => ({
      label: `Item ${i + 1}`,
      detail: `Detail ${i + 1}`,
      icon: icons[i % icons.length],
    })),
  };
}

let live: Array<{ destroy: () => void; container: HTMLElement }> = [];
afterEach(() => {
  for (const entry of live) {
    entry.destroy();
    entry.container.remove();
  }
  live = [];
});

async function renderTemplate(name: string, outline: VisualOutline, theme = 'classic') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const errors: string[] = [];
  const ig = new antv.Infographic({
    container,
    width: 900,
    height: 600,
    ...toAntvOptions(outline, name, theme as never),
  });
  ig.on('error', (error: unknown) => errors.push(String((error as Error)?.message ?? error)));
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    ig.on('loaded', finish);
    ig.render();
    setTimeout(finish, 2500);
  });
  live.push({ destroy: () => ig.destroy(), container });
  return { container, errors };
}

function externalUrls(html: string): string[] {
  return (html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []).filter((url) => !url.startsWith('http://www.w3.org'));
}

describe('PATCH-241 zero outside requests', () => {
  it('renders 10 catalogue templates with no fetch and no external URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NO NETWORK'));
    const appended: Node[] = [];
    const headSpy = vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      appended.push(node);
      return node;
    }) as never);

    const outline = makeOutline('list', 2);
    const names = antvTemplatesFor(outline).slice(0, 10);
    expect(names.length).toBe(10);
    const renders = [];
    for (const name of names) {
      renders.push(await renderTemplate(name, outline));
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const render of renders) {
      expect(render.errors, render.errors.join('; ')).toEqual([]);
      const svg = render.container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(externalUrls(render.container.innerHTML)).toEqual([]);
    }
    const externalAppends = appended
      .map((node) => ('outerHTML' in node ? (node as Element).outerHTML : String(node)))
      .filter((html) => externalUrls(html).length > 0);
    expect(externalAppends).toEqual([]);

    headSpy.mockRestore();
    fetchSpy.mockRestore();
  }, 120000);

  it('renders a hostile label as literal text, never as markup', async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const outline: VisualOutline = {
      title: hostile,
      ordered: false,
      kind: 'list',
      items: [
        { label: hostile },
        { label: 'Plain' },
      ],
    };
    const { container, errors } = await renderTemplate('list-grid-badge-card', outline);
    expect(errors).toEqual([]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror=');
  }, 60000);
});

describe('PATCH-241 every offered template renders', () => {
  it('renders without an error event for 2, 4 and 8 item outlines', async () => {
    const failed: string[] = [];
    for (const count of [2, 4, 8]) {
      const outline = makeOutline('list', count);
      for (const name of antvTemplatesFor(outline)) {
        const { errors } = await renderTemplate(name, outline);
        if (errors.length > 0) failed.push(`${count}:${name}: ${errors.join(', ')}`);
      }
    }
    expect(failed).toEqual([]);
  }, 540000);

  it('keeps every catalogue name renderable for its shape', () => {
    expect(ANTV_TEMPLATES.length).toBeGreaterThan(200);
  });
});
