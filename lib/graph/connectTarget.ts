/**
 * PATCH-227 -- picks the connect-drop target from a hit-test.
 *
 * `document.elementsFromPoint(x, y)` returns the stack of elements under the
 * pointer. The first one that is (or is inside) a `[data-padlet-id]` whose id
 * is not the source and whose post is top-level wins. Pure, so the drop policy
 * is unit-tested rather than inferred from the drag handler.
 */
export function findConnectTargetId(
  elements: Element[],
  sourceId: string,
  isTopLevel: (id: string) => boolean,
): string | null {
  for (const el of elements) {
    const holder = (el as Element).closest?.('[data-padlet-id]') as HTMLElement | null;
    if (!holder) continue;
    const id = holder.getAttribute('data-padlet-id');
    if (!id || id === sourceId) continue;
    if (isTopLevel(id)) return id;
  }
  return null;
}
