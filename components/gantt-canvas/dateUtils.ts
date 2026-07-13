export interface LocalDateParts {
  day: number;
  month: number;
  year: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getLocalDateParts(date: Date): LocalDateParts {
  return {
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
  };
}

export function getStartOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getDefaultNewTaskDateRange(now: Date = new Date()): { startDate: Date; endDate: Date } {
  const startDate = getStartOfLocalDay(now);
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1);
  return { startDate, endDate };
}

export function getIsoWeekNumber(date: Date): number {
  const target = getStartOfLocalDay(date);
  const dayIndex = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayIndex + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstThursdayDayIndex = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayIndex + 3);

  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function formatWeekHeaderLabel(date: Date): string {
  return `Week #${getIsoWeekNumber(date)}`;
}

export function formatWeekRangeLabel(date: Date): string {
  const startDate = getStartOfLocalDay(date);
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7);

  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const startMonth = MONTH_NAMES[startDate.getMonth()];
  const endMonth = MONTH_NAMES[endDate.getMonth()];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}-${endDay} ${startMonth} ${startYear}`;
  }

  if (startYear === endYear) {
    return `${startDay} ${startMonth}-${endDay} ${endMonth} ${startYear}`;
  }

  return `${startDay} ${startMonth} ${startYear}-${endDay} ${endMonth} ${endYear}`;
}

export function buildLocalDate(parts: LocalDateParts): Date {
  return new Date(parts.year, parts.month, parts.day);
}

export function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
