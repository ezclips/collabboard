"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { Padlet } from '@/types/collabboard';
import { POST_RESIZE_CONSTRAINTS, isImageManuallySized } from '@/lib/domain/canvas/postResizePolicy';
import type { MinimapWorldItem, WorldRect } from './freeformMinimapGeometry';
import { isValidWorldRect } from './freeformMinimapGeometry';

type MeasuredRectMap = Record<string, WorldRect>;

function finitePositive(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function getMinimapItemKind(post: Padlet): MinimapWorldItem['kind'] {
  if (post.type === 'container') return 'container';
  if ((post.type === 'comment' || (post.type as string) === 'Comment') && post.metadata?.isCollapsed) {
    return 'comment-pin';
  }
  return 'post';
}

export function getFallbackMinimapItem(post: Padlet): MinimapWorldItem | null {
  if (!Number.isFinite(post.position_x) || !Number.isFinite(post.position_y)) return null;

  const kind = getMinimapItemKind(post);
  let width = finitePositive(post.width, 180);
  let height = finitePositive(post.height, 100);

  if (kind === 'comment-pin') {
    width = 32;
    height = 40;
  } else if (post.type === 'container') {
    width = Math.max(width, 360);
    height = Math.max(height, 150);
  } else if (post.type === 'card') {
    width = finitePositive(post.width, 180);
    height = finitePositive(post.height, 220);
  } else if (post.type === 'image') {
    // PATCH POST-RESIZE-B1.1: the SAME compatibility condition the renderer
    // uses (`isImageManuallySized`) -- a legacy Image's generic stored
    // width/height (e.g. 300x200 template defaults) is never proof of
    // intentional sizing, so the fallback must stay at the historical 360
    // presentation for exactly the same posts the renderer keeps legacy.
    // Only an explicitly-resized Image's canonical geometry feeds the
    // minimap fallback.
    const imageMin = POST_RESIZE_CONSTRAINTS.image ?? { minWidth: 100, minHeight: 100 };
    if (isImageManuallySized(post)) {
      width = Math.max(finitePositive(post.width, 360), imageMin.minWidth);
      height = Math.max(finitePositive(post.height, 100), imageMin.minHeight);
    } else {
      width = 360;
      height = 100;
    }
  } else if (post.type === 'link') {
    width = 320;
  } else if (post.type === 'ai-component') {
    width = Math.max(finitePositive(post.width, 500), 200);
    height = Math.max(finitePositive(post.height, 400), 150);
  }

  const item: MinimapWorldItem = {
    id: post.id,
    type: post.type,
    kind,
    x: post.position_x,
    y: post.position_y,
    width,
    height,
  };
  return isValidWorldRect(item) ? item : null;
}

export function resolveMinimapWorldItems(
  rootPosts: readonly Padlet[],
  measuredRects: Readonly<MeasuredRectMap>,
): MinimapWorldItem[] {
  return rootPosts.flatMap((post) => {
    const measured = measuredRects[post.id];
    const geometry = measured && isValidWorldRect(measured)
      ? measured
      : getFallbackMinimapItem(post);
    if (!geometry) return [];
    return [{
      ...geometry,
      id: post.id,
      type: post.type,
      kind: getMinimapItemKind(post),
    }];
  });
}

export function getRootMeasurementElement(root: HTMLElement, post: Padlet): HTMLElement {
  const rootRect = root.getBoundingClientRect();
  const commentRoot = root.querySelector<HTMLElement>('[data-comment-post-root="true"]');
  if ((post.type === 'comment' || (post.type as string) === 'Comment') && commentRoot) {
    return commentRoot;
  }

  const firstChild = root.firstElementChild instanceof HTMLElement ? root.firstElementChild : null;
  if (!firstChild) return root;
  const childRect = firstChild.getBoundingClientRect();
  if ((rootRect.width < 1 || rootRect.height < 1)
    || (childRect.width > rootRect.width + 8 && childRect.height > rootRect.height + 8)) {
    return firstChild;
  }
  return root;
}

export function measureRootElementWorldRect(
  root: HTMLElement,
  post: Padlet,
  worldOriginRect: Pick<DOMRect, 'left' | 'top'>,
  zoom: number,
): WorldRect | null {
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  const rect = getRootMeasurementElement(root, post).getBoundingClientRect();
  const worldRect = {
    x: (rect.left - worldOriginRect.left) / zoom,
    y: (rect.top - worldOriginRect.top) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  };
  return isValidWorldRect(worldRect) ? worldRect : null;
}

export interface UseFreeformMinimapGeometryOptions {
  rootPosts: readonly Padlet[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  worldOriginRef: React.RefObject<HTMLDivElement | null>;
  canvasZoom: number;
}

export function useFreeformMinimapGeometry({
  rootPosts,
  containerRef,
  worldOriginRef,
  canvasZoom,
}: UseFreeformMinimapGeometryOptions): MinimapWorldItem[] {
  const [measuredRects, setMeasuredRects] = useState<MeasuredRectMap>({});
  const postsByIdRef = useRef(new Map(rootPosts.map((post) => [post.id, post])));
  postsByIdRef.current = new Map(rootPosts.map((post) => [post.id, post]));
  const rootGeometryKey = rootPosts
    .map((post) => `${post.id}:${post.type}:${getMinimapItemKind(post)}`)
    .join('\u001f');

  useEffect(() => {
    const container = containerRef.current;
    const worldOrigin = worldOriginRef.current;
    if (!container || !worldOrigin || rootPosts.length === 0 || typeof ResizeObserver === 'undefined') {
      setMeasuredRects({});
      return;
    }

    const rootIdSet = new Set(rootPosts.map((post) => post.id));
    const rootsById = new Map<string, HTMLElement>();
    for (const element of container.querySelectorAll<HTMLElement>('[data-padlet-id]')) {
      const id = element.dataset.padletId;
      const parentPadlet = element.parentElement?.closest<HTMLElement>('[data-padlet-id]');
      if (id && rootIdSet.has(id) && !parentPadlet) rootsById.set(id, element);
    }

    let mounted = true;
    let frameId: number | null = null;
    let measureAll = false;
    const pendingIds = new Set<string>();

    const flushMeasurements = () => {
      frameId = null;
      if (!mounted) return;
      const originRect = worldOrigin.getBoundingClientRect();
      const ids = measureAll ? [...rootsById.keys()] : [...pendingIds];
      measureAll = false;
      pendingIds.clear();
      if (ids.length === 0) return;

      setMeasuredRects((current) => {
        const next = { ...current };
        let changed = false;
        for (const id of ids) {
          const root = rootsById.get(id);
          const post = postsByIdRef.current.get(id);
          if (!root || !post) continue;
          const measured = measureRootElementWorldRect(root, post, originRect, canvasZoom);
          if (!measured) continue;
          const previous = next[id];
          if (!previous
            || previous.x !== measured.x
            || previous.y !== measured.y
            || previous.width !== measured.width
            || previous.height !== measured.height) {
            next[id] = measured;
            changed = true;
          }
        }
        for (const id of Object.keys(next)) {
          if (!rootIdSet.has(id)) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    };

    const scheduleMeasurements = (ids?: Iterable<string>) => {
      if (ids) {
        for (const id of ids) pendingIds.add(id);
      } else {
        measureAll = true;
      }
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(flushMeasurements);
    };

    const observedElementIds = new WeakMap<Element, string>();
    const resizeObserver = new ResizeObserver((entries) => {
      const ids = new Set<string>();
      for (const entry of entries) {
        const id = observedElementIds.get(entry.target);
        if (id) ids.add(id);
      }
      scheduleMeasurements(ids);
    });

    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
        const ids = new Set<string>();
        for (const record of records) {
          const id = record.target instanceof Element
            ? observedElementIds.get(record.target)
            : undefined;
          if (id) ids.add(id);
        }
        scheduleMeasurements(ids);
      });

    for (const [id, root] of rootsById) {
      const post = postsByIdRef.current.get(id);
      if (!post) continue;
      const visualRoot = getRootMeasurementElement(root, post);
      observedElementIds.set(root, id);
      resizeObserver.observe(root);
      mutationObserver?.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
      if (visualRoot !== root) {
        observedElementIds.set(visualRoot, id);
        resizeObserver.observe(visualRoot);
      }
    }

    scheduleMeasurements();
    return () => {
      mounted = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
    };
    // Root membership and zoom change measurement normalization. Post field
    // changes are read through postsByIdRef without rebuilding observers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, worldOriginRef, rootGeometryKey, canvasZoom]);

  return useMemo(
    () => resolveMinimapWorldItems(rootPosts, measuredRects),
    [rootPosts, measuredRects],
  );
}
