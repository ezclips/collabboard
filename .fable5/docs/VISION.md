# Vision

> Fable 5 — the visual collaboration platform that combines the approachability of Padlet, the spatial freedom of Milanote/Miro, the drawing fluency of Excalidraw/FigJam, and the structured depth of Notion — while being legally and visually distinct from all of them.

## The One-Sentence Vision

**A single canvas product where a teacher, a product team, and a family can each create a beautiful, living board in under 60 seconds — and where that board scales gracefully from 5 posts to 5,000 without ever feeling slow or cluttered.**

## Why We Win

Padlet's weaknesses (validated by user complaints and our own analysis):

1. **Layout lock-in** — switching a Padlet between formats loses information or breaks arrangement. We treat *layout as a view over data*, never as the data itself. Any board can be re-projected as wall, grid, timeline, map, kanban, or freeform canvas without loss.
2. **Shallow content model** — Padlet posts are flat. Our posts are structured blocks (text, todo, table, spreadsheet, drawing, embed) that can nest, link, and be queried — a Notion-grade content model inside a Padlet-grade UX.
3. **Weak realtime under load** — Padlet degrades with many concurrent editors. We design realtime as a first-class subsystem (see REALTIME_ARCHITECTURE.md), not a database trigger side effect.
4. **Closed extensibility** — Padlet has no plugin story. Our layout engine and block renderers are registries; new layouts and block types are plugins, not rewrites.
5. **Pricing resentment** — Padlet's 3-board free tier drove churn. Our free tier is generous on *boards*, monetizing on *collaboration scale, storage, and AI*.

## What We Are Not

- Not a whiteboard-only tool (Excalidraw/tldraw) — drawing is one layout among many.
- Not a document tool (Notion) — the canvas is primary; documents are content inside it.
- Not an enterprise diagramming suite (Miro/Lucid) — we optimize for the first 60 seconds, not for facilitation consultants.
- Not a Padlet clone. We share the category, not the implementation, naming, visual identity, or code.

## Product Pillars (in priority order)

1. **Speed** — every interaction under 100 ms perceived; board open under 1.5 s p75.
2. **Usability** — zero-training creation; progressive disclosure of power features.
3. **Collaboration** — presence, comments, reactions, and conflict-free co-editing everywhere.
4. **Extensibility** — layouts, block types, and exporters are plugin registries.
5. **Reliability** — no data loss, ever. Offline-tolerant writes, versioned content, auditable history.

When pillars conflict, the lower number wins. A feature that adds capability but costs speed ships only after the speed cost is paid down.

## North-Star Metrics

| Metric | Target (18 months) |
|---|---|
| Time-to-first-published-board (new user) | < 60 s median |
| Board open, p75, 200-post board | < 1.5 s |
| Weekly boards with ≥ 2 active collaborators | > 35% of active boards |
| Data-loss incidents | 0 |
| Free → paid conversion | > 4% |

## Current Reality (July 2026)

The codebase is a feature-rich prototype: 10+ layout types (wall, row, columns, timeline, map, kanban, gantt, scheduler, freeform/drawing, graph), AI generation, imports, exports, Stripe billing. It has proven the product surface. It has **not** yet proven the architecture — see ARCHITECTURE.md for the honest audit. The next phase is consolidation: one canvas engine, one data model, one realtime protocol, then scale.
