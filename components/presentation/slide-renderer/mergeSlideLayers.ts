type SlideLayer = HTMLCanvasElement | null | undefined;

type MergeSlideLayersArgs = {
  width: number;
  height: number;
  layers: SlideLayer[];
};

export function mergeSlideLayers({
  width,
  height,
  layers,
}: MergeSlideLayersArgs): HTMLCanvasElement | null {
  const drawableLayers = layers.filter((layer): layer is HTMLCanvasElement => Boolean(layer));
  if (drawableLayers.length === 0) return null;

  const mergedCanvas = document.createElement("canvas");
  mergedCanvas.width = width;
  mergedCanvas.height = height;

  const mergedCtx = mergedCanvas.getContext("2d");
  if (!mergedCtx) return null;

  for (const layer of drawableLayers) {
    mergedCtx.drawImage(layer, 0, 0);
  }

  return mergedCanvas;
}
