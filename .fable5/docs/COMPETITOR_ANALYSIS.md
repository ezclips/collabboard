# Competitor Analysis

What we take from each competitor, what we deliberately reject, and where the legal lines are. Knowledge current as of early 2026 — revalidate quarterly.

## Padlet (primary target)

**Strengths to match:** instant board creation; format variety (wall, stream, grid, shelf/columns, map, timeline, canvas); education-friendly moderation (post approval, profanity filter); reactions/grading; simple sharing model (secret link, visitor permissions); excellent mobile experience; "Sandboxes" (whiteboard-lite).

**Weaknesses to exploit:**
- Format switching is lossy and limited (shelf ↔ timeline loses grouping).
- Posts are flat: one attachment, plain text body, no nesting or linked posts.
- Realtime degrades with 30+ concurrent users (education classrooms hit this).
- Search across boards is weak; no database/query views over posts.
- Free tier limited to 3 boards → churn and resentment; per-teacher pricing.
- No API/plugin ecosystem to speak of.

**Legal note:** "Padlet", "padlet" (the noun for a board) and its wall visual identity are trademarked. Our code currently uses `padlets` as a table name and "Padlet" in component names (`FreeformPadletCards.tsx`) — internal today, but must be renamed before public launch, open-sourcing, or hiring external contractors. Track in ROADMAP.md Phase 1.

## Milanote

**Take:** the moodboard aesthetic — cards with images that feel like a designer's pinboard; column containers on an infinite canvas; drag-from-sidebar asset library; per-board nesting (boards inside boards).
**Reject:** their sluggish canvas with large boards; weak realtime (visible sync lag); no education features.

## Excalidraw

**Take:** the hand-drawn aesthetic as an *option*; local-first ethos; keyboard-driven shape creation; the open-source component embedding model. We already vendor a fork (`components/collabboard/canvas/excalidraw_fork`, MIT license — retain attribution).
**Reject:** operating our drawing surface as a separate collab island. The fork ships its own Portal/Collab realtime stack; long-term the drawing layer must speak the same sync protocol as the rest of the board (REALTIME_ARCHITECTURE.md §Excalidraw).

## Miro

**Take:** frames + presentation mode from canvas content (we have `components/presentation` — good instinct); facilitation tools (timer, voting) as lightweight plugins; performant WebGL rendering at high object counts (their canvas virtualization is the industry bar).
**Reject:** enterprise-first complexity, 40-item toolbars, template-mall onboarding. Miro's first 60 seconds are our anti-pattern.

## FigJam

**Take:** cursor chat and playful presence (emotes, stamps) — cheap to build, huge collaborative-feel payoff; widget/plugin API shape; multiplayer quality bar (Figma's LiveGraph/multiplayer is the gold standard for "it just never conflicts").
**Reject:** dependence on a parent design tool; their pivot away from standalone investment shows the standalone-whiteboard market needs the structured-content depth we get from the Notion side.

## Notion

**Take:** blocks as the atomic content unit; databases-as-views (table/board/calendar/gallery over the same rows — this is our P1 principle applied to posts); `/` command; synced blocks (one source, many placements); comment threads anchored to blocks.
**Reject:** document-first navigation; their historically slow initial loads; their permission complexity (our model stays at workspace/board/link — three levels, PERMISSIONS.md).

## Synthesis — the Fable 5 wedge

| Capability | Padlet | Miro | Notion | **Fable 5** |
|---|---|---|---|---|
| 60-second board creation | ✅ | ❌ | ❌ | ✅ |
| Lossless layout switching | ❌ | ❌ | ✅ (db views) | ✅ |
| Structured/nested content | ❌ | ⚠️ | ✅ | ✅ |
| Realtime at classroom scale | ⚠️ | ✅ | ⚠️ | ✅ |
| Drawing surface | ⚠️ | ✅ | ❌ | ✅ |
| Plugin/extensibility | ❌ | ✅ | ⚠️ | ✅ |

The wedge: **Padlet's onboarding + Notion's content model + Figma's multiplayer quality.** No incumbent holds all three; each is structurally blocked from the others' strengths (Padlet by its flat data model, Notion by document-first architecture, Miro/FigJam by enterprise/design-tool gravity).

## Standing intelligence tasks

- Quarterly: re-test Padlet's format-switching, concurrency limits, and pricing.
- Watch tldraw (SDK licensing changes) and Canva Whiteboards (distribution threat, education overlap).
- Watch AI-native entrants: board generation from prompt is table stakes by 2027 — our `lib/ai` pipeline (contracts, mode-registry, validators) is ahead; keep it.
