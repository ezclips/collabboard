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

describe('PATCH-217 tooltip descriptions', () => {
  it('a described tool renders label and description in its title', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media',
      label: 'Media',
      priority: 1,
      tools: [{
        icon: ICON, type: 'knowledge-pdf', label: 'Document', bg: '', color: '',
        pinned: true, activatesInputId: 'x-input',
        description: 'PDF, Word or text — the wiki and AI can read it',
      }],
    }];
    const host = mountSidebar(groups);
    const label = host.querySelector('[data-toolbar-tool="knowledge-pdf"]');
    expect(label).not.toBeNull();
    expect(label!.getAttribute('title')).toBe(
      'Document — PDF, Word or text — the wiki and AI can read it',
    );
  });

  it('a tool without a description keeps its bare label as the title', () => {
    const groups: SidebarToolGroup[] = [{
      id: 'media', label: 'Media', priority: 1,
      tools: [{
        icon: ICON, type: 'knowledge-pdf', label: 'Document', bg: '', color: '',
        pinned: true, activatesInputId: 'x-input',
      }],
    }];
    const host = mountSidebar(groups);
    const tool = host.querySelector('[data-toolbar-tool="knowledge-pdf"]');
    expect(tool!.getAttribute('title')).toBe('Document');
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
