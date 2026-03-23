'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import 'dhtmlx-scheduler/codebase/dhtmlxscheduler.css';
import './scheduler.css';
import { useKanbanData, useKanbanPersistence, useKanbanReadonly } from '@/components/kanban-canvas/store';
import type { Card, Column } from '@/types/kanban-canvas';
import { SchedulerEventMenu } from './SchedulerEventMenu';

type SchedulerEvent = {
  id: string;
  text: string;
  start_date: Date;
  end_date: Date;
};

type SchedulerLike = {
  config: {
    readonly?: boolean;
    drag_create?: boolean;
    edit_on_create?: boolean;
    details_on_create?: boolean;
    details_on_dblclick?: boolean;
    first_hour?: number;
    last_hour?: number;
  };
  templates?: { event_class?: (_start: Date, _end: Date, event: { color?: string }) => string };
  init: (container: HTMLElement, date?: Date, mode?: 'week' | 'month' | 'day') => void;
  clearAll: () => void;
  parse: (data: SchedulerEvent[] | { data: SchedulerEvent[] }, type?: 'json') => void;
  attachEvent: (name: string, cb: (...args: unknown[]) => unknown) => string;
  detachEvent: (id: string) => void;
  changeEventId: (id: string, newId: string) => void;
  getEvent: (id: string | number) => Record<string, unknown> | null;
  setCurrentView: (date?: Date, mode?: 'week' | 'month' | 'day') => void;
  destructor?: () => void;
};

type EventMenuState = {
  cardId: string;
  x: number;
  y: number;
};

function toUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  return crypto.randomUUID();
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

function mapCardToEvent(card: Card): SchedulerEvent {
  const start = toDate(card.start_date) || toDate(card.end_date) || new Date();
  const end = toDate(card.end_date) || new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: card.id,
    text: card.label || 'Untitled',
    start_date: start,
    end_date: end,
  };
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const schedulerRef = useRef<SchedulerLike | null>(null);
  const detachEventsRef = useRef<(() => void) | null>(null);
  const isApplyingExternalUpdateRef = useRef(false);
  const dataRef = useRef(data);
  const originalRangesRef = useRef(new Map<string, { start: string; end: string }>());
  const [eventMenu, setEventMenu] = useState<EventMenuState | null>(null);

  const mapped = useMemo(() => data.cards.map(mapCardToEvent), [data.cards]);

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
    dataRef.current = data;
  }, [data]);

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
    let cancelled = false;

    const setup = async () => {
      if (!containerRef.current || schedulerRef.current) return;
      const schedulerModule = await import('dhtmlx-scheduler');
      if (cancelled) return;

      const scheduler = schedulerModule.scheduler as SchedulerLike;
      schedulerRef.current = scheduler;
      scheduler.config.readonly = readonly;
      scheduler.config.drag_create = !readonly;
      scheduler.config.edit_on_create = false;
      scheduler.config.details_on_create = false;
      scheduler.config.details_on_dblclick = false;
      scheduler.config.first_hour = 6;
      scheduler.config.last_hour = 22;
      scheduler.templates = scheduler.templates || {};
      scheduler.templates.event_class = (_start, _end, event) => (event.color ? `sched-color-${event.color.replace('#', '')}` : '');

      scheduler.init(containerRef.current, new Date(), 'week');
      scheduler.parse(mapped, 'json');

      const ids: string[] = [];
      ids.push(
        scheduler.attachEvent('onEventChanged', (id: unknown) => {
          if (isApplyingExternalUpdateRef.current) return true;
          const ev = scheduler.getEvent(String(id));
          if (!ev) return true;
          const updates: Partial<Card> = {
            label: typeof ev.text === 'string' ? ev.text : undefined,
            start_date: toDateInput(ev.start_date as Date | undefined),
            end_date: toDateInput(ev.end_date as Date | undefined),
          };
          void actions.updateCard(String(id), updates);
          return true;
        })
      );

      ids.push(
        scheduler.attachEvent('onEventAdded', (id: unknown, ev: unknown) => {
          if (isApplyingExternalUpdateRef.current) return true;
          const eventLike = ev as Record<string, unknown>;
          const columnId = resolveDefaultColumnId(dataRef.current.columns);
          if (!columnId) return true;
          const nextId = toUuid(String(id));
          if (nextId !== String(id)) {
            scheduler.changeEventId(String(id), nextId);
          }
          const nextCard: Card = {
            id: nextId,
            label: typeof eventLike.text === 'string' ? eventLike.text : 'Untitled',
            description: undefined,
            priority: 'medium',
            columnId,
            order: dataRef.current.cards.filter((c) => c.columnId === columnId).length + 1,
            start_date: toDateInput(eventLike.start_date as Date | undefined),
            end_date: toDateInput(eventLike.end_date as Date | undefined),
            progress: 0,
          };
          void actions.addCard(nextCard);
          return true;
        })
      );

      ids.push(
        scheduler.attachEvent('onContextMenu', (id: unknown, rawEvent: unknown) => {
          if (readonly) return false;
          const cardId = String(id);
          if (!getCardById(cardId)) return false;
          const event = rawEvent as MouseEvent | undefined;
          if (!event) return false;
          event.preventDefault();
          setEventMenu({
            cardId,
            x: event.clientX,
            y: event.clientY,
          });
          return false;
        })
      );

      ids.push(
        scheduler.attachEvent('onEventDeleted', (id: unknown) => {
          if (isApplyingExternalUpdateRef.current) return true;
          closeEventMenu();
          void actions.deleteCard(String(id));
          return true;
        })
      );

      detachEventsRef.current = () => {
        ids.forEach((eventId) => scheduler.detachEvent(eventId));
      };
    };

    setup();
    return () => {
      cancelled = true;
      detachEventsRef.current?.();
      detachEventsRef.current = null;
      if (schedulerRef.current) {
        schedulerRef.current.clearAll();
        schedulerRef.current.destructor?.();
      }
      schedulerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    scheduler.config.readonly = readonly;
    scheduler.config.drag_create = !readonly;
    scheduler.config.edit_on_create = false;
    scheduler.setCurrentView();
  }, [readonly]);

  useEffect(() => {
    if (!readonly) return;
    setEventMenu(null);
  }, [readonly]);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    isApplyingExternalUpdateRef.current = true;
    try {
      scheduler.clearAll();
      scheduler.parse(mapped, 'json');
    } finally {
      isApplyingExternalUpdateRef.current = false;
    }
  }, [mapped]);

  return (
    <div className="scheduler-shell">
      <div className="scheduler-toolbar">
        <span className="scheduler-toolbar-title">Scheduler</span>
      </div>
      <div ref={containerRef} className="scheduler-container" />
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
