"use client";

import React from "react";
import type { Padlet } from "@/types/collabboard";
import type { ResolvedSlidePadlet } from "@/components/presentation/slide-renderer/types";
import RuntimePresentationPadletCard from "./RuntimePresentationPadletCard";
import RuntimeContainerChildCard from "./RuntimeContainerChildCard";
import { expandRuntimeContainerItems } from "./expandRuntimeContainerItems";

type RuntimePadletLayerProps = {
  resolvedPadlets: ResolvedSlidePadlet[];
  /** CSS scale applied to the whole slide container (slide-coords → viewport pixels) */
  scale: number;
  /** Width of the slide frame in scene units */
  slideWidth: number;
  /** Height of the slide frame in scene units */
  slideHeight: number;
  allPadlets: Padlet[];
};

/**
 * Renders live padlet cards absolutely positioned within the slide coordinate space.
 *
 * The outer wrapper is sized to `slideWidth × slideHeight` in unscaled CSS pixels
 * and then CSS-scaled to the viewport via `transform: scale(scale)`.
 * This preserves font sizes, border radii, and all other CSS properties
 * so that card rendering quality is independent of the viewport scale.
 *
 * Overflow is visible intentionally—the parent slide container clips with overflow:hidden.
 */
export function RuntimePadletLayer({
  resolvedPadlets,
  scale,
  slideWidth,
  slideHeight,
  allPadlets,
}: RuntimePadletLayerProps) {
  if (resolvedPadlets.length === 0) return null;
  const visibleItems = expandRuntimeContainerItems(resolvedPadlets, allPadlets);

  if (visibleItems.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${slideWidth}px`,
        height: `${slideHeight}px`,
        transformOrigin: "top left",
        transform: `scale(${scale})`,
        pointerEvents: "auto",
        // creates a new stacking context so z-index values are relative within this layer
        zIndex: 2,
        isolation: "isolate",
      }}
    >
      {visibleItems.map((item) => (
        <div
          key={item.key}
          style={{
            position: "absolute",
            left: `${item.localX}px`,
            top: `${item.localY}px`,
            width: `${item.width}px`,
            height: `${item.height}px`,
            zIndex: item.zIndex,
            overflow: "hidden",
          }}
        >
          {item.kind === "derived-container-child" ? (
            <RuntimeContainerChildCard padlet={item.padlet} />
          ) : (
            <RuntimePresentationPadletCard padlet={item.padlet} allPadlets={item.allPadlets} />
          )}
        </div>
      ))}
    </div>
  );
}
