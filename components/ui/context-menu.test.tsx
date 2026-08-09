// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSwatch,
  ContextMenuSwatchRow,
  ContextMenuTrigger,
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuLabel,
  PositionedContextMenuSeparator,
  PositionedContextMenuSub,
  PositionedContextMenuSubContent,
  PositionedContextMenuSubTrigger,
  PositionedContextMenuSwatch,
} from './context-menu';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Radix's Popper positioning relies on browser APIs jsdom does not implement.
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!('DOMRect' in globalThis)) {
    (globalThis as any).DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      get top() { return this.y; }
      get left() { return this.x; }
      get right() { return this.x + this.width; }
      get bottom() { return this.y + this.height; }
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).setPointerCapture ??= () => {};
  (Element.prototype as any).releasePointerCapture ??= () => {};
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
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

/** Radix portals menu content to document.body, so query globally. */
function openMenu(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('[data-testid="trigger"]')!;
  act(() => {
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
  });
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu).not.toBeNull();
  return menu!;
}

function itemByText(scope: ParentNode, text: string): HTMLElement {
  const match = Array.from(scope.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((el) => el.textContent?.includes(text));
  expect(match, `no menuitem containing "${text}"`).toBeTruthy();
  return match!;
}

function TrashIcon() {
  return <svg data-testid="trash-icon" />;
}

function Fixture({ onDelete = vi.fn() }: { onDelete?: () => void }) {
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger data-testid="trigger">target</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<TrashIcon />}>
          Duplicate
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled onSelect={onDelete}>
          Paste
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Send to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Front</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSwatchRow>
          <ContextMenuSwatch color="#e03131" label="Red" selected />
          <ContextMenuSwatch color="#1971c2" label="Blue" />
        </ContextMenuSwatchRow>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

describe('shared context-menu shell', () => {
  it('renders an item with its icon slot and label', () => {
    const menu = openMenu(mount(<Fixture />));
    const item = itemByText(menu, 'Duplicate');
    const iconSlot = item.querySelector('[data-slot="context-menu-icon"]')!;
    expect(iconSlot).not.toBeNull();
    expect(iconSlot.getAttribute('aria-hidden')).toBe('true');
    expect(iconSlot.querySelector('[data-testid="trash-icon"]')).not.toBeNull();
    expect(item.textContent).toContain('Duplicate');
    // Icon precedes the label so rows stay vertically aligned.
    expect(item.firstElementChild).toBe(iconSlot);
  });

  it('right-aligns the keyboard-shortcut slot', () => {
    const menu = openMenu(mount(<Fixture />));
    const shortcut = itemByText(menu, 'Duplicate')
      .querySelector<HTMLElement>('[data-slot="context-menu-shortcut"]')!;
    expect(shortcut).not.toBeNull();
    expect(shortcut.textContent).toBe('Ctrl+D');
    expect(shortcut.className).toContain('ml-auto');
    expect(shortcut).toBe(itemByText(menu, 'Duplicate').lastElementChild);
  });

  it('does not select a disabled item', () => {
    const onDelete = vi.fn();
    const menu = openMenu(mount(<Fixture onDelete={onDelete} />));
    const disabled = itemByText(menu, 'Paste');
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(disabled.hasAttribute('data-disabled')).toBe(true);
    act(() => {
      disabled.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('renders the destructive variant distinctly from the default variant', () => {
    const menu = openMenu(mount(<Fixture />));
    const destructive = itemByText(menu, 'Delete');
    const normal = itemByText(menu, 'Duplicate');
    expect(destructive.getAttribute('data-variant')).toBe('destructive');
    expect(normal.getAttribute('data-variant')).toBe('default');
    expect(destructive.className).toContain('text-red-600');
    expect(normal.className).not.toContain('text-red-600');
  });

  it('opens a submenu via the keyboard and shares the root menu surface', () => {
    const menu = openMenu(mount(<Fixture />));
    const subTrigger = document.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
    expect(subTrigger).not.toBeNull();
    expect(subTrigger.getAttribute('data-state')).toBe('closed');
    expect(document.querySelector('[data-slot="context-menu-sub-content"]')).toBeNull();

    // Radix's ArrowRight sub-open behaviour must survive the restyling.
    act(() => {
      subTrigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    });
    expect(subTrigger.getAttribute('data-state')).toBe('open');

    const subContent = document.querySelector<HTMLElement>('[data-slot="context-menu-sub-content"]')!;
    expect(subContent).not.toBeNull();
    expect(itemByText(subContent, 'Front')).toBeTruthy();
    // Submenu and root menu are drawn on the same surface.
    const surface = 'bg-gray-50';
    expect(subContent.className).toContain(surface);
    expect(menu.className).toContain(surface);
  });

  it('renders a separator', () => {
    openMenu(mount(<Fixture />));
    const separators = document.querySelectorAll('[data-slot="context-menu-separator"]');
    expect(separators).toHaveLength(2);
    expect(separators[0].getAttribute('role')).toBe('separator');
  });

  it('renders an accessible swatch row without coupling to any specific menu', () => {
    const menu = openMenu(mount(<Fixture />));
    const row = menu.querySelector<HTMLElement>('[data-slot="context-menu-swatch-row"]')!;
    expect(row).not.toBeNull();
    expect(row.getAttribute('role')).toBe('group');

    const swatches = Array.from(row.querySelectorAll<HTMLElement>('[data-slot="context-menu-swatch"]'));
    expect(swatches).toHaveLength(2);
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual(['Red', 'Blue']);
    // Radix item semantics are preserved so keyboard navigation still works.
    expect(swatches.every((s) => s.getAttribute('role') === 'menuitem')).toBe(true);
    expect(swatches[0].style.backgroundColor).toBe('rgb(224, 49, 49)');
    expect(swatches[0].hasAttribute('data-selected')).toBe(true);
    expect(swatches[1].hasAttribute('data-selected')).toBe(false);
  });

  it('keeps the pre-existing ContextMenu API backward-compatible', async () => {
    const mod = await import('./context-menu');
    for (const name of [
      'ContextMenu',
      'ContextMenuTrigger',
      'ContextMenuContent',
      'ContextMenuItem',
      'ContextMenuCheckboxItem',
      'ContextMenuRadioItem',
      'ContextMenuLabel',
      'ContextMenuSeparator',
      'ContextMenuShortcut',
      'ContextMenuGroup',
      'ContextMenuPortal',
      'ContextMenuSub',
      'ContextMenuSubContent',
      'ContextMenuSubTrigger',
      'ContextMenuRadioGroup',
    ]) {
      expect(mod, `missing export ${name}`).toHaveProperty(name);
    }

    // The only props existing call sites pass (className, variant, onClick) still work.
    const onClick = vi.fn();
    const container = mount(
      <ContextMenu modal={false}>
        <ContextMenuTrigger data-testid="trigger">target</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={onClick} variant="destructive">
            Delete canvas
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    const menu = openMenu(container);
    expect(menu.className).toContain('w-48');
    const item = itemByText(menu, 'Delete canvas');
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exports the positioned family alongside the Radix family', async () => {
    const mod = await import('./context-menu');
    for (const name of [
      'PositionedContextMenu',
      'PositionedContextMenuItem',
      'PositionedContextMenuSeparator',
      'PositionedContextMenuLabel',
      'PositionedContextMenuSwatch',
    ]) {
      expect(mod, `missing export ${name}`).toHaveProperty(name);
    }
  });
});

// ── Positioned (externally-coordinated) menus ─────────────────────────────
describe('positioned context menu', () => {
  /**
   * Radix's own dismissal defers listener attachment by a macrotask; the
   * positioned surface does the same so the opening interaction cannot close
   * it. Tests that dismiss an open menu must let that timer flush first.
   */
  function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function PositionedFixture({
    open = true,
    x = 120,
    y = 240,
    onOpenChange = vi.fn(),
    onPick = vi.fn(),
    onPickDisabled = vi.fn(),
    onPickSwatch = vi.fn(),
  }: Record<string, any> = {}) {
    return (
      <PositionedContextMenu open={open} x={x} y={y} onOpenChange={onOpenChange}>
        <PositionedContextMenuLabel>Line</PositionedContextMenuLabel>
        <PositionedContextMenuItem icon={<TrashIcon />} onSelect={onPick}>
          Duplicate
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </PositionedContextMenuItem>
        <PositionedContextMenuItem disabled onSelect={onPickDisabled}>
          Paste
        </PositionedContextMenuItem>
        <PositionedContextMenuSeparator />
        <ContextMenuSwatchRow>
          <PositionedContextMenuSwatch color="#e03131" label="Red" selected onSelect={onPickSwatch} />
          <PositionedContextMenuSwatch color="#1971c2" label="Blue" />
        </ContextMenuSwatchRow>
        <PositionedContextMenuSeparator />
        <PositionedContextMenuItem variant="destructive" onSelect={onPick}>
          Delete
        </PositionedContextMenuItem>
      </PositionedContextMenu>
    );
  }

  function surface(): HTMLElement {
    const el = document.querySelector<HTMLElement>('[data-slot="positioned-context-menu-content"]');
    expect(el, 'positioned menu did not render').not.toBeNull();
    return el!;
  }

  function rowByText(scope: ParentNode, text: string): HTMLElement {
    const match = Array.from((scope as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((el) => el.textContent?.includes(text));
    expect(match, `no menuitem containing "${text}"`).toBeTruthy();
    return match!;
  }

  it('renders at the supplied x/y as a fixed-position surface', () => {
    mount(<PositionedFixture x={120} y={240} />);
    const el = surface();
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('240px');
    expect(el.className).toContain('fixed');
    expect(el.getAttribute('role')).toBe('menu');
  });

  it('moves when x/y change', () => {
    function Harness() {
      const [pos, setPos] = React.useState({ x: 30, y: 40 });
      return (
        <>
          <button data-testid="move" onClick={() => setPos({ x: 300, y: 410 })}>move</button>
          <PositionedContextMenu open x={pos.x} y={pos.y} onOpenChange={vi.fn()}>
            <PositionedContextMenuItem>Only</PositionedContextMenuItem>
          </PositionedContextMenu>
        </>
      );
    }
    const dom = mount(<Harness />);
    expect(surface().style.left).toBe('30px');
    expect(surface().style.top).toBe('40px');
    act(() => {
      dom.querySelector<HTMLElement>('[data-testid="move"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(surface().style.left).toBe('300px');
    expect(surface().style.top).toBe('410px');
  });

  it('pulls back from the viewport edge only when it would overflow', () => {
    // jsdom reports zero offsetWidth/Height, so the clamp bound is
    // innerWidth - 0 - 8. A coordinate past that is pulled back; one inside is not.
    mount(<PositionedContextMenu open x={99999} y={99999} onOpenChange={vi.fn()}>
      <PositionedContextMenuItem>Only</PositionedContextMenuItem>
    </PositionedContextMenu>);
    expect(Number(surface().style.left.replace('px', ''))).toBe(window.innerWidth - 8);
    expect(Number(surface().style.top.replace('px', ''))).toBe(window.innerHeight - 8);
  });

  it('renders nothing while closed', () => {
    mount(<PositionedFixture open={false} />);
    expect(document.querySelector('[data-slot="positioned-context-menu-content"]')).toBeNull();
  });

  it('closes on outside pointer interaction', async () => {
    const onOpenChange = vi.fn();
    mount(<PositionedFixture onOpenChange={onOpenChange} />);
    await act(async () => { await tick(); });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close when the interaction is inside the surface', async () => {
    const onOpenChange = vi.fn();
    mount(<PositionedFixture onOpenChange={onOpenChange} />);
    await act(async () => { await tick(); });
    act(() => {
      surface().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onOpenChange = vi.fn();
    mount(<PositionedFixture onOpenChange={onOpenChange} />);
    act(() => {
      surface().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('fires the item callback and closes on select', () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    mount(<PositionedFixture onPick={onPick} onOpenChange={onOpenChange} />);
    act(() => {
      rowByText(surface(), 'Duplicate')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lets an item keep the menu open via preventDefault, matching Radix onSelect', () => {
    const onOpenChange = vi.fn();
    mount(
      <PositionedContextMenu open x={10} y={10} onOpenChange={onOpenChange}>
        <PositionedContextMenuItem onSelect={(event) => event.preventDefault()}>
          Choose Custom Color...
        </PositionedContextMenuItem>
      </PositionedContextMenu>,
    );
    act(() => {
      rowByText(surface(), 'Choose Custom Color...')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not fire or close for a disabled item', () => {
    const onPickDisabled = vi.fn();
    const onOpenChange = vi.fn();
    mount(<PositionedFixture onPickDisabled={onPickDisabled} onOpenChange={onOpenChange} />);
    const disabled = rowByText(surface(), 'Paste');
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(disabled.hasAttribute('data-disabled')).toBe(true);
    act(() => {
      disabled.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onPickDisabled).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('uses the shared surface, row, destructive and shortcut styling', () => {
    mount(<PositionedFixture />);
    const el = surface();
    // Same surface constant as the Radix ContextMenuContent.
    expect(el.className).toContain('bg-gray-50');
    expect(el.className).toContain('rounded-lg');

    const destructive = rowByText(el, 'Delete');
    const normal = rowByText(el, 'Duplicate');
    expect(destructive.getAttribute('data-variant')).toBe('destructive');
    expect(destructive.className).toContain('text-red-600');
    expect(normal.getAttribute('data-variant')).toBe('default');
    expect(normal.className).not.toContain('text-red-600');
    // Identical row geometry constant to the Radix family.
    expect(normal.className).toContain('text-[13px]');
    expect(normal.getAttribute('data-slot')).toBe('context-menu-item');

    const separators = el.querySelectorAll('[data-slot="context-menu-separator"]');
    expect(separators).toHaveLength(2);
    expect(separators[0].getAttribute('role')).toBe('separator');
    expect(el.querySelector('[data-slot="context-menu-label"]')).not.toBeNull();
  });

  it('aligns the icon slot and right-aligns the shared shortcut slot', () => {
    mount(<PositionedFixture />);
    const row = rowByText(surface(), 'Duplicate');
    const iconSlot = row.querySelector('[data-slot="context-menu-icon"]')!;
    expect(iconSlot).not.toBeNull();
    expect(iconSlot.getAttribute('aria-hidden')).toBe('true');
    expect(row.firstElementChild).toBe(iconSlot);

    // ContextMenuShortcut is reused verbatim by both families.
    const shortcut = row.querySelector<HTMLElement>('[data-slot="context-menu-shortcut"]')!;
    expect(shortcut.textContent).toBe('Ctrl+D');
    expect(shortcut.className).toContain('ml-auto');
    expect(row.lastElementChild).toBe(shortcut);
  });

  it('renders an accessible swatch row using the shared swatch styling', () => {
    const onPickSwatch = vi.fn();
    mount(<PositionedFixture onPickSwatch={onPickSwatch} />);
    const row = surface().querySelector<HTMLElement>('[data-slot="context-menu-swatch-row"]')!;
    expect(row.getAttribute('role')).toBe('group');

    const swatches = Array.from(row.querySelectorAll<HTMLElement>('[data-slot="context-menu-swatch"]'));
    expect(swatches).toHaveLength(2);
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual(['Red', 'Blue']);
    expect(swatches.every((s) => s.getAttribute('role') === 'menuitem')).toBe(true);
    expect(swatches[0].style.backgroundColor).toBe('rgb(224, 49, 49)');
    expect(swatches[0].hasAttribute('data-selected')).toBe(true);
    expect(swatches[1].hasAttribute('data-selected')).toBe(false);

    act(() => {
      swatches[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onPickSwatch).toHaveBeenCalledTimes(1);
  });

  it('moves focus with arrow keys, skipping disabled rows, and activates with Enter', () => {
    const onPick = vi.fn();
    mount(<PositionedFixture onPick={onPick} />);
    const el = surface();
    // Focus starts on the surface itself.
    expect(document.activeElement).toBe(el);

    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(rowByText(el, 'Duplicate'));

    // "Paste" is disabled, so ArrowDown skips straight past it to the first swatch.
    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
    });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Red');

    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      );
    });
    const focused = document.activeElement as HTMLElement;
    expect(focused).toBe(rowByText(el, 'Duplicate'));

    act(() => {
      focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the previously focused element when it closes', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button data-testid="opener" onClick={() => setOpen(true)}>open</button>
          <PositionedContextMenu open={open} x={10} y={10} onOpenChange={setOpen}>
            <PositionedContextMenuItem>Only</PositionedContextMenuItem>
          </PositionedContextMenu>
        </>
      );
    }
    const dom = mount(<Harness />);
    const opener = dom.querySelector<HTMLElement>('[data-testid="opener"]')!;
    act(() => { opener.focus(); });
    act(() => {
      opener.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(surface());
    act(() => {
      surface().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(opener);
  });

  it('needs no trigger element and no synthetic contextmenu event to open', () => {
    // The whole fixture is just <PositionedContextMenu open> — there is no
    // ContextMenuTrigger anywhere, and no contextmenu event is ever dispatched.
    mount(<PositionedFixture />);
    expect(surface()).not.toBeNull();
    expect(document.querySelector('[data-radix-context-menu-trigger]')).toBeNull();
    expect(document.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
  });
});

// ── Positioned submenus ───────────────────────────────────────────────────
describe('positioned context menu submenu', () => {
  /** React synthesizes onMouseEnter/onMouseLeave from native mouseover/mouseout. */
  function enter(target: HTMLElement) {
    act(() => {
      target.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }),
      );
    });
  }
  function leave(target: HTMLElement) {
    act(() => {
      target.dispatchEvent(
        new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }),
      );
    });
  }
  function key(target: HTMLElement, k: string) {
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    });
  }

  function SubFixture({
    onOpenChange = vi.fn(),
    onPick = vi.fn(),
    onDisabledPick = vi.fn(),
    subDisabled = false,
    keepOpen = false,
    rootStyle,
  }: Record<string, any> = {}) {
    return (
      <PositionedContextMenu open x={20} y={30} onOpenChange={onOpenChange} style={rootStyle}>
        <PositionedContextMenuItem>Cut</PositionedContextMenuItem>
        <PositionedContextMenuSub>
          <PositionedContextMenuSubTrigger disabled={subDisabled} icon={<TrashIcon />}>
            Change Alignment...
          </PositionedContextMenuSubTrigger>
          <PositionedContextMenuSubContent>
            <PositionedContextMenuItem
              onSelect={keepOpen ? (event: any) => event.preventDefault() : onPick}
            >
              Left
            </PositionedContextMenuItem>
            <PositionedContextMenuItem disabled onSelect={onDisabledPick}>
              Center
            </PositionedContextMenuItem>
            <PositionedContextMenuSeparator />
            <PositionedContextMenuItem onSelect={onPick}>Right</PositionedContextMenuItem>
          </PositionedContextMenuSubContent>
        </PositionedContextMenuSub>
        <PositionedContextMenuItem>Paste</PositionedContextMenuItem>
      </PositionedContextMenu>
    );
  }

  function root(): HTMLElement {
    return document.querySelector<HTMLElement>('[data-slot="positioned-context-menu-content"]')!;
  }
  function subContent(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-slot="positioned-context-menu-sub-content"]');
  }
  function openSubContent(): HTMLElement {
    const el = subContent();
    expect(el, 'submenu is not open').not.toBeNull();
    return el!;
  }
  function trigger(): HTMLElement {
    return document.querySelector<HTMLElement>('[data-slot="context-menu-sub-trigger"]')!;
  }
  function rowByText(scope: ParentNode, text: string): HTMLElement {
    const match = Array.from((scope as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((el) => el.textContent?.includes(text));
    expect(match, `no menuitem containing "${text}"`).toBeTruthy();
    return match!;
  }

  /** jsdom reports zero box metrics; pin them so positioning is measurable. */
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

  function stubTriggerRect(rect: Partial<DOMRect>) {
    const full = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, ...rect };
    trigger().getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect;
  }

  // 1 / 2 — shared styling
  it('renders the trigger with shared row styling and a trailing chevron', () => {
    mount(<SubFixture />);
    const el = trigger();
    expect(el.className).toContain('text-[13px]');
    expect(el.className).toContain('data-[highlighted]:bg-gray-200/70');
    expect(el.className).toContain('data-[disabled]:opacity-50');
    // Same leading icon slot as any other row, chevron last.
    expect(el.firstElementChild?.getAttribute('data-slot')).toBe('context-menu-icon');
    expect(el.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(el.lastElementChild?.getAttribute('class')).toContain('ml-auto');
  });

  it('renders submenu content on the shared menu surface', () => {
    mount(<SubFixture />);
    enter(trigger());
    const el = openSubContent();
    expect(el.className).toContain('bg-gray-50');
    expect(el.className).toContain('rounded-lg');
    expect(el.className).toContain('fixed');
    // Rows and separators inside a submenu are the same shared primitives.
    expect(rowByText(el, 'Left').getAttribute('data-slot')).toBe('context-menu-item');
    expect(el.querySelectorAll('[data-slot="context-menu-separator"]')).toHaveLength(1);
  });

  // 3 / 4 — pointer
  it('opens on hover and stays open while the pointer travels into the content', async () => {
    vi.useFakeTimers();
    try {
      mount(<SubFixture />);
      enter(trigger());
      expect(subContent()).not.toBeNull();

      // Pointer leaves the trigger heading for the submenu.
      leave(trigger());
      act(() => { vi.advanceTimersByTime(50); });
      expect(subContent(), 'closed before the pointer could arrive').not.toBeNull();

      enter(openSubContent());
      act(() => { vi.advanceTimersByTime(500); });
      expect(subContent(), 'closed even though the pointer is inside it').not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes once the pointer leaves and the grace period elapses', () => {
    vi.useFakeTimers();
    try {
      mount(<SubFixture />);
      enter(trigger());
      leave(trigger());
      act(() => { vi.advanceTimersByTime(500); });
      expect(subContent()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // 5 / 6 / 7 / 8 — keyboard
  it('opens with ArrowRight and moves focus onto the first enabled submenu item', () => {
    mount(<SubFixture />);
    act(() => { trigger().focus(); });
    // Focusing the trigger opens it, but must not steal focus.
    expect(document.activeElement).toBe(trigger());

    key(trigger(), 'ArrowRight');
    expect(document.activeElement).toBe(rowByText(openSubContent(), 'Left'));
  });

  it('moves focus in on ArrowRight even when hover already opened the submenu', () => {
    // There is no open-state transition to hang the focus move off in this
    // case, so it must not be driven by one.
    mount(<SubFixture />);
    enter(trigger());
    openSubContent();
    expect(document.activeElement).not.toBe(rowByText(openSubContent(), 'Left'));

    key(trigger(), 'ArrowRight');
    expect(document.activeElement).toBe(rowByText(openSubContent(), 'Left'));
  });

  it('navigates submenu items with ArrowDown/ArrowUp, skipping disabled ones', () => {
    mount(<SubFixture />);
    key(trigger(), 'ArrowRight');
    const content = openSubContent();
    expect(document.activeElement).toBe(rowByText(content, 'Left'));

    // "Center" is disabled, so ArrowDown skips straight to "Right".
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByText(content, 'Right'));

    key(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(rowByText(content, 'Left'));

    key(document.activeElement as HTMLElement, 'End');
    expect(document.activeElement).toBe(rowByText(content, 'Right'));

    key(document.activeElement as HTMLElement, 'Home');
    expect(document.activeElement).toBe(rowByText(content, 'Left'));
  });

  // 9 — ArrowLeft
  it('closes on ArrowLeft and returns focus to its trigger without reopening', () => {
    mount(<SubFixture />);
    key(trigger(), 'ArrowRight');
    openSubContent();

    key(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(subContent(), 'ArrowLeft did not close the submenu').toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  // 10 — Escape
  it('dismisses the whole hierarchy on Escape from inside the submenu', () => {
    const onOpenChange = vi.fn();
    mount(<SubFixture onOpenChange={onOpenChange} />);
    key(trigger(), 'ArrowRight');
    // The portal still bubbles through the React tree to the root surface.
    key(document.activeElement as HTMLElement, 'Escape');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 11 / 12 / 13 — selection contract
  it('fires a submenu item callback and closes the hierarchy', () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    mount(<SubFixture onPick={onPick} onOpenChange={onOpenChange} />);
    enter(trigger());
    act(() => {
      rowByText(openSubContent(), 'Right')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('honours preventDefault to keep the menu open, matching root items', () => {
    const onOpenChange = vi.fn();
    mount(<SubFixture keepOpen onOpenChange={onOpenChange} />);
    enter(trigger());
    act(() => {
      rowByText(openSubContent(), 'Left')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(subContent()).not.toBeNull();
  });

  it('does not activate a disabled submenu item', () => {
    const onDisabledPick = vi.fn();
    const onOpenChange = vi.fn();
    mount(<SubFixture onDisabledPick={onDisabledPick} onOpenChange={onOpenChange} />);
    enter(trigger());
    const disabled = rowByText(openSubContent(), 'Center');
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    act(() => {
      disabled.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onDisabledPick).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // 14 — disabled trigger
  it('never opens from a disabled trigger, by hover, click or ArrowRight', () => {
    mount(<SubFixture subDisabled />);
    const el = trigger();
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el.hasAttribute('data-disabled')).toBe(true);
    expect(el.getAttribute('aria-expanded')).toBe('false');

    enter(el);
    expect(subContent()).toBeNull();
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(subContent()).toBeNull();
    key(el, 'ArrowRight');
    expect(subContent()).toBeNull();
  });

  it('skips a disabled submenu trigger during root navigation', () => {
    mount(<SubFixture subDisabled />);
    key(root(), 'ArrowDown');
    expect(document.activeElement).toBe(rowByText(root(), 'Cut'));
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByText(root(), 'Paste'));
  });

  // 15 — ARIA
  it('exposes menu semantics on the trigger and the content', () => {
    mount(<SubFixture />);
    expect(trigger().getAttribute('role')).toBe('menuitem');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    enter(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(openSubContent().getAttribute('role')).toBe('menu');
    // The trigger points at the surface it controls.
    expect(trigger().getAttribute('aria-controls')).toBe(openSubContent().id);
  });

  // 16 / 17 / 18 — positioning
  it('positions itself against its trigger, with no coordinates from the consumer', () => {
    withMenuBox(160, 120, () => {
      mount(<SubFixture />);
      stubTriggerRect({ left: 100, right: 300, top: 200, bottom: 224, width: 200, height: 24 });
      enter(trigger());
      const el = openSubContent();
      // Right edge of the trigger, less the pointer-travel overlap.
      expect(el.style.left).toBe(`${300 - 4}px`);
      expect(el.style.top).toBe(`${200 - 4}px`);
    });
  });

  it('flips to the left when the right side cannot hold it', () => {
    withMenuBox(300, 120, () => {
      mount(<SubFixture />);
      // Trigger hard against the right edge of the 1024px jsdom viewport.
      stubTriggerRect({ left: 800, right: 1000, top: 100, bottom: 124, width: 200, height: 24 });
      enter(trigger());
      // 1000 - 4 + 300 overflows, so it flips: left edge - width + overlap.
      expect(openSubContent().style.left).toBe(`${800 - 300 + 4}px`);
    });
  });

  it('clamps vertically instead of overflowing the bottom of the viewport', () => {
    withMenuBox(160, 400, () => {
      mount(<SubFixture />);
      stubTriggerRect({ left: 10, right: 200, top: 700, bottom: 724, width: 190, height: 24 });
      enter(trigger());
      // jsdom viewport is 768 tall; 768 - 400 - 8.
      expect(openSubContent().style.top).toBe(`${768 - 400 - 8}px`);
    });
  });

  it('stacks above a root menu that raised its own z-index', () => {
    mount(<SubFixture rootStyle={{ zIndex: 9999 }} />);
    enter(trigger());
    expect(openSubContent().style.zIndex).toBe('10000');
  });

  // 19 — outside-dismiss isolation
  it('does not treat submenu interaction as an outside click on the root', async () => {
    const onOpenChange = vi.fn();
    mount(<SubFixture onOpenChange={onOpenChange} />);
    enter(trigger());
    // Let the root's deferred outside-pointer listener attach.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => {
      openSubContent().dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
    });
    expect(onOpenChange, 'submenu interaction closed the root menu').not.toHaveBeenCalled();
    expect(subContent()).not.toBeNull();

    // A genuine outside click still dismisses.
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 20 — level separation
  it('keeps root navigation out of submenu descendants while the submenu is open', () => {
    mount(<SubFixture />);
    enter(trigger());
    const content = openSubContent();
    expect(content).not.toBeNull();

    // Three root rows: Cut, the sub trigger, Paste. Cycling must never leave them.
    const seen: HTMLElement[] = [];
    key(root(), 'ArrowDown');
    for (let i = 0; i < 4; i += 1) {
      seen.push(document.activeElement as HTMLElement);
      key(document.activeElement as HTMLElement, 'ArrowDown');
    }
    expect(seen.some((el) => content.contains(el))).toBe(false);
    expect(seen.map((el) => el.textContent?.trim())).toEqual([
      'Cut', 'Change Alignment...', 'Paste', 'Cut',
    ]);
  });

  it('never lets submenu rows join the root ring, even rendered inline', () => {
    // Guards the level check itself rather than the portal: a row that is a DOM
    // descendant of the root surface but belongs to another surface must not be
    // reachable from the root ring.
    mount(
      <PositionedContextMenu open x={10} y={10} onOpenChange={vi.fn()}>
        <PositionedContextMenuItem>Alpha</PositionedContextMenuItem>
        <div data-positioned-menu-surface="">
          <PositionedContextMenuItem>Nested</PositionedContextMenuItem>
        </div>
      </PositionedContextMenu>,
    );
    key(root(), 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('Alpha');
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('Alpha');
  });

  // 23 — backward compatibility
  it('adds the submenu exports without disturbing the existing ones', async () => {
    const mod = await import('./context-menu');
    for (const name of [
      'ContextMenu', 'ContextMenuTrigger', 'ContextMenuContent', 'ContextMenuItem',
      'ContextMenuCheckboxItem', 'ContextMenuRadioItem', 'ContextMenuLabel',
      'ContextMenuSeparator', 'ContextMenuShortcut', 'ContextMenuGroup',
      'ContextMenuPortal', 'ContextMenuSub', 'ContextMenuSubContent',
      'ContextMenuSubTrigger', 'ContextMenuRadioGroup', 'ContextMenuSwatchRow',
      'ContextMenuSwatch',
      'PositionedContextMenu', 'PositionedContextMenuItem',
      'PositionedContextMenuSeparator', 'PositionedContextMenuLabel',
      'PositionedContextMenuSwatch',
      'PositionedContextMenuSub', 'PositionedContextMenuSubTrigger',
      'PositionedContextMenuSubContent',
    ]) {
      expect(mod, `missing export ${name}`).toHaveProperty(name);
    }
  });

  it('keeps the whole public surface on @/components/ui/context-menu', async () => {
    // Frozen at the 4F.1 internal split. The implementation lives in three
    // modules now; consumers must still see exactly one import path with
    // exactly these names. Adding a name here is a deliberate API change.
    const mod = await import('./context-menu');
    expect(Object.keys(mod).sort()).toEqual([
      'ContextMenu',
      'ContextMenuCheckboxItem',
      'ContextMenuContent',
      'ContextMenuGroup',
      'ContextMenuItem',
      'ContextMenuLabel',
      'ContextMenuPortal',
      'ContextMenuRadioGroup',
      'ContextMenuRadioItem',
      'ContextMenuSeparator',
      'ContextMenuShortcut',
      'ContextMenuSub',
      'ContextMenuSubContent',
      'ContextMenuSubTrigger',
      'ContextMenuSwatch',
      'ContextMenuSwatchRow',
      'ContextMenuTrigger',
      'PositionedContextMenu',
      'PositionedContextMenuItem',
      'PositionedContextMenuLabel',
      'PositionedContextMenuSeparator',
      'PositionedContextMenuSub',
      'PositionedContextMenuSubContent',
      'PositionedContextMenuSubTrigger',
      'PositionedContextMenuSwatch',
    ]);
  });

  it('forwards the positioned root components unchanged, not as copies', async () => {
    // Proves the barrel forwards the real implementations rather than
    // shadowing them, so behavior cannot drift between import paths.
    const barrel = await import('./context-menu');
    const rootModule = await import('./positioned-context-menu');
    for (const name of [
      'PositionedContextMenu', 'PositionedContextMenuItem',
      'PositionedContextMenuSeparator', 'PositionedContextMenuLabel',
      'PositionedContextMenuSwatch',
    ] as const) {
      expect((barrel as any)[name], `${name} is not the same reference`)
        .toBe((rootModule as any)[name]);
    }
  });

  it('forwards the positioned submenu components unchanged, not as copies', async () => {
    const barrel = await import('./context-menu');
    const subModule = await import('./positioned-context-menu-submenu');
    for (const name of [
      'PositionedContextMenuSub', 'PositionedContextMenuSubTrigger',
      'PositionedContextMenuSubContent',
    ] as const) {
      expect((barrel as any)[name], `${name} is not the same reference`)
        .toBe((subModule as any)[name]);
    }
  });

  it('keeps root-to-submenu internals out of the public barrel', async () => {
    // The submenu reaches into the root for these; consumers must not see them.
    const barrel = await import('./context-menu');
    for (const internal of [
      'POSITIONED_MENU_VIEWPORT_MARGIN', 'usePositionedContextMenu',
      'focusableRows', 'moveFocus',
    ]) {
      expect(barrel, `${internal} leaked into the public surface`)
        .not.toHaveProperty(internal);
    }
    // They are genuinely available to the submenu module, though.
    const rootModule = await import('./positioned-context-menu');
    expect(typeof (rootModule as any).focusableRows).toBe('function');
    expect(typeof (rootModule as any).moveFocus).toBe('function');
  });

  it('draws both families from one style source', async () => {
    // The Radix surface and the positioned surface must render byte-identical
    // class strings; a forked constant in either module breaks this.
    const styles = await import('./context-menu-styles');
    const radixMenu = openMenu(mount(<Fixture />));
    mount(
      <PositionedContextMenu open x={10} y={10} onOpenChange={vi.fn()}>
        <PositionedContextMenuItem>Only</PositionedContextMenuItem>
      </PositionedContextMenu>,
    );
    const positioned = document.querySelector<HTMLElement>(
      '[data-slot="positioned-context-menu-content"]',
    )!;

    for (const cls of styles.menuSurfaceClassName.split(' ')) {
      expect(radixMenu.className, `radix surface missing ${cls}`).toContain(cls);
      expect(positioned.className, `positioned surface missing ${cls}`).toContain(cls);
    }
    const radixRow = itemByText(radixMenu, 'Duplicate');
    const positionedRow = positioned.querySelector<HTMLElement>('[role="menuitem"]')!;
    for (const cls of styles.menuRowClassName.split(' ')) {
      expect(radixRow.className, `radix row missing ${cls}`).toContain(cls);
      expect(positionedRow.className, `positioned row missing ${cls}`).toContain(cls);
    }

    // The submenu module is the third consumer of that same source.
    mount(<SubFixture />);
    enter(trigger());
    for (const cls of styles.menuSurfaceClassName.split(' ')) {
      expect(openSubContent().className, `submenu surface missing ${cls}`).toContain(cls);
    }
    for (const cls of styles.menuRowClassName.split(' ')) {
      expect(trigger().className, `submenu trigger missing ${cls}`).toContain(cls);
    }
  });

  it('has no cycle between the four context-menu modules', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (file: string) =>
      fs.readFileSync(path.join(process.cwd(), 'components/ui', file), 'utf8');
    /** Local module specifiers this file imports from. */
    const importsOf = (source: string) =>
      Array.from(source.matchAll(/from "(\.\/[^"]+)"/g)).map((m) => m[1]);

    // Required direction:  styles <- root <- submenu,  barrel -> all three.
    expect(importsOf(read('context-menu-styles.tsx'))).toEqual([]);
    expect(importsOf(read('positioned-context-menu.tsx'))).toEqual(['./context-menu-styles']);
    expect(importsOf(read('positioned-context-menu-submenu.tsx')).sort()).toEqual([
      './context-menu-styles', './positioned-context-menu',
    ]);
    expect(importsOf(read('context-menu.tsx')).sort()).toEqual([
      './context-menu-styles',
      './positioned-context-menu',
      './positioned-context-menu',
      './positioned-context-menu-submenu',
      './positioned-context-menu-submenu',
    ]);

    // The two rules that would create a cycle, stated directly. Checked against
    // imports rather than raw text, since prose may name a sibling module.
    expect(
      importsOf(read('positioned-context-menu.tsx')),
      'the root module must not depend on its submenu',
    ).not.toContain('./positioned-context-menu-submenu');
    for (const file of [
      'context-menu-styles.tsx', 'positioned-context-menu.tsx',
      'positioned-context-menu-submenu.tsx',
    ]) {
      expect(importsOf(read(file)), `${file} must not import the public barrel`)
        .not.toContain('./context-menu');
    }
  });

  it('leaves a positioned menu without a submenu completely unchanged', () => {
    // No submenu means no haspopup, no satellite surface, no extra portal.
    mount(
      <PositionedContextMenu open x={10} y={10} onOpenChange={vi.fn()}>
        <PositionedContextMenuItem>Only</PositionedContextMenuItem>
      </PositionedContextMenu>,
    );
    expect(document.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-positioned-menu-surface]')).toHaveLength(1);
    expect(subContent()).toBeNull();
  });
});
