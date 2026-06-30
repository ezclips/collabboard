"use client";

import type { Padlet } from "@/types/collabboard";
import type { ResolvedSlidePadlet } from "@/components/presentation/slide-renderer/types";
import { resolveRuntimeContainerChildren } from "./resolveRuntimeContainerChildren";
import { getImg, getVideoEmbedSrc } from "./runtimeChildCardUtils";

export type RuntimeVisiblePadletItem =
  | {
      kind: "resolved";
      key: string;
      localX: number;
      localY: number;
      width: number;
      height: number;
      zIndex: number;
      padlet: Padlet;
      allPadlets: Padlet[];
    }
  | {
      kind: "derived-container-child";
      key: string;
      localX: number;
      localY: number;
      width: number;
      height: number;
      zIndex: number;
      padlet: Padlet;
    };

type ChildSlotKind = "media" | "image" | "structured" | "text";

type ChildSlotFrame = {
  localX: number;
  width: number;
  height: number;
};

function getChildSlotKind(child: Padlet): ChildSlotKind {
  const normalizedType = String(child.type ?? "").trim().toLowerCase();

  if (normalizedType === "link") {
    const videoSrc = getVideoEmbedSrc(child.metadata?.linkUrl);
    if (videoSrc) {
      return "media"; // video embed keeps wide slot
    }
  }

  const isPureImage =
    normalizedType === "image" ||
    normalizedType === "file" ||
    normalizedType === "card" ||
    normalizedType === "drawing" ||
    Boolean(getImg(child));

  if (isPureImage) {
    return "image"; // aspect-ratio-driven slot, not full-width card row
  }

  if (normalizedType === "todo" || normalizedType === "table") {
    return "structured";
  }

  return "text";
}

function getChildHeights(children: Padlet[], frameHeight: number): number[] {
  const paddingY = 12;
  const gap = 8;
  const gapTotal = gap * Math.max(children.length - 1, 0);
  const availableHeight = Math.max(frameHeight - paddingY * 2 - gapTotal, 72);
  const kinds = children.map(getChildSlotKind);

  if (children.length === 1 && kinds[0] === "media") {
    return [availableHeight];
  }

  if (children.length === 1 && kinds[0] === "image") {
    return [492];
  }

  const minimums = kinds.map((kind) => {
    if (kind === "media" || kind === "image") return 140;
    if (kind === "structured") return 104;
    return 88;
  });

  const extras = kinds.map((kind) => {
    if (kind === "media" || kind === "image") return 1.8;
    if (kind === "structured") return 1.1;
    return 0.7;
  });

  const totalMinimum = minimums.reduce((sum, value) => sum + value, 0);

  if (totalMinimum >= availableHeight) {
    const shrinkRatio = availableHeight / totalMinimum;
    const scaled = minimums.map((value) => Math.max(72, Math.floor(value * shrinkRatio)));
    let used = scaled.reduce((sum, value) => sum + value, 0);
    let remaining = Math.max(availableHeight - used, 0);

    for (let index = 0; remaining > 0 && index < scaled.length; index += 1) {
      scaled[index] += 1;
      remaining -= 1;
    }

    return scaled;
  }

  const heights = [...minimums];
  const totalExtraWeight = extras.reduce((sum, value) => sum + value, 0);
  let remaining = availableHeight - totalMinimum;

  extras.forEach((weight, index) => {
    const addition = Math.floor((remaining * weight) / totalExtraWeight);
    heights[index] += addition;
  });

  let used = heights.reduce((sum, value) => sum + value, 0);
  let leftover = Math.max(availableHeight - used, 0);
  let cursor = 0;

  while (leftover > 0 && heights.length > 0) {
    heights[cursor % heights.length] += 1;
    leftover -= 1;
    cursor += 1;
  }

  return heights;
}

function getChildAspectRatio(child: Padlet, slotKind: ChildSlotKind): number {
  if (slotKind === "media") {
    const normalizedType = String(child.type ?? "").trim().toLowerCase();
    if (normalizedType === "link" && getVideoEmbedSrc(child.metadata?.linkUrl)) {
      return 16 / 9;
    }
  }

  const width = Number(child.width);
  const height = Number(child.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height;
  }

  if (slotKind === "media") return 1;
  if (slotKind === "image") return 325 / 492; // portrait fallback (~2:3)
  return 1.4;
}

function getChildFrames(children: Padlet[], frameWidth: number, frameHeight: number): ChildSlotFrame[] {
  const paddingX = 12;
  const paddingY = 12;
  const innerWidth = Math.max(frameWidth - paddingX * 2, 120);
  const childHeights = getChildHeights(children, frameHeight);
  const kinds = children.map(getChildSlotKind);

  return children.map((child, index) => {
    const kind = kinds[index];
    const height = childHeights[index] ?? 72;

    if (kind === "image") {
      const slotWidth = 325;
      const slotHeight = 492;
      const offsetX = paddingX + Math.floor((innerWidth - slotWidth) / 2);
      return {
        localX: offsetX,
        width: slotWidth,
        height: slotHeight,
      };
    }

    return {
      localX: paddingX,
      width: innerWidth,
      height,
    };
  });
}

export function expandRuntimeContainerItems(
  resolvedPadlets: ResolvedSlidePadlet[],
  allPadlets: Padlet[],
): RuntimeVisiblePadletItem[] {
  const independentlyResolvedIds = new Set(resolvedPadlets.map((item) => item.padlet.id));
  const expanded: RuntimeVisiblePadletItem[] = [];

  for (const item of resolvedPadlets) {
    const normalizedType = String(item.padlet.type ?? "").trim().toLowerCase();
    if (normalizedType !== "container") {
      expanded.push({
        kind: "resolved",
        key: item.padlet.id,
        localX: item.localX,
        localY: item.localY,
        width: item.width,
        height: item.height,
        zIndex: item.zIndex,
        padlet: item.padlet,
        allPadlets,
      });
      continue;
    }

    const children = resolveRuntimeContainerChildren(item.padlet, allPadlets).filter(
      (child) => !independentlyResolvedIds.has(child.id),
    );

    if (children.length === 0) {
      continue;
    }

    const paddingY = 12;
    const gap = 8;
    const childFrames = getChildFrames(children, item.width, item.height);
    let currentLocalY = item.localY + paddingY;

    children.forEach((child, index) => {
      const frame = childFrames[index] ?? { localX: 12, width: Math.max(item.width - 24, 120), height: 72 };
      expanded.push({
        kind: "derived-container-child",
        key: `${item.padlet.id}::${child.id}`,
        localX: item.localX + frame.localX,
        localY: currentLocalY,
        width: frame.width,
        height: frame.height,
        zIndex: item.zIndex,
        padlet: child,
      });
      currentLocalY += frame.height + gap;
    });
  }

  return expanded;
}
