/**
 * PATCH-381. The ONE rule every placement prompt asks: with the containers that
 * exist on this board, which of "New Container" / "Add to Existing" can the
 * person pick right now?
 *
 * A prompt used to offer both unconditionally, so on an empty board "Add to
 * Existing" led to the "Click a container to place your post" step with nothing
 * to click. This helper makes that a visible, disabled option with a hint
 * instead of a dead end.
 *
 * Scope: `containerCount` is the containers on the whole board (the four Padlet
 * layouts' prompts are board-scoped; "New Container" targets the active/first
 * section today, an accepted limitation -- see PATCH-381).
 */

export type NewContainerState = 'enabled' | 'hidden';
export type AddToExistingState = 'enabled' | 'disabled';

export interface PlacementOptionsInput {
  /** Containers on the board today. A non-positive / non-finite count is empty. */
  containerCount: number;
  /** False for a guest at a prompt that still writes `board_sections`. */
  canCreateContainer: boolean;
}

export interface PlacementOptions {
  newContainer: NewContainerState;
  addToExisting: AddToExistingState;
  /** Present only when `addToExisting` is disabled. */
  hint?: string;
}

export const ADD_TO_EXISTING_EMPTY_HINT =
  'You need at least one container on the canvas first.';

export function placementOptions({
  containerCount,
  canCreateContainer,
}: PlacementOptionsInput): PlacementOptions {
  const hasContainer = Number.isFinite(containerCount) && containerCount > 0;
  return {
    newContainer: canCreateContainer ? 'enabled' : 'hidden',
    addToExisting: hasContainer ? 'enabled' : 'disabled',
    ...(hasContainer ? {} : { hint: ADD_TO_EXISTING_EMPTY_HINT }),
  };
}

/**
 * PATCH-381. A placement draft with no title, no text and no media is EMPTY:
 * on the four Padlet layouts such a post is discarded silently rather than
 * carrying an empty card into a container. Conservative on purpose -- anything
 * with text, a title or a file is kept, so a real edit is never lost (P3).
 */
export interface PlacementDraftLike {
  content?: unknown;
  title?: unknown;
  file_url?: unknown;
}

export function isPlacementDraftEmpty(draft: PlacementDraftLike): boolean {
  const content = typeof draft.content === 'string' ? draft.content : '';
  const text = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const hasTitle = typeof draft.title === 'string' && draft.title.trim() !== '';
  const hasFile = typeof draft.file_url === 'string' && draft.file_url.trim() !== '';
  return text === '' && !hasTitle && !hasFile;
}

/** The minimum a post needs to be counted as a container. A `Padlet` satisfies it. */
export interface ContainerLikePost {
  type?: string | null;
  metadata?: unknown;
}

/**
 * PATCH-381. Root containers on the board -- the count `placementOptions`
 * judges "Add to Existing" on. Recognises the same three data shapes as the
 * engine's `isContainerPadlet` (type / metadata.kind / metadata.isContainer)
 * and excludes nested containers (a `parentId`), which are not valid targets.
 *
 * Written here (not imported from the components tree) so it can be unit
 * tested, and so a Timeline board's auto-created blank first entry (a root
 * `container` post with `position_in_timeline`) is counted like any other.
 */
export function countRootContainers(posts: readonly ContainerLikePost[]): number {
  return posts.filter((p) => {
    const meta = (p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) as Record<string, unknown>;
    const isContainer = p.type === 'container' || meta.kind === 'container' || meta.isContainer === true;
    return isContainer && !meta.parentId;
  }).length;
}


