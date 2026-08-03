# PATCH-138 — DOCUMENT CANVAS CARD, FREE-STANDING OPEN AFFORDANCE, DEFERRED "CARD VIEW" REMOVAL, DEAD-CONSTANT CLEANUP

**Status:** **OPEN · BLOCKED · OPTION F (BLOCKED BY AN EXPLICIT DEPENDENCY)** · NO IMPLEMENTATION
AUTHORIZED · PRODUCTION ALLOWLIST **EMPTY** · TEST ALLOWLIST **EMPTY** · **PATCH-139 NOT RELEASED**
· NOT PUSHED
**Authored:** 2026-08-04 (CTO). **Base:** `89e1ab5`. **First authoring of this number** — see §1.
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
