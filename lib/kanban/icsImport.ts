import crypto from 'node:crypto';
import ICAL from 'ical.js';

// PATCH-326. Parse an .ics calendar into the events a Kanban board can hold.
//
// Pure and server-side: it reads text and returns plain data, touching no
// network, storage or board. `ical.js` does the hard parts (RRULE/RDATE/EXDATE,
// VTIMEZONE, all-day dates); this module only decides WHAT to keep and HOW to
// shape it.
//
// WHAT NEVER LEAVES HERE. The UID, ORGANIZER and ATTENDEE properties -- and any
// email inside them -- are read by ical.js and deliberately never copied into
// the output. A calendar link is a secret and an import should not become a way
// to leak its participants.

export class IcsParseError extends Error {
  readonly code = 'not_a_calendar';
  constructor(message = 'This file is not a calendar (.ics)') {
    super(message);
    this.name = 'IcsParseError';
  }
}

export interface ImportedEvent {
  readonly title: string;
  readonly description: string;
  readonly location?: string;
  readonly allDay: boolean;
  /** All-day only: `YYYY-MM-DD`, inclusive. */
  readonly startDate?: string;
  readonly endDate?: string;
  /** Timed only: UTC ISO instants. */
  readonly startIso?: string;
  readonly endIso?: string;
  /**
   * PATCH-328, only when `includeSourceKey` is set: the stable identity of this
   * occurrence -- SHA-256 hex of `<UID>|<occurrence start>` -- used to match a
   * card back to its event across syncs. The UID itself never leaves here.
   */
  readonly sourceKey?: string;
}

/** The window kept around `now`: 30 days back, 365 days forward. */
const WINDOW_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const WINDOW_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

/** The most events returned; more than this sets `truncated`. */
export const ICS_MAX_EVENTS = 500;

/** Hard stop on recurrence expansion, so a pathological RRULE cannot spin. */
const ITERATOR_MAX_STEPS = 1000;

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;
const LOCATION_MAX = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Candidate {
  readonly startMs: number;
  readonly endMs: number;
  readonly event: ImportedEvent;
}

/** Registers the file's own VTIMEZONEs so TZID times resolve correctly. */
function registerTimezones(root: ICAL.Component): void {
  for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone));
    } catch {
      // A malformed VTIMEZONE must not fail the whole import; its times then
      // fall back to the event's start/end as written.
    }
  }
}

/**
 * A UTC instant for a timed value.
 *
 * FLOATING TIME IS TREATED AS UTC. ical.js's `toJSDate()` interprets a floating
 * time in the MACHINE's zone, which would make the same file import differently
 * on different servers; reading its fields as UTC is deterministic. Zoned and
 * UTC times already resolve through their own zone.
 */
function instantOf(time: ICAL.Time): Date {
  if (time.zone === ICAL.Timezone.localTimezone) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second));
  }
  return time.toJSDate();
}

function dateOnly(time: ICAL.Time): string {
  const month = String(time.month).padStart(2, '0');
  const day = String(time.day).padStart(2, '0');
  return `${time.year}-${month}-${day}`;
}

function dateOnlyMs(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** The day before a `YYYY-MM-DD` date -- used for the exclusive DTEND. */
function previousDay(value: string): string {
  const dt = new Date(dateOnlyMs(value) - DAY_MS);
  return dt.toISOString().slice(0, 10);
}

function titleOf(item: ICAL.Event): string {
  const summary = String(item.summary ?? '').trim();
  if (summary.length === 0) return 'Untitled event';
  return summary.length > TITLE_MAX ? summary.slice(0, TITLE_MAX) : summary;
}

function descriptionOf(item: ICAL.Event): string {
  const description = String(item.description ?? '');
  return description.length > DESCRIPTION_MAX ? description.slice(0, DESCRIPTION_MAX) : description;
}

function locationOf(item: ICAL.Event): string | undefined {
  const location = String(item.location ?? '').trim();
  if (location.length === 0) return undefined;
  return location.length > LOCATION_MAX ? location.slice(0, LOCATION_MAX) : location;
}

function isCancelled(component: ICAL.Component): boolean {
  const status = component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

/**
 * One occurrence (`item` may be a RECURRENCE-ID override) as a candidate.
 *
 * `hasDtend` is read from the OCCURRENCE's own component: an all-day event
 * without DTEND ends the same day, even though ical.js reports a default
 * one-day duration for it.
 */
/**
 * How an event's identity is built.
 *
 * - `single`: a one-off event. The key is the UID ALONE, so moving the event
 *   (changing DTSTART) keeps the card instead of deleting and re-creating it.
 * - `occurrence`: one occurrence of a series, or a RECURRENCE-ID override. The
 *   key adds the ORIGINAL occurrence slot (the RECURRENCE-ID), so each
 *   occurrence is distinct and moving an override keeps its card.
 */
type SourceKeyMode = 'single' | 'occurrence';

/**
 * The identity of one event: SHA-256 hex.
 *
 * Only the hash is produced -- the UID is never returned or stored.
 */
function sourceKeyOf(item: ICAL.Event, keyStart: ICAL.Time, mode: SourceKeyMode): string {
  if (mode === 'single') {
    return crypto.createHash('sha256').update(item.uid).digest('hex');
  }
  const occurrenceStart = keyStart.isDate === true
    ? dateOnly(keyStart)
    : instantOf(keyStart).toISOString();
  return crypto.createHash('sha256').update(`${item.uid}|${occurrenceStart}`).digest('hex');
}

function candidateFor(
  item: ICAL.Event,
  startTime: ICAL.Time,
  endTime: ICAL.Time,
  keyStart: ICAL.Time,
  includeSourceKey: boolean,
  keyMode: SourceKeyMode,
): Candidate {
  const component = item.component;
  const allDay = startTime.isDate === true;
  const sourceKey = includeSourceKey ? sourceKeyOf(item, keyStart, keyMode) : undefined;
  const keyFields = sourceKey === undefined ? {} : { sourceKey };

  if (allDay) {
    const startDate = dateOnly(startTime);
    let endDate = startDate;
    if (component.hasProperty('dtend')) {
      endDate = previousDay(dateOnly(endTime));
      if (endDate < startDate) endDate = startDate;
    }
    return {
      startMs: dateOnlyMs(startDate),
      // Inclusive days become an exclusive instant for the overlap test.
      endMs: dateOnlyMs(endDate) + DAY_MS,
      event: {
        title: titleOf(item),
        description: descriptionOf(item),
        location: locationOf(item),
        allDay: true,
        startDate,
        endDate,
        ...keyFields,
      },
    };
  }

  const startMs = instantOf(startTime).getTime();
  let endMs = instantOf(endTime).getTime();
  if (endMs < startMs) endMs = startMs;
  return {
    startMs,
    endMs,
    event: {
      title: titleOf(item),
      description: descriptionOf(item),
      location: locationOf(item),
      allDay: false,
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
      ...keyFields,
    },
  };
}

function inWindow(candidate: Candidate, windowStart: number, windowEnd: number): boolean {
  return candidate.startMs <= windowEnd && candidate.endMs >= windowStart;
}

interface EventGroup {
  master: ICAL.Component | null;
  overrides: ICAL.Component[];
}

function groupVevents(root: ICAL.Component): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  root.getAllSubcomponents('vevent').forEach((vevent, index) => {
    const uid = vevent.getFirstPropertyValue('uid');
    const key = typeof uid === 'string' && uid.length > 0 ? uid : `__no_uid_${index}`;
    const group = groups.get(key) ?? { master: null, overrides: [] };
    if (vevent.hasProperty('recurrence-id')) {
      group.overrides.push(vevent);
    } else if (group.master === null) {
      group.master = vevent;
    } else {
      group.overrides.push(vevent);
    }
    groups.set(key, group);
  });
  return [...groups.values()];
}

function collectGroup(
  group: EventGroup,
  out: Candidate[],
  windowStart: number,
  windowEnd: number,
  includeSourceKey: boolean,
): void {
  if (group.master === null) {
    // No master: each override is a standalone occurrence. Its key uses the
    // RECURRENCE-ID slot, so moving it keeps its card.
    for (const override of group.overrides) {
      const event = new ICAL.Event(override);
      const keyStart = event.recurrenceId ?? event.startDate;
      const candidate = candidateFor(event, event.startDate, event.endDate, keyStart, includeSourceKey, 'occurrence');
      if (inWindow(candidate, windowStart, windowEnd)) out.push(candidate);
    }
    return;
  }

  const master = new ICAL.Event(group.master);
  for (const override of group.overrides) {
    try {
      master.relateException(override);
    } catch {
      // Not related by UID under strict rules; ignored rather than fatal.
    }
  }

  if (!master.isRecurring()) {
    if (isCancelled(master.component)) return;
    // A ONE-OFF event: keyed by UID alone, so moving its date keeps the card.
    const candidate = candidateFor(master, master.startDate, master.endDate, master.startDate, includeSourceKey, 'single');
    if (inWindow(candidate, windowStart, windowEnd)) out.push(candidate);
    return;
  }

  let steps = 0;
  const iterator = master.iterator();
  for (;;) {
    if (steps >= ITERATOR_MAX_STEPS) break;
    let occurrence: ICAL.Time | null = null;
    try {
      occurrence = iterator.next();
    } catch {
      break;
    }
    if (!occurrence) break;
    steps += 1;

    const details = master.getOccurrenceDetails(occurrence);
    const item = details.item;
    if (isCancelled(item.component)) continue;
    // The key uses the recurrence slot, so each occurrence is distinct and
    // moving an override keeps its key.
    const candidate = candidateFor(item, details.startDate, details.endDate, details.recurrenceId, includeSourceKey, 'occurrence');
    if (inWindow(candidate, windowStart, windowEnd)) out.push(candidate);
    // The iterator is ordered, so once we are past the window there is nothing
    // later to keep.
    if (candidate.startMs > windowEnd) break;
  }
}

/**
 * Reads an .ics file into events that overlap `[now - 30 days, now + 365 days]`,
 * sorted by start and capped at {@link ICS_MAX_EVENTS}.
 *
 * Throws {@link IcsParseError} when the text is not a VCALENDAR.
 */
export function parseIcsEvents(
  text: string,
  options: { now?: Date; includeSourceKey?: boolean } = {},
): { events: ImportedEvent[]; truncated: boolean } {
  let root: ICAL.Component;
  try {
    const jcal = ICAL.parse(text);
    if (!Array.isArray(jcal) || String(jcal[0]).toLowerCase() !== 'vcalendar') {
      throw new Error('not a vcalendar');
    }
    root = new ICAL.Component(jcal);
  } catch {
    throw new IcsParseError();
  }

  registerTimezones(root);

  const now = options.now ?? new Date();
  const windowStart = now.getTime() - WINDOW_PAST_MS;
  const windowEnd = now.getTime() + WINDOW_FUTURE_MS;

  const includeSourceKey = options.includeSourceKey === true;
  const collected: Candidate[] = [];
  for (const group of groupVevents(root)) {
    collectGroup(group, collected, windowStart, windowEnd, includeSourceKey);
  }

  collected.sort((a, b) => a.startMs - b.startMs);
  const truncated = collected.length > ICS_MAX_EVENTS;
  return {
    events: collected.slice(0, ICS_MAX_EVENTS).map((candidate) => candidate.event),
    truncated,
  };
}
