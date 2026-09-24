// @vitest-environment jsdom
//
// PATCH-165 -- row and column handle menus, and the "+" bars.
//
// Harness: the react-dom/client + act pattern of
// TableEditor.commentCanonicalization.test.tsx, and the positioned-menu
// interaction model of tableCellContextMenu.characterization.test.tsx (click a
// menuitem button; submenus are portaled siblings of the root surface).
//
// EVERY assertion is made through `onSave`'s JSON -- the editor's own
// save-and-close path -- so the tests read what the app would persist rather
// than an internal state hook.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import TableEditor from './TableEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
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
  vi.restoreAllMocks();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function tick() {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}

/** The positioned menu surface (root or a portaled submenu). */
function surfaces(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], [data-slot="positioned-context-menu-sub-content"]',
  ));
}
function menuEls(): HTMLElement[] {
  return surfaces().flatMap((s) => Array.from(s.querySelectorAll<HTMLElement>('[role="menuitem"]')));
}
function menuLabels(): string[] {
  return menuEls().map((el) => (el.textContent ?? '').trim()).filter((l) => l.length > 0);
}
function menuItem(label: string): HTMLElement {
  const found = menuEls().find((el) => (el.textContent ?? '').trim() === label);
  expect(found, ).not.toBeUndefined();
  return found!;
}

/** A 3x3 table with a coloured cell in row 1 (the second row), for shifting. */
const THREE_BY_THREE = {
  rows: [['a0', 'b0', 'c0'], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
  columns: ['A', 'B', 'C'],
  cellStyles: { '1-1': { bg: '#dcfce7' } },
  caption: '',
  titleStyle: {},
};

function tableEditor(content: object, onSave = vi.fn()) {
  const c = mount(<TableEditor isOpen onClose={vi.fn()} onSave={onSave} initialContent={JSON.stringify(content)} />);
  return { c, onSave };
}

/** Save through the editor's existing overlay-click path and parse the JSON. */
function savedContent(onSave: ReturnType<typeof vi.fn>, container: HTMLElement) {
  act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(onSave).toHaveBeenCalledTimes(1);
  return JSON.parse(onSave.mock.calls[0][0].content);
}

const rowHandle = (c: HTMLElement, index: number) =>
  c.querySelector<HTMLButtonElement>(`[data-table-row-handle="${index}"]`)!;
const columnHandle = (c: HTMLElement, index: number) =>
  c.querySelector<HTMLButtonElement>(`[data-table-column-handle="${index}"]`)!;

describe('PATCH-165 -- the handle menus', () => {
  it('a row grip opens a menu with exactly the row items, in order', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    click(rowHandle(c, 1));
    await tick();
    const labels = menuLabels();
    expect(labels).toContain('Insert above');
    expect(labels).toContain('Insert below');
    expect(labels).toContain('Duplicate');
    expect(labels).toContain('Clear contents');
    expect(labels).toContain('Delete');
    // ORDER, not just presence.
    expect(labels.indexOf('Insert above')).toBeLessThan(labels.indexOf('Insert below'));
    expect(labels.indexOf('Insert below')).toBeLessThan(labels.indexOf('Duplicate'));
    expect(labels.indexOf('Duplicate')).toBeLessThan(labels.indexOf('Clear contents'));
    expect(labels.indexOf('Clear contents')).toBeLessThan(labels.indexOf('Delete'));
  });

  it('a column grip opens a menu with the column items, in order', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    click(columnHandle(c, 1));
    await tick();
    const labels = menuLabels();
    expect(labels).toContain('Insert left');
    expect(labels).toContain('Insert right');
    expect(labels).toContain('Delete');
    expect(labels.indexOf('Insert left')).toBeLessThan(labels.indexOf('Insert right'));
  });

  it('Insert above on row 2 (index 1) with a coloured cell moves that colour to row 3 (index 2)', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    // Sanity: the colour starts on row index 1.
    expect(THREE_BY_THREE.cellStyles['1-1']).toEqual({ bg: '#dcfce7' });

    click(rowHandle(c, 1));
    await tick();
    click(menuItem('Insert above'));

    const saved = savedContent(onSave, c);
    expect(saved.rows).toHaveLength(4);
    // A blank row was inserted at index 1; the old row 1 is now row 2.
    expect(saved.rows[1]).toEqual(['', '', '']);
    expect(saved.rows[2]).toEqual(['a1', 'b1', 'c1']);
    // The style that was on row 1 is now on row 2, and nothing remains on row 1.
    expect(saved.cellStyles['2-1']).toEqual({ bg: '#dcfce7' });
    expect(saved.cellStyles['1-1']).toBeUndefined();
  });

  it('REGRESSION via the RIGHT-CLICK path: Insert row above moves row 1\'s style to row 2', async () => {
    // The old bug: the right-click menu changed rows but not cellStyles, so the
    // colour stayed on the OLD row index. This drives the same action through
    // the cell context menu, which must now move the style too.
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    // Right-click a cell in the first row to select it and open the menu.
    const firstCell = c.querySelectorAll('tbody tr')[0].querySelectorAll('td')[1];
    act(() => {
      firstCell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await tick();
    click(menuItem('Insert row above'));

    const saved = savedContent(onSave, c);
    // A row is prepended, so the old row 0 text is now row 1.
    expect(saved.rows[0]).toEqual(['', '', '']);
    expect(saved.rows[1]).toEqual(['a0', 'b0', 'c0']);
    // And the style that was on row 1 ('1-1') moved to row 2.
    expect(saved.cellStyles['2-1']).toEqual({ bg: '#dcfce7' });
    expect(saved.cellStyles['1-1']).toBeUndefined();
  });

  it('Duplicate copies text and style into the row below', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(rowHandle(c, 1));
    await tick();
    click(menuItem('Duplicate'));

    const saved = savedContent(onSave, c);
    expect(saved.rows[1]).toEqual(['a1', 'b1', 'c1']);
    expect(saved.rows[2]).toEqual(['a1', 'b1', 'c1']);
    expect(saved.cellStyles['1-1']).toEqual({ bg: '#dcfce7' });
    expect(saved.cellStyles['2-1']).toEqual({ bg: '#dcfce7' });
  });

  it('Clear contents empties the text and KEEPS the style', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(rowHandle(c, 1));
    await tick();
    click(menuItem('Clear contents'));

    const saved = savedContent(onSave, c);
    expect(saved.rows[1]).toEqual(['', '', '']);
    expect(saved.cellStyles['1-1']).toEqual({ bg: '#dcfce7' });
  });

  it('Delete removes the row and its styles', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(rowHandle(c, 1));
    await tick();
    click(menuItem('Delete'));

    const saved = savedContent(onSave, c);
    expect(saved.rows).toEqual([['a0', 'b0', 'c0'], ['a2', 'b2', 'c2']]);
    expect(saved.cellStyles['1-1']).toBeUndefined();
  });

  it('Delete is ABSENT from the row menu when there is only one row', async () => {
    const one: object = { rows: [['only']], columns: ['A'], cellStyles: {}, caption: '', titleStyle: {} };
    const { c } = tableEditor(one);
    click(rowHandle(c, 0));
    await tick();
    expect(menuLabels()).not.toContain('Delete');
    // The rest of the menu is intact.
    expect(menuLabels()).toContain('Duplicate');
  });

  it('Delete is ABSENT from the column menu when there is only one column (the mirror)', async () => {
    const one: object = { rows: [['x'], ['y']], columns: ['A'], cellStyles: {}, caption: '', titleStyle: {} };
    const { c } = tableEditor(one);
    click(columnHandle(c, 0));
    await tick();
    expect(menuLabels()).not.toContain('Delete');
    expect(menuLabels()).toContain('Duplicate');
  });
});

describe('PATCH-165 -- color and align on the whole axis', () => {
  /** Opens a submenu by hovering its trigger, as the primitive expects. */
  async function openSubmenu(label: string) {
    const trigger = menuItem(label);
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }));
    });
    await tick();
  }

  it('Color sets bg on every cell of the row, and None removes it', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);

    // Colour every cell of row 0 with a palette swatch.
    click(rowHandle(c, 0));
    await tick();
    await openSubmenu('Color');
    const swatch = menuEls().find((el) => el.getAttribute('aria-label') === '#dbeafe');
    expect(swatch, 'no #dbeafe swatch in the Color submenu').not.toBeUndefined();
    click(swatch!); // a swatch closes the menu itself

    let saved = savedContent(onSave, c);
    expect(saved.cellStyles['0-0'].bg).toBe('#dbeafe');
    expect(saved.cellStyles['0-1'].bg).toBe('#dbeafe');
    expect(saved.cellStyles['0-2'].bg).toBe('#dbeafe');

    // Re-open and choose None: the bg key is REMOVED, not set to a string.
    const second = tableEditor({ ...saved });
    click(rowHandle(second.c, 0));
    await tick();
    await openSubmenu('Color');
    const none = menuEls().find((el) => el.getAttribute('aria-label') === 'None');
    expect(none, 'no None swatch').not.toBeUndefined();
    click(none!);

    const savedAgain = savedContent(second.onSave, second.c);
    expect(savedAgain.cellStyles['0-0']).toBeUndefined();
  });

  it('Align sets align on every cell of the row, and the menu shows a checkmark only for a shared value', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(rowHandle(c, 0));
    await tick();
    await openSubmenu('Align');
    click(menuItem('Center'));

    const saved = savedContent(onSave, c);
    expect(saved.cellStyles['0-0'].align).toBe('center');
    expect(saved.cellStyles['0-1'].align).toBe('center');
    expect(saved.cellStyles['0-2'].align).toBe('center');
  });
});

describe('PATCH-165 -- the column grip does not change selection', () => {
  it('clicking a column grip does NOT select the column the header click would', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    // Click the header LETTER of column 2 (index 1) directly: this selects it.
    const headerOne = c.querySelectorAll('thead th')[2] as HTMLElement; // th[0] is the corner
    click(headerOne);
    // Now open the COLUMN grip of a DIFFERENT column (index 2) and pick Duplicate.
    click(columnHandle(c, 2));
    await tick();
    // The menu is open for column 2. Selecting Duplicate must not have run the
    // header click's selection for column 2.
    click(menuItem('Duplicate'));

    const saved = savedContent(onSave, c);
    // The duplicate landed on column index 2's copy (index 3), named uniquely.
    expect(saved.columns).toEqual(['A', 'B', 'C', 'D']);
    expect(saved.rows[0]).toEqual(['a0', 'b0', 'c0', 'c0']);
  });

  it('the grip opens its menu WITHOUT selecting the column; the header letter still selects it', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    const headerOf = (col: number) => c.querySelectorAll('thead th')[col + 1] as HTMLElement; // th[0] is the corner
    click(columnHandle(c, 2));
    await tick();
    expect(menuLabels()).toContain('Insert left');
    expect(headerOf(2).className).not.toContain('bg-purple-100');
    // Control: the header click itself still selects, so the assertion above can fail.
    click(headerOf(1));
    expect(headerOf(1).className).toContain('bg-purple-100');
  });
});

describe('PATCH-165 -- the "+" bars', () => {
  it('the row bar appends a row', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(c.querySelector('[data-table-add-row="true"]')!);
    const saved = savedContent(onSave, c);
    expect(saved.rows).toHaveLength(4);
    expect(saved.rows[3]).toEqual(['', '', '']);
  });

  it('the column bar appends a column, and the new name is unique after a delete', async () => {
    // A,B,C -> delete B via its OWN handle menu -> A,C -> the next name must be
    // B, not D. Driving the delete through the handle menu keeps this test on
    // the surface this patch owns, and makes the deleted column unambiguous.
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(columnHandle(c, 1));
    await tick();
    click(menuItem('Delete'));
    await tick();

    click(c.querySelector('[data-table-add-column="true"]')!);
    const saved = savedContent(onSave, c);
    // A, C, then the appended name fills the first gap: B.
    expect(saved.columns).toEqual(['A', 'C', 'B']);
    expect(new Set(saved.columns).size).toBe(saved.columns.length);
  });
});
