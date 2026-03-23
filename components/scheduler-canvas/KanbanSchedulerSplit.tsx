'use client';

import { useEffect, useRef, useState } from 'react';
import { KanbanCanvas } from '@/components/kanban-canvas';
import { SchedulerCanvas } from './SchedulerCanvas';

const MIN_SCHEDULER_HEIGHT = 220;
const MIN_KANBAN_HEIGHT = 280;

export function KanbanSchedulerSplit({ canvasId }: { canvasId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [schedulerHeight, setSchedulerHeight] = useState(320);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nextHeight = rect.bottom - event.clientY;
      const maxHeight = Math.max(MIN_SCHEDULER_HEIGHT, rect.height - MIN_KANBAN_HEIGHT);
      setSchedulerHeight(Math.max(MIN_SCHEDULER_HEIGHT, Math.min(maxHeight, nextHeight)));
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

    const handle = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="kanban-scheduler"]');
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
        data-resize-handle="kanban-scheduler"
        className="h-2 flex-shrink-0 cursor-row-resize bg-gray-300 hover:bg-gray-400 transition-colors"
        aria-label="Resize Scheduler"
        role="separator"
        aria-orientation="horizontal"
      />
      <div style={{ height: `${schedulerHeight}px` }} className="min-h-0 min-w-0 overflow-hidden border-t border-gray-300 bg-white">
        <SchedulerCanvas />
      </div>
    </div>
  );
}

