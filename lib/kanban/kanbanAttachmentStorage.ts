/**
 * PATCH-320. Kanban attachment files live in the `padlet-files` bucket under
 * `kanban/<cardId>/<...>`. This is the one place that derives and removes those
 * objects, so the editor, the store and the board-delete route cannot drift.
 * Every function logs a storage failure and never throws: cleanup must never
 * block the card/column/board delete it accompanies.
 */
export const KANBAN_ATTACHMENT_BUCKET = 'padlet-files';

export function kanbanAttachmentPrefix(cardId: string): string {
  return `kanban/${cardId}/`;
}

/**
 * The storage path of an attachment from its public URL, but only when it is
 * under `kanban/<cardId>/` — a URL for another card (or another bucket) is
 * never returned, so it can never be deleted by mistake.
 */
export function kanbanAttachmentPathFromUrl(url: string | null | undefined, cardId: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const marker = `/${KANBAN_ATTACHMENT_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length).split('?')[0];
  const prefix = kanbanAttachmentPrefix(cardId);
  return path.startsWith(prefix) ? path : null;
}

export interface KanbanAttachmentStorageClient {
  from(bucket: string): {
    list(prefix: string, options?: { limit?: number }): Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
    remove(paths: string[]): Promise<{ error: unknown }>;
  };
}

export async function removeKanbanAttachmentByUrl(
  storage: KanbanAttachmentStorageClient,
  url: string | null | undefined,
  cardId: string,
): Promise<void> {
  const path = kanbanAttachmentPathFromUrl(url, cardId);
  if (!path) return;
  try {
    const { error } = await storage.from(KANBAN_ATTACHMENT_BUCKET).remove([path]);
    if (error) console.error('[kanban] Failed to remove attachment object', path, error);
  } catch (error) {
    console.error('[kanban] Failed to remove attachment object', path, error);
  }
}

export async function removeKanbanCardAttachments(
  storage: KanbanAttachmentStorageClient,
  cardId: string,
): Promise<void> {
  const prefix = kanbanAttachmentPrefix(cardId);
  try {
    const { data, error } = await storage.from(KANBAN_ATTACHMENT_BUCKET).list(prefix);
    if (error) {
      console.error('[kanban] Failed to list attachments for card', cardId, error);
      return;
    }
    const paths = (data ?? []).map((item) => `${prefix}${item.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await storage.from(KANBAN_ATTACHMENT_BUCKET).remove(paths);
    if (removeError) console.error('[kanban] Failed to remove attachments for card', cardId, removeError);
  } catch (error) {
    console.error('[kanban] Attachment cleanup failed for card', cardId, error);
  }
}

export async function removeKanbanCardAttachmentsForCards(
  storage: KanbanAttachmentStorageClient,
  cardIds: readonly string[],
): Promise<void> {
  for (const cardId of cardIds) {
    await removeKanbanCardAttachments(storage, cardId);
  }
}
