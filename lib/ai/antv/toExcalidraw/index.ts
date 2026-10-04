/**
 * PATCH-277. The public entry: `convertAntvSvg(svg, { background })` reads a
 * rendered AntV picture into a `PictureScene`, emits Excalidraw skeletons, and
 * runs Excalidraw's OWN `convertToExcalidrawElements` to build the elements the
 * editor renders. Returns the scene, the elements, the files map and a report.
 *
 * Addendum 1: this module imports Excalidraw ONLY as types. The single runtime
 * import lives in `loadExcalidraw.ts` as a lazy dynamic import, so importing
 * this module never evaluates the Excalidraw package (which would break SSR).
 */

import type { BinaryFileData } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import type { SvgGeometry } from './geometry';
import { loadExcalidraw, type ExcalidrawModule } from './loadExcalidraw';
import { readSvgScene } from './readSvgScene';
import { buildReport, type ReportElement, type SpikeReport } from './report';
import type { PictureScene } from './scene';
import { alignTextElements, toSkeleton, type AlignableElement } from './toSkeleton';

export type { SvgGeometry } from './geometry';
export {
  PICTURE_GROUP_ID,
  PICTURE_SCENE_VERSION,
  type PictureScene,
  type SceneElement,
  type SceneSkip,
  type SceneSkipReason,
} from './scene';
export type { SpikeReport } from './report';

export interface ConvertAntvSvgOptions {
  /** The picture ground, for alpha blending; also the background rectangle. */
  background: string;
  /** Pill handling. Default `'polygon'` (exact capsule); `'rectangle'` is legacy. */
  pill?: 'rectangle' | 'polygon';
  /** Report labels only. */
  template?: string;
  theme?: string;
  /** Test seam for the browser geometry. */
  geometry?: SvgGeometry;
  /** Test seam for the clock. */
  now?: () => number;
  /** Test seam for the lazy Excalidraw loader. */
  loadModule?: () => Promise<ExcalidrawModule>;
}

export interface ConvertAntvSvgResult {
  scene: PictureScene;
  elements: ExcalidrawElement[];
  files: Record<string, BinaryFileData>;
  report: SpikeReport;
}

/**
 * Converts a rendered AntV root `<svg>` into Excalidraw elements and a report.
 * The `<svg>` must be attached with real layout (the reader uses its matrices).
 * Async because the Excalidraw module is loaded lazily (client only).
 */
export async function convertAntvSvg(
  svg: Element,
  options: ConvertAntvSvgOptions,
): Promise<ConvertAntvSvgResult> {
  const now = options.now ?? (() => performance.now());
  // Addendum 3: load the (memoised, one-time) Excalidraw module BEFORE the
  // timer, so `conversionMs` measures only reading + toSkeleton + convert, not
  // the module download every row waits for. Its cost is reported separately.
  const loadStart = now();
  const { convertToExcalidrawElements } = await (options.loadModule ?? loadExcalidraw)();
  const moduleLoadMs = now() - loadStart;

  const start = now();
  const scene = readSvgScene(svg, { background: options.background, geometry: options.geometry });
  const { elements: skeleton, files } = toSkeleton(scene, { pill: options.pill });
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
  alignTextElements(elements as unknown as AlignableElement[], scene);
  const conversionMs = now() - start;
  const report = buildReport({
    scene,
    elements: elements as unknown as ReportElement[],
    files,
    conversionMs,
    moduleLoadMs,
    template: options.template,
    theme: options.theme,
  });
  return { scene, elements, files, report };
}
