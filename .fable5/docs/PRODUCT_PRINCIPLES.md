# Product Principles

Decision rules for when we disagree or face trade-offs. Cite these by number in PRs and design docs.

## P1 — Layout is a view, never the data

A board's content is a layout-agnostic graph of posts/blocks with positions and orderings *per projection*. Switching wall → timeline → map must be lossless and reversible. Any feature that stores content in a layout-specific shape is rejected at design time.

**Current violation to fix:** kanban has its own table set (`kanban_cards`, `kanban_columns`, …) disjoint from `canvas_items`; comments live in three shapes (`metadata.comments`, `detachedComments`, `canvas_comments`). See DATABASE.md.

## P2 — The first 60 seconds are sacred

New-user flow (land → create → post → share) may never gain a required step, modal, or decision. Power features enter through progressive disclosure: right-click, `/` command, settings drawer — never through the default path.

## P3 — Never lose user work

- Every destructive action is undoable or soft-deleted with retention.
- Writes are optimistic locally but durably queued; a dropped connection must not lose a post.
- Version history is a platform capability, not a per-feature add-on.

## P4 — Fast by default, fast forever

Performance budgets (PERFORMANCE.md) are release gates, not aspirations. A PR that regresses board-open p75 by >5% is blocked regardless of the feature it ships.

## P5 — Boring technology, exciting product

We innovate in UX and the content model. Infrastructure choices default to the mainstream, well-documented option (Postgres, Next.js, proven CRDT libraries). Hand-rolled infrastructure (custom sync protocols, custom stores) requires a written justification of why no library fits.

## P6 — One way to do each thing

One canvas engine, one comment system, one drag-drop abstraction, one date library, one modal pattern. Duplication is a bug with a deadline. When a second implementation appears "temporarily," it gets a removal ticket the same day.

## P7 — Legally distinct by construction

- No Padlet/Miro/Notion trademarks, icons, mascots, or distinctive trade dress. Internal names like "padlet" in code/tables (`padlets` table, `FreeformPadletCards.tsx`) must be renamed to neutral terms (`boards`, `FreeformCards`) before any public launch or open-sourcing.
- Vendored forks (Excalidraw, MIT) keep their LICENSE files and attribution.
- No GPL/commercial-ambiguous dependencies in the shipped bundle (dhtmlx-gantt and dhtmlx-scheduler are GPLv2/commercial dual-licensed — see SECURITY.md §Licensing; replace or purchase before GA).

## P8 — Multiplayer is the default state

Every feature is designed for two simultaneous editors first, one editor second. "Works single-player, breaks multiplayer" is a failing design review. Presence, attribution, and conflict behavior are part of every feature spec.

## P9 — Accessible is shippable

Keyboard operability and screen-reader labeling are part of "done" (ACCESSIBILITY.md). Canvas products historically ignore this; it is a differentiation lever with education customers — Padlet's core market.

## P10 — Measure, then argue

Product debates end with an experiment or a metric, not a longer meeting. Instrument first; feature flags make every launch reversible.
