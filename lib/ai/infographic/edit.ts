import { OUTLINE_LIMITS, type VisualOutline, type VisualOutlineItem, type VisualSide } from '@/lib/ai/outline';
import { effectiveBranchSides, type MindmapTree } from '@/lib/ai/mindmapLayout';

/**
 * PATCH-240. The pure edit helpers behind "edit on the picture itself": rename a
 * word, add/remove an item, recolour one. Every function returns a NEW object and
 * never mutates its input (the tests deep-freeze the inputs). Lengths are capped
 * by `OUTLINE_LIMITS`; counts respect the PATCH-239 limits (2..8 items, 8
 * branches / 6 leaves).
 */

export type OutlineTextRef =
  | { field: 'title' }
  | { field: 'label' | 'detail'; item: number };

export const NEW_ITEM_LABEL = 'New item';
export const NEW_BRANCH_LABEL = 'New branch';
export const NEW_POINT_LABEL = 'New point';

export const MAX_BRANCHES = OUTLINE_LIMITS.items; // 8
export const MAX_LEAVES = OUTLINE_LIMITS.children; // 6
export const MIN_BRANCHES = 1;
export const MAX_COLOR = 5;

function clampText(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function isValidColor(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COLOR;
}

/** Rename the title, or an item's label/detail. */
export function renameOutline(outline: VisualOutline, ref: OutlineTextRef, text: string): VisualOutline {
  if (ref.field === 'title') {
    return { ...outline, title: clampText(text, OUTLINE_LIMITS.title) };
  }

  const { item: index } = ref;
  if (index < 0 || index >= outline.items.length) return { ...outline, items: outline.items.slice() };

  const items = outline.items.map((item, i) => {
    if (i !== index) return item;
    if (ref.field === 'label') return { ...item, label: clampText(text, OUTLINE_LIMITS.label) };
    const detail = clampText(text, OUTLINE_LIMITS.detail);
    return detail ? { ...item, detail } : { ...item, detail: undefined };
  });
  return { ...outline, items };
}

/**
 * PATCH-245 Addendum 3. Which default a side-less item falls back to. Our hub
 * draws even -> right; AntV's mind map draws even -> left (`stableMindmap.tsx`).
 */
export type OutlineSideRule = 'hub' | 'antv-mindmap';

function defaultOutlineSide(index: number, rule: OutlineSideRule): VisualSide {
  if (rule === 'antv-mindmap') return index % 2 === 0 ? 'left' : 'right';
  return index % 2 === 0 ? 'right' : 'left';
}

/**
 * PATCH-242 / PATCH-245. The side each item is drawn on: its stored `side` when
 * present, else the rule's default (hub even -> right, AntV mind map even ->
 * left). Pure.
 */
export function effectiveOutlineSides(
  items: ReadonlyArray<{ side?: VisualSide }>,
  rule: OutlineSideRule = 'hub',
): VisualSide[] {
  return items.map((item, index) => item.side ?? defaultOutlineSide(index, rule));
}

/**
 * PATCH-242. Freeze every item's CURRENT effective side into the data, so the
 * next edit cannot move any item that is already placed. Returns new objects.
 */
function freezeOutlineSides(
  items: readonly VisualOutlineItem[],
  rule: OutlineSideRule = 'hub',
): VisualOutlineItem[] {
  const sides = effectiveOutlineSides(items, rule);
  return items.map((item, index) => ({ ...item, side: sides[index] }));
}

/**
 * Insert a new item at `index`, capped at the maximum item count. PATCH-242:
 * every existing item's side is frozen first; the new item takes an explicit
 * `side` when given, else the side of the item before it, else `right`.
 */
export function insertItem(
  outline: VisualOutline,
  index: number,
  opts?: { side?: VisualSide; rule?: OutlineSideRule },
): VisualOutline {
  if (outline.items.length >= OUTLINE_LIMITS.items) {
    return { ...outline, items: outline.items.slice() };
  }
  const rule = opts?.rule ?? 'hub';
  const at = Math.max(0, Math.min(index, outline.items.length));
  const sides = effectiveOutlineSides(outline.items, rule);
  const items = freezeOutlineSides(outline.items, rule);
  const side = opts?.side ?? (at > 0 ? sides[at - 1] : defaultOutlineSide(0, rule));
  items.splice(at, 0, { label: NEW_ITEM_LABEL, side });
  return { ...outline, items };
}

/** Remove the item at `index`, never below the minimum item count. PATCH-242:
 * every remaining item's side is frozen so no other item moves. */
export function removeItem(
  outline: VisualOutline,
  index: number,
  rule: OutlineSideRule = 'hub',
): VisualOutline {
  if (outline.items.length <= OUTLINE_LIMITS.minItems || index < 0 || index >= outline.items.length) {
    return { ...outline, items: outline.items.slice() };
  }
  return { ...outline, items: freezeOutlineSides(outline.items, rule).filter((_, i) => i !== index) };
}

/** Set (or, with null/invalid, clear) an item's palette slot. */
export function recolorItem(outline: VisualOutline, index: number, colorIndex: number | null): VisualOutline {
  if (index < 0 || index >= outline.items.length) return { ...outline, items: outline.items.slice() };
  const items = outline.items.map((item, i) => {
    if (i !== index) return item;
    if (!isValidColor(colorIndex)) {
      const cleared: VisualOutlineItem = { ...item };
      delete cleared.color;
      return cleared;
    }
    return { ...item, color: colorIndex };
  });
  return { ...outline, items };
}

/** Rename the root, a branch or a leaf by path. */
export function renameNode(tree: MindmapTree, path: number[], text: string): MindmapTree {
  if (path.length === 0) {
    return { ...tree, label: clampText(text, OUTLINE_LIMITS.title) };
  }
  const children = tree.children ?? [];
  const branchIndex = path[0];
  if (branchIndex < 0 || branchIndex >= children.length) return { ...tree, children: children.slice() };

  if (path.length === 1) {
    return {
      ...tree,
      children: children.map((child, i) => (i === branchIndex ? { ...child, label: clampText(text, OUTLINE_LIMITS.label) } : child)),
    };
  }

  const leafIndex = path[1];
  const leaves = children[branchIndex].children ?? [];
  if (leafIndex < 0 || leafIndex >= leaves.length) return { ...tree, children: children.slice() };
  return {
    ...tree,
    children: children.map((child, i) => {
      if (i !== branchIndex) return child;
      return {
        ...child,
        children: leaves.map((leaf, j) => (j === leafIndex ? { label: clampText(text, OUTLINE_LIMITS.label) } : leaf)),
      };
    }),
  };
}

/**
 * Add a branch at the root ([]) or a leaf on a branch ([b]). PATCH-242: for a
 * branch, every existing branch's side is frozen first and the new branch is
 * appended after the last branch of its side; a leaf is unchanged.
 */
export function addChild(tree: MindmapTree, path: number[], opts?: { side?: VisualSide }): MindmapTree {
  const children = tree.children ?? [];

  if (path.length === 0) {
    if (children.length >= MAX_BRANCHES) return { ...tree, children: children.slice() };
    const sides = effectiveBranchSides(children);
    const frozen = children.map((child, i) => ({ ...child, side: sides[i] }));
    const side = opts?.side ?? 'right';
    let at = frozen.length;
    if (opts?.side) {
      for (let i = frozen.length - 1; i >= 0; i -= 1) {
        if (frozen[i].side === side) { at = i + 1; break; }
      }
    }
    frozen.splice(at, 0, { label: NEW_BRANCH_LABEL, side });
    return { ...tree, children: frozen };
  }

  const branchIndex = path[0];
  if (branchIndex < 0 || branchIndex >= children.length) return { ...tree, children: children.slice() };
  const branch = children[branchIndex];
  const leaves = branch.children ?? [];
  if (leaves.length >= MAX_LEAVES) return { ...tree, children: children.slice() };
  return {
    ...tree,
    children: children.map((child, i) =>
      i === branchIndex ? { ...child, children: [...(child.children ?? []), { label: NEW_POINT_LABEL }] } : child,
    ),
  };
}

/**
 * PATCH-243. Add a child (leaf) under an outline item, capped by
 * `OUTLINE_LIMITS.children`. `childIndex` inserts at that position when given,
 * else appends. Pure; never mutates the input.
 */
export function addItemChild(
  outline: VisualOutline,
  itemIndex: number,
  childIndex?: number,
  label: string = NEW_POINT_LABEL,
): VisualOutline {
  const target = outline.items[itemIndex];
  if (!target) return { ...outline, items: outline.items.slice() };
  if ((target.children?.length ?? 0) >= OUTLINE_LIMITS.children) {
    return { ...outline, items: outline.items.slice() };
  }
  const items = outline.items.map((item, i) => {
    if (i !== itemIndex) return item;
    const children = (item.children ?? []).map((child) => ({ ...child }));
    const at = childIndex === undefined ? children.length : Math.max(0, Math.min(childIndex, children.length));
    children.splice(at, 0, { label: clampText(label, OUTLINE_LIMITS.label) || NEW_POINT_LABEL });
    return { ...item, children };
  });
  return { ...outline, items };
}

/** PATCH-243. Remove the child at `childIndex` from an outline item. Pure. */
export function removeItemChild(outline: VisualOutline, itemIndex: number, childIndex: number): VisualOutline {
  const target = outline.items[itemIndex];
  if (!target || childIndex < 0 || childIndex >= (target.children?.length ?? 0)) {
    return { ...outline, items: outline.items.slice() };
  }
  const items = outline.items.map((item, i) => {
    if (i !== itemIndex) return item;
    const children = (item.children ?? []).filter((_, j) => j !== childIndex);
    if (children.length > 0) return { ...item, children };
    const cleared: VisualOutlineItem = { ...item };
    delete cleared.children;
    return cleared;
  });
  return { ...outline, items };
}

/** Remove a branch ([b]) or a leaf ([b, l]); the root and the last branch stay. */
export function removeNode(tree: MindmapTree, path: number[]): MindmapTree {
  const children = tree.children ?? [];
  if (path.length === 0) return { ...tree, children: children.slice() };

  const branchIndex = path[0];
  if (branchIndex < 0 || branchIndex >= children.length) return { ...tree, children: children.slice() };

  if (path.length === 1) {
    if (children.length <= MIN_BRANCHES) return { ...tree, children: children.slice() };
    const sides = effectiveBranchSides(children);
    const frozen = children.map((child, i) => ({ ...child, side: sides[i] }));
    return { ...tree, children: frozen.filter((_, i) => i !== branchIndex) };
  }

  const leafIndex = path[1];
  const leaves = children[branchIndex].children ?? [];
  if (leafIndex < 0 || leafIndex >= leaves.length) return { ...tree, children: children.slice() };
  return {
    ...tree,
    children: children.map((child, i) =>
      i === branchIndex ? { ...child, children: (child.children ?? []).filter((_, j) => j !== leafIndex) } : child,
    ),
  };
}
