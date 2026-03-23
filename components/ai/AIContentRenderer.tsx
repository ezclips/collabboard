'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

import AIComponentRenderer from '@/components/collabboard/AIComponentRenderer';
import LessonBoardRenderer from '@/components/collabboard/renderers/LessonBoardRenderer';
import type { AIContentData, DiagramData, LoadedAIContent } from '@/lib/ai/contracts';
import { normalizeAIContent } from '@/lib/ai/normalize-ai-content';
import { trackAIRenderFallback } from '@/lib/ai/telemetry';

import ChartDiagramRenderer from './renderers/ChartDiagramRenderer';
// Mermaid is ~300 kB; lazy-load it so the initial bundle is not blocked
const CodeDiagramRenderer = dynamic(() => import('./renderers/CodeDiagramRenderer'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-400">
      Loading diagram renderer…
    </div>
  ),
});
import ComparisonDiagramRenderer from './renderers/ComparisonDiagramRenderer';
import PhotoCardRenderer from './renderers/PhotoCardRenderer';
import StructuredLessonBoardRenderer from './renderers/StructuredLessonBoardRenderer';
import TimelineDiagramRenderer from './renderers/TimelineDiagramRenderer';
import UnsupportedAIContent from './renderers/UnsupportedAIContent';
import WorkshopBoardRenderer from './renderers/WorkshopBoardRenderer';

type LegacyHtmlRendererProps = Omit<React.ComponentProps<typeof AIComponentRenderer>, 'code'>;

interface AIContentRendererProps {
  content: unknown;
  className?: string;
  legacyHtmlProps?: LegacyHtmlRendererProps;
  // Called with the root element of structured content so callers can
  // capture it for PDF/canvas export. Not used for the legacy_html path —
  // that path registers its own target via legacyHtmlProps.onExportTargetReady.
  onExportTargetReady?: (el: HTMLDivElement | null) => void;
}

class AIContentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('AI content renderer failed:', error);
    trackAIRenderFallback({
      renderer: 'error_boundary',
      reason: error instanceof Error ? error.message : 'render_threw',
    });
  }

  render() {
    if (this.state.hasError) {
      return <UnsupportedAIContent message="This renderer failed while displaying the content." />;
    }

    return this.props.children;
  }
}

function renderDiagram(data: DiagramData): React.ReactNode {
  const subtype = data.subtype;
  switch (subtype) {
    case 'flowchart':
    case 'mindmap':
      return <CodeDiagramRenderer data={data} />;
    case 'pie_chart':
    case 'bar_chart':
      return <ChartDiagramRenderer data={data} />;
    case 'timeline':
      return <TimelineDiagramRenderer data={data} />;
    case 'comparison':
      return <ComparisonDiagramRenderer data={data} />;
    default:
      trackAIRenderFallback({ renderer: 'diagram', subtype, reason: 'unsupported_subtype' });
      return <UnsupportedAIContent message="This diagram subtype is not supported yet." />;
  }
}

function renderStructuredContent(data: AIContentData): React.ReactNode {
  switch (data.type) {
    case 'lesson_board':
      return <StructuredLessonBoardRenderer data={data} />;
    case 'photo':
      return <PhotoCardRenderer data={data} />;
    case 'workshop_board':
      return <WorkshopBoardRenderer data={data} />;
    case 'diagram':
      return renderDiagram(data);
    default:
      trackAIRenderFallback({ renderer: 'structured', reason: 'unsupported_content_type' });
      return <UnsupportedAIContent message="This AI content type is not supported yet." />;
  }
}

export default function AIContentRenderer({
  content,
  className,
  legacyHtmlProps,
  onExportTargetReady,
}: AIContentRendererProps) {
  const normalized = normalizeAIContent(content);
  const structuredRef = useRef<HTMLDivElement>(null);

  // Keep a stable ref to the callback so the registration effect does not
  // re-fire every time the parent re-renders with a new inline function.
  const exportReadyRef = useRef(onExportTargetReady);
  useLayoutEffect(() => {
    exportReadyRef.current = onExportTargetReady;
  });

  // Register the export target for structured content only. The legacy_html
  // path handles its own registration via legacyHtmlProps.onExportTargetReady.
  useEffect(() => {
    if (normalized.kind !== 'structured') return;
    exportReadyRef.current?.(structuredRef.current);
    return () => {
      exportReadyRef.current?.(null);
    };
    // Intentionally only re-runs when the content kind changes (e.g. on reopen
    // with a different stored shape), not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.kind]);

  let rendered: React.ReactNode;

  switch (normalized.kind) {
    case 'legacy_html':
      rendered = (
        <AIComponentRenderer
          code={normalized.html}
          className={className}
          {...legacyHtmlProps}
        />
      );
      break;
    case 'legacy_lesson_board':
      rendered = <LessonBoardRenderer data={normalized.data} />;
      break;
    case 'structured':
      // Wrapper div gives export callers a stable DOM anchor that spans the
      // entire rendered output (header + visual + source code).
      rendered = (
        <div ref={structuredRef} className="h-full w-full">
          {renderStructuredContent(normalized.data)}
        </div>
      );
      break;
    case 'unsupported_structured_version':
      rendered = (
        <UnsupportedAIContent
          message={`This AI content uses an unsupported saved version${normalized.version ? ` (${normalized.version})` : ''}.`}
        />
      );
      break;
    default:
      rendered = <UnsupportedAIContent message="The payload does not match a supported AI content shape." />;
      break;
  }

  return (
    <AIContentErrorBoundary>
      {rendered}
    </AIContentErrorBoundary>
  );
}

export type { AIContentRendererProps, LoadedAIContent };
