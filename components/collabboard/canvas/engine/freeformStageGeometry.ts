/**
 * Single source of truth for the Freeform layout's world-stage geometry.
 *
 * The Freeform post stage (FreeformPadletCards.tsx) and the Freeform Line
 * interaction layers (CanvasClient.tsx's back/front SimpleLineRenderer
 * wrappers) must both size their unscaled box to this same world stage
 * before applying `transform: scale(canvasZoom)` -- otherwise a wrapper
 * sized to the viewport instead of the world stage stays reachable only up
 * to the viewport's own pixel size, regardless of zoom (PATCH 9I/9J).
 */

/** Original logical region retained byte-for-byte for existing content. */
export const FREEFORM_WORLD_WIDTH_PX = 10000;
export const FREEFORM_WORLD_HEIGHT_PX = 10000;

/** Finite signed world bounds introduced by PATCH 9V.2A. */
export const FREEFORM_WORLD_MIN_X = -5000;
export const FREEFORM_WORLD_MIN_Y = -5000;
export const FREEFORM_WORLD_MAX_X = 15000;
export const FREEFORM_WORLD_MAX_Y = 15000;

/** Physical signed-stage dimensions. */
export const FREEFORM_SIGNED_WORLD_WIDTH = FREEFORM_WORLD_MAX_X - FREEFORM_WORLD_MIN_X;
export const FREEFORM_SIGNED_WORLD_HEIGHT = FREEFORM_WORLD_MAX_Y - FREEFORM_WORLD_MIN_Y;

/** Logical world (0,0) measured from the signed-stage start. */
export const FREEFORM_WORLD_ORIGIN_OFFSET_X = -FREEFORM_WORLD_MIN_X;
export const FREEFORM_WORLD_ORIGIN_OFFSET_Y = -FREEFORM_WORLD_MIN_Y;
