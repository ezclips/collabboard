/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import type { Padlet } from "@/types/collabboard";
import type { CanvasLine } from "@/types/collabboard";
import { resolveCanvasLineSlideMemberships } from "@/lib/infra/drawing/canvasLineSlideMembership";
import { buildCanvasLineRenderPayload } from "./renderCanvasLinePrimitive";
import { resolveSlidePadlets } from "./resolveSlidePadlets";
import type { SlideCompositionPlan } from "./types";

function isNativeFrameMember(element: any, slideFrame: FrameSlide): boolean {
  if (!element || element.isDeleted) return false;
  if (element.id === slideFrame.id) return false;
  if (element.type === "embeddable" && typeof element.link === "string" && element.link.startsWith("padlet://")) {
    return false;
  }
  return element.frameId === slideFrame.id;
}

export function planSlideComposition(
  slideFrame: FrameSlide,
  sceneElements: readonly any[],
  availablePadlets: Padlet[],
  canvasLines: readonly CanvasLine[] = [],
): SlideCompositionPlan {
  const activeElements = sceneElements.filter((element) => !element?.isDeleted);
  const frameElement = activeElements.find((element) => element.id === slideFrame.id) ?? null;
  const resolvedPadlets = resolveSlidePadlets(slideFrame, activeElements, availablePadlets);
  const nativeFrameElements = activeElements.filter((element) => isNativeFrameMember(element, slideFrame));
  const slideLocalOrder = activeElements
    .map((element, sceneIndex) => ({ element, sceneIndex }))
    .filter(({ element }) => (
      isNativeFrameMember(element, slideFrame)
      || resolvedPadlets.some((entry) => entry.embeddable.id === element?.id)
    ))
    .sort((a, b) => a.sceneIndex - b.sceneIndex);
  const localIndexById = new Map(slideLocalOrder.map(({ element }, localIndex) => [element?.id, localIndex]));
  const frames = activeElements
    .filter((element: any) => element.type === "frame" && !element.isDeleted)
    .map((element: any) => ({
      id: String(element.id),
      x: Number(element.x) || 0,
      y: Number(element.y) || 0,
      width: Number(element.width) || 0,
      height: Number(element.height) || 0,
    }));
  const canvasLinePayloads = resolveCanvasLineSlideMemberships(
    canvasLines.filter((line) => !(line as { isDeleted?: boolean }).isDeleted),
    frames,
    (diagnostic) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[canvas-line-slide-membership]", diagnostic);
      }
    },
  )
    .filter((entry) => entry.frameId === slideFrame.id)
    .map((entry) => {
      const payload = buildCanvasLineRenderPayload(entry.line, slideFrame);
      return payload ? { payload, sourceIndex: entry.sourceIndex } : null;
    })
    .filter((entry): entry is { payload: NonNullable<ReturnType<typeof buildCanvasLineRenderPayload>>; sourceIndex: number } => entry !== null)
    .sort((a, b) => {
      const zDiff = a.payload.zIndex - b.payload.zIndex;
      if (zDiff !== 0) return zDiff;
      return a.sourceIndex - b.sourceIndex;
    })
    .map((entry) => entry.payload);
  const backCanvasLinePayloads = canvasLinePayloads.filter((payload) => payload.layerPlane === "back");
  const frontCanvasLinePayloads = canvasLinePayloads.filter((payload) => payload.layerPlane === "front");

  if (resolvedPadlets.length === 0) {
    return {
      frameElement,
      nativeBelowElements: nativeFrameElements,
      backCanvasLinePayloads,
      nativeAboveElements: [],
      frontCanvasLinePayloads,
      resolvedPadlets,
    };
  }

  const firstPadletActiveIndex = Math.min(...resolvedPadlets.map((entry) => entry.zIndex));

  const nativeBelowElements = nativeFrameElements.filter((element) => {
    const localIndex = localIndexById.get(element.id);
    return typeof localIndex === "number" && localIndex < firstPadletActiveIndex;
  });

  const nativeAboveElements = nativeFrameElements.filter((element) => {
    const localIndex = localIndexById.get(element.id);
    return typeof localIndex === "number" && localIndex >= firstPadletActiveIndex;
  });

  return {
    frameElement,
    nativeBelowElements,
    backCanvasLinePayloads,
    nativeAboveElements,
    frontCanvasLinePayloads,
    resolvedPadlets,
  };
}
