// @vitest-environment jsdom
//
// PATCH 6B — the CollabBoard presentation of Excalidraw's own context menu.
//
// Two kinds of proof live here:
//
//   1. BEHAVIOR: the adapter is mounted for real and driven through the shared
//      positioned-menu primitives, so mapping, positioning, dismissal and
//      execution are exercised rather than asserted about.
//   2. SOURCE: a small number of guards that pin properties which cannot be
//      observed from a single render — above all that the adapter never branches
//      on an action's label, which is what keeps CollabBoard from quietly
//      becoming a second implementation of Excalidraw's actions.
//
// Excalidraw's own menu FUNCTION is not tested here. It is tested where it
// lives, by the fork's packages/excalidraw/tests/contextmenu.test.tsx (26 tests,
// repaired in 6A.1), which 6B leaves green and unmodified.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExcalidrawCollabBoardContextMenu from './menus/ExcalidrawCollabBoardContextMenu';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ADAPTER = 'components/collabboard/menus/ExcalidrawCollabBoardContextMenu.tsx';
const WRAPPER = 'components/collabboard/editors/ExcalidrawWrapper.tsx';
const DRAWING_LAYOUT = 'components/collabboard/canvas/layouts/DrawingLayout.tsx';

function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

/**
 * Source with comments removed.
 *
 * The guards below assert on what the adapter *does*, and its doc block
 * legitimately discusses the very things the code must not do ("must never
 * branch on item.label", "shortcut hints are absent"). Explaining a prohibition
 * is not violating it, so the guards read code only.
 */
function codeOf(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

function mount(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

/** The portaled menu surface. */
function surface(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-slot="positioned-context-menu-content"]'
  );
  expect(el, 'menu surface is not rendered').toBeTruthy();
  return el!;
}

function rows(): HTMLElement[] {
  return Array.from(surface().querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function labels(): string[] {
  return rows().map((row) => row.textContent?.trim() ?? '');
}

function rowFor(text: string): HTMLElement {
  const match = rows().find((row) => row.textContent?.includes(text));
  expect(match, `no row containing "${text}"`).toBeTruthy();
  return match!;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** jsdom reports zero box metrics; pin them so clamping is measurable. */
function withMenuBox(width: number, height: number, run: () => void) {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
  try { run(); } finally {
    if (w) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', w);
    else delete (HTMLElement.prototype as any).offsetWidth;
    if (h) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', h);
    else delete (HTMLElement.prototype as any).offsetHeight;
  }
}

type Item = {
  type: 'item';
  key: string;
  label: string;
  checked: boolean;
  dangerous: boolean;
  onSelect: () => void;
};

function item(label: string, overrides: Partial<Omit<Item, 'type' | 'label'>> = {}): Item {
  return {
    type: 'item',
    key: `${label}-${overrides.key ?? '0'}`,
    label,
    checked: false,
    dangerous: false,
    onSelect: vi.fn(),
    ...overrides,
  };
}

const separator = (key = 'sep-1') => ({ type: 'separator' as const, key });

/** Mirrors a real Excalidraw canvas menu: items, a separator, a toggle. */
function defaultItems() {
  return [
    item('Paste'),
    item('Select all'),
    separator(),
    item('Toggle grid', { checked: true }),
    item('Snap to objects'),
    separator('sep-2'),
    item('Delete', { dangerous: true }),
  ];
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof ExcalidrawCollabBoardContextMenu>> = {}) {
  const props = {
    x: 120,
    y: 80,
    items: defaultItems(),
    onClose: vi.fn(),
    ...overrides,
  };
  mount(<ExcalidrawCollabBoardContextMenu {...(props as any)} />);
  return props;
}

// ─────────────────────────────────────────────────────────────────────────
// Descriptor → shared primitive mapping
// ─────────────────────────────────────────────────────────────────────────
describe('ExcalidrawCollabBoardContextMenu — descriptor mapping', () => {
  it('renders ordinary descriptors as shared positioned items', () => {
    renderMenu();
    const paste = rowFor('Paste');
    expect(paste.getAttribute('data-slot')).toBe('context-menu-item');
    expect(paste.getAttribute('data-positioned-menu-row')).toBe('true');
    expect(paste.getAttribute('data-variant')).toBe('default');
  });

  it('renders separator descriptors as shared separators', () => {
    renderMenu();
    const separators = surface().querySelectorAll('[data-slot="context-menu-separator"]');
    expect(separators.length).toBe(2);
  });

  it('keeps separators at their descriptor positions', () => {
    renderMenu();
    // Walk the surface's children so items and separators share one ordering.
    const kinds = Array.from(surface().children).map((child) =>
      child.getAttribute('data-slot') === 'context-menu-separator' ? 'separator' : 'item'
    );
    expect(kinds).toEqual([
      'item', 'item', 'separator', 'item', 'item', 'separator', 'item',
    ]);
  });

  it('preserves Excalidraw descriptor order exactly', () => {
    renderMenu();
    expect(labels()).toEqual([
      'Paste', 'Select all', 'Toggle grid', 'Snap to objects', 'Delete',
    ]);
  });

  it('maps dangerous=true onto the shared destructive variant', () => {
    renderMenu();
    expect(rowFor('Delete').getAttribute('data-variant')).toBe('destructive');
  });

  it('does not mark dangerous=false items destructive', () => {
    renderMenu();
    for (const label of ['Paste', 'Select all', 'Toggle grid', 'Snap to objects']) {
      expect(rowFor(label).getAttribute('data-variant')).toBe('default');
    }
    expect(surface().querySelectorAll('[data-variant="destructive"]').length).toBe(1);
  });

  it('shows a checked indicator for checked=true', () => {
    renderMenu();
    expect(
      rowFor('Toggle grid').querySelector('[data-slot="excalidraw-menu-checked"]')
    ).not.toBeNull();
  });

  it('shows no checked indicator for checked=false', () => {
    renderMenu();
    expect(
      rowFor('Snap to objects').querySelector('[data-slot="excalidraw-menu-checked"]')
    ).toBeNull();
    expect(surface().querySelectorAll('[data-slot="excalidraw-menu-checked"]').length).toBe(1);
  });

  it('does not own checked state — it follows the descriptor on re-render', () => {
    const items = defaultItems();
    const onClose = vi.fn();
    mount(<ExcalidrawCollabBoardContextMenu x={10} y={10} items={items as any} onClose={onClose} />);
    expect(rowFor('Toggle grid').querySelector('[data-slot="excalidraw-menu-checked"]')).not.toBeNull();

    // Excalidraw is the state owner: flip its descriptor, and the row follows.
    const flipped = defaultItems().map((entry) =>
      entry.type === 'item' && entry.label === 'Toggle grid'
        ? { ...entry, checked: false }
        : entry
    );
    act(() => {
      root!.render(
        <ExcalidrawCollabBoardContextMenu x={10} y={10} items={flipped as any} onClose={onClose} />
      );
    });
    expect(rowFor('Toggle grid').querySelector('[data-slot="excalidraw-menu-checked"]')).toBeNull();
  });

  it('never toggles checked state locally when a checked row is clicked', () => {
    const items = defaultItems();
    mount(<ExcalidrawCollabBoardContextMenu x={10} y={10} items={items as any} onClose={vi.fn()} />);
    const toggle = items.find((i) => i.type === 'item' && i.label === 'Toggle grid') as Item;
    click(rowFor('Toggle grid'));
    // The descriptor was invoked; CollabBoard stored nothing of its own.
    expect(toggle.onSelect).toHaveBeenCalledTimes(1);
    expect(toggle.checked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Execution and dismissal lifecycle
// ─────────────────────────────────────────────────────────────────────────
describe('ExcalidrawCollabBoardContextMenu — lifecycle', () => {
  it('invokes the descriptor onSelect exactly once per activation', () => {
    const items = defaultItems();
    mount(<ExcalidrawCollabBoardContextMenu x={10} y={10} items={items as any} onClose={vi.fn()} />);
    const paste = items.find((i) => i.type === 'item' && i.label === 'Paste') as Item;
    click(rowFor('Paste'));
    expect(paste.onSelect).toHaveBeenCalledTimes(1);
    expect(paste.onSelect).toHaveBeenCalledWith();
  });

  it('activates only the clicked descriptor', () => {
    const items = defaultItems();
    mount(<ExcalidrawCollabBoardContextMenu x={10} y={10} items={items as any} onClose={vi.fn()} />);
    click(rowFor('Delete'));
    for (const entry of items) {
      if (entry.type !== 'item') continue;
      expect(entry.onSelect).toHaveBeenCalledTimes(entry.label === 'Delete' ? 1 : 0);
    }
  });

  it('routes the shared dismissal lifecycle to the descriptor onClose', () => {
    const props = renderMenu();
    click(rowFor('Paste'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('invokes onClose on Escape', () => {
    const props = renderMenu();
    act(() => {
      surface().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('invokes onClose on an outside pointer-down', async () => {
    const props = renderMenu();
    // The shared menu defers its outside listener by a macrotask so the very
    // right-click that opened it cannot immediately dismiss it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
      );
    });
    expect(props.onClose).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Position, stacking and surface
// ─────────────────────────────────────────────────────────────────────────
describe('ExcalidrawCollabBoardContextMenu — placement', () => {
  it('passes Excalidraw viewport coordinates through unchanged', () => {
    withMenuBox(200, 240, () => {
      renderMenu({ x: 120, y: 80 });
      expect(surface().style.left).toBe('120px');
      expect(surface().style.top).toBe('80px');
    });
  });

  it('clamps at the right viewport edge', () => {
    withMenuBox(200, 240, () => {
      renderMenu({ x: window.innerWidth - 10, y: 60 });
      const left = Number(surface().style.left.replace('px', ''));
      expect(left).toBe(window.innerWidth - 200 - 8);
      expect(left + 200).toBeLessThanOrEqual(window.innerWidth);
      expect(surface().style.top).toBe('60px');
    });
  });

  it('clamps at the bottom viewport edge', () => {
    withMenuBox(200, 240, () => {
      renderMenu({ x: 40, y: window.innerHeight - 10 });
      const top = Number(surface().style.top.replace('px', ''));
      expect(top).toBe(window.innerHeight - 240 - 8);
      expect(top + 240).toBeLessThanOrEqual(window.innerHeight);
      expect(surface().style.left).toBe('40px');
    });
  });

  it('clamps at the bottom-right corner on both axes at once', () => {
    withMenuBox(200, 240, () => {
      renderMenu({ x: window.innerWidth + 500, y: window.innerHeight + 500 });
      const left = Number(surface().style.left.replace('px', ''));
      const top = Number(surface().style.top.replace('px', ''));
      expect(left).toBe(window.innerWidth - 200 - 8);
      expect(top).toBe(window.innerHeight - 240 - 8);
      expect(left + 200).toBeLessThanOrEqual(window.innerWidth);
      expect(top + 240).toBeLessThanOrEqual(window.innerHeight);
    });
  });

  it('stacks above the Excalidraw drawing surface and portals to the body', () => {
    renderMenu();
    expect(surface().className).toContain('z-[9999]');
    // Portaled out of the Excalidraw subtree, so canvas stacking cannot trap it.
    expect(surface().closest('[data-slot="positioned-context-menu-content"]')).toBe(surface());
    expect(host!.contains(surface())).toBe(false);
    expect(document.body.contains(surface())).toBe(true);
  });

  it('uses the standard CollabBoard menu surface, not a bespoke Excalidraw style', () => {
    renderMenu();
    // Same surface vocabulary the other migrated CollabBoard menus render with.
    expect(surface().className).toContain('bg-gray-50');
    expect(surface().className).toContain('rounded-lg');
    expect(surface().className).toContain('border-gray-200');
    expect(surface().getAttribute('role')).toBe('menu');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Shortcut-hint rule (PATCH 4H, applied to the Drawing canvas)
// ─────────────────────────────────────────────────────────────────────────
describe('ExcalidrawCollabBoardContextMenu — no shortcut hints', () => {
  it('renders no kbd element', () => {
    renderMenu();
    expect(surface().querySelector('kbd')).toBeNull();
  });

  it('renders no shortcut slot', () => {
    renderMenu();
    expect(surface().querySelector('[data-slot="context-menu-shortcut"]')).toBeNull();
  });

  it('renders no visible shortcut-like text', () => {
    renderMenu();
    const text = surface().textContent ?? '';
    expect(text).not.toMatch(/Ctrl\s*\+|Cmd\s*\+|⌘|Alt\s*\+|Shift\s*\+|\bDel\b/i);
  });

  it('uses no shortcut primitive and no shortcut markup in source', () => {
    const code = codeOf(ADAPTER);
    expect(code).not.toContain('ContextMenuShortcut');
    expect(code).not.toContain('<kbd');
    expect(code.toLowerCase()).not.toContain('shortcut');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Functional boundary — the adapter must stay generic
// ─────────────────────────────────────────────────────────────────────────
describe('ExcalidrawCollabBoardContextMenu — functional boundary', () => {
  it('never branches on an action label', () => {
    const code = codeOf(ADAPTER);
    // Any comparison, membership test or switch involving the label is a step
    // toward reimplementing Excalidraw's actions inside CollabBoard.
    expect(code).not.toMatch(/label\s*(===|!==|==|!=)/);
    expect(code).not.toMatch(/(===|!==|==|!=)\s*\w*\.?label\b/);
    expect(code).not.toMatch(/label\s*\.\s*(includes|startsWith|endsWith|match|indexOf|test)\s*\(/);
    expect(code).not.toMatch(/switch\s*\(\s*\w*\.?label/);
  });

  it('compares against no string literal other than the descriptor type', () => {
    const code = codeOf(ADAPTER);
    // Every equality test in the adapter, so a new label/name comparison cannot
    // be added without this failing.
    const comparisons = code.match(/[^=!]==[=]?\s*["'`][^"'`]*["'`]/g) ?? [];
    expect(comparisons.map((c) => c.trim())).toEqual(['=== "separator"']);
  });

  it('names no Excalidraw action in its own logic', () => {
    const code = codeOf(ADAPTER);
    const forbidden = [
      'Delete', 'Copy', 'Paste', 'Duplicate', 'Cut', 'Group', 'Ungroup',
      'deleteSelectedElements', 'copyStyles', 'pasteStyles', 'duplicateSelection',
    ];
    for (const name of forbidden) {
      expect(code, `adapter logic must not mention "${name}"`).not.toContain(name);
    }
  });

  it('branches only on presentation metadata', () => {
    const source = read(ADAPTER);
    expect(source).toContain("item.type === \"separator\"");
    expect(source).toContain('item.dangerous');
    expect(source).toContain('item.checked');
  });

  it('holds no local state of its own', () => {
    const source = read(ADAPTER);
    expect(source).not.toContain('useState');
    expect(source).not.toContain('useReducer');
    expect(source).not.toContain('useRef');
  });

  it('implements no action behavior — it only forwards onSelect', () => {
    const source = read(ADAPTER);
    // The single call to the descriptor's callback, and nothing built around it.
    expect((source.match(/item\.onSelect\(\)/g) ?? []).length).toBe(1);
    expect(source).not.toContain('executeAction');
    expect(source).not.toContain('actionManager');
  });

  it('applies no coordinate math of its own', () => {
    const source = read(ADAPTER);
    const jsx = source.slice(source.indexOf('<PositionedContextMenu'));
    expect(jsx).toContain('x={x}');
    expect(jsx).toContain('y={y}');
    expect(jsx).not.toMatch(/x=\{[^}]*[-+*][^}]*\}/);
    expect(jsx).not.toMatch(/y=\{[^}]*[-+*][^}]*\}/);
    expect(source).not.toContain('getBoundingClientRect');
    expect(source).not.toContain('innerWidth');
    expect(source).not.toContain('innerHeight');
  });

  it('imports the shared menu only through its public barrel', () => {
    const source = read(ADAPTER);
    expect(source).toContain('from "@/components/ui/context-menu"');
    expect(source).not.toContain('positioned-context-menu');
    expect(source).not.toContain('context-menu-styles');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Production activation
// ─────────────────────────────────────────────────────────────────────────
describe('Excalidraw CollabBoard menu — production activation', () => {
  it('the Drawing canvas opts in', () => {
    expect(read(DRAWING_LAYOUT)).toContain('useCollabBoardContextMenu');
  });

  it('the wrapper forwards the renderer to the public Excalidraw component', () => {
    const source = read(WRAPPER);
    expect(source).toContain('customContextMenuRenderer={');
    // Gated on the opt-in, and rendered by the shared adapter.
    expect(source).toContain('useCollabBoardContextMenu ? renderCollabBoardContextMenu : undefined');
    expect(source).toContain('<ExcalidrawCollabBoardContextMenu');
    // The prop sits on the public <Excalidraw> element, not some inner surface.
    const element = source.slice(source.indexOf('<Excalidraw'), source.indexOf('</Excalidraw>'));
    expect(element).toContain('customContextMenuRenderer=');
  });

  it('defaults to off, so sharing the wrapper is not an opt-in', () => {
    const source = read(WRAPPER);
    expect(source).toContain('useCollabBoardContextMenu = false');
    expect(source).toMatch(/useCollabBoardContextMenu\?:\s*boolean/);
  });

  it('the drawing-post editor opts in too', () => {
    // PATCH 6C. Both real Drawing surfaces now share one menu appearance; the
    // editor opts in through the same wrapper prop, never through Excalidraw's.
    const source = read('components/collabboard/editors/DrawingEditor.tsx');
    expect(source).toContain('useCollabBoardContextMenu');
    expect(source).not.toContain('customContextMenuRenderer');
  });

  it('opting in is the surface\'s only involvement — it implements no menu logic', () => {
    for (const relative of [
      'components/collabboard/editors/DrawingEditor.tsx',
      'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    ]) {
      const source = read(relative);
      // No renderer, no adapter, no descriptor handling: the wrapper owns all of it.
      expect(source, `${relative} must not render the adapter`)
        .not.toContain('ExcalidrawCollabBoardContextMenu');
      for (const token of ['item.onSelect', 'item.dangerous', 'item.checked', 'ResolvedContextMenuItem']) {
        expect(source, `${relative} must not handle menu descriptors (${token})`)
          .not.toContain(token);
      }
    }
  });

  it('non-Drawing Excalidraw consumers still do not opt in', () => {
    const others = [
      'components/collabboard/canvas/layouts/CustomMermaidModal.tsx',
      'components/presentation/slide-renderer/renderExcalidrawSlideBase.ts',
    ];
    for (const relative of others) {
      const source = read(relative);
      expect(source, `${relative} must not opt in`).not.toContain('useCollabBoardContextMenu');
      expect(source, `${relative} must not pass the renderer`)
        .not.toContain('customContextMenuRenderer');
    }
  });

  it('the wrapper stays opt-in, so sharing it never activates the menu implicitly', () => {
    const wrapper = read('components/collabboard/editors/ExcalidrawWrapper.tsx');
    expect(wrapper).toContain('useCollabBoardContextMenu = false');
    // Still exactly one activation seam, and still the shared adapter behind it.
    expect((wrapper.match(/customContextMenuRenderer/g) ?? [])).toHaveLength(1);
    expect(wrapper).toContain('<ExcalidrawCollabBoardContextMenu');
  });

  it('neither Drawing surface introduces shortcut-hint markup', () => {
    for (const relative of [
      'components/collabboard/editors/DrawingEditor.tsx',
      'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    ]) {
      const source = read(relative);
      expect(source, `${relative} must not add a shortcut slot`)
        .not.toContain('ContextMenuShortcut');
    }
  });

  it('leaves the shared menu foundation and the drawing card menu unaware of it', () => {
    // 6B consumes these; it never edits them. The dependency runs one way, so
    // none of them may reference the adapter or Excalidraw's renderer hook.
    for (const relative of [
      'components/ui/context-menu.tsx',
      'components/ui/positioned-context-menu.tsx',
      'components/ui/positioned-context-menu-submenu.tsx',
      'components/ui/context-menu-styles.tsx',
      'components/collabboard/canvas/ui/CanvasContextMenu.tsx',
    ]) {
      const source = read(relative);
      expect(source, `${relative} must not reference the adapter`)
        .not.toContain('ExcalidrawCollabBoardContextMenu');
      expect(source, `${relative} must not reference the renderer hook`)
        .not.toContain('customContextMenuRenderer');
      expect(source, `${relative} must not import from collabboard`)
        .not.toContain('@/components/collabboard');
    }
  });
});
