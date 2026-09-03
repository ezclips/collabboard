// @vitest-environment jsdom
//
// R6G-C1 -- the two toolbars' outer sizing, and the shortened Draw label.
//
// Both defects had the same shape: a toolbar whose width came from whatever
// happened to be mounted in it. The bottom bar was given a fixed width in R6G
// but too small a one, so the row scrolled instead of stretching; the left
// column never had a width at all, so its widest LABEL decided it, and the
// label set differs between its two modes.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ImageActionsToolbar from './ImageActionsToolbar';
import ImageDrawingLayer from './ImageDrawingLayer';

vi.mock('react-sketch-canvas', async () => {
  const ReactModule = (await import('react')) as typeof import('react');
  return {
    ReactSketchCanvas: ReactModule.forwardRef((_props, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({
        exportImage: async () => 'data:image/png;base64,stub',
        exportPaths: async () => [],
        eraseMode: vi.fn(), undo: vi.fn(), redo: vi.fn(), loadPaths: vi.fn(),
      }));
      return <div data-testid="sketch-canvas" />;
    }),
  };
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 12 }),
  }) as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- Left (vertical) Image toolbar ---------------------------------------

const toolbarProps = {
  onColorClick: vi.fn(),
  onCardColor: vi.fn(),
  onCaption: vi.fn(),
  onTextStyle: vi.fn(),
  onSelectColor: vi.fn(),
  onSelectHighlight: vi.fn(),
  onEditImage: vi.fn(),
  onDrawOnTop: vi.fn(),
  onAddReaction: vi.fn(),
  onComment: vi.fn(),
};

/** The toolbar shell -- the element whose outer width the user sees. */
function shell(container: HTMLElement): HTMLElement {
  const el = container.querySelector('div.flex.flex-col.items-center.bg-white') as HTMLElement | null;
  expect(el, 'toolbar shell not found').not.toBeNull();
  return el!;
}

/** The width utility the shell declares, if any. */
function widthToken(el: HTMLElement): string | null {
  return el.className.split(/\s+/).find((c) => /^w-(\d+|\[.+\])$/.test(c)) ?? null;
}

describe('R6G-C1 left toolbar: one outer width in every state', () => {
  it('R6G-C1-11..17: image mode and caption mode declare the SAME width', () => {
    // The reported "two different widths": image mode carried the longer label
    // set, so it rendered wider than caption mode.
    const image = render(<ImageActionsToolbar {...toolbarProps} mode="image" />);
    const imageWidth = widthToken(shell(image.container));
    cleanup();

    const caption = render(<ImageActionsToolbar {...toolbarProps} mode="caption" />);
    const captionWidth = widthToken(shell(caption.container));

    expect(imageWidth, 'image mode declares no width').not.toBeNull();
    expect(captionWidth).toBe(imageWidth);
  });

  it('the width is declared once, rather than left to the content', () => {
    // This is the actual fix: without a width the column is sized by its widest
    // label, which is why changing state changed its width.
    const { container } = render(<ImageActionsToolbar {...toolbarProps} mode="image" />);
    expect(widthToken(shell(container))).toBe('w-16');
  });

  it('R6G-C1-17: every image-mode control is present at that width, and clickable', () => {
    const onDrawOnTop = vi.fn();
    const onComment = vi.fn();
    render(<ImageActionsToolbar {...toolbarProps} onDrawOnTop={onDrawOnTop} onComment={onComment} mode="image" />);

    for (const label of ['Caption', 'Edit image', 'Draw', 'Reaction', 'Comment', 'Color']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    fireEvent.click(screen.getByTitle('Draw on image'));
    expect(onDrawOnTop).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Comment'));
    expect(onComment).toHaveBeenCalled();
  });

  it('icons keep their existing hit target -- the shell shrank, the buttons did not', () => {
    const { container } = render(<ImageActionsToolbar {...toolbarProps} mode="image" />);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.className, button.getAttribute('title') ?? '').toContain('w-10 h-10');
    }
  });
});

describe('R6G-C1 label: "Draw on top" becomes "Draw"', () => {
  it('R6G-C1-18,19: the visible label is Draw; the long form is only the tooltip', () => {
    render(<ImageActionsToolbar {...toolbarProps} mode="image" />);
    expect(screen.getByText('Draw')).toBeTruthy();
    expect(screen.queryByText('Draw on top')).toBeNull();
    // The tooltip may stay descriptive.
    expect(screen.getByTitle('Draw on image')).toBeTruthy();
  });

  it('only the visible copy changed -- the handler prop keeps its name', () => {
    // Renaming onDrawOnTop / isDrawingMode would be an API change, which this
    // visual patch is not.
    const onDrawOnTop = vi.fn();
    render(<ImageActionsToolbar {...toolbarProps} onDrawOnTop={onDrawOnTop} mode="image" isDrawingMode />);
    fireEvent.click(screen.getByTitle('Draw on image'));
    expect(onDrawOnTop).toHaveBeenCalledTimes(1);
  });
});

// --- Bottom (horizontal) Draw toolbar ------------------------------------

describe('R6G-C1 bottom toolbar: wide enough that nothing scrolls', () => {
  const imageUrl = 'data:image/png;base64,stub';

  function renderDrawLayer() {
    const result = render(
      <ImageDrawingLayer imageUrl={imageUrl} initialTextElements={[]} onSave={vi.fn()} onCancel={vi.fn()} />
    );
    // R6H-C1: the editing surfaces only exist once the clean original is ready.
    const base = document.body.querySelector('[data-testid="drawing-base-image"]');
    if (base) fireEvent.load(base);
    return result;
  }

  const bar = () => document.body.querySelector('[data-testid="draw-toolbar"]') as HTMLElement;

  it('R6G-C1-1..6: the width is identical in every tool state', () => {
    renderDrawLayer();
    const widths = new Set<string>([bar().style.width]);
    for (const tool of ['Add Text', 'Pencil', 'Highlighter', 'Eraser']) {
      fireEvent.click(screen.getByTitle(tool));
      widths.add(bar().style.width);
    }
    fireEvent.click(screen.getByTitle('Pencil'));
    fireEvent.click(screen.getByTitle('Square'));
    widths.add(bar().style.width);

    // ...including the widest state: Text with an annotation selected.
    fireEvent.click(screen.getByTitle('Add Text'));
    const surface = document.body.querySelector('.cursor-text.touch-none') as HTMLElement;
    fireEvent.click(surface);
    widths.add(bar().style.width);

    expect([...widths]).toHaveLength(1);
  });

  it('R6G-C1-7: it is wider than the state that used to overflow it', () => {
    // 720px did not fit the Text state (~763px of controls), so the row scrolled
    // and the user saw a horizontal scrollbar under the bar.
    renderDrawLayer();
    expect(parseInt(bar().style.width, 10)).toBeGreaterThanOrEqual(800);
  });

  it('R6G-C1-8,9,10: every control group is still present in the widest state', () => {
    renderDrawLayer();
    fireEvent.click(screen.getByTitle('Add Text'));
    const surface = document.body.querySelector('.cursor-text.touch-none') as HTMLElement;
    fireEvent.click(surface);
    fireEvent.focus(screen.getByPlaceholderText('Type here...'));

    for (const control of ['Add Text', 'Pencil', 'Highlighter', 'Eraser', 'Font Size', 'Text Color', 'Box Border Color', 'Background Opacity', 'Undo', 'Redo']) {
      expect(screen.getByTitle(control), control).toBeTruthy();
    }
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('R6G-C1-20: the bar still degrades on a narrow viewport instead of overflowing it', () => {
    renderDrawLayer();
    expect(bar().style.maxWidth).toContain('100vw');
  });

  // --- R6G-C2: the same bar must not change HEIGHT either -----------------

  /** Walks the bar through every state the user can put it in. */
  function heightInEveryState(): Record<string, string> {
    const seen: Record<string, string> = { initial: bar().style.minHeight };
    for (const tool of ['Add Text', 'Pencil', 'Highlighter', 'Eraser']) {
      fireEvent.click(screen.getByTitle(tool));
      seen[tool] = bar().style.minHeight;
    }
    fireEvent.click(screen.getByTitle('Pencil'));
    fireEvent.click(screen.getByTitle('Square'));
    seen.Square = bar().style.minHeight;

    // The widest AND shortest state: Text with an annotation selected, which is
    // the one that used to be 4px shorter than the rest.
    fireEvent.click(screen.getByTitle('Add Text'));
    const surface = document.body.querySelector('.cursor-text.touch-none') as HTMLElement;
    fireEvent.click(surface);
    fireEvent.focus(screen.getByPlaceholderText('Type here...'));
    seen.selectedText = bar().style.minHeight;
    return seen;
  }

  it('R6G-C2-1..6,10: the height is identical in every tool state', () => {
    // The reported jump: the Colour swatch is w-6 where every other icon is
    // w-5, so its button is 44px against 40px -- and that group only renders
    // while the tool is not Text. Text sat at 54px, every drawing tool at 58px.
    renderDrawLayer();
    const heights = heightInEveryState();
    const distinct = [...new Set(Object.values(heights))];
    expect(distinct, JSON.stringify(heights)).toHaveLength(1);
    // ...and it is a real declared height, not "every state is equally unset".
    expect(distinct[0]).toMatch(/^\d+px$/);
  });

  it('R6G-C2: the height is the TALLEST state, so nothing had to be shrunk', () => {
    renderDrawLayer();
    // 44px Colour button + 12px shell padding + 2px border.
    expect(parseInt(bar().style.minHeight, 10)).toBe(58);
    // The swatch that sets it keeps its size.
    const swatch = screen.getByTitle('Color').querySelector('div') as HTMLElement;
    expect(swatch.className).toContain('w-6 h-6');
  });

  it('R6G-C2-9: groups stay vertically centred inside the fixed shell', () => {
    // Without items-center the extra 4px in the Text state would push the row
    // to one edge instead of splitting evenly.
    renderDrawLayer();
    expect(bar().className).toContain('items-center');
    for (const group of Array.from(bar().children)) {
      expect(group.className, group.className).toContain('items-center');
    }
  });

  it('R6G-C2-7,8: width and the narrow-viewport guard are untouched by the height fix', () => {
    renderDrawLayer();
    const before = { w: bar().style.width, max: bar().style.maxWidth };
    heightInEveryState();
    expect(bar().style.width).toBe('820px');
    expect(bar().style.width).toBe(before.w);
    expect(bar().style.maxWidth).toBe(before.max);
  });
});
