// @vitest-environment jsdom
//
// PATCH-320 Addendum 1. Live, keyboard_navigation kept focus on the .gantt_row,
// so the inline editor's input never received typing, and a click into the
// input closed the editor. The mapping's onShow must focus the real input and
// take the editor's keys off the placeholder.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureGantt } from '@/components/gantt-canvas/GanttConfig';

type Mapping = {
  init: (ctrl: unknown, grid?: unknown) => void;
  onShow?: (ctrl: unknown, placeholder: unknown) => void;
  onHide?: (ctrl: unknown, placeholder?: unknown) => void;
};

function makeFakeGantt() {
  const mapping: { current: Mapping | null } = { current: null };
  const ganttHandlers: Record<string, (...args: unknown[]) => unknown> = {};
  const gantt = {
    config: {} as Record<string, unknown>,
    locale: {} as Record<string, unknown>,
    form_blocks: {} as Record<string, unknown>,
    plugins: vi.fn(),
    attachEvent: (name: string, cb: (...args: unknown[]) => unknown) => {
      ganttHandlers[name] = cb;
      return name;
    },
    ext: {
      inlineEditors: { setMapping: (m: Mapping) => { mapping.current = m; } },
      keyboardNavigation: { attachEvent: (name: string) => name },
    },
    constants: { KEY_CODES: { ENTER: 13, ESC: 27, TAB: 9 } },
    getTaskType: () => 'task',
  };
  return { gantt, mapping, ganttHandlers };
}

function makeCtrl() {
  return {
    isVisible: vi.fn(() => true),
    isChanged: vi.fn(() => true),
    save: vi.fn(),
    hide: vi.fn(),
    locateCell: vi.fn(() => null),
    getEditorConfig: vi.fn(() => ({ type: 'text' })),
    getState: vi.fn(() => ({ id: 'c1', columnName: 'text' })),
    startEdit: vi.fn(),
    attachEvent: vi.fn(),
  };
}

function makePlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'gantt_grid_editor_placeholder';
  const input = document.createElement('input');
  placeholder.appendChild(input);
  document.body.appendChild(placeholder);
  return { placeholder, input };
}

function makeGanttDom() {
  const root = document.createElement('div');
  root.className = 'gantt_layout_root';
  const placeholder = document.createElement('div');
  placeholder.className = 'gantt_grid_editor_placeholder';
  const input = document.createElement('input');
  placeholder.appendChild(input);
  const row = document.createElement('div');
  row.className = 'gantt_row';
  row.tabIndex = -1;
  root.appendChild(placeholder);
  root.appendChild(row);
  document.body.appendChild(root);
  return { root, placeholder, input, row };
}

function keyEvent(keyCode: number) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { value: keyCode });
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-320 Addendum 1: the Gantt inline editor onShow', () => {
  it('focuses the input; Enter/Escape/Tab act on the editor', async () => {
    const { gantt, mapping } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    const { placeholder, input } = makePlaceholder();

    mapping.current!.onShow!(ctrl, placeholder);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(input);

    input.dispatchEvent(keyEvent(13));
    expect(ctrl.save).toHaveBeenCalledTimes(1);

    input.dispatchEvent(keyEvent(27));
    expect(ctrl.hide).toHaveBeenCalledTimes(1);

    input.dispatchEvent(keyEvent(9));
    expect(ctrl.save).toHaveBeenCalledTimes(2);
  });

  it('removes the keydown listener on hide', () => {
    const { gantt, mapping } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    const { placeholder, input } = makePlaceholder();

    mapping.current!.onShow!(ctrl, placeholder);
    mapping.current!.onHide!(ctrl, placeholder);
    input.dispatchEvent(keyEvent(13));
    expect(ctrl.save).not.toHaveBeenCalled();
  });

  it('stops every key from reaching the container (Ctrl+A included)', () => {
    const { gantt, mapping } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    const { root, placeholder, input } = makeGanttDom();

    mapping.current!.onShow!(ctrl, placeholder);

    const onContainerKeydown = vi.fn();
    root.addEventListener('keydown', onContainerKeydown);

    // Ctrl+A: must not reach the gantt container, and must not save/hide.
    const ctrlA = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(ctrlA, 'keyCode', { value: 65 });
    input.dispatchEvent(ctrlA);
    expect(onContainerKeydown).not.toHaveBeenCalled();
    expect(ctrl.save).not.toHaveBeenCalled();
    expect(ctrl.hide).not.toHaveBeenCalled();
    // A normal key keeps its default action (not prevented).
    const plainKey = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    Object.defineProperty(plainKey, 'keyCode', { value: 65 });
    input.dispatchEvent(plainKey);
    expect(onContainerKeydown).not.toHaveBeenCalled();
    expect(plainKey.defaultPrevented).toBe(false);
  });

  it('a click inside the editor placeholder does not close the editor', () => {
    const { gantt, mapping, ganttHandlers } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    const { input } = makePlaceholder();

    ganttHandlers['onTaskClick']('c1', { target: input });
    expect(ctrl.save).not.toHaveBeenCalled();
    expect(ctrl.hide).not.toHaveBeenCalled();
  });

  it('pulls focus back to the input when keyboard_navigation focuses a .gantt_row', async () => {
    const { gantt, mapping } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    const { placeholder, input, row } = makeGanttDom();

    mapping.current!.onShow!(ctrl, placeholder);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(input);

    // keyboard_navigation re-focuses the row a few ms later.
    row.focus();
    expect(document.activeElement).toBe(input);
  });

  it('stops pulling focus back after onHide', () => {
    const { gantt, mapping } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    const { placeholder, row } = makeGanttDom();

    mapping.current!.onShow!(ctrl, placeholder);
    mapping.current!.onHide!(ctrl, placeholder);

    row.focus();
    expect(document.activeElement).toBe(row);
  });
});
