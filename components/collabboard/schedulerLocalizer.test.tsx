// PATCH-331 Addendum 1. Monday-first weeks come from the GLOBAL `en` locale,
// because react-big-calendar's moment localizer reads week/month ranges from it.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import moment from 'moment';
import { schedulerLocalizer, SCHEDULER_FORMATS } from '@/lib/scheduler/schedulerLocalizer';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

describe('PATCH-331 Addendum 1 schedulerLocalizer', () => {
  it('leaves moment.locale() as en', () => {
    expect(moment.locale()).toBe('en');
    expect(typeof schedulerLocalizer.format).toBe('function');
  });

  it('the week of 9 Oct 2026 spans Mon 5 – Sun 11', () => {
    const date = moment('2026-10-09');
    expect(date.clone().startOf('week').format('ddd D MMM YYYY')).toBe('Mon 5 Oct 2026');
    expect(date.clone().endOf('week').format('ddd D MMM YYYY')).toBe('Sun 11 Oct 2026');
  });

  it('the month view of October 2026 starts on Mon 28 Sep', () => {
    expect(moment('2026-10-01').startOf('month').startOf('week').format('ddd D MMM YYYY'))
      .toBe('Mon 28 Sep 2026');
  });

  it('formats clock times as 24-hour HH:mm', () => {
    expect(moment('2026-10-09T06:00').format(SCHEDULER_FORMATS.timeGutterFormat)).toBe('06:00');
    expect(moment('2026-10-09T18:30').format(SCHEDULER_FORMATS.agendaTimeFormat)).toBe('18:30');
  });

  it('formats an event time range as "06:00 – 18:30"', () => {
    const start = new Date(2026, 9, 9, 6, 0);
    const end = new Date(2026, 9, 9, 18, 30);
    expect(SCHEDULER_FORMATS.eventTimeRangeFormat({ start, end })).toBe('06:00 – 18:30');
    expect(SCHEDULER_FORMATS.eventTimeRangeStartFormat({ start, end })).toBe('06:00 –');
    expect(SCHEDULER_FORMATS.eventTimeRangeEndFormat({ start, end })).toBe('– 18:30');
    expect(SCHEDULER_FORMATS.selectRangeFormat({ start, end })).toBe('06:00 – 18:30');
    expect(SCHEDULER_FORMATS.agendaTimeRangeFormat({ start, end })).toBe('06:00 – 18:30');
  });

  it('moment is imported ONLY by the scheduler files', () => {
    const root = process.cwd();
    const importers = ['app', 'components', 'lib', 'workers', 'scripts']
      .flatMap((dir) => walk(path.join(root, dir)))
      .filter((file) => /from 'moment'|require\(['"]moment['"]\)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file).replace(/\\/g, '/'))
      .sort();

    expect(
      importers,
      'moment is imported only by the scheduler files: lib/scheduler/schedulerLocalizer sets the '
      + 'GLOBAL Monday-first week, so a new importer anywhere would silently change week starts.',
    ).toEqual([
      'components/scheduler-canvas/SchedulerToolbar.tsx',
      'lib/scheduler/schedulerLocalizer.ts',
    ]);
    // The synchronous source walk reads every file; give it room under load.
  }, 30_000);
});
