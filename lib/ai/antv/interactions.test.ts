import { describe, expect, it } from 'vitest';

import { stageInteractions } from './interactions';

function make(name: string, made: string[]) {
  return class {
    constructor() {
      made.push(name);
    }
  };
}

describe('PATCH-245 AntV stage interactions', () => {
  it('keeps the four editing interactions and drops ZoomWheel / DragCanvas / DragElement / BrushSelect', () => {
    const made: string[] = [];
    const mod = {
      DblClickEditText: make('dbl', made),
      ClickSelect: make('click', made),
      BrushSelect: make('brush', made),
      DragElement: make('dragElement', made),
      HotkeyHistory: make('hotkey', made),
      SelectHighlight: make('highlight', made),
      ZoomWheel: make('zoom', made),
      DragCanvas: make('dragCanvas', made),
    };

    const built = stageInteractions(mod as never);

    expect(built).toHaveLength(4);
    expect(made).toEqual(['dbl', 'click', 'hotkey', 'highlight']);
    expect(made).not.toContain('zoom');
    expect(made).not.toContain('dragCanvas');
    expect(made).not.toContain('dragElement');
    expect(made).not.toContain('brush');
  });

  it('tolerates a module that is missing some interactions', () => {
    const made: string[] = [];
    const built = stageInteractions({ DblClickEditText: make('dbl', made) } as never);
    expect(built).toHaveLength(1);
  });
});
