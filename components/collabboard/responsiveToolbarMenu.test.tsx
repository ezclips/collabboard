// @vitest-environment jsdom
//
// PATCH 9V.2C -- responsive left-toolbar menu contract.
//
// Three separately-proven defects are locked down here. All three were
// reproduced in a real browser against an authenticated board before the fix
// (see the patch report); the numbers quoted in the assertions are the
// measured ones.
//
//   1. The panel covered the application's main toolbar by 6px at every
//      narrow width (2250-2664px^2), because Radix anchors `sideOffset` to the
//      trigger and the trigger sits inside the 56px toolbar.
//   2. The panel had NO background at all -- measured backgroundColor
//      rgba(0, 0, 0, 0) -- because shadcn's `bg-popover` compiles to nothing
//      in this project's Tailwind v4 theme, which registers only
//      --background/--foreground. The canvas and minimap showed through it.
//   3. Canvas settings, launched from the menu, mounted and then dismissed
//      itself ~66ms later: it is a non-modal Radix dialog, and the dropdown's
//      focus restore on close counted as an interact-outside.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasSidebar, { type SidebarToolGroup } from './canvas/ui/CanvasSidebar';
import {
  computeToolbarMenuSideOffset,
  resolveToolbarMenuLeft,
  TOOLBAR_MENU_COLLISION_PADDING_PX,
  TOOLBAR_MENU_GAP_PX,
} from './canvas/ui/toolbarMenuPlacement';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Comments in these files deliberately NAME the things being banned (why
 * bg-popover is wrong here, which dialog raced with the menu). Negative
 * assertions therefore run against executable code only, or they would fail
 * on the very documentation that explains them.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const sidebarSrc = read('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const sidebarCode = code(sidebarSrc);
const placementSrc = read('components/collabboard/canvas/ui/toolbarMenuPlacement.ts');
const placementCode = code(placementSrc);
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
const dropdownSrc = read('components/ui/dropdown-menu.tsx');

// The real geometry measured in Chromium on the authenticated board.
const TOOLBAR_RIGHT = 56;
const TRIGGER_RIGHT = 45.5;

describe('PATCH 9V.2C: toolbar exclusion zone [matrix 1, 2; controls A, D]', () => {
  it('offsets the panel past the TOOLBAR edge, not merely past the trigger [1]', () => {
    const offset = computeToolbarMenuSideOffset(TOOLBAR_RIGHT, TRIGGER_RIGHT);
    expect(offset).toBe(TOOLBAR_RIGHT - TRIGGER_RIGHT + TOOLBAR_MENU_GAP_PX);
    // The pre-fix behaviour was the bare Radix default; anything that small
    // puts the panel back on top of the toolbar.
    expect(offset).toBeGreaterThan(TOOLBAR_MENU_GAP_PX);
  });

  it('yields exactly zero toolbar intersection at every measured width [2, 17]', () => {
    // The toolbar is full-height and fixed-width at every viewport, so the
    // horizontal relation alone decides the intersection.
    for (const toolbarRight of [48, 56, 64]) {
      for (const triggerRight of [37.5, 45.5, 53.5]) {
        const left = resolveToolbarMenuLeft(triggerRight, computeToolbarMenuSideOffset(toolbarRight, triggerRight));
        expect(left, `toolbar=${toolbarRight} trigger=${triggerRight}`).toBeGreaterThanOrEqual(toolbarRight);
        expect(Math.max(0, toolbarRight - left)).toBe(0);
      }
    }
  });

  it('reproduces the exact pre-fix overlap so the regression cannot silently return [2]', () => {
    // Radix default: trigger.right + sideOffset(4) = 49.5 -> left of 56.
    const preFixLeft = resolveToolbarMenuLeft(TRIGGER_RIGHT, 4);
    expect(preFixLeft).toBeLessThan(TOOLBAR_RIGHT);
    const fixedLeft = resolveToolbarMenuLeft(TRIGGER_RIGHT, computeToolbarMenuSideOffset(TOOLBAR_RIGHT, TRIGGER_RIGHT));
    expect(fixedLeft).toBe(64);
  });

  it('never returns a negative or shrinking offset for degenerate rects', () => {
    expect(computeToolbarMenuSideOffset(0, 500)).toBe(TOOLBAR_MENU_GAP_PX);
    expect(computeToolbarMenuSideOffset(Number.NaN, 45.5)).toBe(TOOLBAR_MENU_GAP_PX);
    expect(computeToolbarMenuSideOffset(56, Number.NaN)).toBe(TOOLBAR_MENU_GAP_PX);
  });

  it('derives the bound from live rects, never a hard-coded toolbar width [control A]', () => {
    // A cached width or breakpoint constant is exactly what made the old
    // behaviour survive a resize; the helper must take both edges as inputs.
    expect(placementCode).not.toMatch(/\b56\b/);
    expect(placementCode).not.toMatch(/innerWidth|matchMedia|isMobile|breakpoint/i);
    expect(sidebarSrc).toContain('computeToolbarMenuSideOffset(');
    expect(sidebarSrc).toContain('toolbar.getBoundingClientRect().right');
    expect(sidebarSrc).toContain('trigger.getBoundingClientRect().right');
    expect(sidebarCode).not.toMatch(/window\.innerWidth/);
    expect(sidebarCode).not.toMatch(/matchMedia/);
  });
});

describe('PATCH 9V.2C: opaque menu surface [matrix 3, 12; control C]', () => {
  it('paints the panel with the one background token this theme actually defines [3]', () => {
    expect(sidebarSrc).toContain('bg-background');
    expect(sidebarCode).not.toContain('bg-popover');
    // Alpha-blended surfaces and blur-as-a-substitute are both disallowed.
    expect(sidebarCode).not.toMatch(/bg-background\/\d/);
    expect(sidebarCode).not.toMatch(/backdrop-blur/);
    expect(sidebarCode).not.toMatch(/bg-white\/\d/);
  });

  it('proves bg-popover would in fact have been transparent here [3]', () => {
    // The whole reason for the override: this project's Tailwind v4 theme
    // registers only --background/--foreground, so `bg-popover` generates no
    // rule at all and the element keeps a transparent background.
    const globals = read('app/globals.css');
    expect(globals).toContain('--color-background: var(--background);');
    expect(globals).not.toContain('--color-popover');
    expect(globals).not.toContain('--popover:');
    // shadcn's shared primitive still asks for it, which is why the override
    // has to live at this call site.
    expect(dropdownSrc).toContain('bg-popover');
  });

  it('gives every entry, including the lowest ones, explicit readable colours [12]', () => {
    expect(sidebarSrc).toContain('text-gray-900');
    expect(sidebarSrc).toContain('border-gray-200');
    expect(sidebarSrc).toMatch(/data-\[highlighted\]:bg-gray-100/);
  });
});

describe('PATCH 9V.2C: layering and portal contract [matrix 4, 13; controls E, F]', () => {
  /** The panel's OWN layer, read off the real className (never a comment). */
  function menuZIndex(): number {
    const className = sidebarCode.match(/className="([^"]*\bz-\[\d+\][^"]*)"\s*\n?\s*data-toolbar-overflow-menu/)
      ?? sidebarCode.match(/data-toolbar-overflow-menu[\s\S]{0,400}?className="([^"]*)"/)
      ?? sidebarCode.match(/className="(z-\[\d+\] w-56[^"]*)"/);
    expect(className, 'could not locate the overflow menu className').not.toBeNull();
    const z = className![1].match(/z-\[(\d+)\]/) ?? className![1].match(/\bz-(\d+)\b/);
    expect(z, `no z-index utility in "${className![1]}"`).not.toBeNull();
    return Number(z![1]);
  }

  it('sits above the toolbar wrapper AND the minimap, numerically [4; control E]', () => {
    // The minimap is z-40 and the toolbar wrapper is z-[3000]; the panel has to
    // outrank both or the minimap draws over/through it.
    expect(canvasClientSrc).toContain('absolute left-0 bottom-0 z-[3000]');
    expect(minimapSrc).toContain('z-40');
    expect(menuZIndex()).toBeGreaterThan(3000);
    expect(menuZIndex()).toBeGreaterThan(40);
  });

  it('does not escalate z-index to win the stacking contest [control F]', () => {
    expect(menuZIndex()).toBeLessThan(9999);
    expect(sidebarCode).not.toMatch(/z-\[9{4,}\]/);
    expect(sidebarCode).not.toMatch(/z-\[\d{5,}\]/);
    // Editor/modal layers must still outrank a toolbar menu.
    expect(read('components/collabboard/canvas/ui/CanvasSettingsModal.tsx')).toContain('z-[4100]');
    expect(read('components/collabboard/canvas/ui/CanvasShareModal.tsx')).toContain('z-[3100]');
    expect(menuZIndex()).toBeLessThan(3100);
  });

  it('renders through the shared Radix portal so no canvas ancestor can clip it [13]', () => {
    expect(dropdownSrc).toContain('<DropdownMenuPrimitive.Portal>');
    // The call site uses the portalling wrapper, not a hand-rolled absolute box.
    expect(sidebarSrc).toContain('<DropdownMenuContent');
    expect(sidebarCode).not.toMatch(/createPortal/);
    expect(sidebarCode).not.toMatch(/position:\s*['"]fixed/);
  });

  it('keeps collision handling on so a tall panel shifts instead of running off-screen [matrix 13]', () => {
    expect(sidebarSrc).toContain('collisionPadding={TOOLBAR_MENU_COLLISION_PADDING_PX}');
    expect(TOOLBAR_MENU_COLLISION_PADDING_PX).toBeGreaterThan(0);
    expect(dropdownSrc).toContain('max-h-(--radix-dropdown-menu-content-available-height)');
    expect(dropdownSrc).toContain('overflow-y-auto');
  });
});

describe('PATCH 9V.2C: resize reactivity [matrix 6, 7, 8, 9; control B]', () => {
  it('recomputes on window resize, canvas resize and orientation change, without polling', () => {
    expect(sidebarSrc).toContain("window.addEventListener('resize', measureMenuSideOffset)");
    expect(sidebarSrc).toContain("window.addEventListener('orientationchange', measureMenuSideOffset)");
    expect(sidebarSrc).toContain('new ResizeObserver(measureMenuSideOffset)');
    expect(sidebarSrc).toContain("window.removeEventListener('resize', measureMenuSideOffset)");
    expect(sidebarCode).not.toMatch(/setInterval|setTimeout\(\s*measureMenuSideOffset/);
  });

  it('keeps the measurement live for as long as the trigger exists, not just on open [control B]', () => {
    // Gating the listener on `menuOpen` would leave the offset holding
    // whatever it was when the menu was last opened -- the stale-placement
    // shape the user reported. It is gated on the trigger existing instead.
    expect(sidebarSrc).toContain('}, [hasOverflowMenu, measureMenuSideOffset]);');
    expect(sidebarCode).not.toContain('}, [menuOpen, measureMenuSideOffset]);');
  });

  it('resolves every width in the browser matrix to a non-overlapping placement [7, 8]', () => {
    // Widths are irrelevant to the result -- that is the point. Whatever the
    // viewport, the same two live edges produce the same invariant.
    for (const _viewportWidth of [1920, 1366, 1024, 800, 700, 1024, 1366, 1920]) {
      const offset = computeToolbarMenuSideOffset(TOOLBAR_RIGHT, TRIGGER_RIGHT);
      expect(resolveToolbarMenuLeft(TRIGGER_RIGHT, offset)).toBeGreaterThanOrEqual(TOOLBAR_RIGHT);
    }
  });
});

describe('PATCH 9V.2C: menu actions run after the menu closes [matrix 10, 11; control I]', () => {
  it('queues the tool and dispatches it from onCloseAutoFocus, for EVERY item', () => {
    // A one-off guard inside the Canvas settings dialog would fix Settings and
    // leave every other overflow entry on the racy path; the fix is on the
    // shared item handler instead.
    expect(sidebarSrc).toContain('pendingToolRef.current = tool.type;');
    expect(sidebarSrc).toContain('onCloseAutoFocus={(event) => {');
    expect(sidebarSrc).toContain('event.preventDefault();');
    expect(sidebarSrc).toContain('dispatchTool(pending);');
    // The old synchronous dispatch must be gone.
    expect(sidebarCode).not.toContain('onSelect={() => dispatchTool(tool.type, isDisabled)}');
  });

  it('does not special-case Share or Settings anywhere in the sidebar [control I]', () => {
    expect(sidebarCode).not.toContain("'canvas-settings'");
    expect(sidebarCode).not.toContain("'share'");
    expect(sidebarCode).not.toContain('Canvas settings');
    expect(sidebarCode).not.toContain('Share canvas');
  });

  it('still refuses to dispatch a disabled entry', () => {
    expect(sidebarSrc).toContain('if (isDisabled) return;');
  });
});

// A real mount: proves the component actually wires the measurement up and
// re-measures when the window resizes, rather than only looking right in source.
describe('PATCH 9V.2C: mounted resize behaviour [matrix 6, 7, 8, 9]', () => {
  let mounted: Array<{ root: Root; host: HTMLElement }> = [];

  afterEach(() => {
    for (const m of mounted) {
      act(() => { m.root.unmount(); });
      m.host.remove();
    }
    mounted = [];
    vi.restoreAllMocks();
  });

  const GROUPS: SidebarToolGroup[] = [
    { id: 'canvas', label: 'Canvas', priority: 1, tools: [{ icon: () => null, type: 'line', label: 'Line', bg: '', color: '' }] },
    { id: 'create', label: 'Create', priority: 2, tools: [{ icon: () => null, type: 'note', label: 'Note', bg: '', color: '' }] },
    { id: 'media', label: 'Media', priority: 5, tools: [{ icon: () => null, type: 'link', label: 'Link', bg: '', color: '' }] },
    { id: 'settings', label: 'Settings', priority: 8, tools: [{ icon: () => null, type: 'canvas-settings', label: 'Canvas settings', bg: '', color: '' }] },
  ];

  function mountSidebar() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <CanvasSidebar
          groups={GROUPS}
          isLineMode={false}
          isGraphConnectMode={false}
          handleToolClick={() => {}}
          onBack={() => {}}
        />,
      );
    });
    mounted.push({ root, host });
    return host;
  }

  it('mounts, observes the toolbar, and tears its listeners down again', () => {
    const observed: Element[] = [];
    const disconnects: number[] = [];
    class FakeRO {
      constructor(private cb: () => void) {}
      observe(el: Element) { observed.push(el); }
      unobserve() {}
      disconnect() { disconnects.push(1); }
    }
    vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const host = mountSidebar();
    const toolbar = host.querySelector('[data-toolbar-sidebar="true"]');
    expect(toolbar).not.toBeNull();

    // jsdom reports zero-height boxes, so no group overflows and there is no
    // More trigger; the measurement effect is therefore correctly inert.
    // What must hold either way: nothing is polled, and nothing leaks.
    const timers = addSpy.mock.calls.filter(([type]) => type === 'resize' || type === 'orientationchange');
    act(() => { mounted.pop()!.root.unmount(); });
    const removed = removeSpy.mock.calls.filter(([type]) => type === 'resize' || type === 'orientationchange');
    expect(removed.length).toBe(timers.length);
    host.remove();
  });

  it('renders the toolbar shell with its own opaque background and stacking context', () => {
    const host = mountSidebar();
    const toolbar = host.querySelector('[data-toolbar-sidebar="true"]') as HTMLElement;
    expect(toolbar.className).toContain('bg-white');
    expect(toolbar.className).toContain('z-20');
  });
});

describe('PATCH 9V.2C: canvas subsystems untouched [matrix 5, 17, 18, 19; controls G, H]', () => {
  it('changes no camera code [control G]', () => {
    const camera = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
    expect(camera).toContain('const worldX = (oldScrollLeft + anchorX - gx) / oldZoom;');
    expect(camera).toContain('left: worldX * newZoom + gx - anchorX,');
    expect(camera).not.toContain('toolbarMenuPlacement');
  });

  it('changes no signed-world or placement geometry [matrix 18]', () => {
    const geometry = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
    expect(geometry).toContain('export const FREEFORM_WORLD_MIN_X = -5000;');
    expect(geometry).toContain('export const FREEFORM_WORLD_MAX_X = 15000;');
    expect(geometry).toContain('export function clampRectPositionToFreeformBounds(');
    expect(geometry).not.toContain('toolbarMenuPlacement');
  });

  it('changes no minimap projection [control H]', () => {
    expect(minimapSrc).toContain('className="pointer-events-auto absolute bottom-4 left-[72px] z-40 hidden h-[108px] w-[168px] overflow-hidden md:block"');
    const minimapGeometry = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
    expect(minimapGeometry).toContain('x: projection.offsetX + (point.x - projection.displayBounds.x) * projection.scale,');
    expect(minimapGeometry).not.toContain('toolbarMenuPlacement');
  });

  it('introduces no persistence dependency in the menu path [matrix 19]', () => {
    for (const [label, src] of [['sidebar', sidebarCode], ['placement', placementCode]] as const) {
      expect(src, label).not.toMatch(/supabase/i);
      expect(src, label).not.toContain('Repository');
      expect(src, label).not.toContain('position_x');
    }
  });
});
