import type { Padlet } from '@/types/collabboard';
import { resolveCaptionStyle, type ResolvedCaptionStyle } from '@/lib/domain/canvas/captionStyle';

/**
 * PATCH SECTION-H1 -- the canonical Section Heading contract.
 *
 * A Section Heading is a lightweight horizontal board-structure object that
 * visually divides regions of a Freeform canvas. It is NOT a Note, NOT a
 * Container, and confers NO membership: posts sitting "under" a heading stay
 * completely independent objects.
 *
 * Everything type-specific about Section Headings lives here rather than as
 * scattered `type === 'section_heading'` string checks, so the exclusions
 * below (Container child, Graph endpoint) have exactly one definition each.
 */

/** The canonical post-type discriminator, matching types/collabboard.ts. */
export const SECTION_HEADING_TYPE = 'section_heading' as const;

/**
 * Default geometry, in WORLD units. Deliberately wide and short: a heading
 * is a horizontal rule with a label, never a card-shaped block.
 */
export const SECTION_HEADING_DEFAULT_WIDTH = 500;
export const SECTION_HEADING_DEFAULT_HEIGHT = 64;

export const SECTION_HEADING_DEFAULT_TEXT = 'Section heading';

/** Semantic heading levels. SECTION-H2 exposes the picker; H1 persists the default. */
export type SectionHeadingLevel = 1 | 2 | 3 | 4;
export const SECTION_HEADING_DEFAULT_LEVEL: SectionHeadingLevel = 2;

/**
 * PATCH SECTION-H2 Phase 6: the four semantic levels a CollabBoard Section
 * Heading supports. Deliberately stops at H4 -- H5/H6 exist in HTML but carry
 * no meaning for a board-space divider, so they are not offered.
 */
export const SECTION_HEADING_LEVELS: readonly SectionHeadingLevel[] = [1, 2, 3, 4];

/**
 * PATCH SECTION-H2 Phase 6: the ONE type-scale map for Section Headings.
 *
 * Introduced by SECTION-H1 inside the renderer and hoisted here so the
 * formatting toolbar can never grow a second, drifting copy: any control that
 * needs level typography reads THIS map. Sizes stay inside the frozen 64-world
 * -unit height contract (Phase 8) -- H1's 24px/32px line box is the tallest.
 */
export const SECTION_HEADING_LEVEL_TEXT_CLASS: Record<SectionHeadingLevel, string> = {
  1: 'text-2xl font-bold',
  2: 'text-xl font-semibold',
  3: 'text-lg font-semibold',
  4: 'text-base font-medium',
};

/** Width of the left accent stripe, in world px (Phase 10: left, never top). */
export const SECTION_HEADING_ACCENT_WIDTH_PX = 4;

/** SECTION-H1's accent, now the documented default the Phase 29 control resets to. */
export const SECTION_HEADING_DEFAULT_ACCENT_COLOR = '#0f766e';

/**
 * PATCH SECTION-H2 Phase 13: the ONE minimum width, in world units.
 *
 * 200 sits at the top of the spec's 180-220 band: at the default 64-unit
 * height it still reads as a horizontal label rather than a square block, and
 * it leaves room for the 4-unit accent stripe plus a few characters of H1 text
 * before truncation kicks in.
 */
export const SECTION_HEADING_MIN_WIDTH = 200;

/**
 * Screen-constant size of a resize handle's hit area, in CSS px (Phase 10).
 * The renderer divides by the live zoom so the grab target stays the same
 * physical size at 10% as at 150%.
 */
export const SECTION_HEADING_HANDLE_HIT_PX = 14;

export function isSectionHeading(post: Pick<Padlet, 'type'> | null | undefined): boolean {
  return !!post && (post.type as string) === SECTION_HEADING_TYPE;
}

/**
 * The persisted semantic level, defaulted and clamped. Reading through this
 * helper (rather than the raw metadata field) is what keeps the renderer
 * level-aware from day one -- SECTION-H2 only has to add the control, not
 * retrofit the plumbing.
 */
export function getSectionHeadingLevel(post: Pick<Padlet, 'metadata'> | null | undefined): SectionHeadingLevel {
  const raw = Number((post?.metadata as { headingLevel?: unknown } | undefined)?.headingLevel);
  return raw === 1 || raw === 2 || raw === 3 || raw === 4 ? raw : SECTION_HEADING_DEFAULT_LEVEL;
}

/** The heading's display text. Title is the canonical store; content stays empty. */
export function getSectionHeadingText(post: Pick<Padlet, 'title'> | null | undefined): string {
  return typeof post?.title === 'string' ? post.title : '';
}

/**
 * PATCH SECTION-H1 Phase 19: Section Headings organize board SPACE, not card
 * membership, so they are never eligible to become a Container child --
 * neither by drag-over nor by "Group into Column". Every other post type
 * keeps its existing eligibility untouched.
 */
export function canBeContainerChild(post: Pick<Padlet, 'type'> | null | undefined): boolean {
  return !isSectionHeading(post);
}

/**
 * PATCH SECTION-H1 Phase 21: a Section Heading is canvas organization rather
 * than semantic post content, so it is not a Graph Line endpoint and shows no
 * connection handles. Graph behavior for every existing post type is unchanged.
 */
export function canBeGraphEndpoint(post: Pick<Padlet, 'type'> | null | undefined): boolean {
  return !isSectionHeading(post);
}

/**
 * Collapses arbitrary pasted/typed input to a single-line plain heading
 * string (Phase 12). Strips tags and control characters, folds all whitespace
 * -- including newlines a paste can smuggle in -- to single spaces, and caps
 * the length so one paste cannot produce an unbounded title write.
 */
export const SECTION_HEADING_MAX_LENGTH = 200;

/**
 * PATCH SECTION-H2 Phase 29: the left stripe's colour. Stored on the same
 * generic metadata object as every other post styling field -- a new JSONB
 * property, never a schema column.
 */
export function getSectionHeadingAccentColor(post: Pick<Padlet, 'metadata'> | null | undefined): string {
  const raw = (post?.metadata as { accentColor?: unknown } | undefined)?.accentColor;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : SECTION_HEADING_DEFAULT_ACCENT_COLOR;
}

/**
 * PATCH SECTION-H2 Phase 28: the heading surface colour. `transparent` is a
 * first-class choice (and the SECTION-H1 default), not an "unset" placeholder,
 * so the appearance panel can always put the heading back to bare canvas.
 */
export function getSectionHeadingBackgroundColor(post: Pick<Padlet, 'metadata'> | null | undefined): string {
  const raw = (post?.metadata as { backgroundColor?: unknown } | undefined)?.backgroundColor;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'transparent';
}

/**
 * PATCH SECTION-H2 Phase 22/24: whole-heading typography.
 *
 * Reuses the app's existing generic title-style concept (`metadata.titleStyle`,
 * normalized by lib/domain/canvas/captionStyle) rather than minting parallel
 * `fontWeight`/`fontStyle`/`textAlign` keys under new names. `fontSize` and
 * `lineHeight` are deliberately dropped: the semantic LEVEL owns a heading's
 * size (Phase 6), so a stored font size must never be able to fight the H1-H4
 * control or breach the fixed height contract.
 */
export function resolveSectionHeadingTextStyle(
  post: Pick<Padlet, 'metadata'> | null | undefined,
): ResolvedCaptionStyle {
  const metadata = (post?.metadata ?? {}) as { titleStyle?: unknown; textColor?: unknown };
  const textColor = typeof metadata.textColor === 'string' ? metadata.textColor : null;
  const resolved = resolveCaptionStyle(metadata.titleStyle, textColor);
  const { fontSize: _fontSize, lineHeight: _lineHeight, backgroundColor: _backgroundColor, ...rest } = resolved;
  return rest;
}

export interface SectionHeadingRect {
  x: number;
  width: number;
}

/**
 * PATCH SECTION-H3B Phase 3 -- the renderer-neutral horizontal bounds policy.
 *
 * The geometry helpers below deliberately do NOT know which canvas they are
 * running on. The HOST states how far left and right its world extends, and
 * the helpers merely respect it. Freeform passes its signed-stage bounds from
 * `freeformStageGeometry` (still the one source of truth for -5000/15000);
 * a Drawing/Excalidraw host, whose scene has no finite extent, passes
 * `SECTION_HEADING_UNBOUNDED_WORLD`.
 *
 * There is deliberately no default value: an engine-neutral helper must never
 * silently inherit one host's stage policy (Phase 4, design A).
 */
export interface SectionHeadingWorldBounds {
  minX: number;
  maxX: number;
}

/**
 * Phase 15: the unbounded-host sentinel. The infinities are CONSTRAINTS ONLY
 * -- both helpers below are written so an infinite bound always collapses to
 * "no clamp on that side" and can never reach the returned geometry, which
 * stays finite and therefore safe to persist.
 */
export const SECTION_HEADING_UNBOUNDED_WORLD: SectionHeadingWorldBounds = {
  minX: Number.NEGATIVE_INFINITY,
  maxX: Number.POSITIVE_INFINITY,
};

/**
 * Where a horizontal resize gesture began, in WORLD units.
 *
 * Phase 7: holding the start rect together with the start pointer position
 * lets every frame be derived from absolute world coordinates supplied by the
 * host, with no zoom term anywhere. That is what makes the result identical at
 * 10% and 150%, and structurally immune to the double-division class of bug.
 */
export interface SectionHeadingResizeOrigin {
  rect: SectionHeadingRect;
  pointerWorldX: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function readOrigin(origin: SectionHeadingResizeOrigin) {
  const x = finiteOr(origin.rect.x, 0);
  const width = Number.isFinite(origin.rect.width) && origin.rect.width > 0
    ? origin.rect.width
    : SECTION_HEADING_MIN_WIDTH;
  return { x, width, startPointerWorldX: finiteOr(origin.pointerWorldX, 0) };
}

/**
 * PATCH SECTION-H2 Phase 11 / SECTION-H3B Phase 3: RIGHT-handle resize.
 *
 * `x` never moves; only the width absorbs the pointer's travel, measured
 * between two world points the host resolved for us.
 *
 * Clamp order is deliberate: the minimum width applies first, then the host's
 * right bound wins outright. A heading parked hard against a finite right edge
 * is allowed to be narrower than the minimum rather than be persisted past
 * that edge; under an unbounded policy the bound simply never bites.
 */
export function resizeSectionHeadingRightEdge(
  origin: SectionHeadingResizeOrigin,
  pointerWorldX: number,
  bounds: SectionHeadingWorldBounds,
): SectionHeadingRect {
  const { x, width, startPointerWorldX } = readOrigin(origin);
  const delta = finiteOr(pointerWorldX, startPointerWorldX) - startPointerWorldX;
  const maxWidth = finiteOr(bounds.maxX, Number.POSITIVE_INFINITY) - x;
  const next = Math.round(width + delta);
  const clamped = Math.min(maxWidth, Math.max(SECTION_HEADING_MIN_WIDTH, next));
  // Phase 15: an unbounded maxX must never leak into stored geometry.
  return { x, width: finiteOr(clamped, Math.max(SECTION_HEADING_MIN_WIDTH, next)) };
}

/**
 * PATCH SECTION-H2 Phase 12 / SECTION-H3B Phase 3: LEFT-handle resize.
 *
 * The RIGHT edge is the invariant: it is computed once from the gesture's
 * starting rect and every result is derived back from it, so the far edge
 * cannot drift by a pixel no matter how far the pointer travels or how the
 * clamps bite. Symmetrically to the right handle, the host's left bound wins
 * over the minimum width.
 */
export function resizeSectionHeadingLeftEdge(
  origin: SectionHeadingResizeOrigin,
  pointerWorldX: number,
  bounds: SectionHeadingWorldBounds,
): SectionHeadingRect {
  const { x, width, startPointerWorldX } = readOrigin(origin);
  const delta = finiteOr(pointerWorldX, startPointerWorldX) - startPointerWorldX;
  const right = x + width;
  const widthLimitedX = right - SECTION_HEADING_MIN_WIDTH;
  const minX = finiteOr(bounds.minX, Number.NEGATIVE_INFINITY);
  const bounded = Math.max(minX, Math.min(widthLimitedX, x + delta));
  const nextX = Math.round(finiteOr(bounded, widthLimitedX));
  return { x: nextX, width: right - nextX };
}

export type SectionHeadingToolbarPlacement = 'above' | 'below';

export interface SectionHeadingToolbarPlacementInput {
  /** Live client rect of the heading element, in CSS pixels. */
  heading: { left: number; top: number; width: number; height: number };
  toolbar: { width: number; height: number };
  viewport: { width: number; height: number };
}

export interface SectionHeadingToolbarPlacementResult {
  left: number;
  top: number;
  placement: SectionHeadingToolbarPlacement;
}

/** Gap between the heading and its formatting toolbar, in CSS pixels. */
export const SECTION_HEADING_TOOLBAR_GAP_PX = 10;
/** Minimum breathing room kept between the toolbar and a viewport edge. */
export const SECTION_HEADING_TOOLBAR_EDGE_MARGIN_PX = 8;

/**
 * PATCH SECTION-H2 Phase 4/5: where the screen-space formatting toolbar goes.
 *
 * Inputs are MEASURED client rects, not world coordinates -- which is exactly
 * why the result is immune to zoom and to signed-world placement: a heading at
 * (-4900, -3200) viewed at 10% produces the same kind of rect as one at
 * (200, 300) viewed at 150%, and the toolbar's own size never scales.
 *
 * Placement is centred above the heading, flipping below only when there is
 * genuinely no room above, and clamped horizontally so it stays reachable near
 * the left/right edges. That is the whole collision policy -- deliberately not
 * a generalized floating-UI engine.
 */
export function computeSectionHeadingToolbarPlacement(
  input: SectionHeadingToolbarPlacementInput,
): SectionHeadingToolbarPlacementResult {
  const { heading, toolbar, viewport } = input;
  const margin = SECTION_HEADING_TOOLBAR_EDGE_MARGIN_PX;

  const aboveTop = heading.top - SECTION_HEADING_TOOLBAR_GAP_PX - toolbar.height;
  const belowTop = heading.top + heading.height + SECTION_HEADING_TOOLBAR_GAP_PX;
  const fitsAbove = aboveTop >= margin;
  const placement: SectionHeadingToolbarPlacement = fitsAbove ? 'above' : 'below';

  const rawTop = fitsAbove ? aboveTop : belowTop;
  const maxTop = Math.max(margin, viewport.height - toolbar.height - margin);
  const top = Math.max(margin, Math.min(maxTop, rawTop));

  const centeredLeft = heading.left + heading.width / 2 - toolbar.width / 2;
  const maxLeft = Math.max(margin, viewport.width - toolbar.width - margin);
  const left = Math.max(margin, Math.min(maxLeft, centeredLeft));

  return { left, top, placement };
}

export function sanitizeSectionHeadingText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SECTION_HEADING_MAX_LENGTH);
}
