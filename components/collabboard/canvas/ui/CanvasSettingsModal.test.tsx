// @vitest-environment jsdom
//
// PATCH-376. The refreshed Canvas settings window: real values instead of
// internal ones (the icon used to print "lucide:layout"), the three header
// switches say what they do, and the wallpaper swatch names what it shows.
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CanvasSettingsModal from './CanvasSettingsModal';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { Canvas } from '@/types/collabboard';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

function mount(canvas: Canvas = board()) {
  return render(
    <CanvasSettingsModal
      isOpen
      onClose={() => {}}
      canvasId={BOARD}
      canvas={canvas}
      hasSections
      currentWorkspaceRole="owner"
      onSaved={() => {}}
    />,
  );
}

const iconButton = () => document.querySelector('[data-settings-icon-preview="true"]') as HTMLElement | null;
const wallpaperButton = () => document.querySelector('[data-settings-wallpaper-preview="true"]') as HTMLElement | null;
const headerSwitch = (which: string) =>
  document.querySelector(`[data-settings-show-in-header="${which}"]`) as HTMLElement | null;

beforeEach(() => {
  vi.mocked(supabaseBrowser).mockReturnValue({
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

  it('humanises a multi-word lucide name', () => {
    mount(board({ thumbnail: 'lucide:book-open' }));
    expect(iconButton()!.textContent).toContain('Book open');
    expect(iconButton()!.textContent).not.toContain('lucide:');
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
      // The visible text is the same sentence, so nobody has to hover to know.
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
      // No wallpaper of its own: the window's own fallback value, named.
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
