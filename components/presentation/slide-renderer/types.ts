/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Padlet } from "@/types/collabboard";
import type { CanvasLine } from "@/types/collabboard";
import type { FrameSlide, RenderSlideOptions } from "@/components/presentation/PresentationPanel";
import type { CanvasLineRenderPayload } from "./renderCanvasLinePrimitive";

export type ResolvedSlidePadlet = {
  padlet: Padlet;
  embeddable: any;
  localX: number;
  localY: number;
  width: number;
  height: number;
  zIndex: number;
};

export type CreateSlideRendererArgs = {
  getSceneElements: () => readonly any[];
  getPadlets: () => Padlet[];
  getFiles: () => any;
  getCanvasLines: () => CanvasLine[];
};

export type SlideRenderHelpers = {
  renderSlideToPNG: (slide: FrameSlide, opts: RenderSlideOptions) => Promise<string>;
  getSlideRenderSignature: (slide: FrameSlide) => string;
  resolveSlidePadlets: (slide: FrameSlide, sceneElements?: readonly any[], padlets?: Padlet[]) => ResolvedSlidePadlet[];
};

export type SlideCompositionPlan = {
  frameElement: any | null;
  nativeBelowElements: any[];
  backCanvasLinePayloads: CanvasLineRenderPayload[];
  nativeAboveElements: any[];
  frontCanvasLinePayloads: CanvasLineRenderPayload[];
  resolvedPadlets: ResolvedSlidePadlet[];
};
