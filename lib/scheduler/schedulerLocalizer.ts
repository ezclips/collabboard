'use client';

import moment from 'moment';
import { momentLocalizer } from 'react-big-calendar';

// PATCH-331 (Addendum 1). Monday-first weeks for BOTH Schedulers, so a
// "Week 41" label names the same days as the Gantt (ISO, Monday–Sunday).
//
// react-big-calendar's moment localizer computes the week/month RANGES with
// `moment(date).startOf('week')` / `firstVisibleDay` from the GLOBAL moment
// locale; its `culture` prop only reaches `firstOfWeek`, so the setting must be
// applied to the shared `en` locale itself. `updateLocale` is idempotent (safe
// under HMR) and leaves `moment.locale()` as 'en'.
//
// `moment` is imported ONLY by the scheduler files (this module,
// SchedulerToolbar and StandaloneSchedulerCanvas) -- a source test pins that,
// because this changes the week start for every `moment` use in the app.
moment.updateLocale('en', { week: { dow: 1, doy: 4 } });

/** The one localizer both calendars use. */
export const schedulerLocalizer = momentLocalizer(moment);

interface TimeRange {
  readonly start: Date;
  readonly end: Date;
}

const hm = (date: Date) => moment(date).format('HH:mm');

/**
 * PATCH-332. 24-hour times for both calendars. The day headings stay as they
 * are ("05 Mon"); only clock times change.
 */
export const SCHEDULER_FORMATS = {
  timeGutterFormat: 'HH:mm',
  eventTimeRangeFormat: ({ start, end }: TimeRange) => `${hm(start)} – ${hm(end)}`,
  eventTimeRangeStartFormat: ({ start }: TimeRange) => `${hm(start)} –`,
  eventTimeRangeEndFormat: ({ end }: TimeRange) => `– ${hm(end)}`,
  selectRangeFormat: ({ start, end }: TimeRange) => `${hm(start)} – ${hm(end)}`,
  agendaTimeFormat: 'HH:mm',
  agendaTimeRangeFormat: ({ start, end }: TimeRange) => `${hm(start)} – ${hm(end)}`,
} as const;
