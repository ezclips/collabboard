// @vitest-environment jsdom
// PATCH-217. A described tool shows its description in the tooltip.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CanvasSidebar, { type SidebarToolGroup } from './canvas/ui/CanvasSidebar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships no ResizeObserver, and the sidebar measures itself with one.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const ICON = () => null;

function mountSidebar(groups: SidebarToolGroup[]) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <CanvasSidebar
        groups={groups}
        isLineMode={false}
        isGraphConnectMode={false}
        handleToolClick={vi.fn()}
        onBack={vi.fn()}
        canAddBoardContentPdf
        canAddBoardContentPdfNow={() => true}
      />,
    );
  });
  return container;
}

describe('PATCH-217b tooltip descriptions', () => {
  it('a described label-path tool carries an aria-label and NO title (no second tooltip)', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media',
      label: 'Media',
      priority: 1,
      tools: [{
        icon: ICON, type: 'knowledge-pdf', label: 'AI/Wiki Documents', bg: '', color: '',
        pinned: true, activatesInputId: 'x-input',
        description: 'PDF, Word, Text',
      }],
    }];
    const host = mountSidebar(groups);
    const label = host.querySelector('[data-toolbar-tool="knowledge-pdf"]');
    expect(label).not.toBeNull();
    expect(label!.getAttribute('aria-label')).toBe('AI/Wiki Documents — PDF, Word, Text');
    // The native tooltip is what would show a SECOND tooltip under our own.
    expect(label!.getAttribute('title')).toBeNull();
  });

  it('a tool without a description keeps its bare label as the aria-label', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media', label: 'Media', priority: 1,
      tools: [{
        icon: ICON, type: 'knowledge-pdf', label: 'AI/Wiki Documents', bg: '', color: '',
        pinned: true, activatesInputId: 'x-input',
      }],
    }];
    const host = mountSidebar(groups);
    const tool = host.querySelector('[data-toolbar-tool="knowledge-pdf"]');
    expect(tool!.getAttribute('aria-label')).toBe('AI/Wiki Documents');
    expect(tool!.getAttribute('title')).toBeNull();
  });
});

// PATCH-217. The dark hover label (the pill every tool shows on hover).
describe('PATCH-217 the dark hover label', () => {
  const hoverSpan = (type: string) =>
    document.querySelector(`[data-toolbar-tool="${type}"] span.absolute`) as HTMLElement | null;

  it('a described tool shows the label AND the description', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media', label: 'Media', priority: 1,
      tools: [{
        icon: ICON, type: 'image', label: 'Image', bg: '', color: '',
        description: 'Free images or upload your own',
      }],
    }];
    mountSidebar(groups);
    const span = hoverSpan('image')!;
    expect(span.textContent).toContain('Image');
    expect(span.textContent).toContain('Free images or upload your own');
  });

  it('a label-only tool shows only the label', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media', label: 'Media', priority: 1,
      tools: [{ icon: ICON, type: 'link', label: 'Link', bg: '', color: '' }],
    }];
    mountSidebar(groups);
    expect(hoverSpan('link')!.textContent).toBe('Link');
  });

  it('a disabled tool with a hint shows the hint and NOT a description', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media', label: 'Media', priority: 1,
      tools: [{
        icon: ICON, type: 'image', label: 'Image', bg: '', color: '',
        disabled: true, hint: 'Not on this layout.',
        description: 'Free images or upload your own',
      }],
    }];
    mountSidebar(groups);
    const span = hoverSpan('image')!;
    expect(span.textContent).toContain('Not on this layout.');
    expect(span.textContent).not.toContain('Free images or upload your own');
  });
});
