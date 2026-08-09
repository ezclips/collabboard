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
