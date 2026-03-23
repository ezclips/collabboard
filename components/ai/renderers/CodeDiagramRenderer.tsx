'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { FlowDiagramData, MindmapDiagramData } from '@/lib/ai/contracts';
import { renderDiagramCode } from '@/lib/ai/diagram-engine';
import { trackAIRenderFallback } from '@/lib/ai/telemetry';

import UnsupportedAIContent from './UnsupportedAIContent';

type CodeDiagramData = FlowDiagramData | MindmapDiagramData;

type RenderPhase =
  | { phase: 'loading' }
  | { phase: 'done'; svg: string }
  | { phase: 'failed' };

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <pre className="overflow-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-gray-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Stable container so the card never collapses to zero height during async render.
function DiagramViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[300px] overflow-auto rounded-xl border border-gray-200 bg-white">
      {children}
    </div>
  );
}

function CodeDiagramRenderer({ data }: { data: CodeDiagramData }) {
  const [phase, setPhase] = useState<RenderPhase>({ phase: 'loading' });
  const lastCodeRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip Mermaid re-render when code hasn't changed (guards against parent re-renders)
    if (data.code === lastCodeRef.current) return;
    lastCodeRef.current = data.code;

    let cancelled = false;

    renderDiagramCode(data.code).then((result) => {
      if (cancelled) return;

      if (result.ok) {
        setPhase({ phase: 'done', svg: result.svg });
      } else {
        trackAIRenderFallback({
          renderer: 'code_diagram',
          subtype: data.subtype,
          reason: result.reason,
        });
        setPhase({ phase: 'failed' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data.code, data.subtype]);

  if (!data.code.trim()) {
    trackAIRenderFallback({ renderer: 'code_diagram', subtype: data.subtype, reason: 'empty_code' });
    return <UnsupportedAIContent message="This diagram does not include any renderable code." />;
  }

  return (
    <div
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
      data-ai-render-state={phase.phase}
    >
      <div className="space-y-4">

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            {data.subtype.replace('_', ' ')}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{data.title}</h2>
          {data.explanation && (
            <p className="mt-2 text-sm text-gray-600">{data.explanation}</p>
          )}
        </div>

        {/* Stable viewport — holds minimum height regardless of render phase */}
        <DiagramViewport>
          {phase.phase === 'loading' && (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-400">
              Rendering diagram…
            </div>
          )}

          {phase.phase === 'done' && (
            <div
              className="p-4 [&_svg]:max-h-[480px] [&_svg]:max-w-full [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: phase.svg }}
            />
          )}

          {phase.phase === 'failed' && (
            <div className="p-4">
              <CodeBlock code={data.code} label="Could not render diagram — source code" />
            </div>
          )}
        </DiagramViewport>

        {/* Source code: always shown on failure; collapsible on success */}
        {phase.phase === 'done' && (
          <details className="group">
            <summary className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600">
              View source
            </summary>
            <div className="mt-2">
              <CodeBlock code={data.code} label="" />
            </div>
          </details>
        )}

      </div>
    </div>
  );
}

// Custom comparator: only re-render when the Mermaid source or subtype changes.
// Prevents the expensive Mermaid render from firing on unrelated parent updates.
export default React.memo(CodeDiagramRenderer, (prev, next) =>
  prev.data.code === next.data.code && prev.data.subtype === next.data.subtype,
);
