# PATCH-138 — DOCUMENT CANVAS CARD, FREE-STANDING OPEN AFFORDANCE, DEFERRED "CARD VIEW" REMOVAL, DEAD-CONSTANT CLEANUP

**Status:** **CLOSED (NARROWED SCOPE — C-2 ONLY)** · ACCESSIBLE FREE-STANDING CARD EDIT ACTION
IMPLEMENTED AND INDEPENDENTLY VERIFIED AT `a87b7dd` · **CLASSIFICATION 2 — PASS WITH NON-BLOCKING
OBSERVATIONS** · TWO FILES, 25/25 AND 50/50 LINES · **C-1 / C-3 / C-4 REMAIN OPEN AND BLOCKED** ·
**PATCH-139 RELEASED** · SEE §15 (product decision) AND §16 (closure review) · NOT PUSHED
**Authored:** 2026-08-04 (CTO). **Base:** `89e1ab5`. **First authoring of this number** — see §1.
**Closed:** 2026-08-04 (independent governance review at `a87b7dd`, see §16).

> **§7 below records the pre-narrowing Option F block and is retained as history.** The owner's
> product decision at **§15** superseded it for **C-2 only**; §7's blockers B-1, B-2 and B-3 remain
> in force for C-1, C-3 and C-4. Read §15–§16 for current status.
**Predecessors:** PATCH-133 (document census) · PATCH-134 (Scope C blocked, §7/§8) ·
PATCH-135 (OPEN) · PATCH-136 (§18f sequence) · PATCH-137 (closed at `89e1ab5`).

---

## 1. Why this document exists, and what it is not

**There was no PATCH-138.** Before this commit `.fable5/patches/PATCH-138.md` did not exist,
and it never has:

```
git log --all --diff-filter=A -- .fable5/patches/PATCH-138.md   →  (empty)
```

The patch directory runs `… 135, 136, 137, 142, 143, 144, 145` — **138, 139, 140 and 141 are
absent**, as are 146 and 147. The brief's instruction to "reconstruct PATCH-138 from its own
governance history" therefore cannot be executed as written: there is no original defect
statement, no original reproduction, no original allowlist and no original acceptance criteria
to census. What exists is a **forward-reference carried in other patches' sequence tables**.

This document is consequently the **first authoring** of PATCH-138, not a re-review of one.
Everything below is derived from the referring documents and from the current source, and every
claim is labelled with which of the two it came from.

**The status line "PATCH-138: RELEASED · NEXT ACTIVE PATCH" is accurate only in the narrow sense
that PATCH-137 no longer blocks the slot.** It does not mean a scoped, authorized patch was
waiting behind it. It was not.

---

## 2. Numbering reconstruction — a four-way collision, resolved

The number 138 has carried **four mutually inconsistent meanings**:

| Source | What "PATCH-138" means there | Recency |
|---|---|---|
| `PATCH-133.md:687` | Links, backlinks, archive, reusable multi-board appearances — *"**NOT AUTHORIZED and not authorizable from this census**… Recorded so the sequence has a visible terminus, not as a queued work item"* | oldest |
| `PATCH-134.md:894` (§18f) | Document persistence, lifecycle, reconciliation, import/export | ↓ |
| `PATCH-136.md:303` (§12) | Editor / read-only modal split | ↓ |
| **`PATCH-136.md:1077` (§18f)** | **Document card, free-standing open affordance, deferred Card view removal, dead-constant cleanup** | **newest** |

**Resolution — `PATCH-136 §18f` is operative.** Three independent reasons:

1. It is the **latest** enumeration, and it explicitly supersedes §12 *within the same document*
   ("the document sequence shifts again").
2. It is **confirmed by what actually shipped**: §18f moved "PATCH-124 private-mutation removal"
   into the 137 slot, and PATCH-137 was authored, implemented and closed as exactly that. If
   §18f's mapping were not operative, PATCH-137 would have been the editor/read-only modal split.
3. `PATCH-134 §18f` states the governing rule directly: *"Historical planning numbers are
   non-authoritative (PATCH-133 §19c); this follows current evidence."*

**Operative PATCH-138 scope**, from `PATCH-136 §12`'s fuller phrasing of the same row
(`:302`) plus `:1077`:

> Document canvas card + free-standing open affordance (**inherits PATCH-134 Scope C**, and the
> `GROUP_H`/`OVERHEAD_H` cleanup).

Four components: **(C-1)** document canvas card, **(C-2)** free-standing open affordance,
**(C-3)** the deferred "Card view" removal, **(C-4)** dead-constant cleanup.

**This collision is itself a governance defect and is fixed at §12 below**, because leaving it
unresolved guarantees the same ambiguity recurs at 139.

---

## 3. Original-contract census — classified A–H

No original PATCH-138 contract exists (§1), so the census is taken over the **inherited
obligations** the referring documents attach to this number.

| # | Inherited claim | Source | Class | Evidence |
|---|---|---|---|---|
| 1 | Document canvas card presentation for `type: 'document'` posts | PATCH-136 §18f; PATCH-133 §11 | **H — requires new evidence** | `type: 'document'` **does not exist** in the `Padlet` union (`types/collabboard.ts:97`). The only `'document'` in that file is `importKind?: 'image' \| 'document'` (`:249`). The substrate was never built |
| 2 | Free-standing open affordance — *"explicit, visible, keyboard-reachable"* | PATCH-133 §11b/§11d, via PATCH-134 §8 | **A — still current and reproduced** | Absent. The only opener is a hover-revealed pencil (§4, C-2) |
| 3 | "Card view" removal from `CardActionsToolbar` (PATCH-134 Scope C) | PATCH-134 §7/§8 | **A — still current and reproduced** | PATCH-134 §7's seven-link chain re-verified link-by-link at today's paths (§4, C-3) |
| 4 | `GROUP_H` / `OVERHEAD_H` dead-constant cleanup | PATCH-136 §12, §18f | **A — still current and reproduced**, newly constrained | Both dead in production; now **pinned by an OPEN patch's characterization** (§4, C-4) |
| 5 | Inline card-branch `CardActionsToolbar` is the live toolbar | PATCH-134 §7 link 6 | **F — superseded by later architecture** | That instance is now dead-coded `{false && …}` (`FreeformPadletCards.tsx:1787`); the live one moved into a modal (`:5985`) |
| 6 | Links, backlinks, archive, reusable appearances | PATCH-133 §"PATCH-138" | **G — obsolete under this number** | Renumbered to **PATCH-141** by PATCH-136 §18f. Was never authorizable in any numbering |
| 7 | Board-level capability source (`resolveBoardPermission`) | PATCH-133 §11 BLOCKING PREREQUISITE | **A — still current and reproduced** | Does not exist in the repository; `PERMISSIONS.md` §1 mandates it |
| 8 | Export survivor designation (P6 breach if a third is added) | PATCH-133 §8 note | **B — still current, not reproduced here** | Out of this patch's ownership; recorded because C-1 would otherwise inherit it |

**No claim classified C, D or E.** Nothing in PATCH-138's scope was fixed or superseded by
PATCH-137, PATCH-142, PATCH-144 or PATCH-145 — see §6. That is a clean negative result, and it
is the single most useful finding of this review: **the closed presentation work and this
patch's ownership area do not intersect at all.**

---

## 4. Current-source census

Files named by the referring patches have **moved** since they were written
(`components/collabboard/` → `components/collabboard/canvas/ui/`), so every line reference in
PATCH-134 §7 is stale. All findings below are re-derived at current paths, reading full files
where the answer depended on absence.

### C-1 — Document canvas card

| Item | Finding |
|---|---|
| `Padlet['type']` union | `'text' \| 'image' \| 'file' \| 'table' \| 'link' \| 'todo' \| 'container' \| 'comment' \| 'drawing' \| 'card' \| 'note' \| 'ai-component'` (`types/collabboard.ts:97`) — **no `'document'`** |
| Defect path reachable? | **No — there is nothing to render.** The card presentation work has no substrate |
| Ordinary vs E2E build | No difference; not bridge-related |

### C-2 — Free-standing open affordance

`components/collabboard/CardPreview.tsx` (168 lines) read in full.

| Item | Finding |
|---|---|
| Only open affordance | An `Edit2` pencil button, in **both** render branches: clipart `:68-80`, default `:120-130` |
| Visibility | `opacity-0 group-hover:opacity-100` in both branches — **hover-revealed, not "explicit, visible"**. The default branch adds `opacity-100` only when `isSelected` |
| Accessible name | Clipart branch has `title="Edit"` (`:76`). **The default branch button (`:121-129`) has no `title` and no `aria-label`** — an icon-only control with no accessible name |
| `onEditContent` | Declared in the props interface (`:12`) but **never destructured** (`:19-27`) and never called anywhere in the file |
| Consequence | The handler wired at `FreeformPadletCards.tsx:1758-1762` is **unreachable**, and its `setIsCardViewerOpen(true)` is the **only** caller of that setter repo-wide. `isCardViewerOpen` is fully wired through (`useCanvasOverlays.ts:106,229` → `CanvasClient.tsx:474,810,836` → `:7360 isOpen={isCardViewerOpen}`) but **can never become true** |
| Test coverage | **None.** `CardPreview.test.tsx` (24 tests) covers `captionStyle` and consumer characterization only — no affordance, naming or `onEditContent` assertion |
| Changed since drafted? | **Yes** — `onEditContent` is new dead plumbing not present in PATCH-134's account |

**This is a live, bounded, verifiable defect: an entire modal path exists, is wired end to end,
and is dead because one prop is never destructured.**

### C-3 — "Card view" removal (PATCH-134 Scope C)

PATCH-134 §7's chain, each link re-verified at `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (6343 lines):

| Link | PATCH-134 claim | Current state | Holds? |
|---|---|---|---|
| 1 | Exclusive `type === 'card'` branch at `:1706` | `:1707` `{padlet.type === 'card' && (` | ✔ |
| 2 | Wrapped in `NotePostContextMenu`, no edit/open callback passed | `:1708-1719` — `onSelect`, `onDelete`, four layer ops, `onLock`, `onCreateSyncedCopy`. **No edit/open** | ✔ |
| 3 | `NotePostContextMenu` renders no Edit/Open item | Labels are exactly: Cut, Copy, Duplicate, Create Synced Copy, Delete, Group into Column, Lock/Unlock Position, Send to Back, Send Backward, Bring Forward, Bring to Front | ✔ |
| 4 | Hover pencil lives in a different, non-card branch | `showModalEditButton` `:3086`, rendered `:3216`, calls `openFreeformPadletModal` `:3222` (defined `:401`) | ✔ |
| 5 | `FreeformPadletCards` never receives `openPadletInTypeEditor` | **grep count = 0** in that file (exists only in `CanvasModals.tsx:81,112,270`) | ✔ |
| 6 | The live `CardActionsToolbar` is Freeform-only | Rendered from `CanvasClient.tsx:7025` only | ✔ |
| 7 | Wall/Map/Drawing wire an editor opener; Freeform does not | unchanged | ✔ |

**Changed but not invalidating:** the card-branch `CardActionsToolbar` (`:1788`) is now dead-coded
behind `{false && …}` (`:1787`, comment *"Left Toolbar - moved to card modal"*). The live
instance moved into a modal at `:5985`, reached via `CardPreview.onOpenToolbar` →
`setCardToolbarPadletId`.

**PATCH-134 §7's conclusion therefore still holds, by a different route:**
`CardPreview` pencil → `onOpenToolbar` → toolbar modal → `CardActionsToolbar` → "Card view"
(`CardActionsToolbar.tsx:79`) remains **the only path to the edit-mode `CardEditor` for a
Freeform card post**. Removing it without C-2 would still strand every card post.

**Hard stop from PATCH-134 §7 remains TRIGGERED.**

### C-4 — Dead-constant cleanup

| Item | Finding |
|---|---|
| Definitions | `CanvasSidebar.tsx:47` `const OVERHEAD_H = 105;` · `:48` `const GROUP_H = (toolCount: number) => 20 + toolCount * 44;` |
| Production references | **Zero** — no other use anywhere in `components/` or `lib/` |
| **Blocking coupling** | `e2e/characterization/patch-135-toolbar-overflow.spec.ts:206-207` asserts the **source text**: `expect(sidebarSource).toContain('const OVERHEAD_H = 105')` and the exact `GROUP_H` declaration |
| Owning patch status | **PATCH-135 is OPEN**, not closed |

Deleting the constants **necessarily fails an open patch's characterization**. This is a
source-text assertion pinning dead code in place — the removal cannot proceed as an isolated
cleanup.

### Current green baseline

`HEAD (89e1ab5)` differs from the fully validated `dad2784` by **one docs-only commit**
(`.fable5/patches/PATCH-137.md`, +416/−2), so PATCH-137 §22o's build evidence carries forward
unchanged. Re-confirmed at `89e1ab5`:

- ordinary `.next` present, **no `E2E_BRIDGE_BUILD` marker**;
- `node scripts/e2e/assertBridgeExclusion.mjs` → **exit 0**, 891 files;
- `CardPreview.test.tsx` + `ClipartCardDraftModal.test.tsx` → **69/69 pass**.

---

## 5. Reproduction

**There is no "original PATCH-138 reproduction" to attempt** (§1). What is reproducible is the
*state* each component asserts, and that was established by full-file source census rather than
by runtime, for a reason recorded here explicitly:

| Component | Reproduction method | Deterministic? | Result |
|---|---|---|---|
| C-1 | Type-union inspection | Yes | `'document'` absent — **nothing to reproduce against** |
| C-2 | Full read of `CardPreview.tsx`; repo-wide setter-caller search | Yes | Affordance absent; `onEditContent` unconsumed; `setIsCardViewerOpen` has exactly one, unreachable caller |
| C-3 | Seven-link chain re-verification | Yes | Chain intact at current paths |
| C-4 | Reference search + characterization inspection | Yes | Dead in production, pinned by `patch-135` spec |

**No runtime E2E reproduction was performed, and none is claimed.** C-2 and C-3 are *absence*
properties of a component's source — a passing E2E would not strengthen them, and building a
Freeform card fixture to demonstrate a missing button is implementation-adjacent work that this
governance role is not authorized to do. **When C-2 is eventually implemented, its proof must be
runtime and real-UI** (§9, §10) — source-text absence is adequate to *diagnose*, never to
*accept*.

**No closed patch was reverted to manufacture a failure.**

---

## 6. Interaction with PATCH-137 / 142 / 144 / 145 / 146 / 147

| Patch | Its territory | Overlap with PATCH-138 | Evidence |
|---|---|---|---|
| **PATCH-137** | Real-UI presentation editing; removal of private PATCH-124 mutation; target/unrelated thumbnail behaviour; C10a coalescing / C10b two-colour | **NONE** | PATCH-137 owns exactly one file, `e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts`. PATCH-138's area is `CardPreview.tsx`, `FreeformPadletCards.tsx`, `CardActionsToolbar.tsx`, `CanvasSidebar.tsx`. Disjoint |
| **PATCH-142** | Slide-local overlay ordering, host readiness, thumbnail semantic/invalidation isolation | **NONE** | Presentation/slide domain; no card-post or sidebar surface |
| **PATCH-145** | Embeddable height stability, revision/`versionNonce` propagation | **NONE** | `DrawingLayout` natural-height logic; excluded by default here (§7) |
| **PATCH-144** | Clean vendored declaration regeneration | **NONE** functionally; **consumed** as a validation precondition (§11 row 1) | Tooling only |
| **PATCH-135** | Responsive canvas toolbar overflow | **DIRECT AND BLOCKING for C-4** | `patch-135-toolbar-overflow.spec.ts:206-207` pins the two constants by source text. **PATCH-135 is OPEN** |
| **PATCH-146** | Many cycles inside one test process | **NONE** | No direct evidence of dependency. **Not absorbed** |
| **PATCH-147** | Windows harness lifecycle `spawn npm ENOENT` | **NONE** | No direct evidence of dependency. **Not absorbed** |

The **only** cross-patch coupling this review found is PATCH-135 ↔ C-4, and it was not
previously recorded anywhere.

**PATCH-137's closure observations O1 and O3 are recorded and deliberately not consumed.** O1
(C10a settle window) and O3 (unreproduced colour-hit anomaly) live in
`patch-124-slide-thumbnail-refresh.spec.ts`, which is outside every allowlist below. PATCH-138
does not touch that file.

---

## 7. Scope decision — **OPTION F: BLOCKED BY AN EXPLICIT DEPENDENCY**

Options rejected, with reasons:

| Option | Verdict |
|---|---|
| **A** — original remains valid | **Rejected.** There is no original to hold valid |
| **B** — narrow amendment | **Rejected.** Amending presupposes an existing authorization |
| **C** — partially superseded | **Rejected.** §6 shows nothing was superseded by the closed patches; only the intra-`PATCH-136` §12→§18f renumber moved (claim 5, class F) |
| **D** — fully superseded | **Rejected.** C-2, C-3 and C-4 are all live and reproduced (§4) |
| **E** — test/characterization debt only | **Rejected.** C-2's fix is production (`CardPreview.tsx`) |
| **F** — blocked by an explicit dependency | **CHOSEN** |
| **G** — insufficient evidence | **Rejected.** Evidence is sufficient and specific; the patch is not under-evidenced, it is **gated** |

### The exact blockers

**B-1 (blocks C-1) — the document substrate does not exist, and defining it is a product
decision.** `type: 'document'` is absent from the `Padlet` union. PATCH-133 recorded this scope
as *"NOT AUTHORIZED and not authorizable from this census. Requires the entity/placement schema
split (§5c) and a search index."* Nothing since has changed that.

**B-2 (blocks C-1, and the *quality* bar of C-2) — no board-level capability source.**
PATCH-133 §11's BLOCKING PREREQUISITE requires either a real `resolveBoardPermission` reaching
the canvas, or a recorded owner decision to ship against workspace-level `canEditWorkspace` as
an interim. **Neither exists.** Today's card affordance is gated on
`canUseFreeformEditButton` — a presentation-level flag, not a capability resolution.

**B-3 (blocks C-4) — an OPEN patch pins the dead constants by source text.**
`patch-135-toolbar-overflow.spec.ts:206-207`. C-4 cannot proceed while PATCH-135 is open without
editing that patch's characterization.

**C-3 remains blocked on C-2** by PATCH-134 §7's untouched hard stop.

### What is *not* blocked

**C-2's dead-plumbing defect is bounded, evidenced and independently fixable.** Wiring
`onEditContent` through `CardPreview`'s destructuring — or deleting it and its unreachable
handler — needs no product decision and no schema. It is deliberately **not authorized here**,
for one reason stated plainly: **choosing between "wire it up" and "delete it" is a product
decision about whether a card viewer is intended to exist**, and `isCardViewerOpen` is wired
through three files as though it were. Authorizing either branch would be this review inventing
product intent. **This is the single question that, once answered, unblocks the most work**, and
it is put to the owner at §12.

---

## 8. Production allowlist

**EMPTY. No production file is authorized for modification under PATCH-138 at this time.**

Recorded **prospectively**, to take effect only when §12's decision is made and this document is
amended:

| Path | Responsibility | Max change | Required behaviour | Forbidden |
|---|---|---|---|---|
| `components/collabboard/CardPreview.tsx` | Card open affordance | **≤ 25 lines** | Either consume `onEditContent` with an explicit, visible, keyboard-reachable, accessibly-named control, **or** delete the prop and its unreachable handler — per §12 | No captionStyle changes (PATCH-133 territory, 24 green tests); no reaction-rendering changes; no clipart-branch redesign |
| `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | The `onEditContent` call site only | **≤ 10 lines**, within `:1750-1765` | Matches the §12 branch | No touching `:1787`'s dead-coded toolbar, the modal at `:5985`, or any context-menu wiring |

**Excluded by default, and none is authorized:** PATCH-142 thumbnail ordering/readiness files ·
`DrawingLayout` natural-height logic (PATCH-145) · PATCH-144 type-generation tooling · the
PATCH-136 bridge (`lib/e2e/**`) · the Excalidraw fork · persistence/schema · `package.json` ·
PATCH-137's characterization · `CanvasSidebar.tsx` (blocked by B-3) · `CardActionsToolbar.tsx`
(blocked by C-2) · `types/collabboard.ts` (blocked by B-1).

---

## 9. Test allowlist

**EMPTY.** No test file is authorized for modification or creation at this time.

Prospective, on the same condition:

| Path | Kind | Max | Purpose |
|---|---|---|---|
| `components/collabboard/CardPreview.test.tsx` | unit, **append-only** | **≤ 40 added lines** | Assert the affordance's accessible name and reachability, or assert the prop's removal. **The 24 existing captionStyle/consumer tests must pass unchanged** |
| *(characterization)* | — | **not authorized** | A production-E2E proof is warranted **only** if the wire-up branch is chosen, and must then be a **new** file — never an edit to a PATCH-135/137/142 spec |

`ClipartCardDraftModal.test.tsx:417` — which asserts the toolbar label list including
`'Card view'` — is **explicitly not allowlisted**, exactly as PATCH-134 ruled: *"It is
allowlisted per the owner decision so that if it fails, the failure is investigated under an
authorized path — not so that it may be edited."* Any change to it is a **stop-and-report**.

---

## 10. Induced-failure plan

Not required now: no implementation is authorized, and §5's classification is a supersession-free
**block**, not a closure.

When C-2 is authorized, the load-bearing test must fail against the parent state as follows:

| Branch | Exact assertion | Exact incorrect parent state |
|---|---|---|
| **Wire-up** | Render `CardPreview` with `onEditContent`; query the control by accessible name; fire it; expect the callback | Parent fails: the prop is never destructured (`CardPreview.tsx:19-27`), so **no control exists and the callback is never invoked** |
| **Delete** | Static: `CardPreviewProps` has no `onEditContent`; `FreeformPadletCards` has no `setIsCardViewerOpen(true)` | Parent fails: both are present today (`:12`, `:1760`) |

Binding rules: **no source-text-only proof where runtime behaviour is testable** — the wire-up
branch must assert a rendered, invocable control, not the presence of a string; **no private
scene mutation**; **no `window.h`**; **no broadening of `__COLLABBOARD_E2E__`**; **no mutation
through returned bridge objects**; **no direct database writes** (persistence is not this
patch's defect).

---

## 11. Validation matrix

Governs any future PATCH-138 implementation; nothing to execute now beyond §4's baseline.

| # | Gate | Requirement |
|---|---|---|
| 1 | Clean declaration regeneration | **one** `npm run typecheck` after removing vendored `dist/types` and `.next` → exit 0, declarations regenerated (PATCH-144 contract) |
| 2 | Focused unit tests | `CardPreview.test.tsx` + `ClipartCardDraftModal.test.tsx` — **69/69**, the 24 captionStyle/consumer tests unchanged |
| 3 | Ordinary build | `npx next build` → exit 0 |
| 4 | Bridge exclusion | `node scripts/e2e/assertBridgeExclusion.mjs` → exit 0, no marker |
| 5 | Clean E2E build | only if a characterization is authorized; marker must read `1` |
| 6 | Focused characterization | only if authorized; **new file only** |
| 7 | Independent repeats | if a characterization exists: **ten independent `npx playwright test` process invocations**, no retries, no in-test loop (**PATCH-146 scope must not be consumed**) |
| 8 | Negative control | required for any affordance assertion — remove the wiring and prove the test fails, so it cannot false-green on an unrelated control |
| 9 | `git diff --check` | exit 0 |
| 10 | Final artifact | ordinary `.next`, **no** `E2E_BRIDGE_BUILD` marker |
| 11 | Worktree | only the five pre-existing protected paths outside committed history |

### Real-UI rule

Any presentation- or canvas-touching proof must use real visible controls and live
viewport/frame geometry, verify resulting scene state through the **read-only** bridge, and
verify ownership from the created/changed element itself. `window.h` is forbidden;
`__COLLABBOARD_E2E__` must not be broadened; returned bridge objects must not be mutated; raw
scene injection is forbidden.

### False-green protection

Reject any plan that assumes the pre-census diagnosis without re-verification; duplicates a
closed patch's behaviour; weakens PATCH-137 or PATCH-142 assertions; changes thumbnail
signatures to suppress legitimate input; uses private mutation; accepts a changed thumbnail
without proving scene state; uses `src` identity as the visual contract; substitutes a quiet
delay for an owner-produced completion condition; hides failures with retries; broadens
production APIs for testing; opportunistically mixes PATCH-146/147; or commits generated
declarations or E2E artifacts.

---

## 12. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Original defect no longer reproduces and no unresolved contract remains | **NOT TRIGGERED** — C-2, C-3, C-4 all reproduce (§4) |
| Required fix belongs entirely to a closed patch | **NOT TRIGGERED** — §6 finds zero overlap with the closed patches |
| Ownership cannot be bounded | **TRIGGERED for C-1** — no `type: 'document'`, no schema, no capability source. **Not triggered for C-2** |
| More than a narrow file set required | **TRIGGERED for C-1** |
| Bridge would need write access | **NOT TRIGGERED** |
| Fix requires reverting accepted PATCH-137/142 behaviour | **NOT TRIGGERED** |
| Only remaining failure is PATCH-146/147 tooling debt | **NOT TRIGGERED** — the findings are product-code findings |
| **A product decision is required to define correct behaviour** | **TRIGGERED** — three times: B-1 (document entity/placement model), B-2 (capability source, or a recorded interim decision), and the card-viewer question at §7 |

**Three hard stops trigger. Implementation authorization is withheld.**

### The one decision that unblocks the most work

> **`isCardViewerOpen` is wired through `useCanvasOverlays.ts` → `CanvasClient.tsx:7360` but can
> never become `true`, because `CardPreview` never destructures the `onEditContent` prop that is
> its only trigger. Is the card viewer intended to exist?**
>
> - **Yes** → authorize the wire-up branch (§8 row 1, §9 row 1, §10 wire-up): a real, named,
>   keyboard-reachable control, runtime-proven.
> - **No** → authorize the delete branch: remove the prop, the handler, and the unreachable
>   `isCardViewerOpen` plumbing.
>
> Either answer is a ≤ 35-line change across two files. **Neither can be chosen by this review
> without inventing product intent.**

---

## 13. Status, sequence and dependencies

**PATCH-138: OPEN · BLOCKED (Option F).** No implementation authorized. Production allowlist
empty. Test allowlist empty.

**PATCH-139: NOT RELEASED.** Release is conditioned on PATCH-138 closing or being implemented
successfully; it did neither.

**The sequence is fixed authoritatively here**, adopting `PATCH-136 §18f` and superseding the
`PATCH-133`, `PATCH-134 §18f` and `PATCH-136 §12` tables, so the §2 collision cannot recur:

| Number | Subject | Status |
|---|---|---|
| **PATCH-138** | Document card · free-standing open affordance · deferred "Card view" removal · dead-constant cleanup | **OPEN · BLOCKED** |
| PATCH-139 | Editor / read-only modal split | DEFERRED — **not released** |
| PATCH-140 | Document persistence / lifecycle / reconciliation | DEFERRED |
| PATCH-141 | Links, backlinks, archive, reusable appearances | DEFERRED — *not authorizable* (PATCH-133) |

**PATCH-135:** OPEN, and now a **recorded blocker for C-4** (§4, B-3) — a coupling not
previously documented anywhere.
**PATCH-146 / PATCH-147:** remain **RESERVED and non-blocking**. This review found **no direct
dependency** on either and did not absorb them.
**PATCH-142 / 144 / 145 / 137:** CLOSED, unaffected, untouched.

---

## 14. Recorded diagnostic notes

- **The most important finding was an absence, and absences are only visible in whole files.**
  `onEditContent` appears in `CardPreview`'s props interface and is passed by its caller. Every
  signal short of reading the destructuring block says the feature is wired. A diff-oriented or
  grep-oriented review would have confirmed the wrong answer twice — once at the type, once at
  the call site.
- **Stale line numbers are a warning, not an inconvenience.** Every reference in PATCH-134 §7
  was off, because the files had moved directories. Re-deriving the chain link-by-link cost
  little and turned up the genuinely changed link (the inline toolbar is now `{false && …}`) —
  which did not invalidate the conclusion, but would have been invisible to a review that
  trusted the old citation.
- **A patch number is not a patch.** "PATCH-138: RELEASED · NEXT ACTIVE PATCH" described a slot,
  not a scoped body of work, and the number carried four different meanings across four
  documents. The cheapest possible error here was to accept the framing, pick the most recent
  reading, and start work — producing a confidently-scoped patch against a definition nobody had
  ratified.
- **Dead code can be load-bearing for the wrong reason.** `GROUP_H`/`OVERHEAD_H` have no
  production consumer, yet cannot be deleted, because an open patch asserts their *source text*
  exists. A characterization that pins text rather than behaviour converts dead code into
  permanent code, and the coupling was undocumented until this census.
- **Refusing to choose is sometimes the deliverable.** C-2 is small, well-understood and
  tempting to authorize. But "wire it up" and "delete it" are opposite product answers to the
  same evidence, and picking one to keep momentum would have been this review manufacturing
  intent it does not have. The useful output is the bounded question at §12, not a guess.

---

## 15. Lead product decision and narrowed authorization (2026-08-04, owner)

§12 put one question to the owner. It was answered:

> **The card viewer is intended to exist.** PATCH-138 is narrowed to the existing free-standing
> card edit affordance: a usable edit control invokes the already-supplied `onEditContent`,
> which opens the existing card viewer/editor route. No new editor, modal, permission model or
> card type. **`onEditContent` must not be deleted.**

This selects the **wire-up branch** of §12 and supersedes §7's "not authorized" status for
**C-2 only**. C-1, C-3 and C-4 remain exactly as blocked in §7 — see §15m.

Authorized under the narrowing: `components/collabboard/CardPreview.tsx` (≤ 25 changed lines)
and `components/collabboard/CardPreview.test.tsx` (≤ 50 changed lines).

## 16. Closure review — INDEPENDENT (2026-08-04, CTO / independent governance reviewer)

Performed at `HEAD = a87b7dd`. Every claim below was re-derived from the commit object, the
source tree and fresh execution. Nothing was implemented, no production or test file was
modified, `a87b7dd` was not amended, nothing was pushed.

### 16a. Corrected source path

The implementation brief named `components/collabboard/canvas/ui/CardPreview.tsx`. **That path
does not exist.** The real path is `components/collabboard/CardPreview.tsx`, which is what §4
of this document already recorded. The commit touches the real path only.

**Classified as a prompt-path correction, not a scope violation** — the commit contains
exactly the governed component and its existing test file, and no file under
`canvas/ui/` was created or modified.

### 16b. Implementation commit review — source scope

`git show --numstat a87b7dd`:

| File | Ins | Del | Changed | Limit | Verdict |
|---|---|---|---|---|---|
| `components/collabboard/CardPreview.tsx` | 24 | 1 | **25** | 25 | **at limit, PASS** |
| `components/collabboard/CardPreview.test.tsx` | 48 | 2 | **50** | 50 | **at limit, PASS** |

Exactly two files. Every excluded path re-checked individually against the commit object and
returned empty:

`FreeformPadletCards.tsx` · `CanvasClient.tsx` · `CanvasSidebar.tsx` (GROUP_H/OVERHEAD_H) ·
`patch-135-toolbar-overflow.spec.ts` · PATCH-137 characterization · `patch-142-thumbnail-isolation.spec.ts` ·
`lib/e2e/**` (bridge) · `package.json` · `types/collabboard.ts` (no document-card type) ·
`supabase/**` (schema/persistence) · `excalidraw_fork/**` · `components/collabboard/editors/**` ·
`lib/infra/presentation/**` (thumbnail/presentation) · `canvas/hooks/**` (viewer state).

**No permission or capability service was added.** **PASS.**

### 16c. CardPreview review

| Requirement | Evidence | Verdict |
|---|---|---|
| `onEditContent` destructured | `:24`, added to the destructuring block | ✔ |
| Consumed in both relevant branches | clipart `:65-77`, default `:144-153` | ✔ |
| Invoked only through a semantic button | both sites are `<button type="button">` | ✔ |
| Guarded by callback presence | clipart ternary; default `onEditContent && (…)` | ✔ |
| No role / board-permission inference | no `canEdit*`, no role read, no capability call anywhere in the file | ✔ |

**PASS.**

### 16d. Clipart branch

The change replaces the empty placeholder inside the **same** grid slot:

```
-   <div className="w-5 h-5 shrink-0" aria-hidden="true" />
+   {onEditContent ? ( <button className="shrink-0 w-5 h-5 …" …/> ) : ( <div className="w-5 h-5 shrink-0" aria-hidden /> ) }
```

| Check | Result |
|---|---|
| Layout shift | **None.** Button and placeholder are both `w-5 h-5 shrink-0` in the same `gridTemplateColumns: 'auto 1fr auto'` slot; the placeholder is retained verbatim on the else-branch |
| Dead button without callback | **None** — the else-branch renders the original inert `div` |
| Duplicated in this branch | **No** — one `aria-label="Edit card"` button; the right-hand slot's button is the pre-existing `onOpenToolbar` control |

**PASS.**

### 16e. Default branch and the two-affordance decision

The governance preference was to reuse the existing pencil. **Repurposing it would have removed
the style-toolbar action**, proven by tracing both destinations to different terminals:

| Control | Handler | Chain | Terminal |
|---|---|---|---|
| Existing pencil (`top-1 right-1`) | `onOpenToolbar` | `FreeformPadletCards:1752-1756` → `setCardToolbarPadletId(padlet.id)` | Toolbar modal at `:5985` rendering `CardActionsToolbar` (Color · Icon · Caption · Card view · Reaction · Comment) |
| **New button (`top-1 left-1`)** | `onEditContent` | `FreeformPadletCards:1757-1761` → `setPadletToEdit` + `setIsCardViewerOpen(true)` | `CanvasClient.tsx:7359-7370` `CardEditor … readOnly={true}` |

**The two controls perform genuinely different actions.** They also occupy different corners, so
they do not overlap. **Second control ACCEPTED** on the governed condition. **PASS** — see
**O1** for a naming defect in the new control that is *not* a duplication defect.

### 16f. Accessibility

| Requirement | Result |
|---|---|
| Semantic `<button>` | ✔ both sites |
| `type="button"` | ✔ both sites |
| Stable accessible name `Edit card` | ✔ `aria-label="Edit card"`, both sites |
| Normal keyboard semantics | ✔ **by construction** — a native `<button>` receives Enter/Space activation; no `onKeyDown` interception, no `role` override, no `tabIndex` manipulation |
| No icon-only unnamed control | ✔ for the **new** control. The pre-existing `onOpenToolbar` button in the default branch (`:133-143`) still has **no** accessible name — pre-existing, recorded at §4, out of this patch's scope (**O5**) |

Icon consistency reviewed, no redesign required — see **O5**. **PASS.**

### 16g. Callback-presence rule

| Case | Result |
|---|---|
| `onEditContent` supplied | button rendered and enabled |
| `onEditContent` absent | **no button** — clipart falls back to the inert placeholder, default renders nothing |
| Disabled / no-op control remaining | **none** — there is no `disabled` attribute and no empty handler anywhere |
| Role or capability inference | **none introduced** |

Note the parent supplies `onEditContent` **unconditionally** (`FreeformPadletCards:1757`), unlike
`onOpenToolbar` which is gated on `canUseFreeformEditButton`. That is the parent's existing
decision, unchanged by this patch, and correct for a read-only viewer. **PASS.**

### 16h. Event isolation

`onClick={(e) => { e.stopPropagation(); onEditContent(); }}` at both sites.

| Requirement | Result |
|---|---|
| Stops propagation narrowly on the button | ✔ — on the button's own handler only |
| Invokes `onEditContent` exactly once | ✔ — single call, proven by test and negative control |
| No broad suppression on the card | ✔ — the root `div`'s `onClick={onClick}` is untouched; no `onClickCapture`/`onPointerDownCapture` added |
| Normal keyboard activation preserved | ✔ — no `preventDefault`, no key handler |
| Follows the existing pattern | ✔ — byte-for-byte the same idiom as `onOpenToolbar` (`:135-138`) |

**PASS.**

### 16i. Viewer chain

Traced end to end in source:

```
CardPreview "Edit card" button (:65-77 | :144-153)
  → onEditContent()
  → FreeformPadletCards.tsx:1757  (supplied UNCONDITIONALLY)
      closeAllToolbars();
      setPadletToEdit(padlet);
      setIsCardViewerOpen(true);          ← useCanvasOverlays.ts:106
  → CanvasClient.tsx:474 / :7359          isOpen={isCardViewerOpen}
  → <CardEditor … readOnly={true} />      "Card View Lightbox (Read Only)"
```

| Check | Result |
|---|---|
| Callback unconditional where appropriate | ✔ `:1757`, no capability gate |
| State setter now has a reachable UI caller | ✔ — this was the entire defect; `setIsCardViewerOpen(true)` still has exactly **one** call site, now reachable |
| New modal/editor route added | **No** — `CardEditor` at `:7359` pre-existed and is unchanged |
| Content mutation merely from opening | **No** — `readOnly={true}`; `onSave={() => setIsCardViewerOpen(false)}` closes without writing; `setPadletToEdit` only selects |

**Direct source tracing plus the focused component tests is sufficient.** No gap exists in the
callback chain, so **no new integration test is required** — consistent with the brief's own
instruction not to demand one absent an actual gap. **PASS.**

### 16j. Test review

Four new tests plus a `findEditCardButton` tree-walker.

| # | Contract item | Delivered | Verdict |
|---|---|---|---|
| 1 | Callback present → named button, invoked once | `it.each` over **both** branches; asserts `type==='button'` and `props.type==='button'`, invokes handler, `toHaveBeenCalledTimes(1)` | ✔ |
| 2 | Callback absent → no dead control | `findEditCardButton(...)` → `toBeUndefined()` | ✔ (see **O7**) |
| 3 | **Keyboard: Enter activation** | **NOT DELIVERED** | **GAP — see O2** |
| 4 | Event isolation: parent handler not invoked | Proxy — asserts `stopPropagation` called once + callback once | **PROXY — see O3** |
| 5 | Existing rendering intact | `renderToStaticMarkup`, asserts title still present, `aria-label` present, **exactly 2 buttons** | ✔ |

Branch coverage verified independently: `['clipart branch', {}]` keeps `svgUrl:'/clipart.svg'`
→ `isClipartCard` true; `['default branch', { metadata: { svgUrl: undefined } }]` overrides it to
`undefined` → false. **Both branches genuinely exercised.**

The tests assert **behaviour** (handler invocation), not source text — a real improvement over
the two pre-existing source-text guards in the same file. They are white-box in that they walk
the element tree, which is a consequence of the environment constraint in **O2**, not of choice.

### 16k. Induced-failure and negative-control review — both reproduced

**1. Against parent `bb1bdf0`** (parent `CardPreview.tsx` restored, new tests in place):

```
Tests  4 failed | 25 passed (29)
× clipart branch: renders an accessible "Edit card" button …
× default branch: renders an accessible "Edit card" button …
× stops propagation before invoking onEditContent …
× keeps existing title rendering and onOpenToolbar unchanged …
```

The four new tests fail because no reachable edit control exists; **all 25 pre-existing tests
continue to pass**. Exactly as reported.

**2. Against `a87b7dd`:** `29 passed (29)`.

**3. Temporary negative control:** both `onEditContent()` invocations bypassed (2 sites
confirmed by grep):

```
Tests  3 failed | 26 passed (29)
× clipart branch …            × default branch …            × stops propagation …
```

The three callback-invocation assertions fail; the presence/absence and rendering-preservation
tests correctly still pass. **Restored via `git checkout a87b7dd --`, verified byte-identical,
grep confirms zero residue. Not committed.**

**PASS.**

### 16l. Validation

| Gate | Result |
|---|---|
| Clean one-run `npm run typecheck` | declarations removed, **410** regenerated (generator exits 1 on two pre-existing `SearchMenu.tsx` errors — PATCH-144's closed contract); authoritative `npx tsc --noEmit` → **exit 0** |
| Focused `CardPreview.test.tsx` | **29/29** |
| `ClipartCardDraftModal.test.tsx` | **45/45** — the `'Card view'` toolbar-label assertion at `:417` passes **unchanged**, confirming `CardActionsToolbar` was not disturbed |
| `EmojiReactionPicker.test.tsx` | **10/10** |
| Combined focused card suite | **84/84** |
| Ordinary `npx next build` | **exit 0** |
| `assertBridgeExclusion.mjs` | **exit 0**, 891 files, no marker |
| Clean E2E build | **exit 0**, marker = **`1`** |
| Ordinary `.next` restored | exclusion re-proven 891 files, **marker absent** |
| `git diff --check` | **exit 0** |
| Ports 3000–3003, 3100 | **all free** |
| Test artifacts | removed |
| Worktree | only the five pre-existing protected paths |

**PASS.**

### 16m. Pre-existing full-suite failure — **A, with the root cause proven**

**Classification: A — confirmed pre-existing and non-blocking for PATCH-138.**

Six failures in `lib/infra/drawing/presentationBridge.test.ts`. The implementation report
attributed them to "the already-recorded slide-local index-domain divergence". That attribution
is **correct, and this review proved the mechanism rather than accepting it**:

1. `git diff bb1bdf0..a87b7dd` touches **only** the two `CardPreview` files.
2. A **true parent-state run** (both CardPreview files checked out at `bb1bdf0`) produces the
   **identical** `6 failed | 37 passed (43)`.
3. `presentationBridge.ts:2-3` imports `planSlideComposition` and `resolveSlidePadlets`.
4. Both of those files were last modified by **`1fe6221` — PATCH-142's implementation commit**
   ("scope slide overlay ordering to the slide"), which moved them to the slide-local ordinal.
5. `presentationBridge.test.ts` was last modified by `ed18524` (**PATCH-112**) and still asserts
   the pre-PATCH-142 **global** scene indices (`toEqual([1, 4])`; actual is `[0, 2]`).
6. **Decisive:** checking out *only* those two slide-renderer files at `1fe6221^` makes
   `presentationBridge.test.ts` pass **43/43**.

**These six failures are PATCH-142's residue, not PATCH-138's.** No file involved is in
PATCH-138's allowlist and none was changed. Not fixed here, per instruction. Recorded as
**O6** with a recommendation to open a patch.

### 16n. Acceptance contract

| # | Criterion | Result |
|---|---|---|
| 1 | Existing edit callback becomes reachable | **PASS** §16i |
| 2 | New action is accessible | **PASS** §16f (+O1 on name accuracy) |
| 3 | Callback presence controls visibility | **PASS** §16g |
| 4 | Mouse activation invokes once | **PASS** §16j, §16k |
| 5 | Keyboard activation works | **PASS by construction** §16f; **untested** — O2 |
| 6 | Parent card interaction isolated | **PASS** §16h (test is a proxy — O3) |
| 7 | Existing style-toolbar action remains available | **PASS** §16e; `ClipartCardDraftModal` 45/45 unchanged |
| 8 | Existing viewer/editor chain opens without architectural change | **PASS** §16i |
| 9 | No document-card substrate or permission model introduced | **PASS** §16b |
| 10 | No dead edit control without callback | **PASS** §16d, §16g |
| 11 | Focused tests and builds pass | **PASS** §16l |
| 12 | Only the two authorized files changed | **PASS** §16b |
| 13 | Full-suite failures proven pre-existing and unrelated | **PASS** §16m |

All thirteen hold.

### 16o. Observations

| # | Observation | Classification |
|---|---|---|
| **O1** | **The control is named "Edit card" but opens a read-only viewer.** `onEditContent` → `setIsCardViewerOpen(true)` → `CardEditor readOnly={true}` (`CanvasClient.tsx:7370`, comment *"Card View Lightbox (Read Only)"*). Inversely, `CardActionsToolbar`'s **`'Card view'`** label → `onToggleCardView` → `setIsCardEditorOpen(true)` → `readOnly={false}`, the **editable** editor. **The two labels are inverted relative to their behaviour.** A screen-reader user activating "Edit card" lands somewhere they cannot edit. | **Non-blocking, but correct it.** The name `Edit card` was **prescribed verbatim by the lead product decision**; the implementer complied and did not exercise the brief's own escape hatch (*"unless existing application terminology provides a clearly preferable equivalent"*) — and existing terminology (`'Card view'`, *"Card View Lightbox (Read Only)"*) arguably was one. **This is a governance-side label defect, not an implementation failure.** Recommend a one-word follow-up: rename to `View card`/`Open card`, **or** re-point the callback at `setIsCardEditorOpen`. Not grounds to withhold closure: the control is named, semantic, reachable and isolated. |
| **O2** | **No keyboard-activation test (contract item 3).** | **Unsatisfiable within the authorized scope — recorded, not charged.** `vitest.config.ts:13` sets `environment: 'node'`; `jsdom` and `happy-dom` are **not resolvable** (`require.resolve('jsdom')` throws); installing either needs `package.json`, which is forbidden. No DOM ⇒ no focus, no Enter dispatch. The substitute — asserting `element.type === 'button'` **and** `props.type === 'button'` — is the strongest available proof, since a native button gets Enter/Space from the browser. **The implementation report did not flag this unmet contract item**; that reporting gap is the only charge here. |
| **O3** | **The event-isolation test is a proxy.** It asserts `stopPropagation` was called once, not that a real parent handler stayed silent. | **Accepted under O2's constraint.** True propagation is a DOM behaviour and cannot be exercised without a DOM. Upgrade this test if a DOM environment is ever added. |
| **O4** | **Tests invoke the component as a plain function** (`CardPreview({...})`) and walk the returned element tree. | **Accepted implementation detail.** Verified safe today: `CardPreview` uses **zero** hooks. But the tests silently depend on that; adding any hook would break them with a confusing "invalid hook call" rather than a behavioural message. Worth a comment if the file is reopened. |
| **O5** | **Two visually identical `Edit2` pencils per card.** Clipart: left = "Edit card" (named), right = `title="Edit"`. Default: left = "Edit card" (named), right = **no accessible name at all**. | **Non-blocking; the unnamed control is pre-existing** (recorded at §4) and outside this patch's allowlist. Recommend distinct iconography and naming the `onOpenToolbar` control in the same follow-up as O1 — the two findings share a fix. |
| **O6** | **PATCH-142 was closed with a red unit-test file caused by its own change** (§16m), and neither PATCH-142's nor PATCH-137's validation matrix covered `lib/infra/drawing/presentationBridge.test.ts` — both ran only `lib/infra/presentation/` (36 tests) plus characterizations. A full `npx vitest run` was in **no** recent validation matrix. | **Blocking for nothing here; a real governance finding.** Recommend (a) a patch to reconcile `presentationBridge.test.ts` with the slide-local ordinal basis, and (b) adding a full-suite run to future validation matrices, since a scoped matrix cannot see a regression it does not run. |
| **O7** | **The "callback absent" test is vacuously true at parent** — it passes at `bb1bdf0` (no control exists at all) and at `a87b7dd` (correctly hidden), so alone it cannot distinguish "correctly gated" from "never implemented". | **Minor, inherent to a negative assertion.** Covered in practice by the two positive-branch tests and by the negative control. |

### 16p. Classification

**2 — PASS WITH NON-BLOCKING OBSERVATIONS.**

The narrowed patch does exactly what §15 authorized and nothing more: a dead prop became a
real, named, keyboard-operable, event-isolated control routed through an untouched existing
chain, in two files at exactly their line limits, with an induced-failure proof and a negative
control that both reproduce independently.

Not classification **1**, because **O1** is a genuine user-visible defect — the accessible name
misdescribes the destination, and the corresponding toolbar label is inverted against it — and
because **O2** records a contract item that was not delivered and not disclosed.

Not **5**: every accessibility *mechanism* is correct; O1 is a label-content decision that
governance itself authored. Not **6**: §16e proves the two affordances have different
terminals. Not **7**: the missing keyboard test was unsatisfiable in the authorized file set,
and the strongest available substitute was used.

### 16q. Deferred branches — confirmed NOT closed or implemented

| Branch | Status |
|---|---|
| **C-1 document card substrate** | **Still unauthorizable.** `types/collabboard.ts` untouched; no `'document'` in the `Padlet` union. Blockers B-1 (entity/placement schema, product design) unchanged |
| **C-3 "Card view" removal** | **Still blocked.** `CardActionsToolbar.tsx:79` untouched; `ClipartCardDraftModal.test.tsx:417` passes unchanged. PATCH-134 §7's hard stop stands |
| **C-4 `GROUP_H` / `OVERHEAD_H` cleanup** | **Still blocked by PATCH-135.** `CanvasSidebar.tsx:47-48` untouched; `patch-135-toolbar-overflow.spec.ts:206-207` untouched and still pins both by source text. **PATCH-135 remains independently OPEN** |
| **Board-level capability source** | **Still absent.** No `resolveBoardPermission`; blocker B-2 unchanged. The patch deliberately used callback presence instead |
| **Links / backlinks / archive** | **Remains assigned to PATCH-141**, deferred, never authorizable from the PATCH-133 census |

### 16r. Status and dependencies

- **PATCH-138: CLOSED** — narrowed scope (C-2 only) implemented and independently verified at
  `a87b7dd`. Two files, 25/25 and 50/50 lines. C-1, C-3, C-4 explicitly remain open and are
  **not** closed by this review.
- **PATCH-139 (Editor / read-only modal split): RELEASED** — next active patch. O1's naming
  question is its natural home, since it is precisely an editor-vs-viewer distinction.
- **PATCH-140–141:** remain deferred in the §13 sequence, **not** closed.
- **PATCH-135:** remains **independently OPEN**; still blocks only the C-4 constants cleanup.
- **PATCH-142:** CLOSED, but see **O6** — its `1fe6221` left six red assertions in
  `presentationBridge.test.ts`. Recommend a new patch; **not** reopened here.
- **PATCH-146 / PATCH-147:** remain **RESERVED and non-blocking**; no dependency found.

### 16s. Reviewer's notes

- **Trace the destination, not just the wire.** The chain was reachable, the button semantic and
  the tests green — and the control still tells screen-reader users it will let them edit
  something it opens read-only. That only surfaced by following `setIsCardViewerOpen` all the way
  to `readOnly={true}` and then noticing the toolbar's `'Card view'` label goes to the *editable*
  editor. Verifying reachability would have passed this patch with the defect intact.
- **A missing test is a scope question before it is a quality question.** The absent keyboard
  test looked like an omission. The environment made it impossible: node environment, no jsdom,
  and the only fix forbidden by the allowlist. The right verdict was to record an unsatisfiable
  contract item and the undisclosed gap — not to fail the patch for a constraint governance
  itself imposed.
- **"Pre-existing" deserves a mechanism, not a date.** The six `presentationBridge` failures were
  reported as pre-existing and were. Reverting *only* PATCH-142's two files turned that into
  43/43 green and named the cause — which converted a dismissed nuisance into a filed defect
  against a **closed** patch, plus the more useful finding that no recent validation matrix ran
  the full suite at all.
- **Line limits at exactly the limit deserve a second look.** Both files landed on 25/25 and
  50/50. That is compliance, but it is also the shape of a change trimmed to fit; the trimming
  here was blank-line removal between test blocks, which is harmless. Worth checking, because the
  alternative — dropping a test to fit — would look identical in the numbers.
