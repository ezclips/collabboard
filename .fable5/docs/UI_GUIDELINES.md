# UI Guidelines

Interaction and layout rules that make ten layout types feel like one product. DESIGN_SYSTEM.md covers visual tokens/components; this covers behavior.

## 1. The Consistency Contract

A post must look, open, edit, comment, and drag **identically** in every layout. Today it does not (three comment UIs, per-layout card variants — see memory of `PostCardContent`/`CommentPost` divergence). The engine components (COMPONENT_GUIDELINES.md §2) are the mechanism; this doc is the spec:

- **One card anatomy:** media → title → body preview → meta row (author avatar, timestamp, comment count, reactions). Layouts may change card *size and arrangement*, never anatomy or affordance placement.
- **One open behavior:** click opens the post overlay (same overlay everywhere); double-click enters inline edit where the layout supports it.
- **One context menu** (Radix) with capability-filtered items; identical ordering across layouts.
- **One comment thread UI**, opened from the same affordance (meta-row count or overlay tab) in all layouts.

## 2. Interaction Standards

### Creation (the P2 path)
- Every layout has an ever-visible primary "+" affordance *and* double-click/tap-empty-space to create in place.
- New post drops the user directly into the title field — no intermediate dialog.
- `/` in any empty text block opens the block-type menu (Notion pattern).
- Paste anywhere: URL → link post with preview; image → image post; text → note. Paste is a first-class creation path.

### Drag & drop
- Single system (`@dnd-kit`) with per-layout adapters; ghost preview follows cursor, drop targets highlight, invalid targets show not-allowed — identically everywhere.
- Drag latency budget: pickup < 100 ms, ghost at 60 fps (transform-only).
- Cross-context drags (post → another section/column/board tab) always work or visibly explain why not; silent no-op drops are bugs.

### Selection
- Click selects; shift-click extends; marquee on spatial layouts; Esc clears. Selection chrome and bulk-action bar (move, color, delete, copy) are engine components shared by all layouts.

### Undo
- Ctrl/Cmd+Z works for **every** mutating action, board-scoped, across layouts (op-log powered). Toasts for destructive actions carry an Undo button (P3).

## 3. Feedback & Motion

- Optimistic UI: no spinner may appear for a local mutation; the op applies instantly and reconciles silently. Spinners are reserved for initial loads and imports.
- Sync status: subtle persistent indicator (saved / syncing / offline-queued). Never a blocking modal.
- Motion: 120–200 ms ease-out for enter/attention, ≤ 120 ms for exits; spatial continuity on layout switches (posts animate to their new placement — this *sells* P1 lossless switching). Respect `prefers-reduced-motion` throughout.
- Presence: peer cursors and avatars use assigned identity colors; remote changes flash a soft highlight with author attribution.

## 4. Empty States, Errors, Loading

- Every layout has a designed empty state: one sentence + primary action + optional template pick. No blank white voids.
- Board open uses skeleton placement grids matched to the active layout, not a global spinner.
- Error copy pattern: what happened → what's preserved → the action ("Couldn't save your post. It's kept locally — Retry").

## 5. Responsive & Input Model

- Breakpoints: mobile (≤ 640) — single-column feed projection of any layout + bottom-sheet post overlay; tablet (≤ 1024) — touch-first with full layouts; desktop — full spatial UI.
- All interactions must have touch equivalents: long-press = right-click, two-finger pan/pinch on spatial layouts, drag handles ≥ 44 px targets.
- Keyboard parity for every pointer flow (ACCESSIBILITY.md holds the map; UI work isn't done without it).

## 6. Copy Voice

Concise, active, sentence case ("Share board", not "SHARE BOARD!"). No blame ("Something went wrong on our side"), no jargon ("op", "placement" never reach the user). Numbers humanized ("2 min ago"). All copy in one strings module from Phase 3 (i18n readiness — education market is global).
