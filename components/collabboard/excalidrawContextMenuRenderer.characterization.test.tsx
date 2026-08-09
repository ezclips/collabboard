// @vitest-environment jsdom
//
// Characterization of the Excalidraw fork's context-menu presentation resolver
// and the optional custom-renderer hook added by PATCH 6A.
//
//   .../excalidraw_fork/packages/excalidraw/components/contextMenuPresentation.ts
//   .../excalidraw_fork/packages/excalidraw/components/ContextMenu.tsx
//   .../excalidraw_fork/packages/excalidraw/components/App.tsx
//   .../excalidraw_fork/packages/excalidraw/types.ts
//
// WHY THE RESOLVER IS TESTED DIRECTLY RATHER THAN THROUGH THE FORK'S OWN SUITE
//
// The fork's packages/excalidraw/tests/contextmenu.test.tsx cannot run inside
// this repository, and that is a PRE-EXISTING condition, not something 6A
// introduced. Two independent blockers, both verified by stashing the 6A
// changes and re-running:
//
//   1. The fork's Vite walks up from its own directory and finds the app's root
//      postcss.config.mjs (Tailwind v4), which its bundled Vite cannot load, so
//      the suite fails to collect: "Failed to load PostCSS config".
//   2. Forcing an empty PostCSS config lets it collect, and all 17 tests then
//      fail identically with and without 6A -- stale snapshots plus
//      "Found multiple elements with tool name: rectangle", i.e. the fork's UI
//      has diverged from its vendored tests.
//
// Repairing that harness means blanket snapshot updates and a UI-helper fix,
// which would be a large unrelated change and would risk masking real
// regressions. So this suite proves what can be proven honestly and precisely:
// the resolver is one shared implementation, its behavior is Excalidraw's
// existing behavior, and the public descriptor leaks nothing it should not.
//
// What this suite deliberately does NOT claim to cover, because the fork
// harness is unavailable: live native rendering, right-click hit testing and
// selection, and read-only menu inventory end-to-end. Those remain Excalidraw's
// and are untouched by construction -- 6A adds no code on those paths, which
// the source assertions below pin.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const FORK = 'components/collabboard/canvas/excalidraw_fork/packages/excalidraw';
function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), FORK, relative), 'utf8');
}

/**
 * The resolver is loaded at runtime through a file URL rather than a static
 * import on purpose. The vendored fork is excluded from the root tsconfig, but
 * TypeScript follows imports regardless of `exclude` — a literal import here
 * would pull the whole fork into the root type program and surface hundreds of
 * pre-existing fork type errors in `npx tsc --noEmit`. A non-literal specifier
 * keeps the fork out of the root program while still exercising the real module.
 */
let CONTEXT_MENU_SEPARATOR: string;
let resolveContextMenuItems: (options: any) => any[];

beforeAll(async () => {
  const spec = pathToFileURL(
    path.join(process.cwd(), FORK, 'components/contextMenuPresentation.ts'),
  ).href;
  const mod: any = await import(/* @vite-ignore */ spec);
  CONTEXT_MENU_SEPARATOR = mod.CONTEXT_MENU_SEPARATOR;
  resolveContextMenuItems = mod.resolveContextMenuItems;
});

type ContextMenuItems = any[];

/** Minimal Action-shaped stub. The resolver only reads these fields. */
function action(name: string, extra: Record<string, unknown> = {}) {
  return { name, label: `labels.${name}`, perform: vi.fn(), ...extra } as any;
}

function makeActionManager() {
  return {
    executeAction: vi.fn(),
    app: { props: { someProp: true }, id: 'app-1' },
  } as any;
}

/** Uppercases the key so a translated label is distinguishable from a raw one. */
const translate = ((key: string) => `T(${key})`) as any;

function resolve(items: ContextMenuItems, overrides: Record<string, any> = {}) {
  const actionManager = overrides.actionManager ?? makeActionManager();
  const onClose = overrides.onClose ?? vi.fn();
  const resolved = resolveContextMenuItems({
    items,
    elements: overrides.elements ?? ([] as any),
    appState: overrides.appState ?? ({ someState: true } as any),
    actionManager,
    translate: overrides.translate ?? translate,
    onClose,
  });
  return { resolved, actionManager, onClose };
}

describe('Excalidraw context-menu resolver — predicate filtering', () => {
  it('keeps items with no predicate', () => {
    const { resolved } = resolve([action('copy'), action('paste')]);
    expect(resolved.map((i) => (i.type === 'item' ? i.name : '---'))).toEqual(['copy', 'paste']);
  });

  it('drops items whose predicate returns false, keeps those returning true', () => {
    const { resolved } = resolve([
      action('copy', { predicate: () => true }),
      action('cut', { predicate: () => false }),
      action('paste', { predicate: () => true }),
    ]);
    expect(resolved.map((i) => (i.type === 'item' ? i.name : '---'))).toEqual(['copy', 'paste']);
  });

  it('passes Excalidraw state into the predicate, in the established argument order', () => {
    const predicate = vi.fn(() => true);
    const elements = [{ id: 'el-1' }] as any;
    const appState = { zoom: 1 } as any;
    const actionManager = makeActionManager();
    resolve([action('copy', { predicate })], { elements, appState, actionManager });
    expect(predicate).toHaveBeenCalledWith(
      elements,
      appState,
      actionManager.app.props,
      actionManager.app,
    );
  });

  it('drops falsy entries entirely', () => {
    const { resolved } = resolve([action('copy'), false, null, undefined, action('paste')]);
    expect(resolved).toHaveLength(2);
  });
});

describe('Excalidraw context-menu resolver — separator collapsing', () => {
  it('drops a leading separator', () => {
    const { resolved } = resolve([CONTEXT_MENU_SEPARATOR, action('copy')]);
    expect(resolved.map((i) => i.type)).toEqual(['item']);
  });

  it('drops consecutive separators, keeping one', () => {
    const { resolved } = resolve([
      action('copy'),
      CONTEXT_MENU_SEPARATOR,
      CONTEXT_MENU_SEPARATOR,
      action('paste'),
    ]);
    expect(resolved.map((i) => i.type)).toEqual(['item', 'separator', 'item']);
  });

  it('keeps a separator between two visible items', () => {
    const { resolved } = resolve([action('copy'), CONTEXT_MENU_SEPARATOR, action('paste')]);
    expect(resolved.map((i) => i.type)).toEqual(['item', 'separator', 'item']);
  });

  it('collapses a separator that only became leading after predicate filtering', () => {
    const { resolved } = resolve([
      action('copy', { predicate: () => false }),
      CONTEXT_MENU_SEPARATOR,
      action('paste'),
    ]);
    expect(resolved.map((i) => i.type)).toEqual(['item']);
  });

  it('gives every entry a unique key', () => {
    const { resolved } = resolve([
      action('copy'),
      CONTEXT_MENU_SEPARATOR,
      action('copy'),
      CONTEXT_MENU_SEPARATOR,
      action('paste'),
    ]);
    const keys = resolved.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Excalidraw context-menu resolver — labels', () => {
  it('translates a string label', () => {
    const { resolved } = resolve([action('copy', { label: 'labels.copy' })]);
    expect(resolved[0]).toMatchObject({ label: 'T(labels.copy)' });
  });

  it('calls a function label with Excalidraw state, then translates its result', () => {
    const label = vi.fn(() => 'labels.dynamic');
    const elements = [{ id: 'el-1' }] as any;
    const appState = { zoom: 2 } as any;
    const actionManager = makeActionManager();
    const { resolved } = resolve([action('toggle', { label })], {
      elements, appState, actionManager,
    });
    expect(label).toHaveBeenCalledWith(elements, appState, actionManager.app);
    expect(resolved[0]).toMatchObject({ label: 'T(labels.dynamic)' });
  });

  it('yields an empty label when the action has none', () => {
    const { resolved } = resolve([action('nameless', { label: undefined })]);
    expect(resolved[0]).toMatchObject({ label: '' });
  });
});

describe('Excalidraw context-menu resolver — checked and dangerous', () => {
  it('resolves checked from the action, passing appState', () => {
    const checked = vi.fn(() => true);
    const appState = { gridModeEnabled: true } as any;
    const { resolved } = resolve([action('toggleGrid', { checked })], { appState });
    expect(checked).toHaveBeenCalledWith(appState);
    expect(resolved[0]).toMatchObject({ checked: true });
  });

  it('reports checked false when the action has no checked function', () => {
    const { resolved } = resolve([action('copy')]);
    expect(resolved[0]).toMatchObject({ checked: false });
  });

  it('marks only deleteSelectedElements dangerous, preserving the existing rule', () => {
    const { resolved } = resolve([
      action('copy'),
      action('deleteSelectedElements'),
      action('cut'),
    ]);
    const dangerous = resolved
      .filter((i) => i.type === 'item' && i.dangerous)
      .map((i) => (i.type === 'item' ? i.name : ''));
    expect(dangerous).toEqual(['deleteSelectedElements']);
  });
});

describe('Excalidraw context-menu resolver — execution', () => {
  it('closes first and executes inside the close callback, preserving the ordering', () => {
    const order: string[] = [];
    const actionManager = makeActionManager();
    actionManager.executeAction = vi.fn(() => order.push('execute'));
    // Mirrors App's onClose: state update, then the callback.
    const onClose = vi.fn((callback?: () => void) => {
      order.push('close');
      callback?.();
    });
    const item = action('copy');
    const { resolved } = resolve([item], { actionManager, onClose });

    (resolved[0] as any).onSelect();

    expect(order).toEqual(['close', 'execute']);
    expect(actionManager.executeAction).toHaveBeenCalledWith(item, 'contextMenu');
  });

  it('routes execution through actionManager and never calls action.perform directly', () => {
    const actionManager = makeActionManager();
    const onClose = vi.fn((callback?: () => void) => callback?.());
    const item = action('duplicate');
    const { resolved } = resolve([item], { actionManager, onClose });

    (resolved[0] as any).onSelect();

    expect(actionManager.executeAction).toHaveBeenCalledTimes(1);
    expect(item.perform).not.toHaveBeenCalled();
  });

  it('executes the action it was resolved from, not a neighbour', () => {
    const actionManager = makeActionManager();
    const onClose = vi.fn((callback?: () => void) => callback?.());
    const copy = action('copy');
    const cut = action('cut');
    const { resolved } = resolve([copy, cut], { actionManager, onClose });

    (resolved[1] as any).onSelect();

    expect(actionManager.executeAction).toHaveBeenCalledWith(cut, 'contextMenu');
  });
});

describe('Excalidraw context-menu — one resolver, two presentations', () => {
  it('native and custom paths call the same exported resolver', () => {
    // The primary structural proof that the two presentations cannot drift.
    const contextMenu = read('components/ContextMenu.tsx');
    const calls = contextMenu.match(/resolveContextMenuItems\(\{/g) ?? [];
    expect(calls, 'both renderers must resolve through the shared function').toHaveLength(2);
    expect(contextMenu).toContain('from "./contextMenuPresentation"');

    // And no renderer re-implements any resolution step locally.
    for (const [renderer, body] of Object.entries(splitRenderers(contextMenu))) {
      expect(body, `${renderer} must not filter predicates itself`).not.toContain('item.predicate');
      expect(body, `${renderer} must not translate labels itself`).not.toMatch(/\bt\(/);
      expect(body, `${renderer} must not evaluate checked itself`).not.toContain('item.checked?.(');
      expect(body, `${renderer} must not classify dangerous itself`)
        .not.toContain('deleteSelectedElements');
      expect(body, `${renderer} must not call executeAction itself`)
        .not.toContain('executeAction');
    }
  });

  it('resolution lives in exactly one place', () => {
    const presentation = read('components/contextMenuPresentation.ts');
    for (const marker of [
      'item.predicate',
      'deleteSelectedElements',
      'item.checked?.(appState)',
      'executeAction',
    ]) {
      expect(presentation, `resolver must own ${marker}`).toContain(marker);
    }
    // App.tsx delegates rendering; it must not re-derive presentation.
    const app = read('components/App.tsx');
    expect(app).not.toContain('item.predicate');
    expect(app).not.toContain('context-menu-item__label');
  });

  it('the shared resolver is a leaf module with no runtime imports', () => {
    // This is what lets one implementation serve both renderers without
    // dragging React, SCSS or the App module graph behind it.
    const presentation = read('components/contextMenuPresentation.ts');
    const runtimeImports = presentation
      .split('\n')
      .filter((line) => /^import /.test(line) && !/^import type /.test(line));
    expect(runtimeImports).toEqual([]);
  });
});

describe('Excalidraw context-menu — public descriptor surface', () => {
  it('exposes no keyboard-shortcut text to a host renderer', () => {
    const types = read('types.ts');
    const start = types.indexOf('export type ExcalidrawContextMenuRenderItem');
    const end = types.indexOf('export interface ExcalidrawProps');
    const descriptor = types.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(descriptor).not.toMatch(/shortcut/i);
    expect(descriptor).not.toContain('kbd');
  });

  it('exposes no Action identity, ActionManager or predicate to a host renderer', () => {
    const types = read('types.ts');
    const start = types.indexOf('export type ExcalidrawContextMenuRenderItem');
    const end = types.indexOf('export interface ExcalidrawProps');
    const descriptor = types.slice(start, end);
    expect(descriptor).not.toMatch(/\bname\b/);
    expect(descriptor).not.toContain('ActionManager');
    expect(descriptor).not.toContain('predicate');
    expect(descriptor).not.toContain('Action');
  });

  it('strips the internal action name when projecting to the public descriptor', () => {
    // The resolver keeps `name` for the native renderer's test ids and shortcut
    // lookup; the custom host must receive only presentation fields.
    const contextMenu = read('components/ContextMenu.tsx');
    const start = contextMenu.indexOf('export const CustomContextMenu');
    const projection = contextMenu.slice(start);
    expect(projection).toContain('key: item.key');
    expect(projection).toContain('label: item.label');
    expect(projection).toContain('checked: item.checked');
    expect(projection).toContain('dangerous: item.dangerous');
    expect(projection).toContain('onSelect: item.onSelect');
    expect(projection, 'action name must not reach the host').not.toContain('name: item.name');
  });

  it('keeps the native renderer displaying its own shortcuts, unchanged', () => {
    const contextMenu = read('components/ContextMenu.tsx');
    expect(contextMenu).toContain('getShortcutFromShortcutName');
    expect(contextMenu).toContain('context-menu-item__shortcut');
  });
});

describe('Excalidraw context-menu — render seam and coordinates', () => {
  it('branches only at the render site, keeping the native menu as the fallback', () => {
    const app = read('components/App.tsx');
    const start = app.indexOf('this.state.contextMenu &&');
    expect(start).toBeGreaterThan(-1);
    const block = app.slice(start, start + 1400);
    expect(block).toContain('this.props.customContextMenuRenderer ?');
    expect(block).toContain('<CustomContextMenu');
    expect(block).toContain('<ContextMenu');
  });

  it('leaves the right-click handler and its coordinate contract untouched', () => {
    const app = read('components/App.tsx');
    // Scope every assertion to handleCanvasContextMenu itself. App.tsx has nine
    // selectGroupsForSelectedElements call sites, so an unscoped substring
    // check would pass even if this one were removed.
    const start = app.indexOf('private handleCanvasContextMenu');
    const end = app.indexOf('private maybeDragNewGenericElement');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = app.slice(start, end);

    // Hit testing, then right-click selection, then presentation.
    expect(handler).toContain('this.getElementAtPosition(x, y, {');
    expect(handler).toContain('...selectGroupsForSelectedElements(');
    expect(handler).toContain('selectedLinearElement: isLinearElement(element)');
    // Container-relative coordinates, unchanged.
    expect(handler).toContain('const left = event.clientX - offsetLeft;');
    expect(handler).toContain('const top = event.clientY - offsetTop;');
    expect(handler).toContain(
      'contextMenu: { top, left, items: this.getContextMenuItems(type) }',
    );
    // The handler knows nothing about the custom renderer.
    expect(handler).not.toContain('customContextMenuRenderer');
  });

  it('converts to viewport coordinates from the same container rect', () => {
    const contextMenu = read('components/ContextMenu.tsx');
    const custom = contextMenu.slice(contextMenu.indexOf('export const CustomContextMenu'));
    expect(custom).toContain('container?.getBoundingClientRect()');
    expect(custom).toContain('x: (rect?.left ?? 0) + left');
    expect(custom).toContain('y: (rect?.top ?? 0) + top');
  });

  it('shares one onClose between both branches', () => {
    const app = read('components/App.tsx');
    expect(app).toContain('private closeContextMenu = (callback?: () => void) => {');
    expect((app.match(/onClose=\{this\.closeContextMenu\}/g) ?? [])).toHaveLength(2);
    // The original inline closure body is preserved verbatim in the method.
    const method = app.slice(app.indexOf('private closeContextMenu'));
    expect(method.slice(0, 300)).toContain('this.setState({ contextMenu: null }, () => {');
    expect(method.slice(0, 300)).toContain('this.focusContainer();');
    expect(method.slice(0, 300)).toContain('callback?.();');
  });
});

describe('Excalidraw context-menu — no production activation', () => {
  it('no CollabBoard consumer passes customContextMenuRenderer', () => {
    const consumers = [
      'components/collabboard/editors/ExcalidrawWrapper.tsx',
      'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    ];
    for (const relative of consumers) {
      const source = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
      expect(source, `${relative} must not activate the renderer`)
        .not.toContain('customContextMenuRenderer');
    }
  });

  it('nothing outside the fork mentions the prop at all', () => {
    // Broader than the named consumers above: a sweep of every tracked source
    // outside the vendored fork, so a future activation cannot slip in via a
    // file this suite did not think to list.
    const roots = ['components', 'app', 'lib'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'excalidraw_fork') continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (full.includes('excalidrawContextMenuRenderer.characterization')) continue;
        if (fs.readFileSync(full, 'utf8').includes('customContextMenuRenderer')) {
          offenders.push(path.relative(process.cwd(), full));
        }
      }
    };
    for (const root of roots) walk(path.join(process.cwd(), root));
    expect(offenders).toEqual([]);
  });

  it('the prop is optional, so omitting it is the supported default', () => {
    const types = read('types.ts');
    expect(types).toContain('customContextMenuRenderer?: (');
  });

  it('adds no Excalidraw action implementation', () => {
    const presentation = read('components/contextMenuPresentation.ts');
    // The resolver maps actions to presentation; it must never perform them.
    expect(presentation).not.toMatch(/\bperform\s*[:(]/);
    for (const verb of ['navigator.clipboard', 'document.execCommand', 'mutateElement']) {
      expect(presentation, `resolver must not implement ${verb}`).not.toContain(verb);
    }
  });
});

/** Splits ContextMenu.tsx into its two renderer bodies for scoped assertions. */
function splitRenderers(source: string): Record<string, string> {
  const nativeStart = source.indexOf('export const ContextMenu = React.memo(');
  const customStart = source.indexOf('export const CustomContextMenu = React.memo(');
  expect(nativeStart).toBeGreaterThan(-1);
  expect(customStart).toBeGreaterThan(-1);
  return {
    ContextMenu: source.slice(nativeStart, customStart),
    CustomContextMenu: source.slice(customStart),
  };
}
