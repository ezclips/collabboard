'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import {
  applyAntvButton,
  applyAntvChange,
  isMindmapTemplate,
  outlinesEqual,
  toAntvOptions,
  type AntvButtonOp,
  type AntvChangeEvent,
} from '@/lib/ai/antv/mapOutline';
import { stageInteractions } from '@/lib/ai/antv/interactions';
import { applyElementOverrides, withoutElementOverrides } from '@/lib/ai/antv/elementOverrides';
import { insertItem } from '@/lib/ai/infographic/edit';
import { OUTLINE_LIMITS, type VisualOutline, type VisualSide } from '@/lib/ai/outline';
import { themeById } from '@/lib/ai/visualThemes';
import { themeWithStyle } from '@/lib/ai/visualStyle';
import AntvElementEditor from './AntvElementEditor';
import PictureEditOverlay, { type EditHandle } from './PictureEditOverlay';

/**
 * PATCH-241. Draws a stored outline with the bundled AntV Infographic engine.
 * The engine is loaded only here, only on the client, and only when a picture is
 * shown; our setup (`loadAntv`) turns its fonts off and feeds it our icons, so a
 * picture makes no outside requests. With `edit`, AntV's own on-picture editing
 * is enabled and every `options:change` is mapped back to a new outline.
 *
 * PATCH-243. AntV's own +/− buttons are shown on hover for the list designs (a
 * blue circle with a white + / − glyph). The mind-map designs instead hide those
 * squares (they piled under the boxes and covered words) and draw PATCH-242's
 * handles outside each node.
 */

type RenderPhase = 'loading' | 'done' | 'failed';

interface AntvInstance {
  render(): void;
  update(options: unknown): void | Promise<void>;
  on(event: string, listener: (payload: unknown) => void): void;
  destroy(): void;
}

/**
 * PATCH-243. AntV draws its own +/− buttons but keeps the group `display:none`
 * (an SVG attribute). The CSS wins over that attribute on hover, and gives the
 * buttons our Napkin blue. Only the editable container gets the attribute, so
 * the board and thumbnails are untouched. Mind maps hide AntV's group entirely
 * and use our overlay instead.
 */
const ANTV_EDIT_CSS = `
[data-antv-editable]:hover [data-element-type="btns-group"] { display: inline; }
[data-antv-editable] [data-element-type="btn-add"],
[data-antv-editable] [data-element-type="btn-remove"] { fill: #3B82F6; fill-opacity: 1; }
[data-antv-mindmap-overlay] [data-element-type="btns-group"] { display: none !important; }
`.trim();

/** PATCH-243. Our handle size, matching PictureEditOverlay's 18px circles. */
const HANDLE_RADIUS = 9;
const HANDLE_GAP = 3;

/** Reads AntV's `data-indexes` (a comma list) into a numeric path. */
function parseAntvIndexes(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length === 0 || parts.some((value) => !Number.isInteger(value) || value < 0)) {
    return undefined;
  }
  return parts;
}

/**
 * PATCH-243. AntV's buttons are bare rects: make each a circle and add a white
 * + / − `<path>` sibling. Idempotent (safe to run after every render/update).
 */
export function decorateAntvButtons(container: HTMLElement): void {
  const buttons = container.querySelectorAll('[data-element-type="btn-add"], [data-element-type="btn-remove"]');
  buttons.forEach((element) => {
    const rect = element as SVGRectElement;
    const x = Number(rect.getAttribute('x') ?? 0);
    const y = Number(rect.getAttribute('y') ?? 0);
    const width = Number(rect.getAttribute('width') ?? 20);
    const height = Number(rect.getAttribute('height') ?? 20);
    rect.setAttribute('rx', String(width / 2));
    rect.setAttribute('ry', String(height / 2));

    const next = rect.nextElementSibling;
    if (next && next.getAttribute('data-antv-button-glyph')) return;

    const isAdd = element.getAttribute('data-element-type') === 'btn-add';
    const cx = x + width / 2;
    const cy = y + height / 2;
    const arm = Math.min(width, height) * 0.25;
    const d = isAdd
      ? `M ${cx - arm} ${cy} L ${cx + arm} ${cy} M ${cx} ${cy - arm} L ${cx} ${cy + arm}`
      : `M ${cx - arm} ${cy} L ${cx + arm} ${cy}`;
    const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glyph.setAttribute('d', d);
    glyph.setAttribute('data-antv-button-glyph', isAdd ? 'add' : 'remove');
    glyph.setAttribute('stroke', '#fff');
    glyph.setAttribute('stroke-width', '2');
    glyph.setAttribute('stroke-linecap', 'round');
    glyph.setAttribute('fill', 'none');
    glyph.setAttribute('pointer-events', 'none');
    rect.insertAdjacentElement('afterend', glyph);
  });
}

interface AntvNodeBox {
  indexes: number[];
  x: number;
  y: number;
  w: number;
  h: number;
}

/** PATCH-243. Each mind-map node's box, read from AntV's rendered SVG. */
function readMindmapNodeBoxes(container: HTMLElement): AntvNodeBox[] {
  const labels = container.querySelectorAll('[data-element-type="item-label"][data-indexes]');
  const seen = new Map<string, AntvNodeBox>();
  labels.forEach((label) => {
    const raw = label.getAttribute('data-indexes');
    if (!raw || seen.has(raw)) return;
    const indexes = raw.split(',').map((part) => Number(part.trim()));
    if (indexes.some((value) => !Number.isInteger(value))) return;

    let group: Element | null = label.parentElement;
    let shape: Element | undefined;
    while (group) {
      shape = Array.from(group.children).find((child) => child.getAttribute('data-element-type') === 'shape');
      if (shape) break;
      group = group.parentElement;
    }
    if (!group) return;

    const x = Number(group.getAttribute('x'));
    const y = Number(group.getAttribute('y'));
    let w = shape ? Number(shape.getAttribute('width')) : NaN;
    let h = shape ? Number(shape.getAttribute('height')) : NaN;
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      const box = label.closest('foreignObject') ?? label;
      w = Number(box.getAttribute('width'));
      h = Number(box.getAttribute('height'));
    }
    if (![x, y, w, h].every((value) => Number.isFinite(value))) return;
    seen.set(raw, { indexes, x, y, w, h });
  });
  return [...seen.values()];
}

function viewBoxOf(container: HTMLElement): { minX: number; minY: number; width: number; height: number } | null {
  const raw = container.querySelector('svg')?.getAttribute('viewBox');
  if (!raw) return null;
  const parts = raw.split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
}

/**
 * PATCH-243. Builds our PATCH-242 handles for a mind map: − on the inner edge,
 * + on the outer edge away from the root, both fully outside the box. The root
 * gets two + that add a branch on that side. Pure with respect to the DOM read;
 * clicks reuse the outline edit helpers so sides freeze.
 */
export function buildAntvMindmapHandles(
  container: HTMLElement,
  outline: VisualOutline,
  templateName: string,
  onChange: (next: VisualOutline) => void,
): EditHandle[] {
  const viewBox = viewBoxOf(container);
  if (!viewBox) return [];
  const nodes = readMindmapNodeBoxes(container);
  const root = nodes.find((node) => node.indexes.length === 1);
  if (!root || viewBox.width <= 0 || viewBox.height <= 0) return [];

  const svg = container.querySelector('svg');
  const scale = svg && svg.clientWidth > 0 ? svg.clientWidth / viewBox.width : 1;
  const offset = (HANDLE_RADIUS + HANDLE_GAP) / (scale || 1);
  const pctX = (value: number) => ((value - viewBox.minX) / viewBox.width) * 100;
  const pctY = (value: number) => ((value - viewBox.minY) / viewBox.height) * 100;

  const rootCx = root.x + root.w / 2;
  const items = outline.items;
  const handles: EditHandle[] = [];

  if (items.length < OUTLINE_LIMITS.items) {
    const y = root.y + root.h / 2;
    handles.push({
      key: 'add-root-left',
      kind: 'add',
      left: pctX(root.x - offset),
      top: pctY(y),
      target: 'root:left',
      onActivate: () => onChange(insertItem(outline, items.length, { side: 'left', rule: 'antv-mindmap' })),
    });
    handles.push({
      key: 'add-root-right',
      kind: 'add',
      left: pctX(root.x + root.w + offset),
      top: pctY(y),
      target: 'root:right',
      onActivate: () => onChange(insertItem(outline, items.length, { side: 'right', rule: 'antv-mindmap' })),
    });
  }

  for (const node of nodes) {
    if (node.indexes.length === 1) continue;
    const side: VisualSide = node.x + node.w / 2 >= rootCx ? 'right' : 'left';
    const outerX = side === 'right' ? node.x + node.w + offset : node.x - offset;
    const innerX = side === 'right' ? node.x - offset : node.x + node.w + offset;
    const y = node.y + node.h / 2;

    if (node.indexes.length === 2) {
      const i = node.indexes[1];
      const item = items[i];
      if (item && (item.children?.length ?? 0) < OUTLINE_LIMITS.children) {
        handles.push({
          key: `add-${i}`,
          kind: 'add',
          left: pctX(outerX),
          top: pctY(y),
          target: `add:${i}`,
          onActivate: () => {
            const next = applyAntvButton(outline, [0, i, item.children?.length ?? 0], 'add', templateName);
            if (next !== outline) onChange(next);
          },
        });
      }
      if (items.length > OUTLINE_LIMITS.minItems) {
        handles.push({
          key: `rm-${i}`,
          kind: 'remove',
          left: pctX(innerX),
          top: pctY(y),
          target: `rm:${i}`,
          onActivate: () => onChange(applyAntvButton(outline, [0, i], 'remove', templateName)),
        });
      }
    } else if (node.indexes.length === 3) {
      const i = node.indexes[1];
      const j = node.indexes[2];
      handles.push({
        key: `rm-${i}-${j}`,
        kind: 'remove',
        left: pctX(innerX),
        top: pctY(y),
        target: `rm:${i},${j}`,
        onActivate: () => onChange(applyAntvButton(outline, [0, i, j], 'remove', templateName)),
      });
    }
  }
  return handles;
}

function AntvInfographicRenderer({
  data,
  edit,
  initialEditRef: _initialEditRef,
}: {
  data: InfographicDiagramData;
  edit?: { onChange: (next: VisualOutline) => void };
  initialEditRef?: string | null;
}) {
  const theme = themeWithStyle(themeById(data.theme), data.style);
  const templateName = data.template.slice('antv:'.length);
  const isMindmap = isMindmapTemplate(templateName);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AntvInstance | null>(null);
  const [phase, setPhase] = useState<RenderPhase>('loading');
  const [handles, setHandles] = useState<EditHandle[]>([]);

  // Keep the current outline/callback in refs so the create effect can stay
  // keyed on the template/theme and StrictMode's double-run is harmless.
  //
  // PATCH-260. `outlineRef` is the SINGLE "latest outline". Every upward emitter
  // (element editor commit, AntV `options:change`, +/− button, mind-map handle)
  // reads and writes it SYNCHRONOUSLY, before React re-renders. Without this a
  // later `options:change` -- often fired by AntV reacting to our own transform
  // writes -- rebuilt the outline from the still-old props and silently dropped
  // the just-committed `elementOverrides` (and titleStyle/valuesEstimated).
  const outlineRef = useRef(data.outline);
  outlineRef.current = data.outline;
  const editRef = useRef(edit);
  editRef.current = edit;
  // AntV reacting to OUR paint (the transform we write) must not look like a data
  // change: remember the serialized options we last drew and compare on emit.
  const lastDrawnRef = useRef<string | null>(null);
  // PATCH-260. The outline we last CALLED update() with, ignoring
  // `elementOverrides`. An edit that only moves/resizes/deletes an element changes
  // nothing AntV must redraw, so `update` must be skipped: AntV re-fits the SVG
  // to the moved content and PictureStage then re-fits the user's zoom/shift
  // under the pointer after every edit.
  const lastUpdatedOutlineRef = useRef<string | null>(null);

  /**
   * PATCH-260. The one place an outline edit leaves this renderer. It records the
   * latest outline synchronously (so the next emitter never reads a stale props
   * snapshot), stamps the source for live debugging, and forwards it upward.
   */
  const emitOutline = React.useCallback(
    (next: VisualOutline, source: 'element-editor' | 'antv-change' | 'antv-button' | 'mindmap-handle') => {
      outlineRef.current = next;
      const container = containerRef.current;
      if (container) {
        container.setAttribute('data-ai-last-emit', source);
        container.setAttribute('data-ai-outline-overrides', String(Object.keys(next.elementOverrides?.items ?? {}).length));
      }
      editRef.current?.onChange(next);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setPhase('loading');
    setHandles([]);
    let instance: AntvInstance | null = null;
    const editable = Boolean(editRef.current);

    const decorate = () => {
      if (!cancelled && editable) decorateAntvButtons(container);
    };
    // PATCH-260. Re-apply the user's element overrides after every draw, also
    // when the picture is not editable (board, thumbnails, preview).
    const applyOverrides = () => {
      if (!cancelled) applyElementOverrides(container, outlineRef.current.elementOverrides, templateName);
    };
    // PATCH-260 fix. AntV re-creates `<use>`/`<foreignObject>` nodes when its
    // icons and text reload, which drops the transform we just wrote. Re-apply
    // once more on the next frame (and after `update`'s promise, below).
    const applyOverridesSoon = () => {
      applyOverrides();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(applyOverrides);
    };
    const recompute = () => {
      if (cancelled) return;
      if (!editable || !isMindmap) {
        setHandles([]);
        return;
      }
      setHandles(
        buildAntvMindmapHandles(container, outlineRef.current, templateName, (next) =>
          emitOutline(next, 'mindmap-handle'),
        ),
      );
    };

    // PATCH-243. AntV's own +/− buttons arrive hidden; a single delegated click
    // maps them to an outline edit. Only wired in editable mode.
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest?.(
        '[data-element-type="btn-add"], [data-element-type="btn-remove"]',
      );
      if (!button) return;
      const op: AntvButtonOp =
        button.getAttribute('data-element-type') === 'btn-add' ? 'add' : 'remove';
      const indexes = parseAntvIndexes(button.getAttribute('data-indexes'));
      const next = applyAntvButton(outlineRef.current, indexes, op, templateName);
      if (next === outlineRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      emitOutline(next, 'antv-button');
    };
    if (editable) container.addEventListener('click', handleClick);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => recompute());
    resizeObserver?.observe(container);

    // PATCH-245. PictureStage drives the SVG's viewBox; our PATCH-243 mind-map
    // handles are percent-positioned inside that viewBox, so recompute them on
    // every viewBox change (no `onChange`: it is not outline data).
    const viewObserver =
      editable && isMindmap && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => recompute())
        : null;
    viewObserver?.observe(container, {
      attributes: true,
      subtree: true,
      attributeFilter: ['viewBox'],
    });

    // The adapter (setup + our icons) is itself lazy: it joins the engine chunk
    // instead of the main bundle, and only for a page that shows a picture.
    import('@/lib/ai/antv/load')
      .then(({ loadAntv }) => loadAntv())
      .then((mod) => {
        if (cancelled) return;
        container.innerHTML = '';
        // PATCH-245. Inside the stage the picture's zoom/pan is ours, so the
        // engine keeps only the editing interactions (ZoomWheel/DragCanvas off).
        const interactions = editable ? stageInteractions(mod) : [];
        const options: Record<string, unknown> = {
          ...toAntvOptions(outlineRef.current, templateName, data.theme, data.style),
          container,
          width: '100%',
          height: 'auto',
          editable,
        };
        if (interactions.length) options.interactions = interactions;
        const InfographicCtor = mod.Infographic as unknown as new (
          options: Record<string, unknown>,
        ) => AntvInstance;
        instance = new InfographicCtor(options);
        instance.on('error', () => {
          if (!cancelled) setPhase('failed');
        });
        instance.on('rendered', () => {
          decorate();
          recompute();
          applyOverridesSoon();
        });
        instance.on('loaded', () => {
          if (cancelled) return;
          if (editable) {
            if (isMindmap) container.setAttribute('data-antv-mindmap-overlay', '');
            else container.setAttribute('data-antv-editable', '');
          }
          decorate();
          recompute();
          applyOverridesSoon();
          setPhase('done');
        });
        if (editable) {
          instance.on('options:change', (event) => {
            // PATCH-260. AntV fires `options:change` when WE paint (we set a
            // `transform` on its elements) or when a click/selection happens.
            // Compare the engine's reported options against the last thing we
            // drew: an unchanged payload is not an edit and must emit nothing.
            const serialized = JSON.stringify(
              (event as { options?: unknown } | null | undefined)?.options ?? null,
            );
            if (serialized === lastDrawnRef.current) return;
            const next = applyAntvChange(outlineRef.current, templateName, event as AntvChangeEvent);
            // PATCH-244: an unmapped toolbar action must not trigger a redraw
            // from the unchanged outline, which would wipe what AntV just drew.
            if (outlinesEqual(next, outlineRef.current)) return;
            emitOutline(next, 'antv-change');
          });
        }
        instanceRef.current = instance;
        // PATCH-260. Record the drawn outline (without overrides) so the first
        // overrides-only commit already skips the redundant update().
        lastUpdatedOutlineRef.current = JSON.stringify(withoutElementOverrides(outlineRef.current));
        instance.render();
        applyOverridesSoon();
      })
      .catch(() => {
        if (!cancelled) setPhase('failed');
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      viewObserver?.disconnect();
      container.removeEventListener('click', handleClick);
      container.removeAttribute('data-antv-editable');
      container.removeAttribute('data-antv-mindmap-overlay');
      instance?.destroy();
      if (instanceRef.current === instance) instanceRef.current = null;
    };
    // Re-created only when the engine input changes; the outline edits go through
    // `update` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, data.theme, data.style, Boolean(edit)]);

  // Outline changes re-render through update(). PATCH-260: an edit that only
  // changes `elementOverrides` is NOT an engine data change -- skip update() and
  // re-apply the overrides to the current DOM, so AntV never re-fits its viewBox
  // and the user's zoom/position stays put.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const container = containerRef.current;
    const reapply = () => {
      if (container) applyElementOverrides(container, outlineRef.current.elementOverrides, templateName);
    };
    if (container) {
      container.setAttribute('data-ai-outline-overrides', String(Object.keys(data.outline.elementOverrides?.items ?? {}).length));
    }

    const comparable = JSON.stringify(withoutElementOverrides(data.outline));
    const overridesOnly = lastUpdatedOutlineRef.current !== null && comparable === lastUpdatedOutlineRef.current;
    if (overridesOnly) {
      // Same content, only the element overrides moved: repaint the DOM only.
      reapply();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reapply);
      return;
    }
    lastUpdatedOutlineRef.current = comparable;

    // PATCH-260 fix. AntV rewrites the SVG on update and then re-creates its
    // icon/text nodes as resources load, so re-apply the overrides now, after
    // update's promise (if any) and once more on the next frame.
    const options = toAntvOptions(data.outline, templateName, data.theme, data.style);
    // PATCH-260. Remember what we drew so an `options:change` echoing it back
    // (AntV reacting to our own paint) is recognised as "no data change".
    lastDrawnRef.current = JSON.stringify(options);
    const result = instance.update(options);
    reapply();
    if (result && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).then(reapply, reapply);
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reapply);
  }, [data.outline, templateName, data.theme, data.style]);

  return (
    <div
      data-ai-theme-background={theme.id}
      data-ai-render-state={phase}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      {edit && <style data-antv-editable-css="true">{ANTV_EDIT_CSS}</style>}
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>
            infographic
          </div>
          {/* The title is NOT printed here: AntV draws `data.title` inside the
              picture, and that is the one shown and edited on the picture. */}
          {data.explanation && <p className="mt-2 text-sm" style={{ color: theme.text }}>{data.explanation}</p>}
        </div>
        {phase === 'loading' && (
          <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-400">
            Rendering picture…
          </div>
        )}
        {phase === 'failed' && (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-gray-400">
            This picture could not be drawn.
          </div>
        )}
        <div className="group relative w-full">
          <div
            ref={containerRef}
            data-antv-container={templateName}
            data-ai-outline-overrides={String(Object.keys(data.outline.elementOverrides?.items ?? {}).length)}
            className="w-full"
          />
          {edit && isMindmap && handles.length > 0 && <PictureEditOverlay handles={handles} />}
          {edit && (
            <AntvElementEditor
              containerRef={containerRef}
              template={templateName}
              outline={data.outline}
              onChange={(next) => emitOutline(next, 'element-editor')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default AntvInfographicRenderer;
