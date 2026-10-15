# PATCH-376 — Canvas settings: refresh, two bug fixes, safe layout switching

**Status:** done

## Goal
The Canvas settings window (`CanvasSettingsModal.tsx`) matches the compact Share window
(PATCH-369), shows real values instead of internal ones, says what its switches do, and can
no longer switch a board into a layout that hides every post.

## Reason
Owner (2026-10-15, screenshot): "do you think we need to update the canvas setting, it is
still the old design." PM review + live probe (`probe-layout-switch.mjs`, throwaway boards,
switching through the real window):
1. Icon field prints the raw id: "lucide:layout  Select icon".
2. The three switches next to Title / Description / Icon have NO visible label — only an
   aria-label "Show … in banner". Nobody can tell what they do.
3. Wallpaper shows an empty white square as its preview.
4. LIVE: Columns ↔ Grid keeps every post; Wall ↔ Timeline keeps every post; but
   Columns/Grid → Wall/Timeline shows NO posts and no sections, and Wall → Columns shows no
   cards and no posts (switching back shows them again — data intact, the board just looks
   empty). The code comment "Switching into any of these layouts only ever touches
   boards.layout — safe" is wrong for cross-family switches: Columns/Grid posts belong to
   `board_sections` (`metadata.sectionId`), Wall/Timeline posts are children of root
   containers (`metadata.childPadletIds`).

## Design
1. **Look**: same header style, spacing, max height + internal scroll, footer buttons and
   switch style as `CanvasShareModal` (PATCH-369; reuse `ShareSwitchRow` for the switch
   rows — Comments and the three "show in header" switches). Window `data-canvas-settings-modal`.
2. **Show in header**: a visible column heading "Show in header" above the three switches
   (or each row reads e.g. "Show title in the board header" via `ShareSwitchRow`); keep the
   aria-labels. `data-settings-show-in-header="title|description|icon"`.
3. **Icon**: render the icon itself (the same renderer the board header / IconSelector use
   for `lucide:*`, emoji and image URLs) plus a readable name ("Layout"), never the raw id.
   `data-settings-icon-preview`.
4. **Wallpaper**: the swatch shows the current wallpaper (colour, gradient or image
   thumbnail) and a label ("White", "Gradient", "Image", or "Default" when none);
   `data-settings-wallpaper-preview`.
5. **Layout — same family only (until PATCH-377 converts)**: families
   `{columns, grid}` and `{wall, timeline}`. Tiles of the board's own family are selectable
   as today; tiles of the other family are shown DISABLED with one line under the row:
   "Switching between Wall/Timeline and Columns/Grid isn't available yet — your posts are
   organised differently." `data-settings-layout="<id>"`, `data-settings-layout-disabled`.
   Put the family rule in a pure helper (`lib/domain/canvas/layoutSwitchFamilies.ts` + test)
   and fix the misleading comment. Keep the existing "create a default section when
   switching into Columns with none" behaviour for Grid → Columns.
6. Owner/editor rules unchanged (`canEdit` disables inputs as today).

## Files
Modify: `components/collabboard/canvas/ui/CanvasSettingsModal.tsx` (+ its test file if one
exists, else create `CanvasSettingsModal.test.tsx`). Create:
`lib/domain/canvas/layoutSwitchFamilies.ts` (+ test). Reuse (import, do not change):
`ShareSwitchRow`, the icon renderer. Ask before touching anything else. Tests of the
component you change may be edited without asking. No SQL, no git, no production build.

## Commit
  fix(canvas): refreshed Canvas settings; no layout switch that hides posts

## Acceptance Criteria (PM, live)
Open Canvas settings on a throwaway Columns board: the icon shows as an icon + name (no
"lucide:"), the switches read as "show in header", the wallpaper swatch is visible, the
window looks like the Share window and fits the screen; Grid is selectable, Wall/Timeline are
disabled with the note; Columns → Grid → Columns keeps every post. On a Wall board Timeline
is selectable and Columns/Grid are disabled. tsc clean; per-test gate unchanged.

## Required Tests
Family helper (all pairs); disabled tiles + note for the other family; icon never renders a
raw `lucide:` string; show-in-header labels present; wallpaper label per type.

## Estimated Difficulty
easy
