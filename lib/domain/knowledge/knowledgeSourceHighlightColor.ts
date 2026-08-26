import type { KnowledgeSourceHighlightSpan } from './knowledgeSourceHighlights';

/**
 * P6J-F8-B3 -- what colour one source highlight may show.
 *
 * Read-time derivation with ONE authority: the citing Note's own
 * `metadata.cardColor`. Source highlights have no persisted colour of their own
 * and gain none here -- nothing in this module stores, defaults, generates or
 * normalises anything back into a Note. Null is the ordinary answer, and it
 * means "keep the existing neutral highlight", never "invent a colour".
 *
 * A run of page text can be covered by citations from SEVERAL Notes. One
 * background cannot honestly represent two different Notes, so disagreement --
 * including a coloured Note overlapping an uncoloured one -- fails closed.
 */

/** Padlet id -> its stored `metadata.cardColor`, exactly as persisted. */
export type KnowledgeSourceNoteColors = ReadonlyMap<string, string>;

export interface KnowledgeSourceHighlightColor {
  /** The Note's stored spelling, not a normalised one. */
  readonly backgroundColor: string;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `rrggbbaa`, lower case, or null when the value is not one of the three
 * accepted hex spellings. Comparison form only -- never persisted, never
 * rendered. Deliberately strict: no trimming, no repair, no named colours, so
 * `red`, `url(x)` and a stray `#12345` are all simply not colours.
 */
function canonicalHex(value: string): string | null {
  if (!HEX_COLOR.test(value)) return null;
  const digits = value.slice(1).toLowerCase();
  if (digits.length === 3) {
    const [r, g, b] = digits;
    return `${r}${r}${g}${g}${b}${b}ff`;
  }
  return digits.length === 6 ? `${digits}ff` : digits;
}

/**
 * The Note's colour when it can actually tint a highlight.
 *
 * White is the card default, and a white highlight is an invisible one, so
 * every spelling of white -- `#fff`, `#FFFFFF`, `#ffffffff` -- yields null
 * rather than erasing the highlight the user came to see. Alpha does not
 * rescue it: a transparent white tints nothing either.
 */
function usableNoteColor(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const canonical = canonicalHex(value);
  if (canonical === null) return null;
  if (canonical.slice(0, 6) === 'ffffff') return null;
  return value;
}

/**
 * The one colour every citation covering a run agrees on, or null.
 *
 * Two citations from the SAME Note are one opinion, not two: a Note with
 * several references still has exactly one card colour, so B2's
 * one-reference excerpt rule deliberately does not apply here.
 */
export function knowledgeSourceHighlightColor(
  spans: readonly KnowledgeSourceHighlightSpan[],
  noteColors: KnowledgeSourceNoteColors,
): KnowledgeSourceHighlightColor | null {
  let agreed: string | null = null;
  let agreedCanonical: string | null = null;
  const seen = new Set<string>();

  for (const span of spans) {
    if (seen.has(span.targetPadletId)) continue;
    seen.add(span.targetPadletId);

    const color = usableNoteColor(noteColors.get(span.targetPadletId));
    // One uncoloured citing Note is enough to make a tint a lie about the rest.
    if (color === null) return null;

    const canonical = canonicalHex(color);
    if (agreedCanonical === null) {
      agreed = color;
      agreedCanonical = canonical;
      continue;
    }
    // Same colour spelled differently still agrees; different colours never do.
    if (canonical !== agreedCanonical) return null;
  }

  return agreed === null ? null : { backgroundColor: agreed };
}
