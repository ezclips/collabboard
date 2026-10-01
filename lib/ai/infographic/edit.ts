import { OUTLINE_LIMITS, type VisualOutline, type VisualOutlineItem } from '@/lib/ai/outline';
import type { MindmapTree } from '@/lib/ai/mindmapLayout';

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

/** Insert a new item at `index`, capped at the maximum item count. */
export function insertItem(outline: VisualOutline, index: number): VisualOutline {
  if (outline.items.length >= OUTLINE_LIMITS.items) {
    return { ...outline, items: outline.items.slice() };
  }
  const at = Math.max(0, Math.min(index, outline.items.length));
  const items = outline.items.slice();
  items.splice(at, 0, { label: NEW_ITEM_LABEL });
  return { ...outline, items };
}

/** Remove the item at `index`, never below the minimum item count. */
export function removeItem(outline: VisualOutline, index: number): VisualOutline {
  if (outline.items.length <= OUTLINE_LIMITS.minItems || index < 0 || index >= outline.items.length) {
    return { ...outline, items: outline.items.slice() };
  }
  return { ...outline, items: outline.items.filter((_, i) => i !== index) };
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

/** Add a branch at the root ([]) or a leaf on a branch ([b]). */
export function addChild(tree: MindmapTree, path: number[]): MindmapTree {
  const children = tree.children ?? [];

  if (path.length === 0) {
    if (children.length >= MAX_BRANCHES) return { ...tree, children: children.slice() };
    return { ...tree, children: [...children, { label: NEW_BRANCH_LABEL }] };
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

/** Remove a branch ([b]) or a leaf ([b, l]); the root and the last branch stay. */
export function removeNode(tree: MindmapTree, path: number[]): MindmapTree {
  const children = tree.children ?? [];
  if (path.length === 0) return { ...tree, children: children.slice() };

  const branchIndex = path[0];
  if (branchIndex < 0 || branchIndex >= children.length) return { ...tree, children: children.slice() };

  if (path.length === 1) {
    if (children.length <= MIN_BRANCHES) return { ...tree, children: children.slice() };
    return { ...tree, children: children.filter((_, i) => i !== branchIndex) };
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
