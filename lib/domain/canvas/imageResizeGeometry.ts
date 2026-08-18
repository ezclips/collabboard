export interface ImageAspectResizeInput {
  outerWidth: number;
  imageAspectRatio: number;
  chromeHeight: number;
  chromeWidth?: number;
  minOuterWidth?: number;
}

export interface ImageAspectResizeResult {
  width: number;
  height: number;
  mediaWidth: number;
  mediaHeight: number;
}

export function resizeImageOuterBoxToAspect({
  outerWidth,
  imageAspectRatio,
  chromeHeight,
  chromeWidth = 0,
  minOuterWidth = 0,
}: ImageAspectResizeInput): ImageAspectResizeResult | null {
  if (!Number.isFinite(outerWidth) || !Number.isFinite(imageAspectRatio) || imageAspectRatio <= 0) {
    return null;
  }

  const width = Math.max(outerWidth, minOuterWidth);
  const safeChromeWidth = Number.isFinite(chromeWidth) ? Math.max(chromeWidth, 0) : 0;
  const safeChromeHeight = Number.isFinite(chromeHeight) ? Math.max(chromeHeight, 0) : 0;
  const mediaWidth = Math.max(width - safeChromeWidth, 1);
  const mediaHeight = mediaWidth / imageAspectRatio;

  return {
    width,
    height: safeChromeHeight + mediaHeight,
    mediaWidth,
    mediaHeight,
  };
}
