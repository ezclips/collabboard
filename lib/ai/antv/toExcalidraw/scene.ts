/**
 * PATCH-277. `PictureScene`, the neutral, versioned JSON a rendered AntV
 * `<svg>` is read into. This is the answer to the owner's "convert the AntV to
 * JSON so Excalidraw could read it": it depends on NOTHING (no Excalidraw, no
 * AntV, no DOM), so a later exporter to PowerPoint, SVG or another canvas can
 * reuse it unchanged.
 *
 * Format spec, version 1
 * ----------------------
 * Units are the AntV root's USER units (the viewBox space, origin at the
 * viewBox top-left). Every box and point is already mapped through
 * `root.getScreenCTM()⁻¹ × element.getScreenCTM()`, so the scene is independent
 * of the stage zoom.
 *
 *   - `background` is the picture ground passed in by the caller. It is not an
 *     element here; `toSkeleton` emits it as the first rectangle.
 *   - `elements` is in SVG document order. `id` is stable within one scene and
 *     is carried onto the Excalidraw element so reports can match them.
 *   - `groupIds` is innermost-first: `[itemGroup?, pictureGroup]`.
 *   - Colours are already resolved by the paint rules (paint.ts): an OPAQUE
 *     `#rrggbb`, or `'none'`. Alpha has been blended away, so no `#rrggbbaa`
 *     survives version 1.
 *   - `skips` records every visible-looking element the reader dropped, with a
 *     closed reason set. `'unknown'` is a defect and must stay at zero.
 *   - `visibleShapes` is the number of visible source shapes (rect/ellipse/
 *     path/polygon/polyline/line). `resolvableIcons` counts `<use>` icons whose
 *     symbol resolved; both feed the coverage measures.
 */

export const PICTURE_SCENE_VERSION = 1 as const;

/**
 * The group id shared by every element of one picture, so a single click in
 * Excalidraw selects the whole drawing.
 */
export const PICTURE_GROUP_ID = 'picture';

/**
 * PATCH-277 Addendum 1. Local copies of the two Excalidraw constants the
 * converter needs, so NO module in this folder imports the Excalidraw package
 * at runtime at module level (it drags SSR-hostile code like `devicePixelRatio`
 * into every importer). `constants.test.ts` asserts these equal the fork's
 * exported values, so a fork drift is caught as a test failure.
 */
export const FONT_FAMILY_HELVETICA = 2;
export const FONT_FAMILY_CASCADIA = 3;
export const ROUNDNESS_ADAPTIVE_RADIUS = 3;

/**
 * PATCH-277 Addendum 2. The CSS font-family list Excalidraw builds for
 * `FONT_FAMILY.Helvetica` (`getFontString` in packages/common: the family name
 * plus its fallbacks `sans-serif, Segoe UI Emoji`). Wrapping must measure with
 * the SAME string Excalidraw renders with, not plain `sans-serif`.
 * `constants.test.ts` pins it against the fork.
 */
export const EXCALIDRAW_FONT_FAMILY_HELVETICA = 'Helvetica, sans-serif, Segoe UI Emoji';
/** The monospace equivalent for `FONT_FAMILY.Cascadia`. */
export const EXCALIDRAW_FONT_FAMILY_CASCADIA = 'Cascadia, monospace, Segoe UI Emoji';

export interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point in root user units, `[x, y]`. */
export type ScenePoint = readonly [number, number];

export type SceneStrokeStyle = 'solid' | 'dashed' | 'dotted';
export type SceneTextAlign = 'left' | 'center' | 'right';

/** The paint of one shape, after the paint rules (blended, opaque). */
export interface ScenePaint {
  /** `#rrggbb` or `'none'`. */
  fill: string;
  /** `#rrggbb` or `'none'`. */
  stroke: string;
  strokeWidth: number;
  strokeStyle: SceneStrokeStyle;
  /** Excalidraw element opacity. Always 100: alpha went into the colour. */
  opacity: number;
  /** True when any alpha was blended over the background. */
  blended: boolean;
}

export interface SceneLosses {
  fontWeight: boolean;
  fontStyle: boolean;
}

export interface SceneSource {
  /** The source SVG tag, lower-case. */
  tag: string;
  /** The nearest `data-indexes` ancestor, parsed, when there was one. */
  indexes?: number[];
  /**
   * PATCH-287. The nearest `data-element-type` of the node or an ancestor, when
   * there was one. Combined with `indexes` it names the chart part.
   */
  elementType?: string;
}

interface SceneElementBase {
  id: string;
  groupIds: string[];
  source: SceneSource;
}

export interface SceneRectElement extends SceneElementBase {
  kind: 'rect';
  box: SceneRect;
  /** Corner radius in root units; 0 is a square. */
  radius: number;
  /** True when `radius >= min(w,h)/2 - 0.5` (a pill/capsule). */
  pill: boolean;
  paint: ScenePaint;
  clipIgnored: boolean;
}

export interface SceneEllipseElement extends SceneElementBase {
  kind: 'ellipse';
  box: SceneRect;
  paint: ScenePaint;
  clipIgnored: boolean;
}

export interface ScenePolylineElement extends SceneElementBase {
  kind: 'polyline';
  /** Root-unit points. Open shapes keep both ends; closed ones repeat the first. */
  points: ScenePoint[];
  closed: boolean;
  filled: boolean;
  arrowStart: boolean;
  arrowEnd: boolean;
  paint: ScenePaint;
  clipIgnored: boolean;
}

export interface SceneImageElement extends SceneElementBase {
  kind: 'image';
  box: SceneRect;
  dataURL: string;
  mimeType: string;
  /** True when an AntV `<use>` icon became a picture (not editable strokes). */
  fromIcon: boolean;
  /**
   * PATCH-283. The icon name recovered from the `<use>`/`<symbol>` id, when it
   * names one of `VISUAL_ICON_NAMES`. Excalidraw does not read it; the AI-drawn
   * example converter uses it to turn an icon picture back into a `DrawnIcon`.
   */
  iconName?: string;
}

export interface SceneTextElement extends SceneElementBase {
  kind: 'text';
  text: string;
  /** The RENDERED text block box (Range client rects), in root units. */
  box: SceneRect;
  fontSize: number;
  /** Opaque `#rrggbb`. */
  color: string;
  align: SceneTextAlign;
  /** AntV drew this with a monospace family -> Excalidraw `Cascadia`. */
  monospace: boolean;
  /** True when the chosen Excalidraw family may be downloaded by the editor. */
  mayDownload: boolean;
  lost: SceneLosses;
  /** True for an SVG `<text>`; false for a `foreignObject` (HTML colour source). */
  svgText: boolean;
  /**
   * Addendum 2. True when the text nodes inside one block disagree on size or
   * colour: the FIRST one wins, and this records the loss.
   */
  mixedTextStyle: boolean;
  /**
   * Addendum 4. The RENDERED line count in the source. Wrapping must not exceed
   * it: one line stays one line.
   */
  lineCount: number;
}

export type SceneElement =
  | SceneRectElement
  | SceneEllipseElement
  | ScenePolylineElement
  | SceneImageElement
  | SceneTextElement;

/** The closed set of reasons an element may be skipped. */
export type SceneSkipReason =
  | 'editor-ui'
  | 'definition'
  | 'hidden'
  | 'invisible'
  | 'pattern'
  | 'external-image'
  | 'icon-unresolved'
  | 'unknown';

export interface SceneSkip {
  id: string;
  tag: string;
  reason: SceneSkipReason;
  indexes?: number[];
}

export interface PictureSceneLosses {
  blended: number;
  gradientFlattened: number;
  clipIgnored: number;
  lostFontWeight: number;
  lostFontStyle: number;
  iconsAsImage: number;
  /**
   * PATCH-281. Icons emitted as editable strokes instead of a picture
   * (`icons: 'strokes'`). Mutually exclusive with `iconsAsImage` per mode.
   */
  iconsAsStrokes: number;
  /** Addendum 2. Text blocks whose inner nodes disagreed on size/colour. */
  mixedTextStyle: number;
  /** Addendum 4. Elements that carried a `filter` (drop shadow) we did not convert. */
  shadowIgnored: number;
  /**
   * PATCH-278 A.1. Paths the analytic sampler could not parse, so their points
   * came from `getPointAtLength`. Zero for real AntV pictures.
   */
  pathFallback: number;
  /**
   * PATCH-281. Faint `fill="url(#...-pattern)"` decorations we deliberately do
   * not convert; counted separately from `invisible`.
   */
  patternIgnored: number;
}

export interface PictureScene {
  version: typeof PICTURE_SCENE_VERSION;
  width: number;
  height: number;
  background: string;
  elements: SceneElement[];
  skips: SceneSkip[];
  visibleShapes: number;
  resolvableIcons: number;
  losses: PictureSceneLosses;
}
