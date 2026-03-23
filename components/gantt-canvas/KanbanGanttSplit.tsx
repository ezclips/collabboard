'use client';

import { useEffect, useRef, useState } from 'react';
import { KanbanCanvas } from '@/components/kanban-canvas';
import { GanttCanvas } from './GanttCanvas';

const MIN_GANTT_HEIGHT = 220;
const MIN_KANBAN_HEIGHT = 280;

export function KanbanGanttSplit({ canvasId }: { canvasId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ganttHeight, setGanttHeight] = useState(320);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nextHeight = rect.bottom - event.clientY;
      const maxHeight = Math.max(MIN_GANTT_HEIGHT, rect.height - MIN_KANBAN_HEIGHT);
      setGanttHeight(Math.max(MIN_GANTT_HEIGHT, Math.min(maxHeight, nextHeight)));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const startResize = () => {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    const handle = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="kanban-gantt"]');
    handle?.addEventListener('mousedown', startResize);

    return () => {
      handle?.removeEventListener('mousedown', startResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-gray-100">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <KanbanCanvas canvasId={canvasId} />
      </div>
      <div
        data-resize-handle="kanban-gantt"
        className="h-2 flex-shrink-0 cursor-row-resize bg-gray-300 hover:bg-gray-400 transition-colors"
        aria-label="Resize Gantt"
        role="separator"
        aria-orientation="horizontal"
      />
      <div style={{ height: `${ganttHeight}px` }} className="min-h-0 min-w-0 overflow-hidden border-t border-gray-300 bg-white">
        <GanttCanvas />
      </div>
    </div>
  );
}
