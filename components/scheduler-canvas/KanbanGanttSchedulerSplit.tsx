'use client';

import { useEffect, useRef, useState } from 'react';
import { KanbanCanvas } from '@/components/kanban-canvas';
import { GanttCanvas } from '@/components/gantt-canvas';
import { SchedulerCanvas } from '@/components/scheduler-canvas';

const MIN_HEIGHT = 200;

export function KanbanGanttSchedulerSplit({
  canvasId,
  showGantt,
  showScheduler,
}: {
  canvasId: string;
  showGantt: boolean;
  showScheduler: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // If only one (or none) of the bottom panels is visible, we can just use a single height state
  const [bottomPanelHeight, setBottomPanelHeight] = useState(320);

  // If BOTH are visible, we split the bottom area into two
  const [ganttHeight, setGanttHeight] = useState(250);
  const [schedulerHeight, setSchedulerHeight] = useState(250);

  // --- SINGLE PANEL RESIZE PIPELINE (When only Gantt OR Scheduler is shown) ---
  useEffect(() => {
    if (showGantt && showScheduler) return; // Skip if both are shown
    if (!showGantt && !showScheduler) return; // Skip if neither are shown

    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nextHeight = rect.bottom - event.clientY;
      const maxHeight = Math.max(MIN_HEIGHT, rect.height - MIN_HEIGHT);
      setBottomPanelHeight(Math.max(MIN_HEIGHT, Math.min(maxHeight, nextHeight)));
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

    const handle = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="single-split"]');
    handle?.addEventListener('mousedown', startResize);

    return () => {
      handle?.removeEventListener('mousedown', startResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [showGantt, showScheduler]);

  // --- MULTI PANEL RESIZE PIPELINES (When BOTH Gantt AND Scheduler are shown) ---
  // 1. Kanban / Gantt Split (Upper Handle)
  useEffect(() => {
    if (!showGantt || !showScheduler) return;

    const onMouseMoveTop = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Calculate how much space is left for Kanban
      const remainingHeightForBottomPanels = rect.bottom - event.clientY;

      // We are adjusting the Gantt height. Scheduler height remains fixed, Gantt absorbs the difference.
      const newGanttHeight = remainingHeightForBottomPanels - schedulerHeight;

      // Ensure min sizes
      const maxGanttHeight = rect.height - MIN_HEIGHT - schedulerHeight;
      setGanttHeight(Math.max(MIN_HEIGHT, Math.min(maxGanttHeight, newGanttHeight)));
    };

    const onMouseUpTop = () => {
      window.removeEventListener('mousemove', onMouseMoveTop);
      window.removeEventListener('mouseup', onMouseUpTop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const startResizeTop = () => {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMoveTop);
      window.addEventListener('mouseup', onMouseUpTop);
    };

    const handleTop = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="multi-top-split"]');
    handleTop?.addEventListener('mousedown', startResizeTop);

    return () => {
      handleTop?.removeEventListener('mousedown', startResizeTop);
      window.removeEventListener('mousemove', onMouseMoveTop);
      window.removeEventListener('mouseup', onMouseUpTop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [showGantt, showScheduler, schedulerHeight]);

  // 2. Gantt / Scheduler Split (Lower Handle)
  useEffect(() => {
    if (!showGantt || !showScheduler) return;

    const onMouseMoveBottom = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nextSchedulerHeight = rect.bottom - event.clientY;

      // We want to steal height from Gantt to give to Scheduler, or vice versa.
      // Maximum height for scheduler is the combined current height of Gantt + Scheduler minus MIN_HEIGHT
      const combinedHeight = ganttHeight + schedulerHeight;
      const maxSchedulerHeight = Math.max(MIN_HEIGHT, combinedHeight - MIN_HEIGHT);

      const resolvedSchedulerHeight = Math.max(MIN_HEIGHT, Math.min(maxSchedulerHeight, nextSchedulerHeight));

      setSchedulerHeight(resolvedSchedulerHeight);
      setGanttHeight(combinedHeight - resolvedSchedulerHeight);
    };

    const onMouseUpBottom = () => {
      window.removeEventListener('mousemove', onMouseMoveBottom);
      window.removeEventListener('mouseup', onMouseUpBottom);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const startResizeBottom = () => {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMoveBottom);
      window.addEventListener('mouseup', onMouseUpBottom);
    };

    const handleBottom = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="multi-bottom-split"]');
    handleBottom?.addEventListener('mousedown', startResizeBottom);

    return () => {
      handleBottom?.removeEventListener('mousedown', startResizeBottom);
      window.removeEventListener('mousemove', onMouseMoveBottom);
      window.removeEventListener('mouseup', onMouseUpBottom);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [showGantt, showScheduler, ganttHeight, schedulerHeight]);


  // Notify DHTMLX to redraw when visibility changes
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
    return () => clearTimeout(timer);
  }, [showGantt, showScheduler]);

  // --- RENDER LOGIC ---
  return (
    <div ref={containerRef} className="h-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-gray-100">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <KanbanCanvas canvasId={canvasId} />
      </div>

      {/* Gantt Area */}
      {showGantt && (
        <div
          data-resize-handle="multi-top-split"
          className="h-2 flex-shrink-0 cursor-row-resize bg-gray-300 hover:bg-gray-400 transition-colors"
          aria-label="Resize Kanban/Gantt"
          role="separator"
          aria-orientation="horizontal"
        />
      )}
      <div
        style={{
          height: showGantt ? `${showScheduler ? ganttHeight : bottomPanelHeight}px` : '0px',
          opacity: showGantt ? 1 : 0,
          pointerEvents: showGantt ? 'auto' : 'none',
        }}
        className="min-h-0 min-w-0 overflow-hidden transition-opacity bg-white"
      >
        <div className={showGantt ? "h-full border-t border-gray-300" : "h-full"}>
          <GanttCanvas />
        </div>
      </div>

      {/* Scheduler Area */}
      {showScheduler && (
        <div
          data-resize-handle={showGantt ? "multi-bottom-split" : "single-split"}
          className="h-2 flex-shrink-0 cursor-row-resize bg-gray-300 hover:bg-gray-400 transition-colors"
          aria-label="Resize Scheduler"
          role="separator"
          aria-orientation="horizontal"
        />
      )}
      <div
        style={{
          height: showScheduler ? `${showGantt ? schedulerHeight : bottomPanelHeight}px` : '0px',
          opacity: showScheduler ? 1 : 0,
          pointerEvents: showScheduler ? 'auto' : 'none',
        }}
        className="min-h-0 min-w-0 overflow-hidden transition-opacity bg-white"
      >
        <div className={showScheduler ? "h-full border-t border-gray-300" : "h-full"}>
          <SchedulerCanvas />
        </div>
      </div>
    </div>
  );
}
