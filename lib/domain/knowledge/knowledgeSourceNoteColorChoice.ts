/**
 * Text Phase 1. The floating PDF-selection toolbar's compact color choices.
 *
 * A deliberate SUBSET of CardColorPanel.tsx's real TOP_STRIP_COLORS values
 * (the existing Note top-stripe authority), not a second palette: a color
 * chosen here seeds the same `metadata.topStrip` field a Note editor's own
 * TS tab writes, so it must render identically. `transparent` is omitted --
 * a source-clip color choice that means nothing simply offers no swatch.
 */
export const KNOWLEDGE_SOURCE_NOTE_TOP_STRIP_COLORS: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
];

/**
 * Auxiliary drag hint, never authoritative. The dedicated Knowledge MIME
 * payload's fields stay exactly as they are; this rides alongside it on a
 * SEPARATE dataTransfer type so a foreign or malformed drag can never forge a
 * color, and a missing or invalid value simply means "no color chosen".
 */
export const KNOWLEDGE_SOURCE_CLIP_COLOR_HINT = 'application/collabboard-knowledge-clip-color-hint';

export function isKnowledgeSourceNoteTopStripColor(value: string): boolean {
  return (KNOWLEDGE_SOURCE_NOTE_TOP_STRIP_COLORS as readonly string[]).includes(value);
}
