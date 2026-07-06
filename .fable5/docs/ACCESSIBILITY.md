# Accessibility

Target: **WCAG 2.2 AA** on all core flows. Strategic, not just ethical: our beachhead market (education) increasingly *requires* accessibility conformance for procurement (US Section 508, EU EN 301 549), and canvas competitors are weak here (P9).

## 1. Scope & Priorities

| Priority | Surface | Bar |
|---|---|---|
| P0 | Auth, dashboard, board browsing/reading, post reading, comments | Full AA — screen reader + keyboard complete |
| P0 | Post creation/editing in structured layouts (wall, columns, timeline list) | Full AA |
| P1 | Drag-and-drop reordering | Keyboard alternative for every drag operation |
| P1 | Spatial canvases (freeform, map, drawing) | Keyboard navigation + object list fallback; drawing itself exempt from full parity but must not trap focus |
| P2 | Presentation mode, exports | Readable output (tagged headings, alt text carried through) |

## 2. Keyboard Model (the master map — UI work must conform)

- `Tab` — chrome navigation (toolbar, header, sidebar). Focus order follows visual order; visible focus ring (2 px accent) always; no `outline: none` without replacement.
- **Roving focus inside the board surface:** `Arrow keys` move between posts (grid-aware per layout); `Enter` opens; `Esc` closes/back; `F2` or `Enter` again = edit title.
- **Keyboard DnD (dnd-kit supports this — wire it):** `Space` on a post = pick up → arrows move / change target → `Space` drop, `Esc` cancel, with `aria-live` announcements ("Moved to column Ideas, position 3").
- Global: `/` or `Ctrl+K` command palette (Phase 3); `N` new post; `?` shortcut sheet.
- **No focus traps**: overlays (Radix handles this) and — critically — the canvas surfaces and embedded editors (TipTap, Excalidraw, Mapbox) must be enter-able *and* escape-able. Mapbox GL and Excalidraw both need explicit focus-management wrappers; audit in Phase 2.

## 3. Screen Reader Semantics

- Board surface = `role="application"` is **forbidden**; use list/grid semantics: layout surfaces expose `role="list"/"listitem"` (wall/stream) or `grid` (columns/table-like) with `aria-setsize`/`aria-posinset` so "post 12 of 87" is announced.
- Post card = one focusable article: `aria-label` = "Note by Maria, 2 comments: {title}". Media requires alt text — the post editor prompts for it (empty alt allowed only explicitly).
- Live collaboration announcements are **opt-in and throttled** (`aria-live="polite"`, batched: "3 posts added by others") — never a firehose.
- Comments = standard disclosure + list semantics; reactions = toggle buttons with state.
- Color is never the only signal (post color labels available as text; sync status has icon + text).

## 4. Contrast & Visual

- Text ≥ 4.5:1, large text/icons ≥ 3:1, in **both themes and on wallpapers** (the card scrim in DESIGN_SYSTEM.md §4 exists for this).
- User-selectable post colors are pre-paired with compliant text colors — users pick a swatch, we guarantee the pair.
- `prefers-reduced-motion`: all non-essential animation off (layout-switch morphing becomes a crossfade); `prefers-contrast: more` bumps border tokens.
- Zoom: UI functional at 400% browser zoom (WCAG reflow); spatial canvases provide their own zoom controls with keyboard bindings (`Ctrl +/-/0`).

## 5. Current State (honest)

Effectively unaudited. Radix primitives give solid dialog/menu semantics for free (good foundation); everything canvas-specific (roving focus, keyboard DnD, announcements, alt-text flow) does not exist yet. Do not retrofit at the end — the engine components (SelectionLayer, card shell) are being rebuilt in Phase 1–3 anyway; a11y semantics go in *as they're built* (cheap now, brutal later).

## 6. Enforcement

- CI: `eslint-plugin-jsx-a11y` + axe-core run in Playwright on dashboard, board (each layout), post overlay, share flow. New violations fail the build.
- Manual: NVDA + VoiceOver pass on the P0 flows each release; keyboard-only walkthrough in the release checklist.
- Definition of Done (COMPONENT_GUIDELINES.md §6) already includes the keyboard path — reviewers actually test it.
