// @vitest-environment jsdom
//
// PATCH-271. Hovering a design tile must never disturb the picture being
// edited: the selected stage stays mounted (so its zoom and its element-editor
// history survive) and the hovered design is drawn read-only on a layer above.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';

const counters = vi.hoisted(() => ({ infographicMounts: 0, editableInstanceSeq: 0 }));

vi.mock('@/components/ai/AIContentRenderer', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ content }: { content?: unknown }) => {
      const data = (content as { data?: { template?: string; subtype?: string } } | undefined)?.data;
      return ReactModule.createElement('div', {
        'data-testid': 'ai-content-stub',
        'data-ai-stub-template': data?.template ?? data?.subtype ?? '',
      });
    },
  };
});

vi.mock('@/components/ai/renderers/PictureStage', async () => {
  const ReactModule = await import('react');
  return {
    default: ({
      mode,
      resetKey,
      children,
    }: {
      mode?: string;
      resetKey?: string | number;
      children?: React.ReactNode;
    }) =>
      ReactModule.createElement(
        'div',
        {
          'data-picture-stage': 'true',
          'data-picture-mode': mode ?? 'css',
          'data-picture-reset-key': String(resetKey ?? ''),
        },
        children,
      ),
  };
});

vi.mock('@/components/ai/renderers/InfographicRenderer', async () => {
  const ReactModule = await import('react');
  return {
    default: ({
      data,
      edit,
    }: {
      data: { outline: VisualOutline };
      edit?: { onChange: (next: VisualOutline) => void };
    }) => {
      ReactModule.useEffect(() => {
        counters.infographicMounts += 1;
      }, []);
      const [instanceId] = ReactModule.useState(() => ++counters.editableInstanceSeq);
      const [history, setHistory] = ReactModule.useState<VisualOutline[]>([]);
      const commit = () => {
        setHistory((past) => [...past, data.outline]);
        edit?.onChange({
          ...data.outline,
          elementOverrides: {
            template: 't',
            items: {},
            additions: [{ id: 'x', kind: 'circle', x: 1, y: 2, w: 3, h: 4 }],
          },
        } as VisualOutline);
      };
      const undo = () => {
        const previous = history[history.length - 1];
        if (!previous) return;
        setHistory((past) => past.slice(0, -1));
        edit?.onChange(previous);
      };
      return ReactModule.createElement(
        'div',
        { 'data-testid': 'editable-renderer', 'data-editable-instance': instanceId },
        ReactModule.createElement('button', { 'data-testid': 'commit-override', onClick: commit }),
        ReactModule.createElement('button', {
          'data-testid': 'undo-override',
          disabled: history.length === 0,
          onClick: undo,
        }),
      );
    },
  };
});

vi.mock('@/components/ai/renderers/MindmapTreeRenderer', async () => {
  const ReactModule = await import('react');
  return { default: () => ReactModule.createElement('div', { 'data-testid': 'mindmap-renderer' }) };
});

import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  counters.infographicMounts = 0;
  counters.editableInstanceSeq = 0;
});

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};
const OPTIONS = suggestDesigns(OUTLINE);
const ANTV = OPTIONS.find((option) => option.key.startsWith('antv:'))!;
const NATIVE = OPTIONS.find((option) => option.key === 'infographic:stack')!;

const envelopeFor = (option: (typeof OPTIONS)[number]) => ({
  mode: 'diagram',
  version: 1,
  data: option.envelopeData,
  meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
});

function render(overrides: Partial<React.ComponentProps<typeof OutlineSuggestionsPanel>> = {}) {
  return mount(
    <OutlineSuggestionsPanel
      options={OPTIONS}
      selectedKey={NATIVE.key}
      onSelect={() => {}}
      envelopeFor={envelopeFor}
      outline={OUTLINE}
      onEditOutline={() => {}}
      {...overrides}
    />,
  );
}

function tileForKey(c: ParentNode, key: string): HTMLElement {
  const el = Array.from(c.querySelectorAll('[data-ai-outline-option]')).find(
    (node) => node.getAttribute('data-ai-outline-option') === key,
  ) as HTMLElement | undefined;
  expect(el).toBeTruthy();
  return el!;
}

/** React synthesizes onPointerEnter/onPointerLeave from pointerover/pointerout. */
function pointer(el: Element, type: 'pointerover' | 'pointerout', pointerType: string) {
  const init = { bubbles: true, cancelable: true, relatedTarget: null } as PointerEventInit;
  let ev: Event;
  try {
    ev = new PointerEvent(type, init);
  } catch {
    ev = new Event(type, { bubbles: true });
  }
  if ((ev as PointerEvent).pointerType !== pointerType) {
    Object.defineProperty(ev, 'pointerType', { value: pointerType });
  }
  act(() => { el.dispatchEvent(ev); });
}

function hover(c: ParentNode, key: string) {
  vi.useFakeTimers();
  pointer(tileForKey(c, key), 'pointerover', 'mouse');
  act(() => { vi.advanceTimersByTime(120); });
}
function leave(c: ParentNode, key: string) {
  pointer(tileForKey(c, key), 'pointerout', 'mouse');
}
function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function selectedLayer(c: ParentNode): HTMLElement | null {
  return c.querySelector('[data-ai-preview-selected-layer]');
}
function selectedStage(c: ParentNode): HTMLElement | null {
  return c.querySelector('[data-ai-preview-selected-layer] [data-picture-stage]');
}
function hoverStage(c: ParentNode): HTMLElement | null {
  return c.querySelector('[data-ai-preview-hover-layer] [data-picture-stage]');
}

describe('PATCH-271 OutlineSuggestionsPanel hover keeps the selected picture alive', () => {
  it('hover then leave: same editable instance, no reset, hover layer gone', () => {
    const c = render();
    const instance = c.querySelector('[data-testid="editable-renderer"]')!.getAttribute('data-editable-instance');
    const resetBefore = selectedStage(c)!.getAttribute('data-picture-reset-key');

    hover(c, ANTV.key);
    expect(c.querySelector('[data-ai-preview-hover-layer]')).not.toBeNull();
    expect(selectedStage(c)!.getAttribute('data-picture-reset-key')).toBe(resetBefore);

    leave(c, ANTV.key);
    expect(c.querySelector('[data-ai-preview-hover-layer]')).toBeNull();
    expect(c.querySelector('[data-testid="editable-renderer"]')!.getAttribute('data-editable-instance')).toBe(instance);
    expect(counters.infographicMounts).toBe(1);
  });

  it('while hovering the selected layer stays in the DOM, hidden, with aria-hidden', () => {
    const c = render();
    hover(c, ANTV.key);
    const layer = selectedLayer(c)!;
    expect(layer).not.toBeNull();
    expect(layer.style.visibility).toBe('hidden');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(c.querySelector('[data-ai-outline-preview] [data-testid="editable-renderer"]')).not.toBeNull();
  });

  it('the hover layer is read-only and takes its mode from the hovered design (AntV over native)', () => {
    const c = render();
    hover(c, ANTV.key);
    expect(hoverStage(c)!.getAttribute('data-picture-mode')).toBe('antv');
    const stub = c.querySelector('[data-ai-preview-hover-layer] [data-testid="ai-content-stub"]')!;
    expect(stub.getAttribute('data-ai-stub-template')).toBe(`antv:${ANTV.key.slice('antv:'.length)}`);
    expect(c.querySelector('[data-ai-preview-hover-layer] [data-testid="editable-renderer"]')).toBeNull();
  });

  it('the hover layer takes its mode from the hovered design (native over AntV)', () => {
    const c = render({ selectedKey: ANTV.key });
    hover(c, NATIVE.key);
    expect(hoverStage(c)!.getAttribute('data-picture-mode')).toBe('css');
    const stub = c.querySelector('[data-ai-preview-hover-layer] [data-testid="ai-content-stub"]')!;
    expect(stub.getAttribute('data-ai-stub-template')).toBe('stack');
  });

  it('the element-editor history survives hover: Undo still reverses the override', () => {
    const onEditOutline = vi.fn();
    const c = render({ onEditOutline });
    click(c.querySelector('[data-testid="commit-override"]')!);
    expect(onEditOutline).toHaveBeenCalledTimes(1);
    expect((onEditOutline.mock.calls[0][0] as VisualOutline).elementOverrides).toBeTruthy();

    hover(c, ANTV.key);
    leave(c, ANTV.key);

    const undo = c.querySelector('[data-testid="undo-override"]') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    click(undo);
    expect(onEditOutline).toHaveBeenCalledTimes(2);
    expect((onEditOutline.mock.calls[1][0] as VisualOutline).elementOverrides).toBeUndefined();
  });
});
