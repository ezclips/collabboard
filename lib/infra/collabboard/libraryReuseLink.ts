/**
 * IMAGE_LIBRARY_NONFREEFORM_LINK_1_C1 -- the durable Library link, shared by the
 * Drawing reuse writers so they cannot drift apart.
 *
 * Placing an existing Library item is REUSE: the placement REFERENCES the same
 * library_items row. Nothing here mints a Library object, calls the atomic
 * NEW-image RPC, or copies an asset. Structural parameter types keep this free
 * of the Supabase-backed library module, so any writer can call it.
 */

/**
 * The durable Library id a reuse drop carries, or null. Two payload shapes
 * reach the same drop and name the SAME relationship: a direct Library drag
 * carries the transport name `libraryItemId`, while a Drawing "Add to Existing"
 * ghost was spread from a staged placement draft and already carries the column
 * name. The transport name wins if both appear; a payload with neither -- a
 * legacy drag, or a ghost never Library-backed -- resolves to null.
 */
export function resolveReusedLibraryItemId(
  source: Record<string, unknown> | null | undefined,
): string | null {
  if (!source) return null;
  const transport = source.libraryItemId;
  if (typeof transport === 'string' && transport) return transport;
  const persisted = source.library_item_id;
  if (typeof persisted === 'string' && persisted) return persisted;
  return null;
}

/** The Library item a click-to-place hands the placement writer. */
export interface ClickedLibraryItem {
  readonly id: string;
  readonly title?: string;
  readonly type?: string;
  readonly content?: {
    readonly title?: string;
    readonly content?: unknown;
    readonly type?: string;
    readonly file_url?: string;
    readonly width?: number;
    readonly height?: number;
    readonly metadata?: Record<string, unknown>;
  } | null;
}

/**
 * The placement draft produced by clicking an existing Library item in the
 * Drawing panel -- the click twin of the drag drop, reaching the same
 * onAddPadlet boundary.
 *
 * Clicking and dragging one image are a single product gesture, so both must
 * reference the same durable object; the click has the item itself in hand, so
 * the id is read straight off it. Stale placement keys are stripped from the
 * snapshot metadata so the container prompt still runs, as the drag path does.
 */
export function buildLibraryClickPlacementDraft(
  item: ClickedLibraryItem,
  placement: { readonly boardId: string; readonly positionX: number; readonly positionY: number },
): Record<string, unknown> {
  const snapshot = item.content ?? {};
  const { parentId: _p, childPadletIds: _c, ...cleanMetadata } =
    (snapshot.metadata ?? {}) as Record<string, unknown>;

  return {
    board_id: placement.boardId,
    type: snapshot.type || item.type || 'note',
    title: snapshot.title || item.title || 'Library Item',
    content: typeof snapshot.content === 'string'
      ? snapshot.content
      : (snapshot.content != null ? JSON.stringify(snapshot.content) : ''),
    file_url: snapshot.file_url || (snapshot.metadata?.imageUrl as string | undefined) || undefined,
    position_x: placement.positionX,
    position_y: placement.positionY,
    width: snapshot.width || 320,
    height: snapshot.height || 280,
    metadata: { ...cleanMetadata, forceContainerPrompt: true },
    // Reuse, not creation: the click has the durable Library object in hand.
    library_item_id: item.id,
  };
}
