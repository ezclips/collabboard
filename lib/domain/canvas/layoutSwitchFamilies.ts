/**
 * PATCH-376/377. Which layout switches are offered, and what each one does.
 *
 * Switching a board's layout is not the same operation in both cases. Within one
 * FAMILY it only rewrites `boards.layout`. Across families it has to CONVERT the
 * posts: a Columns/Grid post belongs to a `board_sections` row
 * (`metadata.sectionId`), while a Wall/Timeline post is a child of a root
 * container (`metadata.childPadletIds` / `metadata.parentId`). PATCH-376 found
 * live that a bare `boards.layout` change across families left the board looking
 * empty -- data intact, nothing rendered -- so it disabled those tiles.
 * PATCH-377 converts instead (`public.convert_board_layout`).
 *
 * Families: `{columns, grid}` are the SECTIONS family, `{wall, timeline}` the
 * CONTAINERS family. `layoutSwitchCounts` counts what a conversion would move
 * the same way the SQL function counts it, so the confirm sentence a person
 * reads matches what the database does.
 */

export type LayoutFamily = 'sections' | 'containers';

/** The two families and their layouts. The ONE place this grouping is written. */
export const LAYOUT_FAMILIES: Readonly<Record<LayoutFamily, readonly string[]>> = {
  sections: ['columns', 'grid'],
  containers: ['wall', 'timeline'],
};

/** The family a layout's posts are organised by, or null for a layout with none. */
export function layoutFamily(layout: string | null | undefined): LayoutFamily | null {
  if (!layout) return null;
  if (LAYOUT_FAMILIES.sections.includes(layout)) return 'sections';
  if (LAYOUT_FAMILIES.containers.includes(layout)) return 'containers';
  return null;
}

/**
 * True when a switch between these two layouts is OFFERED -- i.e. both are among
 * the four. PATCH-376 answered "same family only"; PATCH-377 converts the posts
 * across families, so the cross-family pairs are offered too. WHETHER a switch
 * needs a conversion is `layoutSwitchPlan`'s answer, not this one's.
 */
export function canSwitchLayout(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  return layoutFamily(from) !== null && layoutFamily(to) !== null;
}

/** The minimum a post needs for the switch counts. A `Padlet` satisfies it. */
export interface LayoutSwitchPost {
  readonly id: string;
  readonly type?: string | null;
  readonly metadata?: unknown;
}

export interface LayoutSwitchCounts {
  /** The board's panels today: its sections, or its root cards. */
  readonly panels: number;
  /** How many posts the conversion moves with them. */
  readonly posts: number;
  /**
   * How many SOURCE panels carry comments of their own. Only a card can: the
   * conversion drops those, so the window says so -- and says nothing when there
   * are none.
   */
  readonly commentedPanels: number;
}

export interface LayoutSwitchPlan {
  readonly kind: 'same-family' | 'convert';
  /** The plain sentence for the confirm step. */
  readonly summary: string;
}

const meta = (post: LayoutSwitchPost): Record<string, unknown> => (
  post.metadata && typeof post.metadata === 'object' ? (post.metadata as Record<string, unknown>) : {}
);

const text = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null
);

const childIdsOf = (post: LayoutSwitchPost): string[] => {
  const ids = meta(post).childPadletIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
};

const hasComments = (post: LayoutSwitchPost): boolean => {
  const metadata = meta(post);
  const own = metadata.comments;
  const detached = metadata.detachedComments;
  return (Array.isArray(own) && own.length > 0) || (Array.isArray(detached) && detached.length > 0);
};

/**
 * What a conversion would move, counted as `public.convert_board_layout` counts
 * it:
 * - sections family: every section is a panel; a post with a `sectionId` and no
 *   parent moves (a post with no `sectionId` at all is left alone);
 * - containers family: every root card is a panel, and so is the "Unsorted" card
 *   when a loose root post would need one; the posts that move are the children
 *   NAMED IN a card's `childPadletIds` plus those loose root posts.
 */
export function layoutSwitchCounts(
  layout: string | null | undefined,
  posts: readonly LayoutSwitchPost[],
  sectionCount: number,
): LayoutSwitchCounts {
  const family = layoutFamily(layout);
  if (family === null) return { panels: 0, posts: 0, commentedPanels: 0 };

  if (family === 'sections') {
    const moving = posts.filter((post) => text(meta(post).sectionId) !== null && text(meta(post).parentId) === null);
    return { panels: Math.max(0, sectionCount), posts: moving.length, commentedPanels: 0 };
  }

  const cards = posts.filter((post) => post.type === 'container' && text(meta(post).parentId) === null);
  const named = new Set<string>();
  for (const card of cards) for (const id of childIdsOf(card)) named.add(id);

  const children = posts.filter((post) => named.has(post.id));
  const loose = posts.filter((post) => (
    post.type !== 'container' && text(meta(post).parentId) === null && text(meta(post).sectionId) === null
  ));

  return {
    panels: cards.length + (loose.length > 0 ? 1 : 0),
    posts: children.length + loose.length,
    commentedPanels: cards.filter(hasComments).length,
  };
}

const panelNoun = (family: LayoutFamily, count: number): string => {
  const base = family === 'sections' ? 'column' : 'card';
  return count === 1 ? base : `${base}s`;
};

/**
 * The confirm step's sentence, or null when a switch between these two is not
 * offered at all. Same family needs no explanation beyond "nothing moves".
 */
export function layoutSwitchPlan(
  from: string | null | undefined,
  to: string | null | undefined,
  counts: LayoutSwitchCounts,
): LayoutSwitchPlan | null {
  const fromFamily = layoutFamily(from);
  const toFamily = layoutFamily(to);
  if (fromFamily === null || toFamily === null) return null;

  if (fromFamily === toFamily) {
    return { kind: 'same-family', summary: 'Your posts stay where they are.' };
  }

  const panels = Math.max(0, Math.floor(counts.panels));
  const posts = Math.max(0, Math.floor(counts.posts));
  const becomes = panels === 1 ? 'becomes' : 'become';
  const postsClause = posts === 1 ? 'The 1 post moves with it.' : `All ${posts} posts move with them.`;

  return {
    kind: 'convert',
    summary: `Your ${panels} ${panelNoun(fromFamily, panels)} ${becomes} ${panels} ${panelNoun(toFamily, panels)}. ${postsClause}`,
  };
}

/** The one line beside a conversion when the source cards carry comments. */
export const CARD_COMMENTS_NOTE = 'Comments on the cards themselves are not carried over.';
