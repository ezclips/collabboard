'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Calendar, momentLocalizer, type View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import '@/components/canvas/scheduler-theme.css';
import './scheduler.css';
import { useKanbanData, useKanbanPersistence, useKanbanReadonly } from '@/components/kanban-canvas/store';
import type { Card, Column } from '@/types/kanban-canvas';
import { SchedulerEventMenu } from './SchedulerEventMenu';

const localizer = momentLocalizer(moment);
const DndCalendar = withDragAndDrop(Calendar) as unknown as ComponentType<Record<string, unknown>>;

// react-big-calendar only reads the time-of-day from min/max.
const DAY_START = new Date(1970, 0, 1, 6, 0, 0);
const DAY_END = new Date(1970, 0, 1, 22, 0, 0);

type SchedulerEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Card;
};

type EventMenuState = {
  cardId: string;
  x: number;
  y: number;
};

function getReadableTextColor(backgroundColor: string): '#000000' | '#ffffff' {
  const hex = backgroundColor.trim().replace('#', '');
  const normalized = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return '#000000';
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#000000' : '#ffffff';
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 9, 0, 0, 0);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toDateInput(date?: Date): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function durationInMinutes(start: Date, end: Date): number {
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
}

function floorToQuarter(minutes: number): number {
  return Math.max(15, Math.floor(minutes / 15) * 15);
}

function resolveDefaultColumnId(columns: Column[]): string | null {
  const first = [...columns]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .find((column) => !!column.id);
  return first?.id || null;
}

export function SchedulerCanvas() {
  const data = useKanbanData();
  const actions = useKanbanPersistence();
  const readonly = useKanbanReadonly();

  const dataRef = useRef(data);
  const originalRangesRef = useRef(new Map<string, { start: string; end: string }>());
  const [eventMenu, setEventMenu] = useState<EventMenuState | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentView, setCurrentView] = useState<View>('week');

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Only cards that carry a date are events; an undated card would otherwise
  // land at "now" and clutter the week.
  const events = useMemo<SchedulerEvent[]>(
    () =>
      data.cards
        .filter((card) => !!card.start_date || !!card.end_date)
        .map((card) => {
          const start = toDate(card.start_date) || toDate(card.end_date) || new Date();
          const end = toDate(card.end_date) || addMinutes(start, 60);
          return {
            id: card.id,
            title: card.label || 'Untitled',
            start,
            end: end > start ? end : addMinutes(start, 60),
            resource: card,
          };
        }),
    [data.cards],
  );

  const closeEventMenu = useCallback(() => {
    setEventMenu(null);
  }, []);

  const getCardById = useCallback((cardId: string) => {
    return dataRef.current.cards.find((card) => card.id === cardId) || null;
  }, []);

  const getCardRange = useCallback((card: Card) => {
    const start = toDate(card.start_date) || toDate(card.end_date) || new Date();
    const end = toDate(card.end_date) || addMinutes(start, 60);
    return { start, end: end > start ? end : addMinutes(start, 60) };
  }, []);

  const rememberOriginalRange = useCallback((card: Card) => {
    if (originalRangesRef.current.has(card.id)) return;
    const { start, end } = getCardRange(card);
    originalRangesRef.current.set(card.id, {
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }, [getCardRange]);

  const withMenuCard = useCallback(async (fn: (card: Card) => Promise<void> | void) => {
    if (!eventMenu) return;
    const card = getCardById(eventMenu.cardId);
    if (!card) return;
    await fn(card);
    closeEventMenu();
  }, [closeEventMenu, eventMenu, getCardById]);

  useEffect(() => {
    if (!eventMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEventMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [eventMenu]);

  useEffect(() => {
    if (!readonly) return;
    setEventMenu(null);
  }, [readonly]);

  const handleEventChange = useCallback(({ event, start, end }: { event: SchedulerEvent; start: Date; end: Date }) => {
    if (readonly) return;
    void actions.updateCard(event.resource.id, {
      start_date: toDateInput(start),
      end_date: toDateInput(end),
    });
  }, [actions, readonly]);

  const handleSelectSlot = useCallback(({ start, end, action }: { start: Date; end: Date; action: 'select' | 'click' | 'doubleClick' }) => {
    if (readonly) return;
    // A single click does nothing; only a drag-select or double-click creates.
    if (action === 'click') return;
    const columnId = resolveDefaultColumnId(dataRef.current.columns);
    if (!columnId) return;
    const nextCard: Card = {
      id: crypto.randomUUID(),
      label: 'Untitled',
      description: undefined,
      priority: 'medium',
      columnId,
      order: dataRef.current.cards.filter((c) => c.columnId === columnId).length + 1,
      start_date: toDateInput(start),
      end_date: toDateInput(end),
      progress: 0,
    };
    void actions.addCard(nextCard);
  }, [actions, readonly]);

  const eventPropGetter = useCallback((event: SchedulerEvent) => {
    const color = event.resource.color;
    if (!color) return {};
    return { style: { backgroundColor: color, color: getReadableTextColor(color) } };
  }, []);

  const EventWrapper = useCallback(({ event, children }: { event: SchedulerEvent; children: ReactNode }) => (
    <div
      data-scheduler-event-id={event.resource.id}
      style={{ display: 'contents' }}
      onContextMenu={(contextEvent) => {
        if (readonly) return;
        contextEvent.preventDefault();
        setEventMenu({ cardId: event.resource.id, x: contextEvent.clientX, y: contextEvent.clientY });
      }}
    >
      {children}
    </div>
  ), [readonly]);

  const calendarComponents = useMemo(() => ({ eventWrapper: EventWrapper }), [EventWrapper]);

  return (
    <div className="scheduler-shell">
      <div className="scheduler-toolbar">
        <span className="scheduler-toolbar-title">Scheduler</span>
      </div>
      <div className="scheduler-container">
        <DndCalendar
          localizer={localizer}
          events={events}
          date={currentDate}
          view={currentView}
          onNavigate={(newDate: Date) => setCurrentDate(newDate)}
          onView={(newView: View) => setCurrentView(newView)}
          views={['week', 'day', 'month']}
          min={DAY_START}
          max={DAY_END}
          step={30}
          timeslots={2}
          selectable={!readonly}
          resizable={!readonly}
          draggableAccessor={() => !readonly}
          resizableAccessor={() => !readonly}
          onEventDrop={readonly ? undefined : handleEventChange}
          onEventResize={readonly ? undefined : handleEventChange}
          onSelectSlot={readonly ? undefined : handleSelectSlot}
          eventPropGetter={eventPropGetter}
          components={calendarComponents}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
      {eventMenu ? (
        <SchedulerEventMenu
          x={eventMenu.x}
          y={eventMenu.y}
          canRevert={originalRangesRef.current.has(eventMenu.cardId)}
          onClose={closeEventMenu}
          onSetDuration={(minutes) => {
            void withMenuCard(async (card) => {
              rememberOriginalRange(card);
              const { start } = getCardRange(card);
              await actions.updateCard(card.id, {
                start_date: start.toISOString(),
                end_date: addMinutes(start, floorToQuarter(minutes)).toISOString(),
              });
            });
          }}
          onSplitInHalf={() => {
            void withMenuCard(async (card) => {
              rememberOriginalRange(card);
              const { start, end } = getCardRange(card);
              const total = floorToQuarter(durationInMinutes(start, end));
              if (total < 30) return;
              const firstDuration = floorToQuarter(total / 2);
              const splitPoint = addMinutes(start, firstDuration);
              await actions.updateCard(card.id, {
                start_date: start.toISOString(),
                end_date: splitPoint.toISOString(),
              });
              await actions.addCard({
                ...card,
                id: crypto.randomUUID(),
                start_date: splitPoint.toISOString(),
                end_date: end.toISOString(),
                order: (card.order ?? 0) + 1,
              });
            });
          }}
          onTrimToHalf={() => {
            void withMenuCard(async (card) => {
              rememberOriginalRange(card);
              const { start, end } = getCardRange(card);
              const total = floorToQuarter(durationInMinutes(start, end));
              await actions.updateCard(card.id, {
                start_date: start.toISOString(),
                end_date: addMinutes(start, Math.max(15, Math.floor(total / 2 / 15) * 15)).toISOString(),
              });
            });
          }}
          onRevertTimeSetting={() => {
            void withMenuCard(async (card) => {
              const original = originalRangesRef.current.get(card.id);
              if (!original) return;
              await actions.updateCard(card.id, {
                start_date: original.start,
                end_date: original.end,
              });
              originalRangesRef.current.delete(card.id);
            });
          }}
          onDuplicateEvent={() => {
            void withMenuCard(async (card) => {
              await actions.addCard({
                ...card,
                id: crypto.randomUUID(),
                order: (card.order ?? 0) + 1,
              });
            });
          }}
          onDeleteEvent={() => {
            void withMenuCard(async (card) => {
              await actions.deleteCard(card.id);
            });
          }}
          onChangeColor={(color) => {
            void withMenuCard(async (card) => {
              await actions.updateCard(card.id, { color });
            });
          }}
        />
      ) : null}
    </div>
  );
}
