'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import './gantt.css';
import { Calendar, CalendarDays } from 'lucide-react';
import { useKanbanData, useKanbanPersistence, useKanbanReadonly } from '@/components/kanban-canvas/store';
import { useKanbanI18n } from '@/components/kanban-canvas/useKanbanI18n';
import { CalendarImportModal } from '@/components/kanban-canvas/CalendarImportModal';
import { configureGantt } from './GanttConfig';
import { bindGanttEvents } from './ganttEvents';
import { mapCardToGanttTask, mapLinkToGantt } from './mappers';
import { NewTaskModal } from './NewTaskModal';

type GanttLike = {
  attachEvent: (name: string, callback: (...args: unknown[]) => unknown) => string;
  detachEvent: (id: string) => void;
  changeTaskId: (id: string, newId: string) => void;
  deleteTask: (id: string) => void;
  ext?: {
    zoom?: {
      setLevel: (level: string) => void;
    };
  };
  init: (container: HTMLElement) => void;
  parse: (payload: { data: unknown[]; links: unknown[] }) => void;
  clearAll: () => void;
  render: () => void;
  config: Record<string, unknown>;
  plugins: (features: Record<string, boolean>) => void;
  locale?: { labels?: Record<string, string> };
  getTask: (id: string) => unknown;
  getChildren: (id: string) => unknown[];
};

export function GanttCanvas() {
  const data = useKanbanData();
  const actions = useKanbanPersistence();
  const readonly = useKanbanReadonly();
  const { t } = useKanbanI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<GanttLike | null>(null);
  const detachEventsRef = useRef<(() => void) | null>(null);
  const isApplyingExternalUpdateRef = useRef(false);
  const hasLoadedCardsRef = useRef(false);
  const dataRef = useRef(data);
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>('week');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [parentTaskId, setParentTaskId] = useState<string | undefined>(undefined);
  const [weekRangePopover, setWeekRangePopover] = useState<{
    label: string;
    range: string;
    x: number;
    y: number;
  } | null>(null);

  const mapped = useMemo(
    () => ({
      data: [...data.cards]
        .sort((a, b) => {
          // Sort siblings (same parent) by order so re-parse after drag reflects new positions.
          // Tasks with different parents retain their relative insertion order (stable sort).
          const aParent = a.parent ?? '';
          const bParent = b.parent ?? '';
          if (aParent === bParent) return (a.order ?? 0) - (b.order ?? 0);
          return 0;
        })
        .map(mapCardToGanttTask),
      links: data.links.map(mapLinkToGantt),
    }),
    [data.cards, data.links]
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // GanttCanvas bypasses Board.tsx, which is normally responsible for calling
  // loadCardsForColumn on mount. Without this, the scaffold loads with cards: []
  // and all tasks disappear on refresh (they exist in Supabase but are never fetched).
  useEffect(() => {
    if (hasLoadedCardsRef.current) return;
    if (data.columns.length === 0) return;
    hasLoadedCardsRef.current = true;
    Promise.all(
      data.columns.map((column) => actions.loadCardsForColumn(column.id))
    ).catch((err) => console.error('[GanttCanvas] Failed to load cards:', err));
  }, [data.columns, actions]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      if (!containerRef.current || ganttRef.current) return;
      const ganttModule = await import('dhtmlx-gantt');
      if (cancelled) return;

      const gantt = ganttModule.gantt as GanttLike;
      ganttRef.current = gantt;
      configureGantt(gantt as any, readonly, (taskId?: string) => {
        setParentTaskId(taskId);
        setIsModalOpen(true);
      }, dataRef.current.columns.map((column) => ({ key: column.id, label: column.label })), true);
      gantt.init(containerRef.current);
      // Use latest store snapshot at init time to avoid a stale empty-parse race.
      const latestMapped = {
        data: [...dataRef.current.cards]
          .sort((a, b) => {
            const aParent = a.parent ?? '';
            const bParent = b.parent ?? '';
            if (aParent === bParent) return (a.order ?? 0) - (b.order ?? 0);
            return 0;
          })
          .map(mapCardToGanttTask),
        links: dataRef.current.links.map(mapLinkToGantt),
      };
      gantt.parse(latestMapped);

      detachEventsRef.current = bindGanttEvents({
        gantt: gantt as any,
        actions: {
          addCard: actions.addCard,
          updateCard: actions.updateCard,
          deleteCard: actions.deleteCard,
          addLink: actions.addLink,
          deleteLink: actions.deleteLink,
        },
        getDataSnapshot: () => ({
          cards: dataRef.current.cards,
          columns: dataRef.current.columns,
          rows: dataRef.current.rows,
        }),
        isApplyingExternalUpdateRef,
      });
    };

    setup();
    return () => {
      cancelled = true;
      detachEventsRef.current?.();
      detachEventsRef.current = null;
      if (ganttRef.current) {
        ganttRef.current.clearAll();
      }
      ganttRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;
    configureGantt(gantt as any, readonly, (taskId?: string) => {
      setParentTaskId(taskId);
      setIsModalOpen(true);
    }, data.columns.map((column) => ({ key: column.id, label: column.label })));
    gantt.render();
  }, [readonly, data.columns]);

  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt || !gantt.ext?.zoom) return;
    gantt.ext.zoom.setLevel(zoom);
  }, [zoom]);

  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;

    isApplyingExternalUpdateRef.current = true;
    try {
      gantt.clearAll();
      gantt.parse(mapped);
    } finally {
      isApplyingExternalUpdateRef.current = false;
    }
  }, [mapped]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const weekTarget = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-gantt-week-range]')
        : null;

    const openFromTarget = (target: HTMLElement, x: number, y: number) => {
      setWeekRangePopover((current) => {
        const label = target.dataset.ganttWeekLabel || 'Week';
        const range = target.dataset.ganttWeekRange || '';
        // A SECOND click on the SAME week closes the popover.
        if (current && current.label === label && current.range === range) return null;
        return { label, range, x, y };
      });
    };

    const handleContextMenu = (event: MouseEvent) => {
      const target = weekTarget(event);
      if (!target) return;
      event.preventDefault();
      openFromTarget(target, event.clientX, event.clientY);
    };

    // PATCH-330. A LEFT click opens the same popover. Capture phase and
    // stopPropagation so dhtmlx does nothing else (no sort, no selection).
    const handleClick = (event: MouseEvent) => {
      const target = weekTarget(event);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      openFromTarget(target, event.clientX, event.clientY);
    };

    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('click', handleClick, true);
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('click', handleClick, true);
    };
  }, []);

  useEffect(() => {
    if (!weekRangePopover) return;

    const dismiss = () => setWeekRangePopover(null);
    // A pointerdown on a WEEK LABEL must not dismiss: the `click` that follows
    // is what toggles it, and dismissing first would turn a second click into a
    // re-open instead of a close.
    const handlePointerDown = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-gantt-week-range]')) return;
      dismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [weekRangePopover]);

  return (
    <div className="gantt-shell">
      <div className="gantt-toolbar">
        <div className="gantt-toolbar-left">
          <span className="gantt-toolbar-title">Gantt</span>
          {/* PATCH-330. Reach the calendar connection from the Gantt-only view. */}
          {!readonly ? (
            <button
              type="button"
              data-calendar-import-open="gantt"
              className="gantt-calendar-btn"
              title={t('calendarButtonTitle')}
              onClick={() => setIsCalendarModalOpen(true)}
            >
              <Calendar size={16} />
              <span>{t('import')}</span>
            </button>
          ) : null}
        </div>
        <div className="gantt-zoom-controls" role="group" aria-label="Gantt zoom controls">
          <button
            type="button"
            className={zoom === 'day' ? 'is-active' : ''}
            onClick={() => setZoom('day')}
          >
            Day
          </button>
          <button
            type="button"
            className={zoom === 'week' ? 'is-active' : ''}
            onClick={() => setZoom('week')}
          >
            Week
          </button>
          <button
            type="button"
            className={zoom === 'month' ? 'is-active' : ''}
            onClick={() => setZoom('month')}
          >
            Month
          </button>
        </div>
      </div>
      <div ref={containerRef} className="gantt-container" />
      {weekRangePopover ? (
        <div
          className="gantt-week-range-popover"
          style={{
            left: `min(${weekRangePopover.x + 12}px, calc(100vw - 220px))`,
            top: `min(${weekRangePopover.y + 12}px, calc(100vh - 96px))`,
          }}
          role="dialog"
          aria-label={`${weekRangePopover.label} date range`}
        >
          <div className="gantt-week-range-popover__label">
            <CalendarDays size={14} />
            <span>{weekRangePopover.label}</span>
          </div>
          <div className="gantt-week-range-popover__range">{weekRangePopover.range}</div>
        </div>
      ) : null}
      <NewTaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setParentTaskId(undefined);
        }}
        parentTaskId={parentTaskId}
      />
      <CalendarImportModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
      />
    </div>
  );
}
