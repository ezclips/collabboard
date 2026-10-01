'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import {
  applyAntvButton,
  applyAntvChange,
  isMindmapTemplate,
  toAntvOptions,
  type AntvButtonOp,
  type AntvChangeEvent,
} from '@/lib/ai/antv/mapOutline';
import { insertItem } from '@/lib/ai/infographic/edit';
import { OUTLINE_LIMITS, type VisualOutline, type VisualSide } from '@/lib/ai/outline';
import { themeById } from '@/lib/ai/visualThemes';
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
  update(options: unknown): void;
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
      onActivate: () => onChange(insertItem(outline, items.length, { side: 'left' })),
    });
    handles.push({
      key: 'add-root-right',
      kind: 'add',
      left: pctX(root.x + root.w + offset),
      top: pctY(y),
      target: 'root:right',
      onActivate: () => onChange(insertItem(outline, items.length, { side: 'right' })),
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
  const theme = themeById(data.theme);
  const templateName = data.template.slice('antv:'.length);
  const isMindmap = isMindmapTemplate(templateName);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AntvInstance | null>(null);
  const [phase, setPhase] = useState<RenderPhase>('loading');
  const [handles, setHandles] = useState<EditHandle[]>([]);

  // Keep the current outline/callback in refs so the create effect can stay
  // keyed on the template/theme and StrictMode's double-run is harmless.
  const outlineRef = useRef(data.outline);
  outlineRef.current = data.outline;
  const editRef = useRef(edit);
  editRef.current = edit;

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
    const recompute = () => {
      if (cancelled) return;
      if (!editable || !isMindmap) {
        setHandles([]);
        return;
      }
      setHandles(
        buildAntvMindmapHandles(container, outlineRef.current, templateName, (next) =>
          editRef.current?.onChange(next),
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
      editRef.current?.onChange(next);
    };
    if (editable) container.addEventListener('click', handleClick);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => recompute());
    resizeObserver?.observe(container);

    // The adapter (setup + our icons) is itself lazy: it joins the engine chunk
    // instead of the main bundle, and only for a page that shows a picture.
    import('@/lib/ai/antv/load')
      .then(({ loadAntv }) => loadAntv())
      .then((mod) => {
        if (cancelled) return;
        container.innerHTML = '';
        instance = new mod.Infographic({
          container,
          width: '100%',
          height: 'auto',
          editable,
          ...toAntvOptions(outlineRef.current, templateName, data.theme),
        }) as unknown as AntvInstance;
        instance.on('error', () => {
          if (!cancelled) setPhase('failed');
        });
        instance.on('rendered', () => {
          decorate();
          recompute();
        });
        instance.on('loaded', () => {
          if (cancelled) return;
          if (editable) {
            if (isMindmap) container.setAttribute('data-antv-mindmap-overlay', '');
            else container.setAttribute('data-antv-editable', '');
          }
          decorate();
          recompute();
          setPhase('done');
        });
        if (editable) {
          instance.on('options:change', (event) => {
            editRef.current?.onChange(
              applyAntvChange(outlineRef.current, templateName, event as AntvChangeEvent),
            );
          });
        }
        instanceRef.current = instance;
        instance.render();
      })
      .catch(() => {
        if (!cancelled) setPhase('failed');
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      container.removeEventListener('click', handleClick);
      container.removeAttribute('data-antv-editable');
      container.removeAttribute('data-antv-mindmap-overlay');
      instance?.destroy();
      if (instanceRef.current === instance) instanceRef.current = null;
    };
    // Re-created only when the engine input changes; the outline edits go through
    // `update` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, data.theme, Boolean(edit)]);

  // Outline changes (an edit committed to our data) re-render through update().
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.update(toAntvOptions(data.outline, templateName, data.theme));
  }, [data.outline, templateName, data.theme]);

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
          <div ref={containerRef} data-antv-container={templateName} className="w-full" />
          {edit && isMindmap && handles.length > 0 && <PictureEditOverlay handles={handles} />}
        </div>
      </div>
    </div>
  );
}

export default AntvInfographicRenderer;
