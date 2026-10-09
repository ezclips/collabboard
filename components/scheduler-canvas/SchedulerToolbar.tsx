'use client';

// PATCH-331. The toolbar shared by the standalone Scheduler board and the
// Scheduler inside Kanban. Same buttons, order and classes as
// react-big-calendar's default (`rbc-toolbar`, `rbc-btn-group`, `rbc-active`),
// so the existing CSS keeps styling them; the difference is the centre label.
//
// The centre label names WHAT is shown instead of repeating the dates already
// under it: "Week 41" (with the range on hover and on click), "Friday, 9
// October 2026", "October 2026", or an agenda range with no US numeric dates.

import React, { useEffect, useRef, useState } from 'react';
import type { View } from 'react-big-calendar';
import moment from 'moment';
import { formatWeekRangeLabel, getIsoWeekNumber } from '@/components/gantt-canvas/dateUtils';

const VIEW_LABELS: Record<string, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
};

// The Monday-first week start is set on the global `en` locale by
// lib/scheduler/schedulerLocalizer (imported by both calendars), so a plain
// moment() already has it.
function formatIn(date: Date, format: string): string {
  return moment(date).format(format);
}

/** "9 October – 8 November 2026" -- the agenda's 30-day range, readable. */
export function agendaRangeLabel(date: Date): string {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 30);
  const sameYear = date.getFullYear() === end.getFullYear();
  const start = sameYear ? formatIn(date, 'D MMMM') : formatIn(date, 'D MMMM YYYY');
  return `${start} – ${formatIn(end, 'D MMMM YYYY')}`;
}

/** The centre label for a view, as a plain string (used by tests too). */
export function schedulerToolbarLabel(view: View, date: Date): string {
  if (view === 'week') {
    const weekStart = moment(date).startOf('week').toDate();
    return `Week ${getIsoWeekNumber(weekStart)}`;
  }
  if (view === 'day') return formatIn(date, 'dddd, D MMMM YYYY');
  if (view === 'month') return formatIn(date, 'MMMM YYYY');
  if (view === 'agenda') return agendaRangeLabel(date);
  return '';
}

export interface SchedulerToolbarProps {
  readonly date: Date;
  readonly view: View;
  readonly views: View[];
  readonly onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY' | Date) => void;
  readonly onView: (view: View) => void;
}

export function SchedulerToolbar({ date, view, views, onNavigate, onView }: SchedulerToolbarProps) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  const weekStart = moment(date).startOf('week').toDate();
  const weekNumber = getIsoWeekNumber(weekStart);
  const weekRange = formatWeekRangeLabel(weekStart);

  useEffect(() => {
    if (!rangeOpen) return;
    const dismiss = (event: Event) => {
      // A pointerdown inside the label (including the popover) must not close
      // it; the label's own click toggles.
      if (event.target instanceof Node && labelRef.current?.contains(event.target)) return;
      setRangeOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRangeOpen(false);
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [rangeOpen]);

  let centre: React.ReactNode = null;
  if (view === 'week') {
    centre = (
      <span className="scheduler-week-label-wrap" ref={labelRef}>
        <button
          type="button"
          data-scheduler-week-label="true"
          className="scheduler-week-label"
          title={`Week ${weekNumber}: ${weekRange}`}
          aria-expanded={rangeOpen}
          onClick={() => setRangeOpen((open) => !open)}
        >
          {`Week ${weekNumber}`}
        </button>
        {rangeOpen ? (
          <span
            data-scheduler-week-range-popover="true"
            className="scheduler-week-range-popover"
            role="dialog"
            aria-label={`Week ${weekNumber} date range`}
          >
            {weekRange}
          </span>
        ) : null}
      </span>
    );
  } else {
    centre = <span>{schedulerToolbarLabel(view, date)}</span>;
  }

  return (
    <div className="rbc-toolbar">
      <span className="rbc-btn-group">
        <button type="button" onClick={() => onNavigate('TODAY')}>Today</button>
        <button type="button" onClick={() => onNavigate('PREV')}>Back</button>
        <button type="button" onClick={() => onNavigate('NEXT')}>Next</button>
      </span>
      <span className="rbc-toolbar-label">{centre}</span>
      <span className="rbc-btn-group">
        {views.map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-scheduler-view={candidate}
            className={view === candidate ? 'rbc-active' : ''}
            onClick={() => onView(candidate)}
          >
            {VIEW_LABELS[candidate] ?? candidate}
          </button>
        ))}
      </span>
    </div>
  );
}

export default SchedulerToolbar;
