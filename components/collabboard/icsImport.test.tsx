// PATCH-326. The .ics parser.
import { describe, expect, it } from 'vitest';
import { IcsParseError, parseIcsEvents } from '@/lib/kanban/icsImport';

const NOW = new Date('2026-06-01T00:00:00Z');

const wrap = (body: string) => `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test//EN\n${body}\nEND:VCALENDAR`;

const event = (body: string) => wrap(`BEGIN:VEVENT\nUID:x@test\n${body}\nEND:VEVENT`);

const parse = (body: string) => parseIcsEvents(wrap(body), { now: NOW });

const FIXED_TZ = `BEGIN:VTIMEZONE
TZID:Custom/Plus2
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0200
TZOFFSETTO:+0200
END:STANDARD
END:VTIMEZONE`;

describe('PATCH-326 parseIcsEvents window', () => {
  it('rejects text that is not a VCALENDAR', () => {
    expect(() => parseIcsEvents('hello, not a calendar', { now: NOW })).toThrow(IcsParseError);
    expect(() => parseIcsEvents('', { now: NOW })).toThrow(IcsParseError);
    expect(() => parseIcsEvents('BEGIN:VCARD\nFN:A\nEND:VCARD', { now: NOW })).toThrow(IcsParseError);
  });
});

describe('PATCH-326 all-day events', () => {
  it('a one-day event has start = end (DTEND is exclusive)', () => {
    const { events } = parseIcsEvents(event('DTSTART;VALUE=DATE:20260610\nDTEND;VALUE=DATE:20260611\nSUMMARY:Holiday'), { now: NOW });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ allDay: true, startDate: '2026-06-10', endDate: '2026-06-10', title: 'Holiday' });
  });

  it('a three-day event ends the day before DTEND', () => {
    const { events } = parseIcsEvents(event('DTSTART;VALUE=DATE:20260610\nDTEND;VALUE=DATE:20260613\nSUMMARY:Trip'), { now: NOW });
    expect(events[0]).toMatchObject({ allDay: true, startDate: '2026-06-10', endDate: '2026-06-12' });
  });

  it('no DTEND means start = end, not a default day', () => {
    const { events } = parseIcsEvents(event('DTSTART;VALUE=DATE:20260610\nSUMMARY:Day'), { now: NOW });
    expect(events[0]).toMatchObject({ allDay: true, startDate: '2026-06-10', endDate: '2026-06-10' });
  });
});

describe('PATCH-326 timed events', () => {
  it('resolves a TZID against the file’s VTIMEZONE to a UTC instant', () => {
    const { events } = parseIcsEvents(
      wrap(`${FIXED_TZ}\nBEGIN:VEVENT\nUID:t\nSUMMARY:Zoned\nDTSTART;TZID=Custom/Plus2:20260610T140000\nDTEND;TZID=Custom/Plus2:20260610T150000\nEND:VEVENT`),
      { now: NOW },
    );
    expect(events[0]).toMatchObject({
      allDay: false,
      startIso: '2026-06-10T12:00:00.000Z',
      endIso: '2026-06-10T13:00:00.000Z',
    });
  });

  it('treats a floating time as UTC, deterministically', () => {
    const { events } = parseIcsEvents(event('SUMMARY:Floating\nDTSTART:20260610T140000\nDTEND:20260610T150000'), { now: NOW });
    expect(events[0]).toMatchObject({ startIso: '2026-06-10T14:00:00.000Z', endIso: '2026-06-10T15:00:00.000Z' });
  });

  it('with neither DTEND nor DURATION the end equals the start', () => {
    const { events } = parseIcsEvents(event('SUMMARY:Point\nDTSTART:20260610T140000Z'), { now: NOW });
    expect(events[0].startIso).toBe(events[0].endIso);
  });
});

describe('PATCH-326 recurrence', () => {
  it('expands a weekly event inside the window only', () => {
    const { events } = parseIcsEvents(
      event('SUMMARY:Standup\nDTSTART:20260401T090000Z\nDTEND:20260401T093000Z\nRRULE:FREQ=WEEKLY;COUNT=20'),
      { now: NOW },
    );
    // 2026-04-01 + 5 weeks = 2026-05-06, which is the first occurrence inside
    // the 30-day-back window; the five before it are outside.
    expect(events).toHaveLength(15);
    expect(events[0].startIso).toBe('2026-05-06T09:00:00.000Z');
    expect(events.every((entry) => (entry.startIso as string) >= '2026-05-02')).toBe(true);
  });

  it('respects EXDATE', () => {
    const { events } = parseIcsEvents(
      event('SUMMARY:Weekly\nDTSTART:20260601T090000Z\nDTEND:20260601T100000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nEXDATE:20260608T090000Z'),
      { now: NOW },
    );
    expect(events.map((entry) => entry.startIso)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-15T09:00:00.000Z',
    ]);
  });

  it('a RECURRENCE-ID override replaces its occurrence', () => {
    const { events } = parseIcsEvents(
      wrap(`BEGIN:VEVENT
UID:r
SUMMARY:Weekly
DTSTART:20260601T090000Z
DTEND:20260601T100000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:r
RECURRENCE-ID:20260608T090000Z
SUMMARY:Override
DTSTART:20260608T120000Z
DTEND:20260608T130000Z
END:VEVENT`),
      { now: NOW },
    );
    expect(events).toHaveLength(3);
    expect(events[1]).toMatchObject({ title: 'Override', startIso: '2026-06-08T12:00:00.000Z' });
    expect(events[0].title).toBe('Weekly');
    expect(events[2].title).toBe('Weekly');
  });

  it('skips a cancelled event', () => {
    const { events } = parseIcsEvents(event('SUMMARY:Cancelled\nSTATUS:CANCELLED\nDTSTART:20260610T090000Z\nDTEND:20260610T100000Z'), { now: NOW });
    expect(events).toHaveLength(0);
  });
});

describe('PATCH-326 shaping', () => {
  it('names an untitled event', () => {
    const { events } = parseIcsEvents(event('DTSTART;VALUE=DATE:20260610'), { now: NOW });
    expect(events[0].title).toBe('Untitled event');
  });

  it('truncates to 500 and says so', () => {
    const body = Array.from({ length: 600 }, (_, index) =>
      `BEGIN:VEVENT\nUID:n${index}\nSUMMARY:Event ${index}\nDTSTART;VALUE=DATE:20260610\nEND:VEVENT`,
    ).join('\n');
    const result = parseIcsEvents(wrap(body), { now: NOW });
    expect(result.events).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it('never emits the UID, organizer or attendees', () => {
    const { events } = parseIcsEvents(
      wrap(`BEGIN:VEVENT
UID:secret-uid-123
ORGANIZER:mailto:organizer@example.com
ATTENDEE:mailto:guest@example.com
SUMMARY:Meeting
DTSTART:20260610T090000Z
DTEND:20260610T100000Z
END:VEVENT`),
      { now: NOW },
    );
    const serialized = JSON.stringify(events);
    for (const secret of ['secret-uid-123', 'organizer@example.com', 'guest@example.com', 'ATTENDEE', 'ORGANIZER']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('keeps up to 200 title chars and 4000 description chars', () => {
    const longTitle = 'T'.repeat(300);
    const longDescription = 'D'.repeat(5000);
    const { events } = parseIcsEvents(
      event(`SUMMARY:${longTitle}\nDESCRIPTION:${longDescription}\nDTSTART;VALUE=DATE:20260610`),
      { now: NOW },
    );
    expect(events[0].title).toHaveLength(200);
    expect(events[0].description).toHaveLength(4000);
  });
});
