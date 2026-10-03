# PATCH-272 — Load and save AI posts from their validated data, not the raw object

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F6 (HIGH), confirmed by Codex with a
pure-function pipeline check).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-271 (ab84df57). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` F6 and the
"Persistence and compatibility" section — especially: "`parseOutline` drops both example and estimate flags: blindly
switching serialization to its output changes trusted metadata … Make policy explicit with separate model/stored
parsers … test old posts first. Avoid destructive bulk rewrites."

## Why
`lib/ai/persistence.ts` `isStructuredAIContentData` (~L50-80) runs `safeValidateAIContent(...)` but returns only
`.success`; `isPersistedAIContentEnvelope`, `migrateAIContentEnvelope`, `serializeAIContentForPersistence` (~L96-170)
and `lib/ai/normalize-ai-content.ts` `normalizeAIContent` (~L59-80) then load, render and SAVE the ORIGINAL object.
The schemas' transforms are therefore dead: an unknown `antv:` template (validators.ts ~L219 falls back to
`antv:list-grid-badge-card`), `parseOutline`'s sanitising of the outline (bounds, `elementOverrides` / `additions`
sanitizers, label limits) and similar cleaning never reach what is rendered or stored. Codex: validated
`antv:list-grid-badge-card`, serialized `antv:obsolete-template`. The Edit window has the same pattern
(`AIContentEditModal.tsx` ~L727, ~L744).

## Design
### A. Return the parsed data (`lib/ai/persistence.ts`, `lib/ai/normalize-ai-content.ts`)
- Add `parseStructuredAIContentData(value): AIContentData | null` (the validated, transformed data, or null) and
  `parsePersistedAIContentEnvelope(value): StoredAIContent | null` (envelope with parsed `data`; `mode`, `version`,
  `meta` unchanged). Keep the boolean `is…` helpers as thin wrappers so existing callers compile.
- `migrateAIContentEnvelope`, `serializeAIContentForPersistence`, `deserializePersistedAIContent`,
  `normalizeAIContent` use the PARSED data for everything they return. Legacy HTML / legacy lesson board / unversioned
  structured data / unsupported versions keep exactly today's behaviour.
- The Edit window (`AIContentEditModal.tsx`) loads and saves through the same parsed path (wiring only — file is
  > 800 lines).
### B. Stored data is not model output — keep trusted fields
- The stored-data path must NOT lose legitimate fields the app itself wrote: the outline's `valuesEstimated`
  (provenance of AI-estimated numbers), `elementOverrides` (incl. `additions`), `kicker`, `theme`, `style`, item
  `textStyle` / `side` / `value`, `meta.generatedBy`. Today `parseOutline` drops `valuesEstimated` /
  `valuesExample` (correct for MODEL output). Introduce an explicit option or a second entry point
  (`parseOutline(raw, { source: 'stored' })` or `parseStoredOutline`) that keeps `valuesEstimated` and still drops
  `valuesExample` / `valueExample` (examples are never real data — PATCH-268), and use it inside the stored-data
  schema path. The MODEL path keeps dropping all of them.
- Where model output enters (`app/api/ai/generate-outline/route.ts`, `generate-component`, `convert-component`),
  check that server-only fields (`valuesEstimated`, `valuesExample`, `elementOverrides`, `kicker`) are stripped from
  the MODEL's output before validation; add the strip where missing and say where.
### C. No migration, no bulk rewrite
- Nothing in the database changes. An old post is cleaned when it is LOADED (in memory) and stored cleaned only when
  the user next saves it. No script, no backfill.
- In the report, list every user-visible behaviour change (e.g. a post whose stored template no longer exists now
  renders the fallback design consistently in the board, the Edit window and on save).

## Tests
- Legacy replay fixtures (new `lib/ai/persistence.fixtures.ts` or a test-local set) — at least: a current v1 AntV
  infographic with theme/style/kicker/elementOverrides+additions/valuesEstimated/textStyle; a v1 infographic with an
  unknown `antv:` template; our own six infographic templates; a native mind map with `tree`; a code-only mind map;
  pie and bar chart diagrams; timeline; comparison; flowchart; photo card with kicker; lesson board; workshop board;
  legacy HTML; unversioned structured data; an unsupported version. For EACH: `normalizeAIContent` and
  `serializeAIContentForPersistence` succeed as before, and the parsed result deep-equals the input EXCEPT the
  intended cleanings (assert those explicitly: unknown template → fallback; out-of-range override dropped; a
  `valueExample` / `valuesExample` dropped).
- Codex's case: stored `antv:obsolete-template` → normalized AND serialized template = `antv:list-grid-badge-card`.
- `valuesEstimated` survives load + save; a model output carrying `valuesEstimated` / `elementOverrides` / `kicker`
  loses them on the model path.
- Edit window: open a stored post with an unknown template → it shows and saves the fallback.
- Mutation (revert with Edit): return the raw object again from `parseStructuredAIContentData` → Codex's case fails.

## Allowed files
```
lib/ai/persistence.ts (+ tests), lib/ai/normalize-ai-content.ts (+ tests)
lib/ai/validators.ts (+ tests), lib/ai/outline.ts (+ tests)        the stored-vs-model outline parsing
components/ai/editors/AIContentEditModal.tsx (+ tests)              wiring only
app/api/ai/generate-outline/route.ts, app/api/ai/generate-component/route.ts, app/api/ai/convert-component/route.ts
  (+ tests)                                                          only the model-output strip, if missing
new fixture/test files next to these
```
Forbidden: everything else, the database, migrations, `package.json`. Real tool calls only (never write a tool call
as plain text); one test file at a time with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results
with diff/process substitution, no test files outside the repo; revert mutations with your Edit tool; no git writes;
no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard app/api/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-272.json
```
The CTO compares failing files AND failing test names. Report: every file changed, every model-output strip
added, every user-visible behaviour change. Do not commit.

**Live (CTO):** the board's AI posts render exactly as before (signatures recorded before this patch in the CTO's
scratchpad: `sig-before-272.json` — 3 posts: an AntV infographic, a native mind map, a pie chart); open each in the
Edit window and Cancel; create one new AntV post with a kicker, a colour override and an addition, save, reload: all
kept; then delete it.

## Commit message (verbatim)
```
fix(ai): AI posts are loaded and saved from their checked data

The checks that clean up an AI post's data (unknown designs, invalid
element edits, over-long text) ran but their result was thrown away, so
the unchecked original was shown and saved. The checked version is now
what the board shows and what gets saved; nothing in existing posts is
rewritten until you save them.
```

## Final result (CTO, 2026-10-03, live)
Board signature of all AI posts (3: AntV infographic 108dffef, native mind map 0bb9fdfc, pie chart 1766c698)
recorded BEFORE the patch and AFTER: identical for all three. Each opened in the Edit window (write-locked): preview
and label render, Cancel. New AntV post with kicker "Q3 plan", fill #ff0000 on shape@0#0 and an added circle →
Save → reload: board and Edit window both show all three; no console errors; test post deleted. Gate
`.opencode-vitest-272.json`: failing test names identical to PATCH-271 (59/59); tsc clean. Accepted: unversioned bare
structured data keeps today's raw handling (spec carve-out); `normalize-ai-content.ts` needed no edit.
