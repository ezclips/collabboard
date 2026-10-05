/**
 * PATCH-278 B / PATCH-284. Turns a rendered AntV picture -- or a `PictureScene`
 * the app built without a DOM -- into exactly the payload `DrawingEditor.onSave`
 * produces, so the picture can be saved as an ordinary drawing post and opened
 * for hand editing. The field names are the ones `DrawingEditor.tsx` writes:
 * `drawingData`, `drawingAppState`, `drawingFiles`, `previewUrl`, `title` (plus
 * the `size` the caller places the post with).
 */

import { convertAntvSvg } from './index';
import { loadExcalidraw } from './loadExcalidraw';
import type { PictureScene } from './scene';
import { alignTextElements, toSkeleton, type AlignableElement } from './toSkeleton';

export interface DrawingPostData {
  drawingData: string;
  drawingAppState: string;
  drawingFiles: string;
  /** A `data:image/svg+xml;base64,` URL, the same preview DrawingEditor builds. */
  previewUrl: string;
  title?: string;
  size: { width: number; height: number };
}

export interface BuildDrawingPostOptions {
  /** The picture's real ground; becomes the drawing's `viewBackgroundColor`. */
  background: string;
  title?: string;
  /** Pill handling for the scene path; forwarded to `toSkeleton`. */
  pill?: 'rectangle' | 'polygon';
}

/** Thrown when a picture cannot become a drawing at all. */
export class DrawingConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingConversionError';
  }
}

const PREVIEW_WIDTH = 500;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 900;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * PATCH-284. The scene-based core: builds the Excalidraw elements from a
 * `PictureScene`, exports the preview and assembles `DrawingPostData`. A drawn
 * picture reaches this without ever round-tripping through the DOM.
 */
export async function buildDrawingPostDataFromScene(
  scene: PictureScene,
  opts: BuildDrawingPostOptions,
): Promise<DrawingPostData> {
  if (scene.elements.length === 0) {
    throw new DrawingConversionError('The picture has nothing to convert');
  }
  const { elements: skeleton, files } = toSkeleton(scene, { pill: opts.pill });
  if (!skeleton.length) {
    throw new DrawingConversionError('The picture has nothing to convert');
  }

  const { convertToExcalidrawElements, exportToSvg } = await loadExcalidraw();
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
  alignTextElements(elements as unknown as AlignableElement[], scene);

  const width = scene.width > 0 ? scene.width : PREVIEW_WIDTH;
  const height = scene.height > 0 ? scene.height : PREVIEW_WIDTH;
  const size = {
    width: PREVIEW_WIDTH,
    height: clamp(Math.round((PREVIEW_WIDTH * height) / width), MIN_HEIGHT, MAX_HEIGHT),
  };

  const previewSvg = await exportToSvg({
    elements,
    appState: {
      exportWithDarkMode: false,
      // PATCH-222: a transparent export, so a frameless drawing shows the
      // board through it. Same flags DrawingEditor uses on save.
      exportBackground: false,
      viewBackgroundColor: '#ffffff',
    },
    files,
  });
  const svgString = new XMLSerializer().serializeToString(previewSvg);
  const previewUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;

  return {
    drawingData: JSON.stringify(elements),
    drawingAppState: JSON.stringify({ viewBackgroundColor: opts.background }),
    drawingFiles: JSON.stringify(files),
    previewUrl,
    title: opts.title,
    size,
  };
}

/**
 * Reads `svg` into a scene and converts it. Throws `DrawingConversionError`
 * when the svg is missing or the conversion yields no elements.
 */
export async function buildDrawingPostData(
  svg: SVGSVGElement | null,
  opts: BuildDrawingPostOptions,
): Promise<DrawingPostData> {
  if (!svg) {
    throw new DrawingConversionError('No picture to convert');
  }
  const { scene } = await convertAntvSvg(svg, { background: opts.background });
  return buildDrawingPostDataFromScene(scene, opts);
}
