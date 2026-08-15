"use client";

import React, { useId, useMemo } from 'react';
import type { Padlet } from '@/types/collabboard';
import {
  createMinimapProjection,
  getMinimapDisplayBounds,
  projectWorldRect,
  type MinimapInnerRect,
} from './freeformMinimapGeometry';
import { useFreeformMinimapGeometry } from './useFreeformMinimapGeometry';
import { useFreeformMinimapViewport } from './useFreeformMinimapViewport';

const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 108;
const MINIMAP_PADDING = 8;
const MINIMAP_INNER_RECT: MinimapInnerRect = {
  left: MINIMAP_PADDING,
  top: MINIMAP_PADDING,
  width: MINIMAP_WIDTH - MINIMAP_PADDING * 2,
  height: MINIMAP_HEIGHT - MINIMAP_PADDING * 2,
};

export interface FreeformMinimapProps {
  rootPosts: readonly Padlet[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  worldOriginRef: React.RefObject<HTMLDivElement | null>;
  canvasZoom: number;
}

export default function FreeformMinimap({
  rootPosts,
  containerRef,
  worldOriginRef,
  canvasZoom,
}: FreeformMinimapProps) {
  const clipId = `freeform-minimap-${useId().replace(/:/g, '')}`;
  const items = useFreeformMinimapGeometry({
    rootPosts,
    containerRef,
    worldOriginRef,
    canvasZoom,
  });
  const viewportWorldRect = useFreeformMinimapViewport({
    containerRef,
    worldOriginRef,
    canvasZoom,
  });
  const displayBounds = useMemo(() => getMinimapDisplayBounds(items), [items]);
  const projection = useMemo(
    () => displayBounds ? createMinimapProjection(displayBounds, MINIMAP_INNER_RECT) : null,
    [displayBounds],
  );

  if (!displayBounds || !projection) return null;

  const projectedViewport = viewportWorldRect
    ? projectWorldRect(viewportWorldRect, projection)
    : null;

  return (
    <div
      data-freeform-minimap="true"
      aria-hidden="true"
      className="pointer-events-none absolute bottom-4 left-[72px] z-40 hidden h-[108px] w-[168px] overflow-hidden rounded-lg border border-border bg-background/90 shadow-md backdrop-blur-sm md:block"
    >
      <svg
        data-freeform-minimap-map="true"
        viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
        className="h-full w-full"
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={MINIMAP_INNER_RECT.left}
              y={MINIMAP_INNER_RECT.top}
              width={MINIMAP_INNER_RECT.width}
              height={MINIMAP_INNER_RECT.height}
            />
          </clipPath>
        </defs>

        <rect
          x={MINIMAP_INNER_RECT.left}
          y={MINIMAP_INNER_RECT.top}
          width={MINIMAP_INNER_RECT.width}
          height={MINIMAP_INNER_RECT.height}
          rx="3"
          className="fill-muted/40"
        />

        <g data-freeform-minimap-items="true">
          {items.map((item) => {
            const rect = projectWorldRect(item, projection);
            if (item.kind === 'comment-pin') {
              return (
                <circle
                  key={item.id}
                  data-minimap-item-id={item.id}
                  data-minimap-item-kind={item.kind}
                  cx={rect.x + rect.width / 2}
                  cy={rect.y + rect.height / 2}
                  r={Math.max(2, Math.min(4, Math.max(rect.width, rect.height) / 2))}
                  className="fill-accent-foreground/70"
                />
              );
            }
            return (
              <rect
                key={item.id}
                data-minimap-item-id={item.id}
                data-minimap-item-kind={item.kind}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx="1"
                className={item.kind === 'container'
                  ? 'fill-transparent stroke-muted-foreground/70'
                  : 'fill-muted-foreground/45'}
                strokeWidth={item.kind === 'container' ? 1.25 : undefined}
              />
            );
          })}
        </g>

        {projectedViewport && (
          <g clipPath={`url(#${clipId})`}>
            <rect
              data-freeform-minimap-viewport="true"
              x={projectedViewport.x}
              y={projectedViewport.y}
              width={projectedViewport.width}
              height={projectedViewport.height}
              rx="1.5"
              className="fill-primary/10 stroke-foreground"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
