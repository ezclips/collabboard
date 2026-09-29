// PATCH-212. ONE place that makes a post's geometry whole.
//
// The four geometry columns (`position_x`, `position_y`, `width`, `height`) are
// integer columns. Any position or size computed at a zoom other than 100% comes
// out fractional -- `screenX / 0.8` is `-2995.9999999999995`, not `-2996` -- and
// Postgres refuses the write (22P02). A refused write is not a cosmetic problem:
// the caller has usually already moved the post on screen, so it raises an error
// and rolls back a change the person just made.
//
// PATCH-209 fixed the Section Heading resize, one path at a time, and its audit
// found more (paste, add-at-centre, comment pins, `savePadletPosition`, the
// Drawing canvas). Fixing them one by one leaves the NEXT new path exposed, so
// the rounding lives here and is applied where every write passes: the repository
// (so no repository caller can miss it) and the few sites that still write to
// `padlets` directly.

/** The four columns that are integers in the schema, in one list. */
const GEOMETRY_KEYS = ['position_x', 'position_y', 'width', 'height'] as const;

/**
 * Return a COPY of `fields` with the four geometry columns rounded to whole
 * numbers, and everything else untouched.
 *
 * ONLY a present, FINITE number is rounded:
 *   - `null` / `undefined` are left out-and-out;
 *   - a string (a legacy row shape, a JSONB blob) is left as it is, because it
 *     was not arithmetic and rounding it is not this function's job;
 *   - `NaN` / `Infinity` are left untouched TOO, deliberately: they are already
 *     invalid and must fail loudly at the database, exactly as they do today.
 *     Silently turning `NaN` into an integer would hide a real bug behind a
 *     plausible-looking position.
 *
 * The input is never mutated -- callers keep using their own object after this,
 * and an in-place round would change screen geometry they did not ask to change.
 */
export function roundPostGeometry<T extends object>(fields: T): T {
  const next: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
  for (const key of GEOMETRY_KEYS) {
    const value = next[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = Math.round(value);
    }
  }
  return next as T;
}
