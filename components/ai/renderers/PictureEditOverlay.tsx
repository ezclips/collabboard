'use client';

import React from 'react';

import { PictureZoomContext } from './PictureStage';

/**
 * PATCH-240. The thin HTML layer over an AI picture's SVG: the blue +/− circles,
 * the inline text input, and the colour popover. It is pure presentation -- the
 * renderer owns the state and the edit helpers. Never part of the saved picture.
 *
 * PATCH-245 Addendum 1. On the CSS path the layer lives inside the stage's
 * scaled wrapper, so every control counter-scales by `1 / zoom` to keep a
 * constant on-screen size (18px circles, a readable input) while its percent
 * position still moves with the picture.
 *
 * PATCH-263 Addendum 1. On the AntV path the stage does NOT CSS-scale the layer
 * (it zooms the SVG's viewBox), so `1 / zoom` made the circles 33px instead of
 * 18px. The counter-scale is now read from the layer's REAL on-screen scale
 * (`getBoundingClientRect().width / offsetWidth`); the context zoom is only the
 * fallback when the layer cannot be measured. Handles that name their node
 * (`nodeKey`) take pointer events only while their node is hovered or selected,
 * so the invisible circles no longer swallow clicks meant for the picture.
 */

export interface NodeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditHandle {
  key: string;
  kind: 'add' | 'remove';
  /** Percentage position inside the preview box. */
  left: number;
  top: number;
  /** The attribute value (`data-ai-edit-add` / `data-ai-edit-remove`). */
  target: string;
  onActivate: () => void;
  /** PATCH-263 Addendum 1. The node this control belongs to. */
  nodeKey?: string;
  /** PATCH-263 Addendum 1. That node's box, in layer percent. */
  nodeBox?: NodeBox;
}

export interface ActiveEdit {
  key: string;
  value: string;
  maxLength: number;
  left: number;
  top: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export interface ColorPopoverState {
  key: string;
  left: number;
  top: number;
  /** The theme's six palette stroke colours. */
  swatches: readonly string[];
  onPick: (colorIndex: number | null) => void;
}

/** The handle radius in screen px (the circles are 18px wide). */
const HANDLE_HALF = 9;

/**
 * PATCH-263 Addendum 1. The counter-scale that keeps controls a constant screen
 * size: measured from the layer's real scale, falling back to the context zoom.
 */
export function useLayerCounterScale(ref: React.RefObject<HTMLElement | null>): number {
  const zoom = React.useContext(PictureZoomContext) || 1;
  const fallback = zoom > 0 ? 1 / zoom : 1;
  const [counterScale, setCounterScale] = React.useState(fallback);

  React.useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const measure = () => {
      let layoutWidth = 0;
      let renderedWidth = 0;
      try {
        layoutWidth = layer.offsetWidth || 0;
      } catch {
        layoutWidth = 0;
      }
      try {
        renderedWidth = layer.getBoundingClientRect().width || 0;
      } catch {
        renderedWidth = 0;
      }
      const realScale = layoutWidth > 0 && renderedWidth > 0 ? renderedWidth / layoutWidth : 0;
      const next = realScale > 0 ? 1 / realScale : fallback;
      setCounterScale((previous) => (Math.abs(previous - next) > 0.0001 ? next : previous));
    };
    measure();
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(layer);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [ref, fallback]);

  return counterScale;
}

/**
 * PATCH-263 Addendum 1. The node under a client point: its node box first, then
 * any of its handles (so the pointer can cross the gap onto a button).
 */
function hoveredNodeKey(
  handles: EditHandle[],
  layer: HTMLElement | null,
  clientX: number,
  clientY: number,
): string | null {
  if (!layer) return null;
  const rect = layer.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const px = ((clientX - rect.left) / rect.width) * 100;
  const py = ((clientY - rect.top) / rect.height) * 100;

  for (const handle of handles) {
    const box = handle.nodeBox;
    if (!handle.nodeKey || !box) continue;
    if (px >= box.left && px <= box.left + box.width && py >= box.top && py <= box.top + box.height) {
      return handle.nodeKey;
    }
  }

  const halfX = (HANDLE_HALF / rect.width) * 100;
  const halfY = (HANDLE_HALF / rect.height) * 100;
  for (const handle of handles) {
    if (!handle.nodeKey) continue;
    if (Math.abs(px - handle.left) <= halfX && Math.abs(py - handle.top) <= halfY) {
      return handle.nodeKey;
    }
  }
  return null;
}

function EditInput({ edit, counterScale }: { edit: ActiveEdit; counterScale: number }) {
  const doneRef = React.useRef(false);
  const commit = (value: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    edit.onCommit(value);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    edit.onCancel();
  };

  return (
    <input
      data-ai-edit-input="true"
      data-no-drag="true"
      autoFocus
      defaultValue={edit.value}
      maxLength={edit.maxLength}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
        else if (e.key === 'Escape') cancel();
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      className="pointer-events-auto absolute z-30 rounded border border-indigo-400 bg-white px-1 py-0.5 shadow-md outline-none"
      style={{
        left: `${edit.left}%`,
        top: `${edit.top}%`,
        minWidth: 80,
        fontSize: '13px',
        transform: `translate(-50%, -50%) scale(${counterScale})`,
      }}
    />
  );
}

export default function PictureEditOverlay({
  handles,
  activeEdit,
  colorPopover,
  selectedNodeKey = null,
}: {
  handles: EditHandle[];
  activeEdit?: ActiveEdit | null;
  colorPopover?: ColorPopoverState | null;
  /** PATCH-263 Addendum 1. The node selected in the element editor, if any. */
  selectedNodeKey?: string | null;
}) {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const counterScale = useLayerCounterScale(layerRef);
  const [hoverNodeKey, setHoverNodeKey] = React.useState<string | null>(null);

  const handlesRef = React.useRef(handles);
  handlesRef.current = handles;

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      setHoverNodeKey(hoveredNodeKey(handlesRef.current, layerRef.current, event.clientX, event.clientY));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const activeNodeKey = hoverNodeKey ?? selectedNodeKey;

  return (
    <div ref={layerRef} data-ai-edit-overlay="true" className="pointer-events-none absolute inset-0 z-20">
      {handles.map((handle) => {
        const gated = Boolean(handle.nodeKey);
        const active = !gated || handle.nodeKey === activeNodeKey;
        const className = gated
          ? 'absolute z-30 flex items-center justify-center rounded-full border border-white bg-blue-500 text-[12px] font-bold leading-none text-white shadow transition-opacity'
          : 'pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border border-white bg-blue-500 text-[12px] font-bold leading-none text-white opacity-0 shadow transition-opacity group-hover:opacity-100';
        return (
          <button
            key={handle.key}
            type="button"
            data-no-drag="true"
            {...(handle.kind === 'add' ? { 'data-ai-edit-add': handle.target } : { 'data-ai-edit-remove': handle.target })}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handle.onActivate();
            }}
            title={handle.kind === 'add' ? 'Add' : 'Remove'}
            className={className}
            style={{
              left: `${handle.left}%`,
              top: `${handle.top}%`,
              width: 18,
              height: 18,
              transform: `translate(-50%, -50%) scale(${counterScale})`,
              ...(gated ? { pointerEvents: active ? 'auto' : 'none', opacity: active ? 1 : 0 } : {}),
            }}
          >
            {handle.kind === 'add' ? '+' : '\u2212'}
          </button>
        );
      })}

      {activeEdit && <EditInput edit={activeEdit} counterScale={counterScale} />}

      {colorPopover && (
        <div
          data-ai-edit-color-popover="true"
          data-no-drag="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
          style={{
            left: `${colorPopover.left}%`,
            top: `${colorPopover.top}%`,
            transform: `translateX(-50%) scale(${counterScale})`,
          }}
        >
          {colorPopover.swatches.map((swatch, index) => (
            <button
              key={index}
              type="button"
              data-ai-edit-color={index}
              aria-label={`Colour ${index + 1}`}
              onClick={() => colorPopover.onPick(index)}
              className="h-5 w-5 rounded-full border border-gray-300"
              style={{ background: swatch }}
            />
          ))}
          <button
            type="button"
            data-ai-edit-color="auto"
            onClick={() => colorPopover.onPick(null)}
            className="rounded px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
          >
            Auto
          </button>
        </div>
      )}
    </div>
  );
}
