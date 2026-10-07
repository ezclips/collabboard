// PATCH-320 §1. Replacing the default inline-editor mapping dropped its
// keyboard handling, so Enter closed the editor without saving. The custom
// mapping must handle Enter (save) and Escape (cancel) itself.
//
// A full live reproduction (mounting dhtmlx-gantt and typing into the real
// grid) is not feasible here: the library requires a laid-out, measurable DOM
// that jsdom does not provide, and its inline editor only starts from real
// double-click hit-testing. This drives the same mapping `configureGantt`
// installs with a fake controller instead, which is where the missing
// keyboard handling lives.
import { describe, expect, it, vi } from 'vitest';
import { configureGantt } from '@/components/gantt-canvas/GanttConfig';

function makeFakeGantt() {
  const mapping: { current: { init: (ctrl: unknown, grid?: unknown) => void } | null } = { current: null };
  const keyboard: { current: ((...args: unknown[]) => unknown) | null } = { current: null };
  const gantt = {
    config: {} as Record<string, unknown>,
    locale: {} as Record<string, unknown>,
    form_blocks: {} as Record<string, unknown>,
    plugins: vi.fn(),
    attachEvent: (name: string) => name,
    ext: {
      inlineEditors: { setMapping: (m: { init: (ctrl: unknown, grid?: unknown) => void }) => { mapping.current = m; } },
      keyboardNavigation: {
        attachEvent: (name: string, cb: (...args: unknown[]) => unknown) => {
          if (name === 'onKeyDown') keyboard.current = cb;
          return name;
        },
      },
    },
    constants: { KEY_CODES: { ENTER: 13, ESC: 27 } },
    getTaskType: () => 'task',
  };
  return { gantt, mapping, keyboard };
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

describe('PATCH-320: Gantt inline editor keyboard handling', () => {
  it('Enter saves and Escape hides while the editor is open', () => {
    const { gantt, mapping, keyboard } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    expect(mapping.current).not.toBeNull();

    const ctrl = makeCtrl();
    mapping.current!.init(ctrl, { $gantt: gantt });
    expect(keyboard.current).not.toBeNull();

    const enterPrevent = vi.fn();
    const handled = keyboard.current!({}, { keyCode: 13, preventDefault: enterPrevent });
    expect(ctrl.save).toHaveBeenCalledTimes(1);
    expect(enterPrevent).toHaveBeenCalled();
    expect(handled).toBe(false);

    const escapePrevent = vi.fn();
    keyboard.current!({}, { keyCode: 27, preventDefault: escapePrevent });
    expect(ctrl.hide).toHaveBeenCalledTimes(1);
    expect(escapePrevent).toHaveBeenCalled();
  });

  it('does nothing when no editor is open', () => {
    const { gantt, mapping, keyboard } = makeFakeGantt();
    configureGantt(gantt as never, false, undefined, undefined, true);
    const ctrl = makeCtrl();
    ctrl.isVisible.mockReturnValue(false);
    mapping.current!.init(ctrl, { $gantt: gantt });

    const handled = keyboard.current!({}, { keyCode: 13, preventDefault: vi.fn() });
    expect(handled).toBe(true);
    expect(ctrl.save).not.toHaveBeenCalled();
  });
});
