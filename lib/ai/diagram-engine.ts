// Client-only module — imported from 'use client' components only.
// Wraps Mermaid as a lazily initialized singleton so the library is
// loaded once and reused across all diagram renders on a page.

export type DiagramRenderResult =
  | { ok: true; svg: string }
  | { ok: false; reason: string };

// Singleton: resolved promise holds the initialized mermaid instance.
let ready: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!ready) {
    ready = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        // 'strict' sanitizes HTML labels — safe for AI-generated code.
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        themeVariables: {
          primaryColor: '#f3f4f6',
          primaryTextColor: '#111827',
          primaryBorderColor: '#d1d5db',
          lineColor: '#6b7280',
          background: '#ffffff',
          mainBkg: '#f9fafb',
          nodeBorder: '#d1d5db',
          clusterBkg: '#f3f4f6',
          titleColor: '#111827',
          edgeLabelBackground: '#ffffff',
          fontSize: '14px',
        },
      });
      return mermaid;
    });
  }
  return ready;
}

// Each render call needs a unique DOM-safe ID. Mermaid uses it internally
// to create and clean up a temporary SVG element.
let _seq = 0;

export async function renderDiagramCode(code: string): Promise<DiagramRenderResult> {
  try {
    const mermaid = await loadMermaid();
    const id = `ai-diagram-${++_seq}`;
    const { svg } = await mermaid.render(id, code);
    return { ok: true, svg };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Diagram render failed.',
    };
  }
}
