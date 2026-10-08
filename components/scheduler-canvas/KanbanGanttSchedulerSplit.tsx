'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { KanbanCanvas } from '@/components/kanban-canvas';
import { KanbanCardEditorHost } from '@/components/kanban-canvas/KanbanCardEditorHost';
import { GanttCanvas } from '@/components/gantt-canvas';
import { SchedulerCanvas } from '@/components/scheduler-canvas';

const MIN_HEIGHT = 200;
/** One lower panel open on its own. */
const SINGLE_LOWER_DEFAULT = 320;
/** Two lower panels open together (Kanban + Gantt + Scheduler). */
const DOUBLE_LOWER_DEFAULT = 250;

type ViewId = 'kanban' | 'gantt' | 'scheduler';
type LowerViewId = 'gantt' | 'scheduler';

/**
 * PATCH-325. K / G / S stacked top to bottom, in that order.
 *
 * The TOP-MOST open view takes the remaining height (`flex: 1`); every view
 * below it has a height and a resize handle above it. One view open fills the
 * whole area with no handle. The Gantt and Scheduler stay MOUNTED at height 0
 * when hidden (dhtmlx and the calendar are costly to re-init); the Kanban may
 * unmount, and its card editor is then rendered by the host below.
 */
export function KanbanGanttSchedulerSplit({
  canvasId,
  showKanban,
  showGantt,
  showScheduler,
}: {
  canvasId: string;
  showKanban: boolean;
  showGantt: boolean;
  showScheduler: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lowest view(s) only. `null` means "not resized yet", so the default can
  // depend on how many lower panels are open.
  const [lowerHeights, setLowerHeights] = useState<Record<LowerViewId, number | null>>({
    gantt: null,
    scheduler: null,
  });

  const visibleOrder: ViewId[] = [];
  if (showKanban) visibleOrder.push('kanban');
  if (showGantt) visibleOrder.push('gantt');
  if (showScheduler) visibleOrder.push('scheduler');
  // At least one view must stay open. If a caller ever passes none, show the
  // Kanban rather than an empty page.
  if (visibleOrder.length === 0) visibleOrder.push('kanban');

  const firstVisible = visibleOrder[0];
  const lowerPanels = visibleOrder.slice(1) as LowerViewId[];
  const twoLower = lowerPanels.length === 2;
  const lowerKey = lowerPanels.join(',');

  const defaultLowerHeight = twoLower ? DOUBLE_LOWER_DEFAULT : SINGLE_LOWER_DEFAULT;
  const resolvedHeights: Record<LowerViewId, number> = {
    gantt: lowerHeights.gantt ?? defaultLowerHeight,
    scheduler: lowerHeights.scheduler ?? defaultLowerHeight,
  };
  // The mouse handlers read heights from here, so their effects do not need to
  // re-bind on every height change.
  const resolvedRef = useRef(resolvedHeights);
  resolvedRef.current = resolvedHeights;

  // --- SINGLE LOWER PANEL RESIZE (K+G, K+S, G+S) ---
  useEffect(() => {
    if (lowerPanels.length !== 1) return;
    const target = lowerPanels[0];
    const handle = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="single-split"]');
    if (!handle) return;

    const onMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxHeight = Math.max(MIN_HEIGHT, rect.height - MIN_HEIGHT);
      const next = Math.max(MIN_HEIGHT, Math.min(maxHeight, rect.bottom - event.clientY));
      setLowerHeights((current) => ({ ...current, [target]: next }));
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

    handle.addEventListener('mousedown', startResize);
    return () => {
      handle.removeEventListener('mousedown', startResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowerKey]);

  // --- TWO LOWER PANELS (K+G+S): the middle panel ---
  useEffect(() => {
    if (!twoLower) return;
    const middle = lowerPanels[0];
    const bottom = lowerPanels[1];
    const handle = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="multi-top-split"]');
    if (!handle) return;

    const onMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const bottomHeight = resolvedRef.current[bottom];
      const maxHeight = Math.max(MIN_HEIGHT, rect.height - MIN_HEIGHT - bottomHeight);
      const next = Math.max(MIN_HEIGHT, Math.min(maxHeight, rect.bottom - event.clientY - bottomHeight));
      setLowerHeights((current) => ({ ...current, [middle]: next }));
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

    handle.addEventListener('mousedown', startResize);
    return () => {
      handle.removeEventListener('mousedown', startResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowerKey]);

  // --- TWO LOWER PANELS (K+G+S): the bottom panel steals from the middle ---
  useEffect(() => {
    if (!twoLower) return;
    const middle = lowerPanels[0];
    const bottom = lowerPanels[1];
    const handle = containerRef.current?.querySelector<HTMLDivElement>('[data-resize-handle="multi-bottom-split"]');
    if (!handle) return;

    const onMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const bottomHeight = resolvedRef.current[bottom];
      const middleHeight = resolvedRef.current[middle];
      const combined = middleHeight + bottomHeight;
      const maxBottom = Math.max(MIN_HEIGHT, combined - MIN_HEIGHT);
      const nextBottom = Math.max(MIN_HEIGHT, Math.min(maxBottom, rect.bottom - event.clientY));
      setLowerHeights((current) => ({ ...current, [bottom]: nextBottom, [middle]: combined - nextBottom }));
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

    handle.addEventListener('mousedown', startResize);
    return () => {
      handle.removeEventListener('mousedown', startResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowerKey]);

  // dhtmlx and the calendar must redraw at their new size after any toggle.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
    return () => clearTimeout(timer);
  }, [showKanban, showGantt, showScheduler]);

  const panelStyle = (id: ViewId): CSSProperties => {
    if (!visibleOrder.includes(id)) {
      return { height: 0, opacity: 0, pointerEvents: 'none' };
    }
    if (firstVisible === id) {
      return { flex: '1 1 0%', minHeight: 0 };
    }
    return { height: `${resolvedHeights[id as LowerViewId]}px`, opacity: 1, pointerEvents: 'auto' };
  };

  const fill = (id: ViewId) => (firstVisible === id ? 'true' : undefined);

  return (
    <div ref={containerRef} className="h-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-gray-100">
      {/* Kanban. Unmounted when hidden; its editor host takes its place. */}
      {showKanban ? (
        <div
          data-split-panel="kanban"
          data-split-fill={fill('kanban')}
          style={panelStyle('kanban')}
          className="min-h-0 min-w-0 overflow-hidden bg-white"
        >
          <div className="h-full">
            <KanbanCanvas canvasId={canvasId} />
          </div>
        </div>
      ) : (
        <KanbanCardEditorHost />
      )}

      {/* Gantt. Kept mounted at height 0 when hidden. */}
      {showGantt && firstVisible !== 'gantt' ? (
        <div
          data-resize-handle={twoLower ? 'multi-top-split' : 'single-split'}
          className="h-2 flex-shrink-0 cursor-row-resize bg-gray-300 hover:bg-gray-400 transition-colors"
          aria-label="Resize Gantt"
          role="separator"
          aria-orientation="horizontal"
        />
      ) : null}
      <div
        data-split-panel="gantt"
        data-split-fill={fill('gantt')}
        style={panelStyle('gantt')}
        className="min-h-0 min-w-0 overflow-hidden transition-opacity bg-white"
      >
        <div className={showGantt ? 'h-full border-t border-gray-300' : 'h-full'}>
          <GanttCanvas />
        </div>
      </div>

      {/* Scheduler. Kept mounted at height 0 when hidden. */}
      {showScheduler && firstVisible !== 'scheduler' ? (
        <div
          data-resize-handle={twoLower ? 'multi-bottom-split' : 'single-split'}
          className="h-2 flex-shrink-0 cursor-row-resize bg-gray-300 hover:bg-gray-400 transition-colors"
          aria-label="Resize Scheduler"
          role="separator"
          aria-orientation="horizontal"
        />
      ) : null}
      <div
        data-split-panel="scheduler"
        data-split-fill={fill('scheduler')}
        style={panelStyle('scheduler')}
        className="min-h-0 min-w-0 overflow-hidden transition-opacity bg-white"
      >
        <div className={showScheduler ? 'h-full border-t border-gray-300' : 'h-full'}>
          <SchedulerCanvas />
        </div>
      </div>
    </div>
  );
}
