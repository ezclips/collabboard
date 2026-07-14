import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import { planSlideComposition } from "@/components/presentation/slide-renderer/planSlideComposition";
import { resolveSlidePadlets } from "@/components/presentation/slide-renderer/resolveSlidePadlets";
import { expandRuntimeContainerItems } from "@/components/presentation/runtime-slide/expandRuntimeContainerItems";
import type { Padlet } from "@/types/collabboard";

export type PresentationBridgeViolationCode =
  | "slide-frame-deleted"
  | "slide-order-mismatch-current"
  | "slide-title-empty-current"
  | "slide-embeddable-overlap-fallback"
  | "slide-embeddable-missing-padlet"
  | "slide-native-member-outside-frame"
  | "slide-orientation-zero-size"
  | "slide-thumbnail-key-missing"
  | "slide-runtime-container-child-derived"
  | "slide-merge-zero-size-current";

export type PresentationBridgeDiagnostic = {
  code: PresentationBridgeViolationCode;
  slideId: string | null;
  frameId: string | null;
  frameName: string | null;
  orderIndex: number | null;
  sortedIndex: number | null;
  orientation: string | null;
  width: number | null;
  height: number | null;
  elementId: string | null;
  padletId: string | null;
  embeddableId: string | null;
  zIndex: number | null;
  source: string;
  message: string;
};

type ElementLike = {
  id?: string | null;
  type?: string | null;
  name?: string | null;
  isDeleted?: boolean | null;
  frameId?: string | null;
  link?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
};

type MergeInput = {
  width: number;
  height: number;
  layerCount?: number;
  drawableLayerCount?: number;
};

const numberOrZero = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

const diagnostic = (
  code: PresentationBridgeViolationCode,
  overrides: Partial<PresentationBridgeDiagnostic>,
): PresentationBridgeDiagnostic => ({
  code,
  slideId: null,
  frameId: null,
  frameName: null,
  orderIndex: null,
  sortedIndex: null,
  orientation: null,
  width: null,
  height: null,
  elementId: null,
  padletId: null,
  embeddableId: null,
  zIndex: null,
  source: "presentation-bridge",
  message: code,
  ...overrides,
});

export function characterizeFrameSlides(elements: readonly ElementLike[]): FrameSlide[] {
  return elements
    .filter((element) => element.type === "frame" && !element.isDeleted && element.id)
    .map((element) => ({
      id: String(element.id),
      name: element.name ?? null,
      x: numberOrZero(element.x),
      y: numberOrZero(element.y),
      width: numberOrZero(element.width),
      height: numberOrZero(element.height),
    }));
}

export function characterizeSlideOrdering(slides: readonly FrameSlide[]) {
  const source = slides.map((slide, orderIndex) => ({ slide, orderIndex }));
  const sorted = [...source].sort((a, b) => {
    const ao = a.slide.order ?? Number.POSITIVE_INFINITY;
    const bo = b.slide.order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    if (a.slide.y !== b.slide.y) return a.slide.y - b.slide.y;
    return a.slide.x - b.slide.x;
  });
  return sorted.map(({ slide, orderIndex }, sortedIndex) => ({
    slideId: slide.id,
    orderIndex,
    sortedIndex,
    sameIndex: orderIndex === sortedIndex,
  }));
}

export function characterizeSlideTitleFallback(slides: readonly FrameSlide[]) {
  return slides.map((slide, index) => ({
    slideId: slide.id,
    rawTitle: slide.name ?? null,
    renderedTitle: slide.name?.trim() || `Slide ${index + 1}`,
  }));
}

export function characterizeSlideOrientation(slides: readonly FrameSlide[]) {
  return slides.map((slide) => ({
    slideId: slide.id,
    width: slide.width,
    height: slide.height,
    orientation: slide.width <= 0 || slide.height <= 0
      ? "zero-size"
      : slide.width >= slide.height
        ? "landscape"
        : "portrait",
  }));
}

export function characterizeSlideComposition(
  slideFrame: FrameSlide,
  elements: readonly ElementLike[],
  padlets: Padlet[],
) {
  const resolvedPadlets = resolveSlidePadlets(slideFrame, elements, padlets);
  const plan = planSlideComposition(slideFrame, elements, padlets);
  return {
    frameId: slideFrame.id,
    resolvedPadlets: resolvedPadlets.map((entry) => ({
      padletId: entry.padlet.id,
      embeddableId: entry.embeddable.id,
      localX: entry.localX,
      localY: entry.localY,
      width: entry.width,
      height: entry.height,
      zIndex: entry.zIndex,
      usedOverlapFallback: !entry.embeddable.frameId,
    })),
    nativeBelowIds: plan.nativeBelowElements.map((element) => element.id),
    nativeAboveIds: plan.nativeAboveElements.map((element) => element.id),
    frameElementId: plan.frameElement?.id ?? null,
  };
}

export function characterizeThumbnailKeys(slides: readonly FrameSlide[]) {
  return slides.map((slide) => ({
    slideId: slide.id,
    key: slide.renderSignature ?? `${slide.x},${slide.y},${slide.width},${slide.height},${slide.contentVersion ?? 0}`,
    source: slide.renderSignature ? "renderSignature" : "geometry-contentVersion",
  }));
}

export function characterizeRuntimeContainerExpansion(
  resolvedPadlets: Array<{ padlet: Padlet; localX: number; localY: number; width: number; height: number; zIndex: number }>,
  padlets: Padlet[],
) {
  return expandRuntimeContainerItems(resolvedPadlets.map((item) => ({
    padlet: item.padlet,
    embeddable: { id: `${item.padlet.id}-embeddable` },
    localX: item.localX,
    localY: item.localY,
    width: item.width,
    height: item.height,
    zIndex: item.zIndex,
  })), padlets).map((item) => ({
    kind: item.kind,
    key: item.key,
    padletId: item.padlet.id,
    zIndex: item.zIndex,
  }));
}

export function characterizeMergeSlideLayersInput(args: MergeInput) {
  return {
    width: args.width,
    height: args.height,
    layerCount: args.layerCount ?? 0,
    drawableLayerCount: args.drawableLayerCount ?? 0,
    zeroSize: args.width <= 0 || args.height <= 0,
    currentBehavior: (args.drawableLayerCount ?? 0) === 0
      ? "returns-null"
      : "creates-canvas-with-supplied-size",
  };
}

export function validatePresentationBridgeSnapshot(snapshot: {
  elements?: readonly ElementLike[];
  slides?: readonly FrameSlide[];
  padlets?: Padlet[];
  mergeInputs?: readonly MergeInput[];
}) {
  const elements = snapshot.elements ?? [];
  const slides = snapshot.slides ?? characterizeFrameSlides(elements);
  const padlets = snapshot.padlets ?? [];
  const diagnostics: PresentationBridgeDiagnostic[] = [];

  for (const element of elements) {
    if (element.type === "frame" && element.isDeleted) {
      diagnostics.push(diagnostic("slide-frame-deleted", {
        slideId: element.id ?? null,
        frameId: element.id ?? null,
        frameName: element.name ?? null,
      }));
    }
  }
  for (const row of characterizeSlideOrdering(slides)) {
    if (!row.sameIndex) {
      diagnostics.push(diagnostic("slide-order-mismatch-current", {
        slideId: row.slideId,
        orderIndex: row.orderIndex,
        sortedIndex: row.sortedIndex,
      }));
    }
  }
  for (const slide of slides) {
    if (!slide.name?.trim()) {
      diagnostics.push(diagnostic("slide-title-empty-current", {
        slideId: slide.id,
        frameId: slide.id,
        frameName: slide.name ?? null,
      }));
    }
  }
  for (const orientation of characterizeSlideOrientation(slides)) {
    if (orientation.orientation === "zero-size") {
      diagnostics.push(diagnostic("slide-orientation-zero-size", {
        slideId: orientation.slideId,
        orientation: orientation.orientation,
        width: orientation.width,
        height: orientation.height,
      }));
    }
  }
  for (const slide of slides) {
    const composition = characterizeSlideComposition(slide, elements, padlets);
    for (const entry of composition.resolvedPadlets) {
      if (entry.usedOverlapFallback) {
        diagnostics.push(diagnostic("slide-embeddable-overlap-fallback", {
          slideId: slide.id,
          frameId: slide.id,
          padletId: entry.padletId,
          embeddableId: entry.embeddableId,
          zIndex: entry.zIndex,
        }));
      }
    }
    for (const element of elements) {
      if (
        element.type === "embeddable" &&
        element.link?.startsWith("padlet://") &&
        !padlets.some((padlet) => `padlet://${padlet.id}` === element.link)
      ) {
        diagnostics.push(diagnostic("slide-embeddable-missing-padlet", {
          slideId: slide.id,
          frameId: slide.id,
          elementId: element.id ?? null,
          embeddableId: element.id ?? null,
        }));
      }
      if (element.frameId && element.frameId !== slide.id && element.type !== "frame") {
        diagnostics.push(diagnostic("slide-native-member-outside-frame", {
          slideId: slide.id,
          frameId: slide.id,
          elementId: element.id ?? null,
        }));
      }
    }
  }
  for (const key of characterizeThumbnailKeys(slides)) {
    if (!key.key) {
      diagnostics.push(diagnostic("slide-thumbnail-key-missing", {
        slideId: key.slideId,
      }));
    }
  }
  for (const item of characterizeRuntimeContainerExpansion([], padlets)) {
    if (item.kind === "derived-container-child") {
      diagnostics.push(diagnostic("slide-runtime-container-child-derived", {
        padletId: item.padletId,
      }));
    }
  }
  for (const input of snapshot.mergeInputs ?? []) {
    const characterized = characterizeMergeSlideLayersInput(input);
    if (characterized.zeroSize) {
      diagnostics.push(diagnostic("slide-merge-zero-size-current", {
        width: characterized.width,
        height: characterized.height,
      }));
    }
  }
  return diagnostics;
}

export function summarizePresentationBridgeSnapshot(snapshot: Parameters<typeof validatePresentationBridgeSnapshot>[0]) {
  const slides = snapshot.slides ?? characterizeFrameSlides(snapshot.elements ?? []);
  const diagnostics = validatePresentationBridgeSnapshot(snapshot);
  return {
    slideCount: slides.length,
    diagnosticCount: diagnostics.length,
    orientations: characterizeSlideOrientation(slides),
    ordering: characterizeSlideOrdering(slides),
    titleFallbacks: characterizeSlideTitleFallback(slides),
    thumbnailKeys: characterizeThumbnailKeys(slides),
    violationCodes: diagnostics.map((row) => row.code),
    diagnostics,
  };
}
