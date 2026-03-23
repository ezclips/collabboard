'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from 'react';
import { Calendar, momentLocalizer, type View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import type { Padlet } from '@/types/collabboard';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import './scheduler-theme.css';
import SchedulerEventContextMenu from '@/components/canvas/SchedulerEventContextMenu';

const localizer = momentLocalizer(moment);

type SchedulerEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Padlet;
};

type StandaloneSchedulerCanvasProps = {
  padlets: Padlet[];
  canvasId: string;
  readOnly?: boolean;
  selectedContainerId?: string | null;
  onUpdatePadletMetadata: (padletId: string, metadataUpdates: Record<string, unknown>) => Promise<void> | void;
  onCreatePadlet: (
    start: Date,
    end: Date,
    options?: { title?: string; metadata?: Record<string, unknown> }
  ) => Promise<void> | void;
  onTargetItem?: (padlet: Padlet) => void;
  onEditItem?: (padlet: Padlet) => void;
  selectedTimeSlot?: { start: Date; end: Date } | null;
  onSelectTimeSlot?: (slot: { start: Date; end: Date } | null) => void;
  onDeletePadlet?: (padletId: string) => void;
  onExternalDropItem?: (input: {
    payload: Record<string, unknown>;
    slot: { start: Date; end: Date };
    targetContainerId?: string | null;
  }) => Promise<void> | void;
};

const DndCalendar = withDragAndDrop(Calendar) as unknown as ComponentType<Record<string, unknown>>;

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

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

  // YIQ brightness formula: higher values are lighter backgrounds.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#000000' : '#ffffff';
}

function addMinutes(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000);
}

function durationInMinutes(start: Date, end: Date): number {
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
}

function floorToQuarter(minutes: number): number {
  return Math.max(15, Math.floor(minutes / 15) * 15);
}

export default function StandaloneSchedulerCanvas({
  padlets,
  canvasId,
  readOnly = false,
  selectedContainerId = null,
  onUpdatePadletMetadata,
  onCreatePadlet,
  onTargetItem,
  onEditItem,
  selectedTimeSlot = null,
  onSelectTimeSlot,
  onDeletePadlet,
  onExternalDropItem,
}: StandaloneSchedulerCanvasProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentView, setCurrentView] = useState<View>('week');
  const suppressNextSelectRef = useRef(false);
  const eventMutationInFlightRef = useRef<Set<string>>(new Set());
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const externalDragItemRef = useRef<SchedulerEvent | null>(null);
  const externalDropPayloadRef = useRef<Record<string, unknown> | null>(null);
  const externalDropContainerIdRef = useRef<string | null>(null);
  // Refs kept current so the capture-phase drop listener never has a stale closure.
  const padletsRef = useRef(padlets);
  useEffect(() => { padletsRef.current = padlets; }, [padlets]);
  const onExternalDropItemRef = useRef(onExternalDropItem);
  useEffect(() => { onExternalDropItemRef.current = onExternalDropItem; }, [onExternalDropItem]);

  // Measure the wrapper with ResizeObserver so the calendar gets exact pixel
  // dimensions — prevents react-big-calendar from baking in a wrong offsetWidth
  // during the Next.js hydration pass before the flex layout has settled.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [calSize, setCalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCalSize(prev =>
        prev?.width === width && prev?.height === height ? prev : { width, height }
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Capture-phase document listeners — fire before react-big-calendar's internal
  // handlers, which call stopPropagation on dragover/drop and block our React
  // synthetic event handlers entirely.
  useEffect(() => {
    if (readOnly) return;
    const handleCaptureDragOver = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.('.scheduler-wrapper')) return;

      const types = Array.from(e.dataTransfer?.types ?? []);
      const isLibraryDrag =
        types.includes('application/collabboard-library') ||
        types.includes('application/collabboard-svg');
      if (!isLibraryDrag) return;

      // Detect which container (if any) is under the cursor.
      const containerEl = target.closest('[data-scheduler-container-id]') as HTMLElement | null;
      const containerId = containerEl?.getAttribute('data-scheduler-container-id') ?? null;
      externalDropContainerIdRef.current = containerId;

      if (containerId) {
        e.preventDefault(); // mark as valid drop target so `drop` will fire
      }
      // No preventDefault on empty space → browser shows not-allowed cursor
    };

    const handleCaptureDrop = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.('.scheduler-wrapper')) return;

      const containerId = externalDropContainerIdRef.current;
      if (!containerId) return; // dropped on empty space — do nothing

      const dt = e.dataTransfer;
      if (!dt) return;

      const raw =
        dt.getData('application/collabboard-library') ||
        dt.getData('application/collabboard-svg');
      if (!raw) return;

      let payload: Record<string, unknown>;
      try { payload = JSON.parse(raw) as Record<string, unknown>; }
      catch { return; }

      e.preventDefault();
      e.stopPropagation(); // prevent canvas handler and any other bubble listeners

      const containerPadlet = padletsRef.current.find((p) => p.id === containerId);
      const start = parseDate(containerPadlet?.metadata?.start_date) ?? new Date();
      const end   = parseDate(containerPadlet?.metadata?.end_date)   ?? addMinutes(start, 60);

      onExternalDropItemRef.current?.({ payload, slot: { start, end }, targetContainerId: containerId });
      externalDropContainerIdRef.current = null;
    };

    document.addEventListener('dragover', handleCaptureDragOver, true);
    document.addEventListener('drop', handleCaptureDrop, true);
    return () => {
      document.removeEventListener('dragover', handleCaptureDragOver, true);
      document.removeEventListener('drop', handleCaptureDrop, true);
    };
  }, [readOnly]); // stable — all mutable state accessed through refs

  const events = useMemo<SchedulerEvent[]>(() => {
    return padlets
      .filter(padlet => !padlet.metadata?.parentId)
      .map((padlet) => {
        const start = parseDate(padlet.metadata?.start_date);
        const end = parseDate(padlet.metadata?.end_date);
        if (!start) return null;
        const safeEnd = end && end > start ? end : new Date(start.getTime() + 60 * 60 * 1000);
        return {
          id: padlet.id,
          title: padlet.title?.trim() || '',
          start,
          end: safeEnd,
          resource: padlet,
        };
      })
      .filter((event): event is SchedulerEvent => event !== null);
  }, [padlets]);

  const handleEventMoveOrResize = async ({
    event,
    start,
    end,
  }: {
    event: SchedulerEvent;
    start: Date;
    end: Date;
  }) => {
    if (readOnly) return;
    console.log('[Scheduler] Handling event move/resize', event.title, start, end);
    const safeEnd = end > start ? end : new Date(start.getTime() + 60 * 60 * 1000);
    try {
      await onUpdatePadletMetadata(event.resource.id, {
        start_date: start.toISOString(),
        end_date: safeEnd.toISOString(),
      });
      console.log('[Scheduler] Successfully updated padlet metadata');
    } catch (err) {
      console.error('[Scheduler] Failed to update metadata:', err);
    }
  };

  const handleSelectSlot = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      if (readOnly) return;
      console.log('[Scheduler] Selected slot:', start, end);
      onSelectTimeSlot?.({ start, end });
    },
    [onSelectTimeSlot, readOnly]
  );

  const handleSelectEvent = (event: SchedulerEvent) => {
    if (readOnly) return;
    if (suppressNextSelectRef.current) {
      suppressNextSelectRef.current = false;
      return;
    }
    console.log('[Scheduler] Clicked existing event:', event);
    onEditItem?.(event.resource);
  };

  const runEventMutation = useCallback(async (eventId: string, action: () => Promise<void>) => {
    if (eventMutationInFlightRef.current.has(eventId)) return;
    eventMutationInFlightRef.current.add(eventId);
    try {
      await action();
    } finally {
      eventMutationInFlightRef.current.delete(eventId);
    }
  }, []);

  const getLiveEventRange = useCallback((event: SchedulerEvent) => {
    const livePadlet = padlets.find((p) => p.id === event.resource.id);
    const liveStart = parseDate(livePadlet?.metadata?.start_date);
    const liveEnd = parseDate(livePadlet?.metadata?.end_date);
    const start = liveStart || event.start;
    const end = liveEnd && liveEnd > start ? liveEnd : event.end;
    return { start, end };
  }, [padlets]);

  const getOriginalRangePatch = useCallback((event: SchedulerEvent, start: Date, end: Date) => {
    const metadata = event.resource.metadata as Record<string, unknown> | undefined;
    const hasOriginalStart = typeof metadata?.schedulerOriginalStartDate === 'string';
    const hasOriginalEnd = typeof metadata?.schedulerOriginalEndDate === 'string';
    if (hasOriginalStart && hasOriginalEnd) return {};
    return {
      schedulerOriginalStartDate: start.toISOString(),
      schedulerOriginalEndDate: end.toISOString(),
    };
  }, []);

  const selectedSlotContainerCount = useMemo(() => {
    if (!selectedTimeSlot) return 0;
    const startMs = selectedTimeSlot.start.getTime();
    const endMs = selectedTimeSlot.end.getTime();
    return events.filter((event) => event.start.getTime() === startMs && event.end.getTime() === endMs).length;
  }, [events, selectedTimeSlot]);

  const slotPropGetter = useCallback((date: Date) => {
    if (!selectedTimeSlot) return {};
    // Once multiple containers exist for one time range, slot-wide highlight becomes ambiguous.
    if (selectedSlotContainerCount > 1) return {};
    // Check if this date (time slot) falls within the selected start and end
    if (date >= selectedTimeSlot.start && date < selectedTimeSlot.end) {
      return {
        style: {
          boxShadow: 'inset 2px 0 0 #2563eb',
        },
      };
    }
    return {};
  }, [selectedSlotContainerCount, selectedTimeSlot]);

  const eventPropGetter = useCallback((event: SchedulerEvent) => {
    const metadata = event.resource.metadata as Record<string, unknown> | undefined;
    const cardColor = typeof metadata?.cardColor === 'string' ? metadata.cardColor : null;
    const isTargeted = selectedContainerId === event.resource.id;
    const isInBlueSelectedSlot = !!(
      selectedTimeSlot &&
      selectedSlotContainerCount <= 1 &&
      event.start < selectedTimeSlot.end &&
      event.end > selectedTimeSlot.start
    );
    const outlineColor = isInBlueSelectedSlot ? '#f59e0b' : '#2563eb';
    const targetOutline = isTargeted
      ? {
          border: `2px solid ${outlineColor}`,
          boxShadow: isInBlueSelectedSlot
            ? '0 0 0 2px rgba(245, 158, 11, 0.25)'
            : '0 0 0 2px rgba(37, 99, 235, 0.2)',
        }
      : {};

    if (cardColor && cardColor !== '#ffffff') {
      const textColor = getReadableTextColor(cardColor);
      return {
        style: {
          background: cardColor,
          backgroundColor: cardColor,
          backgroundImage: 'none',
          color: textColor,
          border: 'none',
          ...targetOutline,
        },
      };
    }
    if (isTargeted) {
      return { style: targetOutline };
    }
    return {};
  }, [selectedContainerId, selectedSlotContainerCount, selectedTimeSlot]);

  const setEventDuration = useCallback(async (event: SchedulerEvent, minutes: number) => {
    if (readOnly) return;
    await runEventMutation(event.resource.id, async () => {
      const { start, end } = getLiveEventRange(event);
      const normalized = floorToQuarter(minutes);
      await onUpdatePadletMetadata(event.resource.id, {
        ...getOriginalRangePatch(event, start, end),
        start_date: start.toISOString(),
        end_date: addMinutes(start, normalized).toISOString(),
      });
    });
  }, [getLiveEventRange, getOriginalRangePatch, onUpdatePadletMetadata, readOnly, runEventMutation]);

  const splitEventInHalf = useCallback(async (event: SchedulerEvent) => {
    if (readOnly) return;
    await runEventMutation(event.resource.id, async () => {
      const { start, end } = getLiveEventRange(event);
      const total = floorToQuarter(durationInMinutes(start, end));
      if (total < 30) return;

      const firstDuration = floorToQuarter(total / 2);
      const splitPoint = addMinutes(start, firstDuration);

      await onUpdatePadletMetadata(event.resource.id, {
        ...getOriginalRangePatch(event, start, end),
        start_date: start.toISOString(),
        end_date: splitPoint.toISOString(),
      });

      await onCreatePadlet(splitPoint, end, {
        title: event.title,
        metadata: {
          cardColor: (event.resource.metadata as Record<string, unknown> | undefined)?.cardColor,
        },
      });
    });
  }, [getLiveEventRange, getOriginalRangePatch, onUpdatePadletMetadata, onCreatePadlet, readOnly, runEventMutation]);

  const splitEventIntoQuarterHours = useCallback(async (event: SchedulerEvent) => {
    if (readOnly) return;
    await runEventMutation(event.resource.id, async () => {
      const { start, end } = getLiveEventRange(event);
      const total = floorToQuarter(durationInMinutes(start, end));
      const blocks = Math.floor(total / 15);
      if (blocks <= 1) return;

      const firstEnd = addMinutes(start, 15);
      await onUpdatePadletMetadata(event.resource.id, {
        ...getOriginalRangePatch(event, start, end),
        start_date: start.toISOString(),
        end_date: firstEnd.toISOString(),
      });

      for (let i = 1; i < blocks; i++) {
        const segmentStart = addMinutes(start, i * 15);
        const segmentEnd = addMinutes(start, (i + 1) * 15);
        await onCreatePadlet(segmentStart, segmentEnd, {
          title: event.title,
          metadata: {
            cardColor: (event.resource.metadata as Record<string, unknown> | undefined)?.cardColor,
          },
        });
      }
    });
  }, [getLiveEventRange, getOriginalRangePatch, onUpdatePadletMetadata, onCreatePadlet, readOnly, runEventMutation]);

  const revertTimeSetting = useCallback(async (event: SchedulerEvent) => {
    if (readOnly) return;
    await runEventMutation(event.resource.id, async () => {
      const metadata = event.resource.metadata as Record<string, unknown> | undefined;
      const originalStartRaw = typeof metadata?.schedulerOriginalStartDate === 'string' ? metadata.schedulerOriginalStartDate : null;
      const originalEndRaw = typeof metadata?.schedulerOriginalEndDate === 'string' ? metadata.schedulerOriginalEndDate : null;
      const originalStart = parseDate(originalStartRaw || undefined);
      const originalEnd = parseDate(originalEndRaw || undefined);
      if (!originalStart || !originalEnd || originalEnd <= originalStart) return;

      await onUpdatePadletMetadata(event.resource.id, {
        start_date: originalStart.toISOString(),
        end_date: originalEnd.toISOString(),
        schedulerOriginalStartDate: null,
        schedulerOriginalEndDate: null,
      });
    });
  }, [onUpdatePadletMetadata, readOnly, runEventMutation]);

  const addConcurrentContainer = useCallback(async (event: SchedulerEvent) => {
    if (readOnly) return;
    await runEventMutation(`add-concurrent-${event.resource.id}`, async () => {
      const { start, end } = getLiveEventRange(event);

      const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];
      const currentMetadata = event.resource.metadata as Record<string, unknown> | undefined;
      const currentColor = currentMetadata?.cardColor as string | undefined;
      const availableColors = colors.filter(c => c !== currentColor);
      const finalColors = availableColors.length > 0 ? availableColors : colors;
      const randomColor = finalColors[Math.floor(Math.random() * finalColors.length)];

      await onCreatePadlet(start, end, {
        title: '',
        metadata: {
          cardColor: randomColor,
        },
      });
    });
  }, [getLiveEventRange, onCreatePadlet, readOnly, runEventMutation]);

  const CustomEventWrapper = useCallback(({ event, children }: { event: SchedulerEvent; children: React.ReactNode }) => {
    const content = (
      <div
        data-scheduler-container-id={event.resource.id}
        className="w-full h-full"
        onMouseDown={(e) => {
          if (readOnly) return;
          if (e.button === 0) {
            pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onMouseUp={(e) => {
          if (readOnly) return;
          if (e.button !== 0) return;
          const start = pointerDownPosRef.current;
          pointerDownPosRef.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 5) return;

          e.stopPropagation();
          e.preventDefault();
          if (suppressNextSelectRef.current) {
            suppressNextSelectRef.current = false;
            return;
          }
          onEditItem?.(event.resource);
        }}
      >
        {children}
      </div>
    );

    if (readOnly) {
      return content;
    }

    return (
      <SchedulerEventContextMenu
        onAddPost={() => {
          onTargetItem?.(event.resource);
        }}
        onSetDuration={(minutes) => {
          setEventDuration(event, minutes);
        }}
        onSplitInHalf={() => {
          splitEventInHalf(event);
        }}
        onSplitIntoQuarterHours={() => {
          splitEventIntoQuarterHours(event);
        }}
        onTrimToHalf={() => {
          const { start, end } = getLiveEventRange(event);
          const current = floorToQuarter(durationInMinutes(start, end));
          setEventDuration(event, Math.max(15, Math.floor(current / 2)));
        }}
        onRevertTimeSetting={() => {
          revertTimeSetting(event);
        }}
        onDeleteEvent={() => {
          if (onDeletePadlet) onDeletePadlet(event.resource.id);
        }}
        onAddContainer={() => {
          addConcurrentContainer(event);
        }}
        onChangeColor={(color) => {
          onUpdatePadletMetadata(event.resource.id, { cardColor: color });
        }}
      >
        {content}
      </SchedulerEventContextMenu>
    );
  }, [
    getLiveEventRange,
    onDeletePadlet,
    onEditItem,
    onTargetItem,
    onUpdatePadletMetadata,
    readOnly,
    revertTimeSetting,
    setEventDuration,
    splitEventInHalf,
    splitEventIntoQuarterHours,
    addConcurrentContainer
  ]);

  const CustomEvent = useCallback(({ title, event }: { title: string; event: SchedulerEvent }) => {
    const childCount = Array.isArray(event.resource.metadata?.childPadletIds)
      ? event.resource.metadata.childPadletIds.length
      : 0;
    const postLabel = `${childCount} ${childCount === 1 ? 'post' : 'posts'}`;
    return (
      <div
        data-scheduler-event-tab="true"
        data-scheduler-container-id={event.resource.id}
        title={postLabel}
        className="relative block w-full h-full min-h-[20px] px-1 overflow-hidden font-medium text-sm text-left"
      >
        <span className="block truncate">{title}</span>
      </div>
    );
  }, []);

  const clearExternalDragState = useCallback(() => {
    externalDragItemRef.current = null;
    externalDropPayloadRef.current = null;
    externalDropContainerIdRef.current = null;
  }, []);

  const parseExternalPayload = useCallback((dt: DataTransfer | null): Record<string, unknown> | null => {
    if (!dt) return null;

    const libraryData = dt.getData('application/collabboard-library');
    if (libraryData) {
      try {
        return JSON.parse(libraryData) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    const svgData = dt.getData('application/collabboard-svg');
    if (svgData) {
      try {
        return JSON.parse(svgData) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    const plainText = dt.getData('text/plain');
    if (plainText?.startsWith('svg:')) {
      return {
        type: 'image',
        title: 'Clipart',
        content: '',
        metadata: {
          imageUrl: plainText.replace('svg:', ''),
        },
      };
    }

    return null;
  }, []);

  return (
    <div
      className="scheduler-wrapper"
      ref={wrapperRef}
      onDragOver={(e) => {
        // Container detection and preventDefault are handled by the capture-phase
        // document listener above. This React handler only suppresses the browser
        // default on the wrapper level if the capture listener already approved it.
        if (externalDropContainerIdRef.current) e.preventDefault();
      }}
      onDragEnd={() => {
        clearExternalDragState();
      }}
    >
      {calSize && (
        <DndCalendar
          key={canvasId}
          localizer={localizer}
          events={events}
          date={currentDate}
          view={currentView}
          onNavigate={(newDate: Date) => setCurrentDate(newDate)}
          onView={(newView: View) => setCurrentView(newView)}
          views={['month', 'week', 'day', 'agenda']}
          resizable={!readOnly}
          selectable={!readOnly}
          popup
          dayLayoutAlgorithm="no-overlap"
          step={30}
          timeslots={2}
          style={{ height: calSize.height, width: '100%' }}
          onEventDrop={readOnly ? undefined : handleEventMoveOrResize}
          onEventResize={readOnly ? undefined : handleEventMoveOrResize}
          onSelectSlot={readOnly ? undefined : handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          dragFromOutsideItem={() => null}
          onDropFromOutside={() => { clearExternalDragState(); }}
          slotPropGetter={slotPropGetter}
          eventPropGetter={eventPropGetter}
          components={{
            event: CustomEvent,
            eventWrapper: CustomEventWrapper,
          }}
        />
      )}
    </div>
  );
}
