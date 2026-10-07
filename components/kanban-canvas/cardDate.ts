/**
 * PATCH-319. The one place that turns a stored kanban date into a `Date` and
 * into the value `<input type="date">` accepts. `kanban_cards.date_started/
 * date_due` are TIMESTAMPTZ, so loads return `2026-10-10T00:00:00+00:00` and
 * the calendar writes `toISOString()`; a date-only string must not be shifted
 * by timezone, and the input only accepts a local `YYYY-MM-DD`.
 */
export function parseCardDate(value?: string): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = value.match(dateOnly);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The LOCAL `YYYY-MM-DD` of `parseCardDate(value)`, or `''`. */
export function toDateInputValue(value?: string): string {
  const parsed = parseCardDate(value);
  if (!parsed) return '';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
