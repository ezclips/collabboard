// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NotePostContextMenu } from '@/components/collabboard/menus/NotePostContextMenu';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH-280. "Visualize…" was removed from Note/Document posts. This pins the
 * removal at the source level and re-checks the menu still works.
 */
const ROOTS = ['app', 'components', 'hooks', 'lib'];
const EXCLUDED_DIRS = new Set(['node_modules', '.next', 'excalidraw_fork']);
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const BANNED = ['Visualize…', 'onVisualize', 'initialVisualize', 'visualizePrompt', 'findVisualizeSpot'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      const dot = entry.lastIndexOf('.');
      const ext = dot === -1 ? '' : entry.slice(dot);
      if (TEXT_EXT.has(ext) && !/\.(test|spec)\.[tj]sx?$/.test(entry)) out.push(full);
    }
  }
  return out;
}

describe('PATCH-280 Visualize removed', () => {
  it('no source file under app/, components/, hooks/ or lib/ mentions the feature', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(resolve(process.cwd(), root))) {
        const source = readFileSync(file, 'utf8');
        for (const token of BANNED) {
          if (source.includes(token)) offenders.push(`${file}: ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 30_000);
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

const padlet = () => ({ id: 'p1', type: 'text', title: 'T', content: '<p>Body</p>', metadata: {} } as unknown as Padlet);

function openMenu(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('[data-testid="trigger"]')!;
  act(() => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  });
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, 'context menu did not open').not.toBeNull();
  return menu!;
}
const labels = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((el) => (el.textContent ?? '').trim());

function render(props: Record<string, unknown> = {}) {
  return mount(
    React.createElement(NotePostContextMenu, {
      padlet: padlet(),
      onSelect: vi.fn(),
      ...props,
      children: React.createElement('div', { 'data-testid': 'trigger' }, 'post'),
    }),
  );
}

describe('PATCH-280 NotePostContextMenu after removal', () => {
  it('still renders "Edit Post"', () => {
    const list = labels(openMenu(render({ onEdit: vi.fn() })));
    expect(list).toContain('Edit Post');
  }, 30_000);

  it('has no "Visualize" item', () => {
    const list = labels(openMenu(render({ onEdit: vi.fn() })));
    expect(list.some((label) => label.includes('Visualize'))).toBe(false);
  }, 30_000);
});
