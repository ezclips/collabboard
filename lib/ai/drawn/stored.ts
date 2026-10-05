/**
 * PATCH-284 Addendum 1. The one path a STORED or received drawn picture takes
 * to pixels: parse (untrusted rows), then REPAIR against the stored outline --
 * the model may not set `startAngle`/`endAngle` or text `lines`/`boxHeight`, so
 * a bare `parseDrawnPicture` would render a pie with no slices -- then compile
 * to the shared `PictureScene`.
 */

import type { PictureScene } from '@/lib/ai/antv/toExcalidraw/scene';
import type { DrawnDiagramData } from '@/lib/ai/contracts';

import { drawnToScene } from './compile';
import { parseDrawnPicture } from './format';
import { repairPicture } from './repair';

/** Parse + repair + compile a stored drawn picture for display or conversion. */
export function sceneFromStored(data: DrawnDiagramData): PictureScene {
  const { picture } = parseDrawnPicture(data.picture);
  const repaired = repairPicture(picture, data.outline, data.kind);
  return drawnToScene(repaired.picture);
}
