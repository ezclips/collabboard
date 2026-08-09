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
});
