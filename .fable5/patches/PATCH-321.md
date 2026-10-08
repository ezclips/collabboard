# PATCH-321 — Kanban: priority "None" stays None

## Why
Live: a card set to priority "None" shows MEDIUM after a reload. Three causes:
1. Load (`store.tsx` ~162 and ~235): `let priority = 'medium'`; only 1 → low,
   ≥3 → high, so 0/null/2 all become medium.
2. New card / duplicate (`store.tsx` ~1366, ~1410): `priorityNum = 2` default,
   so every new card is saved as Medium.
3. Update (~1468): only writes priority when a value is given; choosing None
   (undefined) writes nothing, so the old number stays.
`kanban_cards.priority` is `INTEGER DEFAULT 0`.

## Design
One mapping, used everywhere (load, add, duplicate, update, adapter
`toDbPriority`): `0`/`null` ↔ none (`undefined` on the Card), `1` low,
`2` medium, `≥3` high.
- Load maps 0/null to `undefined` (None).
- New cards save 0 unless a priority was chosen; duplicate copies the source
  (None stays None).
- Update: when the update explicitly carries `priority` (key present, even if
  `undefined`/None), write the mapped number (None → 0). When the key is absent,
  do not touch priority.
- Editor "None" must produce that explicit None update.
- Group by Priority / filter keep working (None is the "No Group" bucket).
- Existing rows with 2 stay Medium (cannot tell old defaults from real Medium).

## Tests
Mapping table both ways; add card → 0; duplicate of a None card → 0; update
with `{ priority: undefined }` explicitly → writes 0; update without the key →
no priority field; load 0 → no badge.

## Verification
Focused tests; `npx tsc --noEmit`. List changed files.

## Allowed files
components/kanban-canvas/store.tsx, components/kanban-canvas/Editor.tsx,
lib/kanban/supabaseAdapter.ts, and tests. No git writes, no DB changes.
