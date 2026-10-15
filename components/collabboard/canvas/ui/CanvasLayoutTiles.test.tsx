// @vitest-environment jsdom
//
// PATCH-377. The layout tiles: all four are selectable, and choosing the other
// family shows what will happen to the posts -- the sentence plus, only when a
// source card carries comments, the line saying those are not carried over.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CanvasLayoutTiles from './CanvasLayoutTiles';
import type { LayoutType } from '@/types/collabboard';
import type { LayoutSwitchCounts } from '@/lib/domain/canvas/layoutSwitchFamilies';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const counts = (panels: number, posts: number, commentedPanels = 0): LayoutSwitchCounts =>
  ({ panels, posts, commentedPanels });

function mount(
  currentLayout: LayoutType | null,
  selectedLayout: LayoutType,
  overrides: { canEdit?: boolean; counts?: LayoutSwitchCounts; onSelect?: (l: LayoutType) => void } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn();
  render(
    <CanvasLayoutTiles
      currentLayout={currentLayout}
      selectedLayout={selectedLayout}
      canEdit={overrides.canEdit ?? true}
      onSelect={onSelect}
      counts={overrides.counts ?? counts(3, 12)}
    />,
  );
  return { onSelect };
}

const tile = (id: string) => document.querySelector(`[data-settings-layout="${id}"]`) as HTMLButtonElement | null;
const summary = () => document.querySelector('[data-settings-layout-convert-summary="true"]')?.textContent ?? null;

describe('PATCH-377 CanvasLayoutTiles', () => {
  it('makes all four tiles selectable, on either family', () => {
    for (const layout of ['columns', 'grid', 'wall', 'timeline'] as LayoutType[]) {
      const { unmount } = render(
        <CanvasLayoutTiles
          currentLayout={layout}
          selectedLayout={layout}
          canEdit
          onSelect={vi.fn()}
          counts={counts(2, 5)}
        />,
      );
      for (const id of ['wall', 'columns', 'grid', 'timeline']) {
        expect(tile(id)?.disabled, `${layout} -> ${id}`).toBe(false);
      }
      // The PATCH-376 stop-gap attribute is gone with the stop-gap.
      expect(document.querySelector('[data-settings-layout-disabled="true"]'), layout).toBeNull();
      unmount();
    }
  });

  it('selects any tile', () => {
    const { onSelect } = mount('columns', 'columns');
    fireEvent.click(tile('wall')!);
    expect(onSelect).toHaveBeenCalledWith('wall');
  });

  it('shows no sentence for a same-family selection', () => {
    mount('columns', 'grid');
    expect(summary()).toBeNull();
  });

  it('shows the conversion sentence when the other family is chosen', () => {
    mount('columns', 'wall', { counts: counts(3, 12) });
    expect(summary()).toContain('Your 3 columns become 3 cards.');
    expect(summary()).toContain('All 12 posts move with them.');
  });

  it('reads the other direction too', () => {
    mount('wall', 'columns', { counts: counts(4, 9) });
    expect(summary()).toContain('Your 4 cards become 4 columns.');
    expect(summary()).toContain('All 9 posts move with them.');
  });

  it('says nothing about comments when no source card has any', () => {
    mount('columns', 'wall', { counts: counts(3, 12, 0) });
    expect(summary()).not.toContain('Comments on the cards');
  });

  it('warns about comments only when a source card carries them', () => {
    mount('wall', 'columns', { counts: counts(2, 6, 1) });
    expect(summary()).toContain('Comments on the cards themselves are not carried over.');
  });

  it('disables every tile for a viewer', () => {
    mount('columns', 'columns', { canEdit: false });
    for (const id of ['wall', 'columns', 'grid', 'timeline']) {
      expect(tile(id)?.disabled, id).toBe(true);
    }
  });

  it('says switching is unavailable for a layout outside the four, and renders no tiles', () => {
    for (const layout of ['freeform', 'map', 'kanban', 'scheduler', 'drawing', null] as Array<LayoutType | null>) {
      const { unmount } = render(
        <CanvasLayoutTiles currentLayout={layout} selectedLayout="wall" canEdit onSelect={vi.fn()} counts={counts(0, 0)} />,
      );
      expect(screen.getByText("Layout switching isn't available for this canvas type."), String(layout)).toBeTruthy();
      expect(tile('wall'), String(layout)).toBeNull();
      expect(summary(), String(layout)).toBeNull();
      unmount();
    }
  });
});
