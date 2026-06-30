/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import type { Padlet } from "@/types/collabboard";
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
): SlideCompositionPlan {
  const activeElements = sceneElements.filter((element) => !element?.isDeleted);
  const frameElement = activeElements.find((element) => element.id === slideFrame.id) ?? null;
  const resolvedPadlets = resolveSlidePadlets(slideFrame, activeElements, availablePadlets);
  const nativeFrameElements = activeElements.filter((element) => isNativeFrameMember(element, slideFrame));

  if (resolvedPadlets.length === 0) {
    return {
      frameElement,
      nativeBelowElements: nativeFrameElements,
      nativeAboveElements: [],
      resolvedPadlets,
    };
  }

  const firstPadletIndex = Math.min(...resolvedPadlets.map((entry) => entry.zIndex));
  const lastPadletIndex = Math.max(...resolvedPadlets.map((entry) => entry.zIndex));

  const nativeBelowElements = nativeFrameElements.filter((element) => {
    const sceneIndex = sceneElements.findIndex((candidate) => candidate?.id === element.id);
    return sceneIndex >= 0 && sceneIndex < firstPadletIndex;
  });

  const nativeAboveElements = nativeFrameElements.filter((element) => {
    const sceneIndex = sceneElements.findIndex((candidate) => candidate?.id === element.id);
    return sceneIndex >= 0 && sceneIndex > lastPadletIndex;
  });

  return {
    frameElement,
    nativeBelowElements,
    nativeAboveElements,
    resolvedPadlets,
  };
}
