export interface LocalDateParts {
  day: number;
  month: number;
  year: number;
}

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
