// @vitest-environment jsdom
//
// PATCH-249 -- every Mermaid diagram is drawn into one lazily-created,
// offscreen, fixed, hidden host appended to <body>, so drawing a picture never
// grows the page (and the board never jumps sideways). The host is created on
// the first render and reused for every later one.
import { describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg></svg>' })),
  },
}));

import mermaid from 'mermaid';

import { renderDiagramCode } from './diagram-engine';

const renderMock = vi.mocked(mermaid.render);

describe('PATCH-249 mermaid offscreen render host', () => {
  it('renders into a single fixed, hidden host attached to <body>', async () => {
    const before = document.body.children.length;
    const result = await renderDiagramCode('graph TD; A-->B');
    expect(result.ok).toBe(true);

    expect(renderMock).toHaveBeenCalled();
    const host = renderMock.mock.calls[0][2];
    expect(host).toBeInstanceOf(HTMLElement);
    expect(document.body.contains(host as Node)).toBe(true);
    expect(host?.parentElement).toBe(document.body);
    expect(host?.getAttribute('data-ai-mermaid-host')).not.toBeNull();
    expect((host as HTMLElement).style.position).toBe('fixed');
    expect((host as HTMLElement).style.visibility).toBe('hidden');
    expect(document.body.children.length - before).toBe(1);
  });

  it('reuses the same host for every render', async () => {
    await renderDiagramCode('graph TD; A-->B');
    await renderDiagramCode('graph TD; C-->D');
    const calls = renderMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1][2]).toBe(calls[calls.length - 2][2]);
  });

  it('adds at most one direct <body> child across many renders', async () => {
    const before = document.body.children.length;
    for (let i = 0; i < 8; i += 1) {
      await renderDiagramCode('graph TD; A-->B');
    }
    expect(document.body.children.length - before).toBeLessThanOrEqual(1);
  });
});
