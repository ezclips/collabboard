// PATCH-328. One imported event → the card fields, in a named time zone.
//
// Extracted from the calendar-import modal so the SAME mapping runs in the
// browser (the user's zone) and on the server (the zone the browser sent). It
// is pure: no clock, no globals, no board.

import type { ImportedEvent } from './icsImport';

export interface CalendarCardFields {
  readonly label: string;
  /** Omitted when the event has neither a time line, a location nor a body. */
  readonly description?: string;
  /** `YYYY-MM-DD` in the given zone, inclusive. */
  readonly startDate: string;
  readonly endDate: string;
}

function dateInZone(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function timeInZone(date: Date, timeZone: string): string {
  // h23 keeps midnight as 00:00 rather than 24:00.
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * The card a calendar event becomes.
 *
 * All-day events keep their inclusive dates. A timed event becomes the LOCAL
 * days of its start and of `end - 1 ms` (so an event ending at midnight does
 * not spill into the next day), with an `HH:MM–HH:MM` first line in the given
 * zone, then a `Location:` line, then the body -- each omitted part dropped.
 */
export function eventToCardFields(event: ImportedEvent, timeZone: string): CalendarCardFields {
  const parts: string[] = [];
  let startDate: string;
  let endDate: string;

  if (event.allDay) {
    startDate = event.startDate ?? '';
    endDate = event.endDate ?? startDate;
  } else {
    const start = new Date(event.startIso as string);
    const end = new Date(event.endIso as string);
    const endForDay = new Date(Math.max(start.getTime(), end.getTime() - 1));
    startDate = dateInZone(start, timeZone);
    endDate = dateInZone(endForDay, timeZone);
    if (endDate < startDate) endDate = startDate;
    parts.push(`${timeInZone(start, timeZone)}\u2013${timeInZone(end, timeZone)}`);
  }

  if (event.location) parts.push(`Location: ${event.location}`);
  if (event.description) parts.push(event.description);

  return {
    label: event.title,
    ...(parts.length > 0 ? { description: parts.join('\n\n') } : {}),
    startDate,
    endDate,
  };
}
