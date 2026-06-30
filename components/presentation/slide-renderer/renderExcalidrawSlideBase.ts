/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FrameSlide, RenderSlideOptions } from "@/components/presentation/PresentationPanel";

type RenderExcalidrawSlideBaseArgs = {
  elements: readonly any[];
  frameElement: any | null;
  files: any;
  slide: FrameSlide;
  opts: RenderSlideOptions;
  includeBackground: boolean;
};

export async function renderExcalidrawSlideBase({
  elements,
  frameElement,
  files,
  opts,
  includeBackground,
}: RenderExcalidrawSlideBaseArgs): Promise<HTMLCanvasElement | null> {
  if (!frameElement && elements.length === 0 && !includeBackground) {
    return null;
  }

  const { exportToCanvas } = await import("@excalidraw/excalidraw");

  return exportToCanvas({
    elements: elements as any[],
    appState: {
      exportBackground: includeBackground,
      viewBackgroundColor: includeBackground ? (opts.background ?? "#ffffff") : "transparent",
      exportWithDarkMode: false,
    } as any,
    files: files ?? null,
    exportingFrame: frameElement as any,
    getDimensions: (width: number, height: number) => {
      const scale = opts.scale ?? 2;
      return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        scale,
      };
    },
    exportPadding: opts.paddingPx ?? 0,
  });
}
