# Fable 5 — Claude Working Guide

You are working on **Fable 5**, a visual collaboration platform (Padlet-class UX + Notion-class content model + Figma-class multiplayer). This file is the entry point; the documents in `.fable5/docs/` are the source of truth for all architectural and product decisions.

## Read Order for a Fresh Session

1. `docs/CURRENT_TASK.md` — what we're doing right now
2. `docs/ARCHITECTURE.md` — current-state audit + target architecture + migration strategy
3. The doc(s) covering the subsystem you're touching (index below)

## Document Index

| Area | Docs |
|---|---|
| Product | [VISION](docs/VISION.md) · [PRODUCT_PRINCIPLES](docs/PRODUCT_PRINCIPLES.md) (P1–P10, cite by number) · [COMPETITOR_ANALYSIS](docs/COMPETITOR_ANALYSIS.md) |
| Architecture | [ARCHITECTURE](docs/ARCHITECTURE.md) · [SYSTEM_DESIGN](docs/SYSTEM_DESIGN.md) · [DATABASE](docs/DATABASE.md) · [REALTIME_ARCHITECTURE](docs/REALTIME_ARCHITECTURE.md) · [PERMISSIONS](docs/PERMISSIONS.md) |
| Engineering | [COMPONENT_GUIDELINES](docs/COMPONENT_GUIDELINES.md) · [STATE_MANAGEMENT](docs/STATE_MANAGEMENT.md) · [CODING_STANDARDS](docs/CODING_STANDARDS.md) |
| Design | [UI_GUIDELINES](docs/UI_GUIDELINES.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [ACCESSIBILITY](docs/ACCESSIBILITY.md) |
| Quality | [PERFORMANCE](docs/PERFORMANCE.md) · [SECURITY](docs/SECURITY.md) · [TESTING](docs/TESTING.md) |
| Execution | [ROADMAP](docs/ROADMAP.md) · [CURRENT_TASK](docs/CURRENT_TASK.md) · [CHANGELOG_ARCHITECTURE](docs/CHANGELOG_ARCHITECTURE.md) |
| Governance | [SKILL](docs/SKILL.md) (how implementation models work here) · [CTO_PLAYBOOK](docs/CTO_PLAYBOOK.md) (how to THINK like the CTO — succession doc) · [CTO_GUIDELINES](docs/CTO_GUIDELINES.md) (session procedures) · [AI_WORKFLOW](docs/AI_WORKFLOW.md) (roles: Fable 5 CTO / GPT-5.5 senior / GPT-5.4 implementer) · [patches/](patches/) (numbered work units) · [CODER_HANDOFF_TEMPLATE](docs/CODER_HANDOFF_TEMPLATE.md) (paste for every delegation) |
| Knowledge | [LESSONS_LEARNED](docs/LESSONS_LEARNED.md) (solved-problem records — read the Reusable rule lines) · `.claude/skills/extract-approach/SKILL.md` (how to record new ones) |

## Non-Negotiable Rules (enforced in review; full detail in the docs)

1. **No direct Supabase/network calls in components.** Reads via repositories/selectors, writes via commands→ops (`lib/domain`). Legacy call sites are being extracted, not multiplied.
2. **One implementation per concern (P6).** Before writing a card, comment UI, modal, DnD handler, or date util — find the existing one. If two exist, use the designated survivor (check docs), never add a third.
3. **File ceilings:** 400 lines/component, 800/file. Never grow a file already over the ceiling.
4. **Layouts are plugins.** No `switch (layout)` in engine code; no layout-specific schema. New layout = new folder implementing `LayoutPlugin`.
5. **Migrations only via `supabase/migrations`** (timestamped, RLS in same migration). Never SQL-editor patches, never root-level `.sql` files.
6. **All external input through zod** (API bodies, JSONB, localStorage, AI output).
7. **No new "padlet" naming** in code, tables, or copy (legal, P7). Neutral terms: board, post, block, placement, section.
8. **Behavior-preserving refactors ride the characterization suite** — run relevant Playwright flows before and after; a refactor PR with behavior diffs is two PRs.
9. **Don't delete or "fix" the known dualities opportunistically** (two canvas systems, three comment stores, kanban island) — each has a planned migration phase; ad-hoc fixes strand data.
10. **Never lose user work (P3):** destructive ops need undo or soft-delete; no silent catch; report failures honestly.
11. **Extract before you move on:** after every non-trivial solved problem (surprise root cause, 3+ attempts, review-caught defect, reversed decision), create or update a learning note in [LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md) using the `extract-approach` skill format — in the same session, before starting the next task. A problem solved without a note will be solved again.

## Current Phase

**Phase 1 — Domain Layer & Characterization Net** (Phase 0 executed 2026-07-06; carried
items listed in CURRENT_TASK.md). All implementation flows through numbered patches in
`patches/` — one patch at a time, owner approval between patches. Implementation models:
read [SKILL.md](docs/SKILL.md) before touching anything. During Phases 1–3, new features
ship on the new architecture or not at all.

## Repo Facts (verified 2026-07-06)

- Next.js 15 App Router · React 19 · TS 5 · Tailwind 4 + Radix · Supabase · Stripe · vendored Excalidraw fork (MIT — keep attribution).
- Known hotspots: `app/dashboard/canvas/[id]/CanvasClient.tsx` (8.5k lines, being strangled), `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (6.4k), duplicated canvas stacks under `components/canvas` and `components/collabboard/canvas`, kanban vertical under `components/kanban-canvas` + `kanban_*` tables.
- The `lib/ai` module (contracts/registry/validators) is the house-style exemplar — imitate its structure.
- Repo-wide standards in `.claude/rules/` still apply; where they conflict with `.fable5/docs`, the Fable 5 docs win.

## Update Discipline

These docs are living. When a decision changes: update the owning doc **in the same PR** as the code change, and log it in CURRENT_TASK.md. A doc that contradicts the code is a P0 doc bug.
