-- P6J-F9-B1: visual PDF page regions on existing source references.
--
-- A region is normalised 0..1 with a TOP-LEFT origin in the page's INTRINSIC
-- UNROTATED coordinate system, so a stored rectangle is independent of CSS
-- size, reader width, raster resolution, device pixel ratio and zoom.
--
-- Deliberately NOT stored in `locator`: that jsonb carries parser bounding
-- boxes in `pdf-points-bottom-left`, a different coordinate system, and mixing
-- the two would create a second geometry authority. These are typed columns for
-- the same reason F8's exact spans became char_start/char_end rather than JSON:
-- the invariants below are enforceable here, and JSON's would not be.
--
-- Existing rows keep all four NULL and remain valid page-only or exact-span
-- references. No index is added: regions are read through the existing
-- source_references_target_padlet_idx path, never searched by geometry.

ALTER TABLE public.source_references
    ADD COLUMN IF NOT EXISTS region_x double precision,
    ADD COLUMN IF NOT EXISTS region_y double precision,
    ADD COLUMN IF NOT EXISTS region_width double precision,
    ADD COLUMN IF NOT EXISTS region_height double precision;

-- All four or none. Three quarters of a rectangle is not a location, and
-- repairing it would invent the missing edge.
ALTER TABLE public.source_references
    DROP CONSTRAINT IF EXISTS source_references_region_complete_check;
ALTER TABLE public.source_references
    ADD CONSTRAINT source_references_region_complete_check CHECK (
        (
            region_x IS NULL
            AND region_y IS NULL
            AND region_width IS NULL
            AND region_height IS NULL
        )
        OR (
            region_x IS NOT NULL
            AND region_y IS NOT NULL
            AND region_width IS NOT NULL
            AND region_height IS NOT NULL
        )
    );

-- Normalised bounds. The 1e-9 tolerance exists because a selection dragged to
-- the exact page edge computes x + width as 1 plus a few float ULPs; without it
-- whole-page regions would be randomly unsaveable. It is not slack for genuine
-- out-of-bounds values, which exceed it by many orders of magnitude.
--
-- NaN and Infinity need no special case: PostgreSQL orders NaN above every
-- other double, so both fail the upper bounds and the row is rejected.
ALTER TABLE public.source_references
    DROP CONSTRAINT IF EXISTS source_references_region_bounds_check;
ALTER TABLE public.source_references
    ADD CONSTRAINT source_references_region_bounds_check CHECK (
        region_x IS NULL
        OR (
            region_x >= 0
            AND region_y >= 0
            AND region_x <= 1
            AND region_y <= 1
            AND region_width > 0
            AND region_height > 0
            AND region_x + region_width <= 1 + 1e-9
            AND region_y + region_height <= 1 + 1e-9
        )
    );

-- One locator per reference. A reference is page-only, an exact text span, or a
-- visual region -- never two at once, because two locators describe two
-- different things and nothing downstream could choose between them.
ALTER TABLE public.source_references
    DROP CONSTRAINT IF EXISTS source_references_region_text_exclusion_check;
ALTER TABLE public.source_references
    ADD CONSTRAINT source_references_region_text_exclusion_check CHECK (
        region_x IS NULL
        OR (char_start IS NULL AND char_end IS NULL)
    );

-- A rectangle belongs to exactly one page, the same rule exact spans follow.
ALTER TABLE public.source_references
    DROP CONSTRAINT IF EXISTS source_references_region_single_page_check;
ALTER TABLE public.source_references
    ADD CONSTRAINT source_references_region_single_page_check CHECK (
        region_x IS NULL
        OR page_start = page_end
    );

COMMENT ON COLUMN public.source_references.region_x IS
    'P6J-F9-B1 normalised 0..1 left edge, top-left origin, intrinsic unrotated page.';
COMMENT ON COLUMN public.source_references.region_y IS
    'P6J-F9-B1 normalised 0..1 top edge, top-left origin, intrinsic unrotated page.';
COMMENT ON COLUMN public.source_references.region_width IS
    'P6J-F9-B1 normalised 0..1 width in the intrinsic unrotated page.';
COMMENT ON COLUMN public.source_references.region_height IS
    'P6J-F9-B1 normalised 0..1 height in the intrinsic unrotated page.';
