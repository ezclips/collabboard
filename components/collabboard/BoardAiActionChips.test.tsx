// @vitest-environment jsdom
//
// PATCH-378. The ready-made action chips and the `/` menu: one chip per action,
// a chip SENDS, a menu choice INSERTS, Map is answer-only, and the row does not
// exist without a layout.
import React, { act } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BoardAiActionChips, { type BoardAiActionKeyHandler } from './BoardAiActionChips';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onSend = vi.fn();
const onInsert = vi.fn();
/** The handler the component hands the drawer; null while the menu is closed. */
let keyHandler: BoardAiActionKeyHandler | null = null;
const onKeyHandlerChange = vi.fn((handler: BoardAiActionKeyHandler | null) => { keyHandler = handler; });

function mount(overrides: Partial<React.ComponentProps<typeof BoardAiActionChips>> = {}) {
  render(
    <BoardAiActionChips
      actionLayout="columns"
      onSend={onSend}
      onInsert={onInsert}
      onKeyHandlerChange={onKeyHandlerChange}
      {...overrides}
    />,
  );
}

const chip = (id: string) => document.querySelector(`[data-board-ai-action="${id}"]`) as HTMLButtonElement | null;
const chips = () => Array.from(document.querySelectorAll('[data-board-ai-action]')) as HTMLElement[];
const menu = () => document.querySelector('[data-board-ai-action-menu="true"]') as HTMLElement | null;
const menuItems = () => Array.from(document.querySelectorAll('[data-board-ai-action-menu-item]')) as HTMLElement[];

/** Press a key through the handler the component registered. */
function press(key: string) {
  const preventDefault = vi.fn();
  let consumed = false;
  act(() => {
    consumed = keyHandler?.({ key, preventDefault } as unknown as React.KeyboardEvent<HTMLTextAreaElement>) ?? false;
  });
  return { consumed, preventDefault };
}

beforeEach(() => {
  onSend.mockReset();
  onInsert.mockReset();
  onKeyHandlerChange.mockReset();
  keyHandler = null;
});

afterEach(cleanup);

describe('A. the chip row', () => {
  it('renders one chip per action, each showing its slash form', () => {
    mount();
    expect(chips()).toHaveLength(7);
    expect(chip('summarize')?.textContent).toBe('/summarize');
    expect(chip('group-by-theme')?.textContent).toBe('/group-by-theme');
    expect(chip('retro')?.textContent).toBe('/retro');
  });

  it('renders nothing at all without a layout', () => {
    mount({ actionLayout: null });
    expect(chips()).toHaveLength(0);
    expect(document.querySelector('[data-board-ai-actions="true"]')).toBeNull();
  });

  it('offers only the answer actions on Map', () => {
    mount({ actionLayout: 'map' });
    expect(chips().map((el) => el.getAttribute('data-board-ai-action')))
      .toEqual(['summarize', 'duplicates', 'open-questions']);
  });

  it('sends the prompt, in the board own noun', () => {
    mount({ actionLayout: 'columns' });
    fireEvent.click(chip('group-by-theme')!);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toContain('into columns by theme');

    cleanup();
    onSend.mockReset();
    mount({ actionLayout: 'wall' });
    fireEvent.click(chip('group-by-theme')!);
    expect(onSend.mock.calls[0][0]).toContain('into cards by theme');
  });

  it('disables every chip while a reply is streaming', () => {
    mount({ disabled: true });
    expect(chips()).toHaveLength(7);
    for (const el of chips()) expect((el as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(chip('summarize')!);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('B. the `/` menu', () => {
  it('is closed until the composer starts with a slash', () => {
    mount({ draft: '' });
    expect(menu()).toBeNull();
    expect(keyHandler).toBeNull();

    cleanup();
    mount({ draft: 'group these' });
    expect(menu()).toBeNull();
  });

  it('opens on a slash and filters as the query grows', () => {
    mount({ draft: '/' });
    expect(menuItems()).toHaveLength(7);

    cleanup();
    mount({ draft: '/ne' });
    expect(menuItems().map((el) => el.getAttribute('data-board-ai-action-menu-item'))).toEqual(['next-steps']);

    cleanup();
    mount({ draft: '/zzz' });
    expect(menu()).toBeNull();
  });

  it('is not offered on a layout that has no actions', () => {
    mount({ actionLayout: null, draft: '/ne' });
    expect(menu()).toBeNull();
    expect(keyHandler).toBeNull();
  });

  it('hands the drawer a key handler only while it is open', () => {
    mount({ draft: '/ne' });
    expect(typeof keyHandler).toBe('function');

    cleanup();
    mount({ draft: 'ne' });
    expect(keyHandler).toBeNull();
  });

  it('puts the chosen prompt in the composer and sends NOTHING', () => {
    mount({ draft: '/ne' });
    expect(press('Enter').consumed).toBe(true);
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert.mock.calls[0][0]).toContain('Next steps');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('chooses the highlighted item with the arrows', () => {
    mount({ draft: '/' });
    // The first entry is highlighted to start with, so one step down is the
    // second action.
    press('ArrowDown');
    press('Enter');
    expect(onInsert.mock.calls[0][0]).toContain('into columns by theme');
  });

  it('wraps around at both ends', () => {
    mount({ draft: '/' });
    press('ArrowUp');
    press('Enter');
    expect(onInsert.mock.calls[0][0]).toContain('Sort this board into three');
  });

  it('dismisses on Escape without eating what was typed, and reopens on the next keystroke', () => {
    mount({ draft: '/ne' });
    const escape = press('Escape');
    expect(escape.consumed).toBe(true);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();

    // The composer still says '/ne', so a keystroke that changes the query opens
    // the menu again.
    cleanup();
    mount({ draft: '/nex' });
    expect(menu()).not.toBeNull();
  });

  it('chooses by click too', () => {
    mount({ draft: '/re' });
    fireEvent.click(menuItems()[0]);
    expect(onInsert.mock.calls[0][0]).toContain('Sort this board into three');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('leaves every other key to the drawer', () => {
    mount({ draft: '/ne' });
    expect(press('a').consumed).toBe(false);
    expect(onInsert).not.toHaveBeenCalled();
  });
});
