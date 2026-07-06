# Design System

Visual foundations and the component library. Stack: Tailwind 4 + Radix primitives + CVA (already in place — endorsed). This doc turns the current ad-hoc styling into a token system.

## 1. Principles

- **Content is the interface.** User posts carry the color and personality; our chrome stays quiet (neutral surfaces, one accent). Boards should look like the *user's* board, not our brand.
- **Tokens, not values.** No raw hex/px in components; Tailwind theme extensions + CSS variables only. (Current codebase has scattered inline styles — burn down as files are touched.)
- **Legally distinct identity (P7):** no Padlet pink/fuchsia identity, no Miro yellow, no Notion monochrome-serif look. Our identity: neutral warm grays, a single saturated accent, generous whitespace, 8-px radius language.

## 2. Tokens (CSS variables, defined once in `globals`; Tailwind maps to them)

### Color — semantic, theme-aware (light/dark via `next-themes`, already installed)
```
--surface-0/1/2/3        page → card → raised → overlay
--border-subtle/default/strong
--text-primary/secondary/tertiary/inverse
--accent / --accent-hover / --accent-subtle
--danger --warning --success --info
--identity-1..12         presence cursors & avatars (fixed, colorblind-checked)
--post-1..16             user-selectable post colors (pastel fills + strong pair)
```
Rules: semantic tokens only in components (`bg-surface-1`, never `bg-gray-50`); post colors must keep body text ≥ 4.5:1 in both themes (ACCESSIBILITY.md); identity colors never used for UI meaning.

### Type
- UI font: system stack or one variable font (self-hosted, no CDN).
- Scale: 12 / 13 / 14 (base) / 16 / 18 / 22 / 28. Post titles 16 semibold; body 14; UI chrome 13.
- User-facing rich text may use its own font choices later (Milanote-style moodboards); chrome never varies.

### Space, radius, elevation
- 4-px spacing grid (`1..12` steps); card padding 12/16.
- Radius: 6 controls, 10 cards, 16 overlays/sheets.
- Elevation: shadow-1 card rest, shadow-2 hover/drag-source, shadow-3 overlays; dark theme swaps shadows for surface-step + border.

## 3. Component Library (`components/ui` — the only kit)

Two kits exist today (`components/ui`, `components/ui-kit`) → **merge into `components/ui`**, delete the other (P6).

Tiers:
1. **Primitives** (Radix-wrapped, CVA variants): Button, IconButton, Input, Select, Switch, Tabs, Dialog, Popover, DropdownMenu, ContextMenu, Tooltip, Avatar, Toast (sonner).
2. **Patterns:** PostCard shell, CommentThread, UserChip, EmptyState, Toolbar, ColorPicker, EmojiTrigger, ShareSheet.
3. **Engine chrome** (COMPONENT_GUIDELINES.md): SelectionBar, PresenceLayer, SyncIndicator, BoardHeader.

Rules:
- Variants via CVA exclusively (`variant`, `size`, `tone`); no boolean-prop styling forks.
- Icons: lucide-react only, 16/20 px, `stroke-width: 1.75` globally.
- Every primitive documented with a fixture page (a lightweight `/dev/ui` route in dev builds serves as our Storybook until we adopt one).

## 4. Theming & Board Wallpapers

- Light/dark ship day one; every token has both values; components never check the theme — tokens absorb it.
- Board wallpapers (Padlet-parity feature): a curated set + upload; wallpaper affects only the board surface, never chrome tokens; enforce a scrim so post cards stay legible on any wallpaper.
- Optional "sketch" skin for freeform/drawing boards (Excalidraw-fork aesthetic) is a per-board render option, not a fork of the design system.

## 5. Density

Two densities (comfortable/compact) as a board-level setting implemented purely through spacing tokens — classroom boards with 200 posts need compact; moodboards want comfortable.

## 6. Governance

- New component → PR includes fixture + both themes + keyboard/focus states, and this doc's component list updated.
- Visual changes to primitives require a screenshot diff in the PR (Playwright snapshot of `/dev/ui`).
- Token additions need a semantic justification; "I needed a slightly different gray" is a rejected reason.
