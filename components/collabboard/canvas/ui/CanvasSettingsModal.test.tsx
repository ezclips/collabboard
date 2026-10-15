// @vitest-environment jsdom
//
// PATCH-376/377. The refreshed Canvas settings window: real values instead of
// internal ones, the three header switches say what they do, the wallpaper
// swatch names what it shows, and Save converts the posts when the chosen layout
// is in the other family.
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CanvasSettingsModal from './CanvasSettingsModal';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { Canvas } from '@/types/collabboard';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';

/** The one RPC this window makes, and the plain `boards` update. */
const rpc = vi.fn();
const update = vi.fn();

function board(overrides: Partial<Record<string, unknown>> = {}): Canvas {
  return {
    id: BOARD,
    title: 'Throwaway',
    description: '',
    layout: 'columns',
    background_type: 'color',
    background_value: '#ffffff',
    thumbnail: 'lucide:layout',
    comments_enabled: true,
    settings: { titleHeader: { showTitle: true } },
    ...overrides,
  } as unknown as Canvas;
}

const onClose = vi.fn();
const onSaved = vi.fn();

function mount(canvas: Canvas = board()) {
  return render(
    <CanvasSettingsModal
      isOpen
      onClose={onClose}
      canvasId={BOARD}
      canvas={canvas}
      sectionCount={3}
      posts={[]}
      currentWorkspaceRole="owner"
      onSaved={onSaved}
    />,
  );
}

const iconButton = () => document.querySelector('[data-settings-icon-preview="true"]') as HTMLElement | null;
const wallpaperButton = () => document.querySelector('[data-settings-wallpaper-preview="true"]') as HTMLElement | null;
const headerSwitch = (which: string) =>
  document.querySelector(`[data-settings-show-in-header="${which}"]`) as HTMLElement | null;
const tile = (id: string) => document.querySelector(`[data-settings-layout="${id}"]`) as HTMLButtonElement | null;
const saveButton = () => {
  const button = Array.from(document.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.includes('Save changes'));
  return button as HTMLButtonElement;
};

async function save() {
  await act(async () => {
    fireEvent.click(saveButton());
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  rpc.mockReset();
  update.mockReset();
  onClose.mockReset();
  onSaved.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  rpc.mockResolvedValue({ data: [{ converted: true, panels: 3, posts: 12 }], error: null });
  update.mockReturnValue({ eq: async () => ({ error: null }) });
  vi.mocked(supabaseBrowser).mockReturnValue({ from: () => ({ update }), rpc } as never);
});

afterEach(cleanup);

describe('PATCH-376 the window itself', () => {
  it('is the Share window shape: one panel, one header, one scrolling body', () => {
    mount();
    const panel = document.querySelector('[data-canvas-settings-modal="true"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(panel.className).toContain('flex-col');
    expect(document.body.textContent).toContain('Canvas settings');
  });
});

describe('PATCH-376 the icon shows an icon and a NAME', () => {
  it('never prints the raw lucide id', () => {
    mount(board({ thumbnail: 'lucide:layout' }));
    const button = iconButton()!;
    expect(button.textContent).toContain('Layout');
    expect(button.textContent).not.toContain('lucide:');
    // The glyph itself is the shared renderer, not a copy.
    expect(button.querySelector('[data-icon-kind="line"]')).not.toBeNull();
  });

  it('names an image and an emoji without printing a url', () => {
    const { unmount } = mount(board({ thumbnail: 'https://example.com/i.png' }));
    expect(iconButton()!.textContent).toContain('Image');
    expect(iconButton()!.textContent).not.toContain('http');
    unmount();

    mount(board({ thumbnail: '🎨' }));
    expect(iconButton()!.textContent).toContain('Emoji');
    expect(iconButton()!.textContent).not.toContain('lucide:');
  });
});

describe('PATCH-376 the header switches say what they do', () => {
  it('gives each one a visible label and a meaningful accessible name', () => {
    mount();
    const expectations: Array<[string, string]> = [
      ['title', 'Show title in the board header'],
      ['description', 'Show description in the board header'],
      ['icon', 'Show icon in the board header'],
    ];
    for (const [which, label] of expectations) {
      const control = headerSwitch(which);
      expect(control, which).not.toBeNull();
      expect(control!.getAttribute('aria-label'), which).toBe(label);
      expect(control!.closest('[data-share-switch-row]')?.textContent, which).toContain(label);
    }
  });

  it('reflects the stored values', () => {
    mount(board({ settings: { titleHeader: { showTitle: true, showDescription: false, showIcon: false } } }));
    expect(headerSwitch('title')!.getAttribute('aria-checked')).toBe('true');
    expect(headerSwitch('description')!.getAttribute('aria-checked')).toBe('false');
    expect(headerSwitch('icon')!.getAttribute('aria-checked')).toBe('false');
  });
});

describe('PATCH-376 the wallpaper swatch names what it shows', () => {
  it('labels a white colour, the default, another colour, a gradient, an image and nothing', () => {
    const cases: Array<[Partial<Record<string, unknown>>, string]> = [
      [{ background_type: 'color', background_value: '#ffffff' }, 'White'],
      [{ background_type: 'color', background_value: '#ef4444' }, 'Colour'],
      [{ background_type: 'gradient', background_value: 'linear-gradient(#fff, #000)' }, 'Gradient'],
      [{ background_type: 'image', background_value: 'https://example.com/w.png' }, 'Image'],
      [{ background_type: null, background_value: null }, 'Default'],
      [{ background_type: 'color', background_value: '#f3f4f6' }, 'Default'],
    ];
    for (const [overrides, label] of cases) {
      const { unmount } = mount(board(overrides));
      expect(wallpaperButton()!.textContent, label).toContain(label);
      unmount();
    }
  });

  it('shows a real swatch, not an empty square', () => {
    mount(board({ background_type: 'color', background_value: '#ef4444' }));
    const swatch = wallpaperButton()!.querySelector('span[style]') as HTMLElement;
    expect(swatch).not.toBeNull();
    expect(swatch.getAttribute('style')).toContain('background-color');
  });
});

describe('PATCH-377 Save converts the posts when the family changes', () => {
  it('calls the RPC for a cross-family choice and writes no layout column', async () => {
    mount(board({ layout: 'columns' }));
    fireEvent.click(tile('wall')!);
    await save();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('convert_board_layout', { b: BOARD, target: 'wall' });
    // The conversion owns boards.layout; the plain update must not also set it.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).not.toHaveProperty('layout');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('writes the layout column for a same-family choice and never calls the RPC', async () => {
    mount(board({ layout: 'columns' }));
    fireEvent.click(tile('grid')!);
    await save();

    expect(rpc).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].layout).toBe('grid');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('writes neither when the layout did not change', async () => {
    mount(board({ layout: 'columns' }));
    await save();

    expect(rpc).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0]).not.toHaveProperty('layout');
  });

  it('shows the refusal and leaves the window open when the conversion fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'This board is frozen' } });
    mount(board({ layout: 'columns' }));
    fireEvent.click(tile('wall')!);
    await save();

    expect(toastError).toHaveBeenCalledWith('This board is frozen');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    // Nothing else was written: the refusal stopped the save before the update.
    expect(update).not.toHaveBeenCalled();
    expect(document.querySelector('[data-canvas-settings-modal="true"]')).not.toBeNull();
  });

  it('shows the conversion sentence beside the tiles once the other family is chosen', async () => {
    mount(board({ layout: 'columns' }));
    expect(document.querySelector('[data-settings-layout-convert-summary="true"]')).toBeNull();

    fireEvent.click(tile('wall')!);
    expect(document.querySelector('[data-settings-layout-convert-summary="true"]')?.textContent)
      .toContain('become');
  });
});
