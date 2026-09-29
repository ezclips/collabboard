// @vitest-environment jsdom
//
// PATCH-210. Editing a Section Heading's title starts on a double-click (or
// Enter/F2 on the focused text), and nothing on screen said so. A selected
// heading that the viewer can edit now shows a small "Double-click to edit the
// title" line beneath it, and the text carries the same note as a tooltip.
// A viewer sees neither.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import {
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import type { Padlet } from '@/types/collabboard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
let hosts: HTMLElement[] = [];
afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const host of hosts) host.remove();
  roots = [];
  hosts = [];
});

function makeHeading(overrides: Partial<Padlet> = {}): Padlet {
  return {
    id: 'sh-1',
    board_id: 'board-1',
    title: SECTION_HEADING_DEFAULT_TEXT,
    content: '',
    type: 'section-heading',
    position_x: 100,
    position_y: 200,
    width: SECTION_HEADING_DEFAULT_WIDTH,
    height: 56,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata: { headingLevel: SECTION_HEADING_DEFAULT_LEVEL },
    ...overrides,
  } as Padlet;
}

function mountHeading(
  padlet: Padlet,
  overrides: Partial<React.ComponentProps<typeof SectionHeadingPost>> = {},
) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <SectionHeadingPost
        padlet={padlet}
        isSelected={overrides.isSelected ?? true}
        canEdit={overrides.canEdit ?? true}
        isDraggingThis={false}
        onMouseDownCapture={vi.fn()}
        onCommitText={vi.fn()}
        clientToWorld={(clientX) => ({ x: clientX, y: 0 })}
        worldBounds={{ minX: -5000, maxX: 15000 }}
        canResize={overrides.canResize ?? true}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
      />,
    );
  });
  return host;
}

const hint = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('[data-section-heading-edit-hint="true"]');
const textButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('[data-section-heading-text="true"]')!;

describe('PATCH-210 the edit hint on a selected section heading', () => {
  it('a selected, editable heading shows the exact hint text', () => {
    const host = mountHeading(makeHeading(), { isSelected: true, canEdit: true });
    expect(hint(host)).not.toBeNull();
    expect(hint(host)!.textContent).toBe('Double-click to edit the title');
    // Small, grey, no background, non-interactive, and out of layout.
    // PATCH-211 raised the size from text-[11px] to text-[13px].
    expect(hint(host)!.className).toContain('text-[13px]');
    expect(hint(host)!.className).toContain('text-gray-500');
    expect(hint(host)!.className).toContain('pointer-events-none');
    expect(hint(host)!.className).toContain('select-none');
    expect(hint(host)!.className).toContain('absolute');
  });

  it('an unselected heading shows no hint', () => {
    const host = mountHeading(makeHeading(), { isSelected: false, canEdit: true });
    expect(hint(host)).toBeNull();
  });

  it('a viewer sees no hint and no tooltip', () => {
    const host = mountHeading(makeHeading(), { isSelected: true, canEdit: false });
    expect(hint(host)).toBeNull();
    expect(textButton(host).getAttribute('title')).toBeNull();
    // The button is disabled for a viewer -- no edit affordance at all.
    expect(textButton(host).disabled).toBe(true);
  });

  it('an editor gets the same note as a hover tooltip on the text', () => {
    const host = mountHeading(makeHeading(), { isSelected: true, canEdit: true });
    expect(textButton(host).getAttribute('title')).toBe('Double-click to edit');
  });

  it('the hint disappears once editing begins', () => {
    const host = mountHeading(makeHeading(), { isSelected: true, canEdit: true });
    expect(hint(host)).not.toBeNull();
    act(() => {
      textButton(host).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    // The input is now mounted...
    expect(host.querySelector('[data-section-heading-input="true"]')).not.toBeNull();
    // ...and the hint is gone.
    expect(hint(host)).toBeNull();
  });

  it('the hint is NOT the surface text element, so it never becomes the title', () => {
    const host = mountHeading(makeHeading(), { isSelected: true, canEdit: true });
    // The heading's own text is unchanged; the hint is a separate sibling.
    expect(textButton(host).textContent).toBe(SECTION_HEADING_DEFAULT_TEXT);
    expect(hint(host)!.hasAttribute('data-section-heading-text')).toBe(false);
  });
});
