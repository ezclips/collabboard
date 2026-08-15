import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H1 -- the canonical Section Heading contract.
 *
 * A Section Heading is a lightweight horizontal board-structure object that
 * visually divides regions of a Freeform canvas. It is NOT a Note, NOT a
 * Container, and confers NO membership: posts sitting "under" a heading stay
 * completely independent objects.
 *
 * Everything type-specific about Section Headings lives here rather than as
 * scattered `type === 'section_heading'` string checks, so the exclusions
 * below (Container child, Graph endpoint) have exactly one definition each.
 */

/** The canonical post-type discriminator, matching types/collabboard.ts. */
export const SECTION_HEADING_TYPE = 'section_heading' as const;

/**
 * Default geometry, in WORLD units. Deliberately wide and short: a heading
 * is a horizontal rule with a label, never a card-shaped block.
 */
export const SECTION_HEADING_DEFAULT_WIDTH = 500;
export const SECTION_HEADING_DEFAULT_HEIGHT = 64;

export const SECTION_HEADING_DEFAULT_TEXT = 'Section heading';

/** Semantic heading levels. SECTION-H2 exposes the picker; H1 persists the default. */
export type SectionHeadingLevel = 1 | 2 | 3 | 4;
export const SECTION_HEADING_DEFAULT_LEVEL: SectionHeadingLevel = 2;

/** Width of the left accent stripe, in world px (Phase 10: left, never top). */
export const SECTION_HEADING_ACCENT_WIDTH_PX = 4;

export function isSectionHeading(post: Pick<Padlet, 'type'> | null | undefined): boolean {
  return !!post && (post.type as string) === SECTION_HEADING_TYPE;
}

/**
 * The persisted semantic level, defaulted and clamped. Reading through this
 * helper (rather than the raw metadata field) is what keeps the renderer
 * level-aware from day one -- SECTION-H2 only has to add the control, not
 * retrofit the plumbing.
 */
export function getSectionHeadingLevel(post: Pick<Padlet, 'metadata'> | null | undefined): SectionHeadingLevel {
  const raw = Number((post?.metadata as { headingLevel?: unknown } | undefined)?.headingLevel);
  return raw === 1 || raw === 2 || raw === 3 || raw === 4 ? raw : SECTION_HEADING_DEFAULT_LEVEL;
}

/** The heading's display text. Title is the canonical store; content stays empty. */
export function getSectionHeadingText(post: Pick<Padlet, 'title'> | null | undefined): string {
  return typeof post?.title === 'string' ? post.title : '';
}

/**
 * PATCH SECTION-H1 Phase 19: Section Headings organize board SPACE, not card
 * membership, so they are never eligible to become a Container child --
 * neither by drag-over nor by "Group into Column". Every other post type
 * keeps its existing eligibility untouched.
 */
export function canBeContainerChild(post: Pick<Padlet, 'type'> | null | undefined): boolean {
  return !isSectionHeading(post);
}

/**
 * PATCH SECTION-H1 Phase 21: a Section Heading is canvas organization rather
 * than semantic post content, so it is not a Graph Line endpoint and shows no
 * connection handles. Graph behavior for every existing post type is unchanged.
 */
export function canBeGraphEndpoint(post: Pick<Padlet, 'type'> | null | undefined): boolean {
  return !isSectionHeading(post);
}

/**
 * Collapses arbitrary pasted/typed input to a single-line plain heading
 * string (Phase 12). Strips tags and control characters, folds all whitespace
 * -- including newlines a paste can smuggle in -- to single spaces, and caps
 * the length so one paste cannot produce an unbounded title write.
 */
export const SECTION_HEADING_MAX_LENGTH = 200;

export function sanitizeSectionHeadingText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SECTION_HEADING_MAX_LENGTH);
}
