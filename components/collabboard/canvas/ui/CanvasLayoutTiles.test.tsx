// @vitest-environment jsdom
//
// PATCH-376. The layout tiles: same-family tiles are selectable, the other
// family's are DISABLED with one line under the row (never removed), a viewer
// gets none, and a layout outside the four gets the old "not available" line.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CanvasLayoutTiles from './CanvasLayoutTiles';
import type { LayoutType } from '@/types/collabboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

function mount(currentLayout: LayoutType | null, overrides: { canEdit?: boolean; onSelect?: (l: LayoutType) => void } = {}) {
  const onSelect = overrides.onSelect ?? vi.fn();
  render(
    <CanvasLayoutTiles
      currentLayout={currentLayout}
      selectedLayout={(currentLayout ?? 'wall') as LayoutType}
      canEdit={overrides.canEdit ?? true}
      onSelect={onSelect}
    />,
  );
  return { onSelect };
}

const tile = (id: string) => document.querySelector(`[data-settings-layout="${id}"]`) as HTMLButtonElement | null;
const disabledTile = (id: string) => document.querySelector(`[data-settings-layout-disabled="true"][data-settings-layout="${id}"]`);
const note = () => document.querySelector('[data-settings-layout-note="true"]')?.textContent ?? null;

describe('PATCH-376 CanvasLayoutTiles', () => {
  it('offers the same family and disables the other, on a Columns board', () => {
    mount('columns');

    expect(tile('columns')?.disabled).toBe(false);
    expect(tile('grid')?.disabled).toBe(false);
    expect(tile('wall')?.disabled).toBe(true);
    expect(tile('timeline')?.disabled).toBe(true);
    expect(disabledTile('wall')).not.toBeNull();
    expect(disabledTile('timeline')).not.toBeNull();
    expect(disabledTile('columns')).toBeNull();
    expect(disabledTile('grid')).toBeNull();
  });

  it('offers the same family and disables the other, on a Wall board', () => {
    mount('wall');

    expect(tile('wall')?.disabled).toBe(false);
    expect(tile('timeline')?.disabled).toBe(false);
    expect(tile('columns')?.disabled).toBe(true);
    expect(tile('grid')?.disabled).toBe(true);
  });

  it('explains the disabled family in one line, on every switchable board', () => {
    for (const layout of ['columns', 'grid', 'wall', 'timeline'] as LayoutType[]) {
      const { unmount } = render(
        <CanvasLayoutTiles currentLayout={layout} selectedLayout={layout} canEdit onSelect={vi.fn()} />,
      );
      expect(note(), layout).toContain('Wall/Timeline');
      expect(note(), layout).toContain('Columns/Grid');
      expect(note(), layout).toContain("isn't available yet");
      unmount();
    }
  });

  it('selects an enabled tile and never a disabled one', () => {
    const { onSelect } = mount('columns');

    fireEvent.click(tile('grid')!);
    expect(onSelect).toHaveBeenCalledWith('grid');

    fireEvent.click(tile('wall')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disables every tile for a viewer, keeping the note', () => {
    mount('columns', { canEdit: false });
    for (const id of ['wall', 'columns', 'grid', 'timeline']) {
      expect(tile(id)?.disabled, id).toBe(true);
    }
    expect(note()).not.toBeNull();
  });

  it('says switching is unavailable for a layout outside the four, and renders no tiles', () => {
    for (const layout of ['freeform', 'map', 'kanban', 'scheduler', 'drawing', null] as Array<LayoutType | null>) {
      const { unmount } = render(
        <CanvasLayoutTiles currentLayout={layout} selectedLayout="wall" canEdit onSelect={vi.fn()} />,
      );
      expect(screen.getByText("Layout switching isn't available for this canvas type."), String(layout)).toBeTruthy();
      expect(tile('wall'), String(layout)).toBeNull();
      expect(note(), String(layout)).toBeNull();
      unmount();
    }
  });
});
