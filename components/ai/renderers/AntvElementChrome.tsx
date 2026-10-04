'use client';

import React from 'react';
import { Palette, Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-react';

import {
  elementAtPoint,
  elementItemScope,
  elementKey,
  isTransientElement,
  itemMemberKeys,
  type ElementHandle,
  type ElementOverride,
  type ElementOverrides,
  type ScreenBox,
} from '@/lib/ai/antv/elementOverrides';
import { overridesForTemplate } from '@/lib/ai/antv/templateOverrides';
import type { VisualOutline } from '@/lib/ai/outline';

/**
 * PATCH-261. The pure selection helpers and the handle/bar chrome, split out of
 * `AntvElementEditor` so that file stays under the 700-line ceiling. No
 * behaviour changed by the move.
 */

export interface ChromeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Selection =
  | { kind: 'item'; scope: string; keys: string[] }
  | { kind: 'element'; key: string; scope: string | null };

/** A deep clone of an override map (each override is a flat primitive record). */
export function cloneOverridesDeep(overrides: ElementOverrides | undefined): ElementOverrides | undefined {
  if (!overrides) return undefined;
  const items: Record<string, ElementOverride> = {};
  for (const key of Object.keys(overrides.items)) items[key] = { ...overrides.items[key] };
  return { template: overrides.template, items };
}

export const HANDLES: Array<{ name: ElementHandle; fx: number; fy: number }> = [
  { name: 'nw', fx: 0, fy: 0 },
  { name: 'n', fx: 0.5, fy: 0 },
  { name: 'ne', fx: 1, fy: 0 },
  { name: 'e', fx: 1, fy: 0.5 },
  { name: 'se', fx: 1, fy: 1 },
  { name: 's', fx: 0.5, fy: 1 },
  { name: 'sw', fx: 0, fy: 1 },
  { name: 'w', fx: 0, fy: 0.5 },
];

export const CURSORS: Record<ElementHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

export const DRAG_THRESHOLD = 4;
export const MIN_SCREEN_SIZE = 8;
export const HISTORY_MAX = 50;
export const ZERO_BOX: ScreenBox = { left: 0, top: 0, width: 0, height: 0 };

/**
 * PATCH-263. The on-screen handle box (matches the h-2.5/w-2.5 Tailwind class)
 * and the outward gap between a handle's centre and the selection edge. The
 * n/s handles are dropped on a short box and the e/w handles on a narrow one,
 * so a mind map node (12-20 px tall) is never covered by its own handles.
 */
export const HANDLE_SIZE = 10;
export const HANDLE_GAP = 2;
export const HANDLE_EDGE_MIN = 28;

/**
 * PATCH-260, defect 6.1. Text elements whose own AntV interactions (the inline
 * text editor on double-click, the text toolbar on a single click) must not be
 * swallowed by our layer unless a real drag started.
 */
const TEXT_ELEMENT_TYPES = new Set(['title', 'item-label', 'item-value', 'item-desc', 'label', 'desc']);

export function isTextElement(el: Element | null): boolean {
  const host = el?.closest?.(
    '[data-element-type="title"], [data-element-type="item-label"], [data-element-type="item-value"], [data-element-type="item-desc"], foreignObject',
  );
  if (host) return true;
  const type = el?.getAttribute?.('data-element-type');
  return type ? TEXT_ELEMENT_TYPES.has(type) : false;
}

export function isTextEntry(target: Element | null): boolean {
  if (!target?.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (target as HTMLElement).isContentEditable === true;
}

/**
 * PATCH-260, defect 3. AntV's inline text editor marks its target
 * `contenteditable` and `.infographic-inline-text-editor`. In Chrome the active
 * element is not always that node (SVG text focus is inconsistent), so our
 * layer must not judge by `document.activeElement` alone -- while such an editor
 * is open we stay out of the way entirely.
 */
export function hasActiveAntvTextEditor(root: HTMLElement | null): boolean {
  if (!root) return false;
  const active = document.activeElement as HTMLElement | null;
  if (active && active.isContentEditable === true && root.contains(active)) return true;
  return Boolean(root.querySelector('[contenteditable="true"]'));
}

export function sameOverride(a: ElementOverride | undefined, b: ElementOverride | undefined): boolean {
  if (a === b) return true;
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left as Record<string, unknown>)[key] !== (right as Record<string, unknown>)[key]) return false;
  }
  return true;
}

export function sameOverrides(a: ElementOverrides | undefined, b: ElementOverrides | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.template !== b.template) return false;
  // PATCH-262. Additions are part of the map, so a move/resize/recolour of one
  // is a real change even when `items` is unchanged.
  if (JSON.stringify(a.additions ?? []) !== JSON.stringify(b.additions ?? [])) return false;
  const keys = new Set([...Object.keys(a.items), ...Object.keys(b.items)]);
  for (const key of keys) {
    if (!sameOverride(a.items[key], b.items[key])) return false;
  }
  return true;
}

export function initialOverrides(outline: VisualOutline, template: string): ElementOverrides | undefined {
  return overridesForTemplate(outline, template);
}

export function selectedKeys(selection: Selection | null): string[] {
  if (!selection) return [];
  return selection.kind === 'item' ? selection.keys : [selection.key];
}

/**
 * PATCH-260, defect 4.1 / PATCH-262. What a pointerdown should drag, and (for
 * an already-selected item) what a click WITHOUT movement should narrow to.
 * Narrowing never happens on pointerdown, so a drag on a selected item moves
 * the whole item. Pure with respect to the DOM read; extracted from the editor
 * (which is at the 800-line ceiling).
 */
export function resolveAntvPointerDown(
  root: Element,
  current: Selection | null,
  target: Element | null,
  clientX: number,
  clientY: number,
): { selection: Selection | null; narrowTo: Selection | null } {
  if (target?.closest?.('[data-element-type^="btn-"]')) {
    return { selection: current, narrowTo: null };
  }

  // Defect 5.2. The pointer, not event.target: a big title box can cover an
  // icon, so pick the smallest SVG box containing the point.
  const hit = elementAtPoint(root, clientX, clientY);
  const candidate = hit ?? target?.closest?.('[data-element-type]') ?? null;
  // AntV's editor overlay is not part of the picture: never select it.
  if (!candidate || isTransientElement(candidate)) return { selection: null, narrowTo: null };
  const key = elementKey(candidate, root);
  if (!key) return { selection: null, narrowTo: null };

  const elementSelection: Selection = { kind: 'element', key, scope: elementItemScope(candidate, root) };
  const scope = elementSelection.scope;
  if (!scope) return { selection: elementSelection, narrowTo: null };

  const itemActive =
    current !== null &&
    ((current.kind === 'item' && current.scope === scope) ||
      (current.kind === 'element' && current.scope === scope));
  if (!itemActive) {
    return { selection: { kind: 'item', scope, keys: itemMemberKeys(scope, root) }, narrowTo: null };
  }
  if (current.kind === 'element') {
    return { selection: elementSelection, narrowTo: null };
  }
  // The whole item is selected: drag it now, narrow only on a no-move click.
  return { selection: current, narrowTo: elementSelection };
}

/**
 * PATCH-263 Addendum 3. A left-percent clamped so the control stays fully inside
 * its container. The bar and the colour popover are anchored at the selection's
 * left edge and grew rightward, so a node near the right edge had its right side
 * cut off by the preview's overflow. Measured after mount and on resize against
 * the parent's on-screen width; returns the desired position when unmeasurable.
 */
export function useClampedLeft(
  ref: React.RefObject<HTMLElement | null>,
  desiredLeft: number,
  counterScale: number,
): number {
  const [left, setLeft] = React.useState(desiredLeft);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const parent = el.parentElement;
      const parentWidth = parent?.getBoundingClientRect().width ?? 0;
      const ownWidth = el.offsetWidth || 0;
      if (parentWidth <= 0 || ownWidth <= 0) {
        setLeft(desiredLeft);
        return;
      }
      const renderedWidth = ownWidth * (counterScale || 1);
      const maxLeft = Math.max(0, 100 - (renderedWidth / parentWidth) * 100);
      const next = Math.min(Math.max(desiredLeft, 0), maxLeft);
      setLeft((previous) => (Math.abs(previous - next) > 0.001 ? next : previous));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref, desiredLeft, counterScale]);
  return left;
}

export interface AntvElementChromeProps {
  selectionLabel: string;
  members?: string;
  rect: ChromeRect;
  /** PATCH-263. The container's on-screen size, so handle offsets are true px. */
  screenWidth: number;
  screenHeight: number;
  counterScale: number;
  colourOpen: boolean;
  /**
   * PATCH-261 fix. A text selection gets AntV's own text toolbar directly above
   * it (z-index 9999), exactly where our bar sits. For a text selection the bar
   * therefore drops BELOW the box; other selections keep it above.
   */
  barBelow?: boolean;
  onResize: (event: React.PointerEvent, handle: ElementHandle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onDelete: () => void;
  onToggleColour: () => void;
  children?: React.ReactNode;
}

/** PATCH-261. The selection box, its 8 handles and the floating bar. */
export function AntvElementChrome({
  selectionLabel,
  members,
  rect,
  screenWidth,
  screenHeight,
  counterScale,
  colourOpen,
  barBelow = false,
  onResize,
  onUndo,
  onRedo,
  onReset,
  onDelete,
  onToggleColour,
  children,
}: AntvElementChromeProps) {
  const barRef = React.useRef<HTMLDivElement>(null);
  const barLeft = useClampedLeft(barRef, rect.left, counterScale);
  const barTop = barBelow
    ? `calc(${rect.top + rect.height}% + 6px)`
    : `calc(${Math.max(rect.top, 0)}% - 30px)`;

  // PATCH-263. Compute the selection box in screen pixels (from the overlay's
  // own units), then place each handle centre OUTSIDE the box by half the
  // handle size plus the gap. Corners move diagonally, edge handles
  // perpendicular to their edge; the visible edges drop out on a small box.
  const screenKnown = screenWidth > 0 && screenHeight > 0;
  const boxLeft = (rect.left / 100) * screenWidth;
  const boxTop = (rect.top / 100) * screenHeight;
  const boxWidth = (rect.width / 100) * screenWidth;
  const boxHeight = (rect.height / 100) * screenHeight;
  const handleOffset = HANDLE_SIZE / 2 + HANDLE_GAP;
  const showVerticalEdges = !screenKnown || boxHeight >= HANDLE_EDGE_MIN;
  const showHorizontalEdges = !screenKnown || boxWidth >= HANDLE_EDGE_MIN;

  const handles = HANDLES.filter((handle) => {
    if (handle.name === 'n' || handle.name === 's') return showVerticalEdges;
    if (handle.name === 'e' || handle.name === 'w') return showHorizontalEdges;
    return true;
  }).map((handle) => {
    const outwardX = Math.sign(handle.fx - 0.5) * handleOffset;
    const outwardY = Math.sign(handle.fy - 0.5) * handleOffset;
    const centreX = boxLeft + handle.fx * boxWidth + outwardX;
    const centreY = boxTop + handle.fy * boxHeight + outwardY;
    return {
      ...handle,
      left: screenKnown ? (centreX / screenWidth) * 100 : rect.left + handle.fx * rect.width,
      top: screenKnown ? (centreY / screenHeight) * 100 : rect.top + handle.fy * rect.height,
    };
  });

  return (
    <div
      data-ai-element-overlay="true"
      data-ai-element-selected={selectionLabel}
      data-ai-element-members={members}
      className="pointer-events-none absolute inset-0 z-[10000]"
      style={{ pointerEvents: 'none' }}
    >
      <div
        data-ai-element-box="true"
        className="absolute border-2 border-blue-500"
        style={{
          pointerEvents: 'none',
          left: `${rect.left}%`,
          top: `${rect.top}%`,
          width: `${rect.width}%`,
          height: `${rect.height}%`,
        }}
      />

      {handles.map((handle) => (
        <button
          key={handle.name}
          type="button"
          data-ai-element-handle={handle.name}
          aria-label={`Resize ${handle.name}`}
          onPointerDown={(event) => onResize(event, handle.name)}
          className="absolute h-2.5 w-2.5 rounded-full border border-white bg-blue-500 shadow"
          style={{
            pointerEvents: 'auto',
            left: `${handle.left}%`,
            top: `${handle.top}%`,
            transform: `translate(-50%, -50%) scale(${counterScale})`,
            cursor: CURSORS[handle.name],
          }}
        />
      ))}

      <div
        ref={barRef}
        data-ai-element-bar="true"
        data-ai-element-bar-placement={barBelow ? 'below' : 'above'}
        data-picture-control="true"
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-lg"
        style={{
          pointerEvents: 'auto',
          left: `${barLeft}%`,
          top: barTop,
          transform: `scale(${counterScale})`,
          transformOrigin: barBelow ? 'left top' : 'left bottom',
        }}
      >
        <button type="button" data-ai-element-undo="true" title="Undo" onClick={onUndo} className="rounded p-1 text-gray-600 hover:bg-gray-100">
          <Undo2 size={14} />
        </button>
        <button type="button" data-ai-element-redo="true" title="Redo" onClick={onRedo} className="rounded p-1 text-gray-600 hover:bg-gray-100">
          <Redo2 size={14} />
        </button>
        <button type="button" data-ai-element-reset="true" title="Reset element" onClick={onReset} className="rounded p-1 text-gray-600 hover:bg-gray-100">
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          data-ai-element-colour-toggle="true"
          title="Edit"
          aria-label="Edit"
          aria-expanded={colourOpen}
          onClick={onToggleColour}
          className={`rounded p-1 hover:bg-gray-100 ${colourOpen ? 'text-blue-600' : 'text-gray-600'}`}
        >
          <Palette size={14} />
        </button>
        <button type="button" data-ai-element-delete="true" title="Delete" onClick={onDelete} className="rounded p-1 text-red-600 hover:bg-red-50">
          <Trash2 size={14} />
        </button>
      </div>

      {children}
    </div>
  );
}
