// Client-only module — imported from 'use client' components only.
// Wraps Mermaid as a lazily initialized singleton so the library is
// loaded once and reused across all diagram renders on a page.

export type DiagramRenderResult =
  | { ok: true; svg: string }
  | { ok: false; reason: string };

declare global {
  interface Window {
    __patch101DiagramRenderHoldMs?: number;
  }
}

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
        // PATCH-232 Addendum 2: emit SVG <text>/<tspan> rather than
        // <foreignObject> HTML. The DOMPurify svg profile (which strips
        // foreignObject) then keeps every label instead of leaving blank boxes.
        htmlLabels: false,
        flowchart: {
          htmlLabels: false,
          // PATCH-234: soft curved flow lines for the coloured flowchart.
          curve: 'basis',
        },
        theme: 'base',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        themeVariables: {
          primaryColor: '#f3f4f6',
          primaryTextColor: '#111827',
          primaryBorderColor: '#d1d5db',
          lineColor: '#9CA3AF',
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

// PATCH-249: Mermaid appends its temporary render element to <body> when no
// container is given, which briefly grows the page and makes the board jump.
// Draw into one fixed, offscreen host instead: created on the first render,
// reused for the life of the page, never removed. `display: none` is
// deliberately avoided because Mermaid measures label text with getBBox.
let _host: HTMLDivElement | null = null;

function getMermaidHost(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  if (!_host || !_host.isConnected) {
    _host = document.createElement('div');
    _host.setAttribute('data-ai-mermaid-host', '');
    Object.assign(_host.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '1200px',
      height: '0',
      overflow: 'hidden',
      visibility: 'hidden',
      pointerEvents: 'none',
      contain: 'layout size',
    });
    document.body.appendChild(_host);
  }
  return _host;
}

export async function renderDiagramCode(code: string): Promise<DiagramRenderResult> {
  try {
    const mermaid = await loadMermaid();
    const renderHoldMs = typeof window !== 'undefined'
      ? window.__patch101DiagramRenderHoldMs
      : undefined;
    if (
      process.env.NODE_ENV !== 'production'
      && typeof renderHoldMs === 'number'
      && Number.isFinite(renderHoldMs)
      && renderHoldMs >= 0
    ) {
      await new Promise((resolve) => setTimeout(resolve, renderHoldMs));
    }
    const id = `ai-diagram-${++_seq}`;
    const { svg } = await mermaid.render(id, code, getMermaidHost());
    return { ok: true, svg };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Diagram render failed.',
    };
  }
}
