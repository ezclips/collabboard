// @vitest-environment jsdom
//
// PATCH-232 -- the diagram renderer must draw on every effect attempt. React
// StrictMode runs the effect twice and discards the first result, so the old
// "same code" early return left the phase stuck on "Rendering diagram…" forever.
import React, { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowDiagramData, MindmapDiagramData } from '@/lib/ai/contracts';

const { renderDiagramCodeMock, trackFallbackMock } = vi.hoisted(() => ({
  renderDiagramCodeMock: vi.fn(),
  trackFallbackMock: vi.fn(),
}));

vi.mock('@/lib/ai/diagram-engine', () => ({ renderDiagramCode: renderDiagramCodeMock }));
vi.mock('@/lib/ai/telemetry', () => ({ trackAIRenderFallback: trackFallbackMock }));

import CodeDiagramRenderer from './CodeDiagramRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  renderDiagramCodeMock.mockReset();
  trackFallbackMock.mockClear();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function flow(code: string): FlowDiagramData {
  return { type: 'diagram', subtype: 'flowchart', renderer: 'diagram_code', title: 'Flow', code };
}
function mindmap(code: string): MindmapDiagramData {
  return { type: 'diagram', subtype: 'mindmap', renderer: 'diagram_code', title: 'Mind', code };
}

const state = (container: HTMLElement, phase: string) =>
  container.querySelector(`[data-ai-render-state="${phase}"]`);

describe('PATCH-232 CodeDiagramRenderer', () => {
  it('renders to done under StrictMode (the effect runs twice)', async () => {
    // MUTATION: restoring the lastCodeRef early return makes this fail.
    renderDiagramCodeMock.mockResolvedValue({ ok: true, svg: '<svg id="d"></svg>' });
    const { container } = mount(
      <StrictMode>
        <CodeDiagramRenderer data={flow('graph TD; A-->B')} />
      </StrictMode>,
    );
    await flush();

    expect(state(container, 'done')).not.toBeNull();
    expect(container.querySelector('[data-ai-render-state="done"] svg')).not.toBeNull();
  });

  it('re-renders with the same code but a different subtype and still ends done', async () => {
    renderDiagramCodeMock.mockResolvedValue({ ok: true, svg: '<svg id="d"></svg>' });
    const { root, container } = mount(<CodeDiagramRenderer data={flow('X')} />);
    await flush();
    expect(state(container, 'done')).not.toBeNull();

    await act(async () => {
      root.render(<CodeDiagramRenderer data={mindmap('X')} />);
    });
    await flush();
    expect(state(container, 'done')).not.toBeNull();
  });

  it('shows loading for a new code, then the new svg; a stale result is ignored', async () => {
    let resolveA!: (v: { ok: true; svg: string }) => void;
    let resolveB!: (v: { ok: true; svg: string }) => void;
    renderDiagramCodeMock
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r as typeof resolveA; }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r as typeof resolveB; }));

    const { root, container } = mount(<CodeDiagramRenderer data={flow('A')} />);
    expect(state(container, 'loading')).not.toBeNull();

    await act(async () => {
      root.render(<CodeDiagramRenderer data={flow('B')} />);
    });
    expect(state(container, 'loading')).not.toBeNull();

    // The stale first render resolves late -- it must be ignored.
    await act(async () => {
      resolveA({ ok: true, svg: '<svg id="a"></svg>' });
      await Promise.resolve();
    });
    expect(state(container, 'loading')).not.toBeNull();
    expect(container.querySelector('#a')).toBeNull();

    await act(async () => {
      resolveB({ ok: true, svg: '<svg id="b"></svg>' });
      await Promise.resolve();
    });
    expect(state(container, 'done')).not.toBeNull();
    expect(container.querySelector('#b')).not.toBeNull();
    expect(container.querySelector('#a')).toBeNull();
  });

  it('fails after 15s when the render never resolves, and tracks the timeout', async () => {
    vi.useFakeTimers();
    renderDiagramCodeMock.mockImplementation(() => new Promise(() => {}));
    const { container } = mount(<CodeDiagramRenderer data={flow('X')} />);
    expect(state(container, 'loading')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(15000); });

    expect(state(container, 'failed')).not.toBeNull();
    expect(trackFallbackMock).toHaveBeenCalledWith({
      renderer: 'code_diagram',
      subtype: 'flowchart',
      reason: 'timeout',
    });
  });
});
