# PATCH-063 — Drawing/container fix arc: unify blank-title placeholder semantics + close the arc

**Status:** APPROVED — implement exactly. **Implementer:** GPT-5.4 acceptable
(one shared pure helper + four narrow call-site edits + tests; no routing,
no data-model, no DOM-structure change). **Authored/approved:** 2026-07-14
by the CTO model.

> **This is a corrective/retroactive spec.** Five commits already landed on
> `origin/main` (`39ff3c1`, `866803d`, `2ba06ca`, `9d2e527`, `625fdde`) under
> an *unapproved draft* of this file, and two more fixes sit uncommitted. An
> independent review returned **PASS WITH REQUIRED CHANGES**. This rewrite
> records what actually shipped, ratifies the good parts, and binds the
> corrective commit that closes the arc. It supersedes the prior draft
> entirely (the old draft's file list, `lib/infra/collabboard/postType.ts`
> resolver, and editor-routing goal were never implemented and are **withdrawn**
> — editor routing is explicitly OUT of scope; see §7).

**Bound commit message:**

```
fix(drawing): unify blank-title placeholder handling and close container-fix arc (PATCH-063)
```

---

## 1. What already landed (ratified, do not redo)

Verified on `origin/main` @ `625fdde` and accepted by review:

- **A. Drawing edit-target labels** — `lib/infra/drawing/containerEditTargetLabel.ts`
  (+ 12 passing tests). Meaningful title wins; blank/whitespace/`Untitled`/
  type-placeholder fall back to semantic type; single child → `Edit <label>`,
  multiple → submenu label (`components/collabboard/canvas/ui/CanvasContextMenu.tsx`
  `singleOpenTarget` path); selecting a target still calls the same
  `onOpenTarget(target)`. **Behavior correct.** Only defects: (a) its placeholder
  rule diverges from PostCardContent's, and (b) a redundant duplicated guard
  line — both fixed in §3.
- **B. Table titles (partial)** — `PostCardContent.tsx` (`getMeaningfulTypeTitle`,
  table `<h4>` gated), `CanvasClient.tsx` (blank table title on create/insert),
  `CanvasModals.tsx`, `editors/TableEditor.tsx`, `hooks/canvas/usePadletSave.ts`
  (`saveTable` trims, no `'New Table'` fallback). Blank tables persist blank
  through the create→edit→save chain. **Correct on these surfaces**; two OTHER
  render surfaces were missed — fixed in §3.
- **C. Drawing comment-toggle styling (uncommitted)** —
  `RowColumnContainerCard.tsx` L433: the child "Add a comment" button appends
  literal light colours (`#f3f4f6` / `#4b5563` / hover `#e5e7eb`, `!shadow-none`)
  ONLY when `canvasContext === "drawing"`, to defeat the Excalidraw fork's
  `.excalidraw { --color-gray-100: #121212; }` override
  (`excalidraw_fork/.../css/theme.scss:103`) that Tailwind v4's `bg-gray-100`
  resolves against. Wall/Row/Columns never pass `canvasContext` → unchanged.
  Source dims preserved (`text-[10px] px-1.5 py-0.5 rounded-full`, icon `w-3 h-3`).
  **Correct — commit as-is in this arc's commit.**
- **D. Drawing container bottom-clipping (uncommitted)** —
  `DrawingLayout.tsx` L451: natural-height buffer `stripH + 20 + h` →
  `stripH + 22 + h` (exactly +2px), comment updated. `onNaturalResize` still
  only writes the in-memory height lock (`recentlyNaturalResizedRef`); the
  `< 1px` early-return convergence guard is untouched, so no new resize churn.
  **Correct — commit as-is in this arc's commit.**

## 2. Why this corrective patch (the required changes)

The review found the placeholder-title concern implemented **three divergent
ways** and **two live surfaces still emitting a generated `"Table"`**, violating
approved scope B ("no generated visible Table or Image title") and E
("one pure shared helper, no divergent rules"):

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx:3502` —
  `{padlet.title || 'Table'}` (live: Freeform canvas, imported by CanvasClient).
- `components/collabboard/ContainerChildPreviewCard.tsx:273` —
  `content={padlet.title || "Table"}` (live via `PostPreviewCard` in
  Columns/Wall/Row and settings previews).
- `PostCardContent.getMeaningfulTypeTitle` recognizes `new <type>` /
  `untitled <type>`; `containerEditTargetLabel.isTypePlaceholderTitle` only
  matches the bare type — a legacy row titled `"New Table"` blanks on one
  surface and prints verbatim on another.
- `containerEditTargetLabel.ts:52` duplicates the guard at L49 (dead code).

## 3. Scope of the corrective commit

### Files to CREATE
- `lib/infra/collabboard/postTitle.ts` — the single shared pure helper (§4)
- `lib/infra/collabboard/postTitle.test.ts` — its regression net (§5)

### Files to MODIFY
- `components/collabboard/PostCardContent.tsx` — delete the local
  `getMeaningfulTypeTitle`; import and use `getMeaningfulTitle` at the table
  `<h4>` site (L467/476). Behavior identical on this surface; it now shares
  the canonical rule.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` — at L3497–3503,
  replace `{padlet.title || 'Table'}` with a gated title:
  `const tableTitle = getMeaningfulTitle(padlet.title, 'table')` and render
  `{tableTitle && <h4 …>{tableTitle}</h4>}`.
- `components/collabboard/ContainerChildPreviewCard.tsx` — at L273, replace
  `padlet.title || "Table"` with `getMeaningfulTitle(padlet.title, "table")`.
- `lib/infra/drawing/containerEditTargetLabel.ts` — delegate placeholder
  detection to the shared `isPlaceholderTitle`; delete the local
  `isTypePlaceholderTitle`; collapse the two identical title-return guards
  (L49 & L52) into one. Keep `getMetadataDisplayTitle` and `formatSemanticType`
  (label-specific enrichment). Net label behavior must be unchanged for its
  12 existing tests (they are characterization — see §5).
- `lib/infra/drawing/containerEditTargetLabel.test.ts` — may add cases; MUST
  keep all 12 existing assertions green and unmodified.

### Files committed AS-IS in this same commit (already-reviewed C & D)
- `components/collabboard/RowColumnContainerCard.tsx` (the L433 drawing-colour edit)
- `components/collabboard/canvas/layouts/DrawingLayout.tsx` (the L451 +2px edit)

These are the current uncommitted working-tree changes; commit them unchanged.
They normalize to pure LF on staging (`core.autocrlf=true`); do not hand-edit
their line endings.

### MUST NOT be touched (hash-fenced — verify before and after)
```
lib/infra/drawing/bridge.ts                                   ed26c312610a386711f658662e82d29dd48c5890
lib/infra/drawing/bridge.test.ts                              b6f3e674328e06304e08d6f079a553df4d36464e
lib/infra/drawing/importScene.ts                              8fbf501c4a6ca723c87cdfdd58ead55363be9000
components/presentation/slide-renderer/resolveSlidePadlets.ts 5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
app/dashboard/canvas/[id]/CanvasClient.tsx                    1c6864b46e1c5c9a52f9e771ee2e51793898ecd8
components/collabboard/canvas/ui/CanvasContextMenu.tsx        904f97ba2f264d87a8d073b7b69fcda346da50b5
hooks/canvas/usePadletSave.ts                                 2615511796176dbc1f9ac747870cbdd47b773437
components/collabboard/editors/TableEditor.tsx                dcd9344598c0cc5f4701fda675ce30538e370a96
```
Plus, categorically (per §7): `excalidraw_fork/**`, `supabase/**`, any
migration/schema, `package.json`/`package-lock.json`, `vitest.config.ts`,
`eslint.boundaries.config.mjs`, middleware/next config, and all PATCH-062
bridge files.

## 4. Shared helper contract — `lib/infra/collabboard/postTitle.ts`

Pure, no React, no I/O, no `console.*`; structural input types (`unknown`),
never throws. Exactly two exports:

```ts
export const isPlaceholderTitle = (title: unknown, type: unknown): boolean
export const getMeaningfulTitle = (title: unknown, type: unknown): string
```

Normalization: `titleNorm` = `String(title ?? "").trim().toLowerCase()`.
`typeNorm` = `String(type ?? "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()`.

`isPlaceholderTitle` returns **true** iff `titleNorm` is any of:
- `""` (blank / whitespace-only)
- `"untitled"`
- `typeNorm` (and `typeNorm` non-empty)
- `"new " + typeNorm`
- `"untitled " + typeNorm`
- `"image"` **when** `typeNorm === "table"` (legacy drawing-table children were
  historically saved titled `"Image"`)

`getMeaningfulTitle` returns `""` when `isPlaceholderTitle(title, type)`, else
the original title with only surrounding whitespace trimmed
(`String(title).trim()`).

Cross-type safety (bound by test): `isPlaceholderTitle("Image", "comment")`
is **false** — the table→image legacy applies only when the type is `table`,
so a comment a user explicitly titled `"Image"` keeps `"Image"`.

`containerEditTargetLabel.ts` consumes `isPlaceholderTitle` only; its
metadata-fallback (`caption`/`linkTitle`/`todoTitle`/`title`) and Title-Case
`formatSemanticType` stay local. Its resolution order is unchanged:
meaningful title → metadata display title → semantic type.

## 5. Required tests

**`lib/infra/collabboard/postTitle.test.ts`** (runs under the existing
`lib/infra/**/*.test.ts` include — no config change). Must assert at least:
- blank and whitespace-only → placeholder; `getMeaningfulTitle` → `""`
- `"Untitled"` → placeholder
- exact type match (`"Table"`, type `table`) → placeholder
- `"New Table"` and `"Untitled Table"` → placeholder
- legacy table titled `"Image"` (type `table`) → placeholder
- **`"Image"` with type `comment` → NOT placeholder** (returns `"Image"`)
- meaningful title (`"Budget"`, type `table`) → returned verbatim
- underscore/hyphen type normalization (e.g. `ai_component` vs `"Ai Component"`)

**`lib/infra/drawing/containerEditTargetLabel.test.ts`** — all 12 existing
assertions remain green and unedited (they characterize A; if the delegation
breaks any, the refactor is wrong — fix the helper, not the test).

**C and D are not unit-testable without new DOM/env infra** (a config change,
which is excluded). They are covered by the static + manual gates in §6.
State this honestly in the report; do not fabricate a passing unit test for
inline JSX styling or a layout constant.

## 6. Verification gates

Static (paste output):
```bash
git diff --check
# blank-title fallbacks are gone from the two missed surfaces:
grep -n "|| 'Table'\|\"Table\"" components/collabboard/canvas/ui/FreeformPadletCards.tsx components/collabboard/ContainerChildPreviewCard.tsx   # no title-fallback hits
# drawing-only colour literals present and context-gated:
grep -n '#f3f4f6' components/collabboard/RowColumnContainerCard.tsx    # 1, inside the canvasContext === "drawing" branch
# +2px buffer:
grep -n 'stripH + 22 + h' components/collabboard/canvas/layouts/DrawingLayout.tsx   # 1
# no divergent local placeholder rule remains:
grep -n 'getMeaningfulTypeTitle\|isTypePlaceholderTitle' components/collabboard/PostCardContent.tsx lib/infra/drawing/containerEditTargetLabel.ts   # 0
```
Build/test:
```bash
npx vitest run lib/infra/collabboard/postTitle.test.ts
npx vitest run lib/infra/drawing/containerEditTargetLabel.test.ts   # 12 green
npx tsc --noEmit
npm run check:boundaries
npx vitest run
npm run verify
npm run build
```
Re-verify every §3 MUST-NOT-CHANGE hash after the run. Confirm no `.next/**`
or log artifacts are staged (`git status --short`).

Manual runtime (port-gate per LESSONS_LEARNED — never build under a live dev
server; attribute any listener on :3000 before touching it):
1. Drawing container with a blank-titled table child → card shows **no**
   generated "Table"/"Image" heading; a table titled "Budget" shows "Budget".
2. Same blank table on Freeform and in a Columns/Wall preview → still blank.
3. Drawing edit menu: single child → `Edit <Type>`; multiple → submenu labels;
   a comment titled "Image" still reads "Image"; a legacy table titled "Image"
   reads "Table"; selecting any target opens the same record/editor as before.
4. Drawing comment toggle button renders light (not a solid dark pill); Wall/
   Row/Columns comment buttons visually unchanged.
5. Drawing container footer/bottom border no longer clipped; **drag and zoom a
   Freeform table card** (DOM-critical guardrail — the `<h4>` gate must not
   disturb drag/zoom/popup anchoring).

## 7. Explicit exclusions (stop and report if a fix seems to need these)
Editor/edit routing (`isImageEditPadlet`, `openPadletInTypeEditor`,
`onPadletEdit` targets); comment data model; image auto-container behavior;
frame persistence/membership; slide preview/export; lines; duplication;
clipboard; AI-image rendering; the Excalidraw fork; database/schema; config;
dependencies. The two blank-table surfaces must be fixed at the render
expression only — no restructuring of `FreeformPadletCards` DOM (interaction
engine; see the freeform DOM-critical rule).

## 8. Stop conditions
- Any §3 MUST-NOT-CHANGE hash would change.
- Delegating the label helper regresses any of the 12 existing label tests.
- A blank-table fix appears to require DOM restructuring, editor routing, or a
  vitest env/config change.
- The shared rule cannot satisfy both card-site and label-site semantics with
  one function (it can — proven by the §5 matrix; if not, the census is wrong,
  amend the spec).

## 9. Rollback
Single commit; additive helper + narrow edits. `git revert <commit>` restores
the pre-arc-close tree. No schema, dependency, fork, or bridge file changes, so
revert is clean.

## 10. Acceptance criteria
1. One commit, bound message, only §3 files (create/modify + the two AS-IS).
2. Every §3 MUST-NOT-CHANGE hash intact.
3. `getMeaningfulTitle`/`isPlaceholderTitle` is the sole placeholder rule;
   `getMeaningfulTypeTitle` and `isTypePlaceholderTitle` are gone.
4. Both missed surfaces no longer emit a generated title; meaningful titles show.
5. 12 label tests green + new `postTitle.test.ts` green; full suite green.
6. `npm run verify` + `npm run build` green; dev server reaches Ready.
7. C and D committed unchanged; Wall/Row/Columns styling and all excluded
   subsystems provably untouched.

## 11. Estimated difficulty
easy–medium.
