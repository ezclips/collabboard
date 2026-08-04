# PATCH-139 — EDITOR / READ-ONLY MODAL SPLIT

**Status:** **CLOSED · OPTION C (CAPABILITY-BASED CARD MODAL SPLIT) DELIVERED** · classification
**3 (pass; governance amendment recorded for arithmetic scope deviations)** at §14 by independent
review of `20d6f65` · **PATCH-140 RELEASED** (see §14l **O1** for the one product-owner call that
may gate it) · **PATCH-151 RESERVED** · NOT PUSHED
**Closed:** 2026-08-04 (independent reviewer). **Implementation:** `20d6f65`.
§13k's line budgets are amended by **§14g** and **§14h**.
**Amended:** 2026-08-04 (governance architect) at base `fcd1cc7` — see **§13**, which supersedes
the §5 Option G block. Sections 1–12 are retained as authorization history; §3d's terminology
hard stop remains binding (§13n).
**Authored:** 2026-08-04 (CTO). **Base:** `71f5807`. **First authoring of this number** — see §1.
**Predecessors:** PATCH-133 §11 (scope origin) · PATCH-134 §5/§7/§8 · PATCH-136 §18f (sequence) ·
PATCH-138 (closed, §13 pinned this slot) · PATCH-142 (closed; source of Finding B).

---

## 1. Number census — PATCH-139 has three historical meanings

```
git log --all --diff-filter=A -- .fable5/patches/PATCH-139.md   →  (empty)
```

**No PATCH-139 document has ever existed.** This is its first authoring. Every reference is a
forward-reference in another patch's sequence table:

| Source | Meaning assigned to PATCH-139 | Recency |
|---|---|---|
| `PATCH-134.md:895` (§18f) | Links, backlinks, archive, reusable multi-board appearances — *"still not authorizable"* | oldest |
| `PATCH-136.md:304` (§12) | Document persistence, lifecycle, reconciliation | ↓ |
| **`PATCH-136.md:1078` (§18f)** | **Editor / read-only modal split** | **newest** |
| `PATCH-138.md:417`, `:775` (§13, §16r) | **Editor / read-only modal split** — *pinned authoritatively* | confirmation |

**Resolution — "Editor / read-only modal split" is operative**, by the same four-part rule
PATCH-138 §2 applied and by direct confirmation:

1. **Latest explicit enumeration:** `PATCH-136 §18f` supersedes its own §12.
2. **Consistency with what shipped:** PATCH-137 and PATCH-138 both landed as §18f defined them.
3. **Already pinned:** `PATCH-138 §13` fixed the sequence authoritatively *precisely so this
   collision could not recur*. Re-pointing 139 one patch later would reintroduce the exact
   pathology PATCH-138 §14 diagnosed ("a patch number is not a patch").
4. **Smallest coherent boundary:** the split is a single owned concern with a single owner file.

**Scope origin.** The slot traces to `PATCH-133 §"PATCH-136 — Editor / viewer modal split and
permission enforcement"` (renumbered 136 → 137 → 138 → **139**):

> **Outcome:** §11c, with viewer safety enforced by **types**, not by hidden buttons.
> **Ownership:** `CardEditor.tsx` → shell + two bodies.
> **BLOCKING PREREQUISITE:** either (a) a real capability resolution — the
> `resolveBoardPermission` that `PERMISSIONS.md` §1 already mandates and that does not exist —
> reaching the canvas, **or** (b) an explicit, recorded owner decision that the viewer/editor
> split ships against the workspace-level `canEditWorkspace` boolean as an interim.

**Neither Finding A nor Finding B is this slot's scope.** They are new work surfaced by the
PATCH-138 closure review, and this document does **not** assume PATCH-139 owns them (§4, §5).

### 1a. Path corrections

The brief named two paths that do not exist. Recorded so the next reader is not misled:

| Named in brief | Actual |
|---|---|
| `components/collabboard/canvas/ui/CardActionsToolbar.tsx` | **`components/collabboard/editors/CardActionsToolbar.tsx`** |
| (implied) `components/collabboard/editors/CardEditor.tsx` | **`components/collabboard/CardEditor.tsx`** |

Prompt-path corrections, not scope changes — consistent with PATCH-138 §16a.

---

## 2. PATCH-139's own inherited scope — BLOCKED

| Prerequisite | State | Evidence |
|---|---|---|
| (a) `resolveBoardPermission` reaching the canvas | **ABSENT** | zero occurrences repo-wide outside `PERMISSIONS.md`'s mandate |
| (b) recorded owner decision to ship against workspace-level `canEditWorkspace` as an interim | **NOT SUPPLIED** | `canEditWorkspace` **does exist** (`lib/workspace/context.ts:45`) and already feeds `canUseFreeformEditButton` (`CanvasClient.tsx:253`), so (b) is *technically available* — but PATCH-133 §11 requires the decision to be **explicit and recorded**, and no such decision accompanies this brief |

**PATCH-133 §11's BLOCKING PREREQUISITE is therefore still unmet.** The split cannot be
authorized. This is the same B-2 blocker PATCH-138 §7 recorded, unchanged.

**Because PATCH-139 does not close, PATCH-140 is NOT released.**

---

## 3. Candidate A — label semantics: full route diagnosis

### 3a. The two live routes

| | Control 1 | Control 2 |
|---|---|---|
| **Component** | `components/collabboard/CardPreview.tsx` `:66-74` (clipart), `:145-153` (default) | `components/collabboard/editors/CardActionsToolbar.tsx` `:75-80` |
| **Label** | `aria-label="Edit card"` | `label: 'Card view'` |
| **Icon** | `Edit2` (pencil) | `LayoutGrid` |
| **Callback** | `onEditContent` | `onToggleCardView` |
| **Wiring** | `FreeformPadletCards.tsx:1757-1761` → `setPadletToEdit` + `setIsCardViewerOpen(true)` | `FreeformPadletCards.tsx:6008-6012` → `setPadletToEdit` + `setIsCardEditorOpen(true)` |
| **Destination** | `CanvasClient.tsx:7359-7370` `<CardEditor readOnly={true}>` — *"Card View Lightbox (Read Only)"* | `CanvasClient.tsx:7373-7384` `<CardEditor readOnly={false}>` — *"Card Editor Modal (Edit Mode)"* |
| **Read-only or editable** | **READ-ONLY** | **EDITABLE** |
| **User can change content** | **No** | **Yes** |
| **Accessible name** | `Edit card` | `title={tool.label}` → `Card view` |
| **Tests pinning the text** | `CardPreview.test.tsx:311,318,342` (PATCH-138's own, 3 sites) | `ClipartCardDraftModal.test.tsx:417` — **closed-patch exact-label-list assertion**; also `:871` by name |

**`readOnly={true}` genuinely prevents every edit** — verified in `CardEditor.tsx`: `handleSave`
short-circuits to `onClose()` without writing (`:59-61`); the formatting toolbar is hidden
(`:133`); the textarea carries native `readOnly` (`:150`); the description footer is hidden
(`:156`); the header edit block is hidden (`:84`). **There is no secondary editing affordance in
the viewer.** The inversion is therefore real, not cosmetic.

### 3b. Root-cause questions answered

| # | Question | Answer |
|---|---|---|
| 1 | Which control opens a read-only route? | `CardPreview`'s **"Edit card"** |
| 2 | Which control opens an editable route? | `CardActionsToolbar`'s **"Card view"** |
| 3 | Both visible for the same card? | **Not simultaneously.** `CardPreview`'s pair is on the card; "Card view" lives inside the toolbar modal reached via the *other* pencil (`onOpenToolbar`). Two clicks apart, same card |
| 4 | Distinguishable by icon alone? | **Between each other, yes** (`Edit2` vs `LayoutGrid`). **But `CardPreview` renders two identical `Edit2` pencils** — "Edit card" (left) and the unnamed `onOpenToolbar` (right) — PATCH-138 **O5** |
| 5 | Does "Edit card" misrepresent its destination? | **Yes** — unambiguously (§3a) |
| 6 | Does "Card view" hide that its destination is editable? | **Yes** — and worse, see #7 |
| 7 | Is the pencil icon appropriate for a view-only action? | **No.** Compounding it: `'Card view'` is rendered as a **mode toggle** with `active: isCardView` driven by `metadata.showCardView` — and **`showCardView` is never written anywhere in the repository** (4 read sites, 1 type declaration `types/collabboard.ts:203`, **zero writers**). So the entry presents as a toggle that can never activate, while actually opening a modal. PATCH-133 §779 recorded this: *"'Card view' toggles nothing; it opens an editor."* |
| 8 | Established `Open card` / `View card` / `Edit card` strings elsewhere? | **Yes** — `components/kanban-canvas/useKanbanI18n.ts:231` `viewCard: 'View Card'` and `:203` `editCard: 'Edit Card'`. Also `ContainerEditor.tsx:289,393` `"Open editor"` |
| 9 | Localization involved? | **No** for collabboard — it has no i18n layer (only the vendored Excalidraw fork and the separate kanban vertical do). **No localization architecture change is needed** |
| 10 | Which tests require amendment? | `CardPreview.test.tsx` (3 sites, PATCH-138's own) **and** `ClipartCardDraftModal.test.tsx:417` — a **closed-patch characterization** that PATCH-134 §394 designated *"not so that it may be edited… Any edit to this file requires stopping and reporting first"* |

### 3c. Why the label pair cannot be split, and why it is not PATCH-139's

Terminology for **Control 1 alone** *is* derivable (destination = read-only; established string
`View Card` exists). But renaming only Control 1 yields, on the same card:

> **"View card"** (opens the viewer) and **"Card view"** (opens the editor)

— two near-homographs, one letter-order apart, with opposite behaviours. **That is worse than
today's state**, because today at least the two names look different. Half the pair cannot ship.

Renaming **Control 2** is where it stops being a label change:

1. It requires editing `ClipartCardDraftModal.test.tsx:417`, a **closed-patch** exact-label-list
   assertion explicitly ring-fenced by PATCH-134 §394.
2. The entry carries **dead mode plumbing** (`isCardView` / `showCardView`, never written) that a
   rename leaves behind — renaming an action-styled-as-a-toggle without removing the toggle state
   is a half-fix.
3. **PATCH-134 §5 already assigned this work**, verbatim:
   > *"The label stays **'Card view'** in this patch. Renaming it to something accurate (e.g.
   > 'Open editor') would change a label asserted by a closed-patch test and affects the canvas
   > toolbar too; per the owner's instruction, that is **recorded for a later patch, together with
   > the Scope C removal (§8)**."*
4. **PATCH-134 §8 wants that entry deleted**, not renamed, once a real editor-opening affordance
   exists (Scope C / PATCH-138 **C-3**). Renaming a control slated for removal is wasted churn.

**Critical finding — C-3 is still gated.** PATCH-138 delivered a **viewer** opener, not an
**editor** opener. PATCH-134 §7's hard stop was that removing "Card view" would strand card posts
with *no way to reopen content for editing*. A read-only lightbox does not clear that stop.
**C-3 remains blocked, and the label pair is gated behind the same decision.**

### 3d. Terminology decision — **HARD STOP**

Applying the brief's own rule ("do not decide from English preference alone; use actual
destinations and existing application terminology"): the destinations are unambiguous and
`View Card`/`Edit Card` are established. **A4 (the consistent pair) is the technically indicated
outcome** — but it cannot be authorized here, because choosing it requires three decisions this
review cannot make:

- whether Control 2 is **renamed or removed** (PATCH-134 §8 says removed; that is C-3, blocked);
- whether the dead `showCardView` / `isCardView` mode plumbing is **removed with it**;
- whether a **closed-patch characterization** may be amended (PATCH-134 §394 requires an
  explicit owner authorization to touch `ClipartCardDraftModal.test.tsx`).

**Recorded as a product-decision hard stop.** No label change is authorized under PATCH-139.

---

## 4. Candidate B — presentationBridge residue: full diagnosis

### 4a. The six failures, precisely

Every one is the **same assertion**: `composition.resolvedPadlets.map((entry) => entry.zIndex)`.

| Test | Actual (slide-local ordinal) | Asserted (scene-global index) | Resolved order (`embeddableId`) |
|---|---|---|---|
| S1 `:263` | `[1]` | `[2]` | `emb-a` |
| S2 `:281` | `[1, 2]` | `[2, 3]` | `emb-a`, `emb-b` |
| S3 `:300` | `[0, 3]` | `[1, 4]` | `emb-a`, `emb-b` |
| S4 `:319` | `[0, 1, 4]` | `[2, 3, 7]` | `emb-slide-a`, `emb-uploaded-image`, `runtime-container-c` |
| S5 `:341` | `[0, 2]` | `[1, 3]` | `emb-a`, `emb-a-copy` |
| S7 `:377` | `[0, 2]` | `[1, 4]` | `emb-a`, `emb-b` |

The asserted values are **scene-global array indices** — they count the frame element itself and,
in S7, a deleted element. The actual values are **slide-local ordinals** over live slide members.

**Independently verified by read-only probe** (temporary file, run, deleted, not committed): for
**all six** fixtures, `nativeBelowIds`, `nativeAboveIds` and the lossless-band invariant
**already match the tests' existing expectations**, and `zIndex` is **strictly increasing** with
correct resolved order in every case. Each test aborts at the `zIndex` line before reaching its
band assertions, which is why this was not visible from the runner output alone.

**Classification: B1 — the tests merely assert obsolete global-index values. Production is
correct.** Not B2, not B3.

### 4b. Why B2 was ruled out, and where the real divergence lives

PATCH-142's recorded observation — two slide-local index spaces can diverge — is **real and
confirmed in source**, but **none of the six fixtures exercises it**:

- `resolveSlidePadlets.ts:25` builds `localOrdinalById` over **all** live slide members, *then*
  drops embeddables whose padlet record is missing or `type === 'drawing'` (`:36`). Dropped
  members keep their ordinal slot, leaving **gaps** in the returned sequence.
- `planSlideComposition.ts:38` builds `localIndexById` over native members **plus only the
  surviving `resolvedPadlets`** — densely re-indexed, no gaps.
- These agree **only when nothing is dropped**. `planSlideComposition:82` then compares
  `firstPadletActiveIndex` (from space 1) against `localIndexById` (space 2).

All six fixtures supply a valid padlet for every embeddable, so the two spaces coincide and the
band split is correct. **The divergence remains latent, unexercised, and exactly as PATCH-142
accepted it.** It is *not* what these tests expose.

### 4c. presentationBridge semantic contract (post-PATCH-142)

`presentationBridge.ts` is a **pure characterization pass-through** — it calls
`resolveSlidePadlets` and `planSlideComposition` and reshapes their output. It holds no index
logic of its own, so **no production defect exists here and `presentationBridge.ts` must not be
modified**.

| Aspect | Contract |
|---|---|
| **Index domain** | **Slide-local ordinal.** Rank among the slide's own live members, in scene order. **Not** scene-global; **not** presentation-global |
| **Slide membership** | Embeddables with a `padlet://` link resolve via `resolveFrameMembership` (explicit `frameId`, else strict centre containment); all other elements by `frameId === slideFrame.id`. The frame element itself is excluded; deleted elements are excluded |
| **Ordering** | Ascending scene order, stable; the returned array is sorted by `zIndex` |
| **Missing padlet record** | Consumes an ordinal slot, then is dropped → **sequence may contain gaps**. Gaps are contractual, not a defect |
| **`type === 'drawing'` padlets** | Same as missing — slot consumed, entry dropped |
| **Unframed embeddables** | Admitted via centre-point containment fallback; flagged `usedOverlapFallback` |
| **Relationship to `planSlideComposition`** | It re-derives a **dense** local index over native members + surviving padlets, then splits bands at `firstPadletActiveIndex`. Agrees with `resolveSlidePadlets` iff nothing was dropped |
| **Numeric stability** | `zIndex` values are **derived, not intrinsic** — they shift whenever unrelated slide members are added or removed |

**Assertion policy — the whole point of the fix.** Because the numbers are derived, tests must
assert **semantics, not magic numbers**:

1. **membership and identity** — which `padletId`/`embeddableId` resolved;
2. **relative order** — the resolved sequence, and `zIndex` strictly increasing;
3. **band placement** — `nativeBelowIds` / `nativeAboveIds` and the lossless invariant;
4. **exact numerals only** where the value *is* the property under test (e.g. a deliberate gap
   proving a dropped member consumed a slot).

**`S6` (`:360`) already demonstrates this style** — it asserts `toMatchObject([{ padletId,
embeddableId }])` plus bands, carries no numeric `zIndex`, and **passes today**. It is the
in-repo precedent the corrected tests should follow, and it is why S6 is the only one of the
seven that survived PATCH-142 unscathed.

### 4d. Full-suite policy

These six are the **only** failures in the repository suite (`64` files, `739` tests → `733`
passed / `6` failed, all in this one file). Fixing them restores **full Vitest green**, which is
therefore a legitimate acceptance target for whichever patch owns this — and no unrelated failing
suite exists to be tempted into scope.

---

## 5. Scope decision — **OPTION G**

> **Product/owner decision required. Label work is blocked. The test cleanup has clear ownership
> — and that ownership is *not* PATCH-139.**

| Option | Verdict |
|---|---|
| **A** — label correction only | **Rejected.** §3d hard stop; and labels are not this slot's scope |
| **B** — bridge residue only | **Rejected as a PATCH-139 scope.** The work is ready (§4) but assigning it here would re-point a number PATCH-138 §13 pinned one commit ago |
| **C** — both, as a two-part cleanup | **Rejected.** The brief forbids combining for convenience; the two share no root cause, no file, and no decision |
| **D** — labels here, residue separate | **Rejected.** §3d blocks the labels |
| **E** — residue here, labels separate | **Rejected.** Same objection as B: silent renumbering |
| **F** — one or both belong to PATCH-140/141 | **Rejected.** 140 = document persistence, 141 = links/backlinks. Neither finding fits either |
| **G** — product decision required; authorize test cleanup separately if ownership is clear | **CHOSEN** |
| **H** — insufficient evidence | **Rejected.** Evidence is abundant and specific; the patch is *gated*, not under-evidenced |

**Hard stop triggered explicitly:** *"the candidate scopes belong to different authoritative patch
numbers."* Three distinct homes — PATCH-139 (the split), the label pair (PATCH-134 §5 bound it to
Scope C), and the bridge residue (unowned, created by `1fe6221`). Folding them together would
manufacture the collision PATCH-138 §2 spent a full review dissolving.

### 5a. Exact owned scope

**PATCH-139 owns the editor / read-only modal split, and nothing else. It is BLOCKED and
authorizes no implementation.** Production allowlist **EMPTY**. Test allowlist **EMPTY**.

### 5b. Exact deferred scope, with new reservations

Rather than leave ready work unowned, both findings are **reserved to explicit new numbers**
(recorded here, **not** silently absorbed). Neither is authorized for implementation until its own
document is authored.

| New number | Scope | State | Why not PATCH-139 |
|---|---|---|---|
| **PATCH-148** *(reserved)* | **presentationBridge slide-local index reconciliation** — reconcile the six stale `zIndex` assertions with the §4c contract | **READY.** No product decision, no production change, complete specification below (§6–§9) | Not the split; belongs to no existing slot |
| **PATCH-149** *(reserved)* | **Card action terminology + PATCH-134 Scope C** — decide the `View card` / `Edit card` pair *together*, resolve the `showCardView` dead mode plumbing, and take the "Card view" removal | **BLOCKED** — §3d product decision; gated on an editor-opening affordance (PATCH-134 §7) | PATCH-134 §5 bound the rename to the Scope C removal, not to the modal split |

**PATCH-148's specification is complete enough that authoring its document is a formality.** It is
recorded in full at §6–§9 so no diagnosis is lost, but implementation requires that document.

---

## 6. Allowlists — for PATCH-148 when authored (PATCH-139's own remain empty)

**Production allowlist: EMPTY.** `lib/infra/drawing/presentationBridge.ts` is a pure
pass-through with no defect (§4c) and **must not be touched**. `resolveSlidePadlets.ts` and
`planSlideComposition.ts` carry PATCH-142's **accepted, closed** behaviour and are excluded.

| Test file | Max changed lines | Purpose |
|---|---|---|
| `lib/infra/drawing/presentationBridge.test.ts` | **≤ 60** | Reconcile the six `zIndex` assertions with §4c, following S6's semantic style |

**Explicitly excluded:** every production file · PATCH-142's slide-renderer trio ·
PATCH-137/PATCH-142 characterizations · `CanvasSidebar.tsx` (`GROUP_H`/`OVERHEAD_H`, PATCH-135) ·
`CardPreview.tsx` and `CardActionsToolbar.tsx` (PATCH-149) · `package.json` · the bridge ·
document-card substrate · links/backlinks/archive · PATCH-146/147 territory.

## 7. Induced-failure plan — for PATCH-148

| Step | Requirement |
|---|---|
| Parent proof | Show the six current expectations fail against accepted production behaviour — already reproduced: `6 failed / 37 passed` |
| Corrected expectations | Derived from the §4c contract, **not** from running the code and pasting the output. Every retained numeral needs a one-line comment stating the property it encodes |
| No production change | The corrected tests must pass with `presentationBridge.ts` and the slide-renderer trio **untouched** — proven by `git diff --exit-code` on those paths |
| **Negative control** | Required, and it must be **semantic**: perturb *slide membership* (move an element to another frame) and *scene order* (swap two members) and prove the corrected tests fail. A test that only tracks renumbering would survive both and is a false green |
| No global-index restoration | Assert no corrected expectation reproduces a scene-global index — the S1/S2 offsets (`+1`) are individually plausible, so this must be checked against the contract, not by eye |

**Forbidden:** replacing magic numbers with different unexplained magic numbers; changing
production to satisfy stale tests; excluding or skipping the file to hide the failures;
source-text-only assertions where runtime behaviour is available.

## 8. Validation matrix — for PATCH-148

1. clean one-run `npm run typecheck` → exit 0, declarations regenerated (PATCH-144 contract);
2. `npx vitest run lib/infra/drawing/presentationBridge.test.ts` → **43/43**;
3. **full `npx vitest run` → green** (these six are the only repository failures, §4d);
4. focused PATCH-142 presentation units (`lib/infra/presentation`) → **36/36**, unchanged;
5. ordinary `npx next build` → exit 0;
6. `node scripts/e2e/assertBridgeExclusion.mjs` → exit 0, 891 files, no marker;
7. clean E2E build → exit 0, marker `1`;
8. `git diff --check` → exit 0;
9. ordinary `.next` restored, **no** `E2E_BRIDGE_BUILD` marker;
10. worktree contains only the five pre-existing protected paths.

Since PATCH-148 changes **tests only**, gates 5–7 are repository gates, not behavioural proof —
the behavioural proof is gates 2–4 plus §7's negative control.

## 9. PATCH-138 observation O2 — not absorbed

PATCH-138 **O2** (no keyboard-activation test; `environment: 'node'`, no `jsdom`/`happy-dom`,
`package.json` forbidden) is **not** absorbed. PATCH-148's scope is a pure-function unit file that
never opens the DOM question, and PATCH-149's is blocked. **No test-environment dependency may be
added, and `package.json` must not be modified, to backfill it.**

---

## 10. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Product terminology cannot be derived and no product decision supplied | **TRIGGERED** (§3d) — the *pair* cannot be decided; half of it cannot ship |
| The six failures reveal a real accepted-behaviour inconsistency | **NOT TRIGGERED** — B1, production correct (§4a, §4b) |
| Fixing the tests requires redefining PATCH-142's closed contract | **NOT TRIGGERED** — the contract at §4c *is* PATCH-142's, restated |
| **Candidate scopes belong to different authoritative patch numbers** | **TRIGGERED** (§5) — three distinct homes |
| More than a narrow file set required | **NOT TRIGGERED** for PATCH-148 (one test file) |
| Localization architecture change needed | **NOT TRIGGERED** — collabboard has no i18n layer (§3b #9) |
| New test-environment dependency required | **NOT TRIGGERED** — and forbidden (§9) |
| *(PATCH-139's own)* capability source absent / no recorded interim decision | **TRIGGERED** (§2) |

**Three hard stops trigger. PATCH-139 authorizes no implementation.**

### 10a. The decisions that unblock the most work

> **1.** *(unblocks PATCH-139)* Is the viewer/editor split authorized to ship against
> workspace-level `canEditWorkspace` as a recorded interim (PATCH-133 §11 option (b))? A real
> `resolveBoardPermission` does not exist and is not this patch's to build.
>
> **2.** *(unblocks PATCH-149)* Is `CardActionsToolbar`'s "Card view" entry **renamed or removed**
> — and may `ClipartCardDraftModal.test.tsx:417`, a closed-patch assertion, be amended to match?
> Until this is answered the label pair cannot ship, because renaming only one side produces
> "View card" and "Card view" side by side with opposite meanings.
>
> **3.** *(formality)* Author `PATCH-148.md` from §4, §6–§9 and authorize it.

---

## 11. Status, sequence and dependencies

**PATCH-139: OPEN · BLOCKED (Option G).** Scope = editor / read-only modal split. No
implementation authorized. Both allowlists empty.

**PATCH-140: NOT RELEASED** — release is conditioned on PATCH-139 closing; it did not.

The §13 sequence pinned by PATCH-138 is **preserved unchanged**, with two new reservations
appended rather than renumbering anything:

| Number | Subject | Status |
|---|---|---|
| PATCH-138 | Document card · open affordance · Card view removal · dead constants | **CLOSED (C-2 only)**; C-1/C-3/C-4 still open |
| **PATCH-139** | **Editor / read-only modal split** | **OPEN · BLOCKED** |
| PATCH-140 | Document persistence / lifecycle / reconciliation | DEFERRED — **not released** |
| PATCH-141 | Links, backlinks, archive, reusable appearances | DEFERRED — *not authorizable* |
| PATCH-146 | Many-cycles-in-one-test characterization ceiling | RESERVED · non-blocking |
| PATCH-147 | Windows harness lifecycle `spawn npm ENOENT` | RESERVED · non-blocking |
| **PATCH-148** | **presentationBridge slide-local index reconciliation** | **RESERVED · READY** (§4, §6–§9) |
| **PATCH-149** | **Card action terminology + PATCH-134 Scope C removal** | **RESERVED · BLOCKED** (§3d) |

**PATCH-135:** remains **independently OPEN**; still blocks only the `GROUP_H`/`OVERHEAD_H`
cleanup (PATCH-138 C-4). Untouched here.
**PATCH-142:** CLOSED. Its `1fe6221` created the PATCH-148 residue; the patch is **not reopened**
— the residue is test-side and separately owned.
**PATCH-146 / PATCH-147:** RESERVED, non-blocking. No dependency found; not mixed in.

---

## 12. Recorded diagnostic notes

- **A released slot is not a mandate to spend it.** PATCH-139 was released and two findings were
  waiting. The cheapest move was to declare it owner of whichever fit best. But PATCH-138 §13 had
  just pinned this number after a four-way collision, and re-pointing it one commit later would
  have re-created the exact defect that review dissolved. **Numbering discipline is worth more
  than filling a slot.**
- **Half a rename is worse than none.** "Edit card" is provably wrong today, and renaming it to
  "View card" is a one-word, fully-derivable fix. It is still refused, because it would sit beside
  "Card view" — one letter-order apart, opposite behaviour. The pair has to move together, and
  that is a product decision, not a wording preference.
- **A failing assertion hides the ones behind it.** All six bridge tests abort at their first
  line, so the runner never showed whether membership and band placement were also wrong. A
  read-only probe re-running the fixtures proved every other assertion already passes — turning
  "six broken tests" into "six stale numbers" and shrinking the fix from a redesign to one file.
- **The precedent for the fix was already in the file.** S6 is the only one of the seven with no
  numeric `zIndex` assertion, and the only one PATCH-142 did not break. The contract at §4c is
  less an invention than a description of why S6 survived.
- **"Never written" is a stronger finding than "wrong value."** `showCardView` has four readers,
  one type declaration, and zero writers — so a toolbar entry renders as a mode toggle that can
  never be on. That reframes the label question: Control 2 is not mislabelled, it is a control
  wearing the costume of a mode it does not have.

---

## 13. Amendment — product decision supplied, PATCH-139 AUTHORIZED

**Authored:** 2026-08-04 (governance architect). **Base HEAD:** `fcd1cc7` (PATCH-148 closed).
**Supersedes §5's Option G block for PATCH-139's own scope.** Sections 1–12 remain the
authorization history; §3d's terminology hard stop is **retained** (see §13n).
**No implementation performed. No production or test file modified. Nothing pushed.**

### 13a. Product-owner decision (recorded verbatim in effect)

The **existing workspace capability is the interim authority**:

| Capability | Route |
|---|---|
| `canEditWorkspace === true` | existing **editable** card/document editor modal |
| `canEditWorkspace === false` | genuine **read-only** card/document viewer modal |

**Explicitly not created:** `resolveBoardPermission` · a permission service · a new role model ·
schema changes · permission inference from ownership · a second editor implementation.
The interim rule may later be replaced by a formal capability source; PATCH-139 uses the existing
value only.

### 13b. Path correction — fourth occurrence in this sequence

| Named in brief | Actual |
|---|---|
| `components/collabboard/canvas/ui/CardActionsToolbar.tsx` | **`components/collabboard/editors/CardActionsToolbar.tsx`** |
| `CanvasClient.tsx` (unqualified) | **`app/dashboard/canvas/[id]/CanvasClient.tsx`** |
| `CardEditor` under `editors/` | **`components/collabboard/CardEditor.tsx`** |

Prompt-path corrections, not scope changes. Cf. PATCH-138 §16a, PATCH-139 §1a, PATCH-148 §1a.

### 13c. Complete card/document modal route census — measured at `fcd1cc7`

Both modals are **`CardEditor`**, rendered twice in `CanvasClient.tsx` against two independent
state flags:

- **Viewer** — `CanvasClient.tsx:7359-7370`, `readOnly={true}`, `onSave={() => setIsCardViewerOpen(false)}` (a no-op).
- **Editor** — `CanvasClient.tsx:7373-7384`, `readOnly={false}`, `onSave={saveCard}` (persists).

Both `onClose` handlers clear selection: `setIs…Open(false); setPadletToEdit(null)`.

| # | Source | Label | Callback | Setter | Card state | Modal / `readOnly` | Capability source | Editing controls | Editing possible |
|---|---|---|---|---|---|---|---|---|---|
| **R1** | `CardPreview` top-left pencil (PATCH-138) wired at `FreeformPadletCards.tsx:1757-1761` | `aria-label="Edit card"` | `onEditContent` | `setIsCardViewerOpen(true)` | `setPadletToEdit(padlet)` | Viewer · **true** | **NONE — supplied unconditionally** | no | no |
| **R2** | `CardPreview` top-right pencil | icon only | `onOpenToolbar` | `setCardToolbarPadletId` | — | `CardActionsToolbar` | `canUseFreeformEditButton` ✔ | — | — |
| **R3** | `CardActionsToolbar` **"Card view"** at `FreeformPadletCards.tsx:6008-6012` | `Card view` | `onToggleCardView` | `setIsCardEditorOpen(true)` | `setPadletToEdit` | **Editor · false** | inherited via R2 ✔ | yes | yes |
| **R4** | Freeform strip pencil `FreeformPadletCards.tsx:3216-3222` | `title="Edit"` | `openFreeformPadletModal` → `:420` | `setIsCardEditorOpen(true)` | `setPadletToEdit` `:408` | **Editor · false** | `showModalEditButton` `:3086` ✔ | yes | yes |
| **R5** | Canvas create-card `CanvasClient.tsx:5416` | — | toolbar create | `setIsCardEditorOpen(true)` | synthetic new padlet | **Editor · false** | creation flow, not a view route | yes | yes |
| **R6** | `openPadletInTypeEditor` `CanvasClient.tsx:5684-5702`, card branch `:5700` | — | share-link `?openPadlet=` `:344-350`; context menu `:6717`; `:5709/:5713`; `CanvasModals.tsx:270` | `setIsCardEditorOpen(true)` | `setPadletToEdit(post)` `:5691` | **Editor · false** | **NONE at the function; the `?openPadlet=` effect has no guard whatsoever** | yes | yes |
| **R7** | inline `CardActionsToolbar` `FreeformPadletCards.tsx:1786-1807` | `Card view` | `onToggleCardView` | `setIsCardEditorOpen(true)` | — | — | **DEAD — guarded by `{false && …}`** | — | — |

### 13d. `canEditWorkspace` ownership — exact

`canEditWorkspace` in `lib/workspace/context.ts:45` is a **pure function of `WorkspaceRole`**
(`owner | admin | member` → `true`; `readonly` → `false`), **not** a boolean field. Its boolean
form already exists at the two owners PATCH-139 needs:

- `app/dashboard/canvas/[id]/CanvasClient.tsx:253` — `const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);`
  — **in scope at R5/R6** (same component).
- Threaded to `FreeformPadletCards` via `CanvasConfigContext` (`CanvasConfigContext.tsx:9`),
  destructured at `FreeformPadletCards.tsx:238` — **in scope at R1/R3/R4**.

**No new plumbing is required.** Allowlist candidate 3 ("thread `canEditWorkspace` narrowly") is
therefore **not needed and not authorized**.

### 13e. Root-cause answers

1. **Does `CardPreview` always open the read-only viewer?** **Yes** — R1 is supplied
   unconditionally; an **editable** user's pencil opens the *viewer*. This is PATCH-138 **O1**,
   now confirmed as a capability defect rather than a labelling one.
2. **Does `CardActionsToolbar` always open the editable editor?** **Yes** (R3), but it is
   unreachable for read-only users because R2 gates the toolbar.
3. **Where is `canEditWorkspace` available?** §13d — already at both owners.
4. **Narrow owner for route selection?** Two: `FreeformPadletCards` (R1) and
   `CanvasClient.openPadletInTypeEditor` (R6).
5. **Can one callback select without duplicating modal state?** **Yes** — both modals already
   exist and are correctly configured; only the flag choice changes.
6. **Two branches or one governed `readOnly`?** **Keep the two existing branches.** Collapsing
   them would rewrite `CanvasClient`'s modal region for no capability benefit.
7. **Does `readOnly={true}` truly prevent mutation?** **Yes** — verified by probe (§13f).
8. **Absent, disabled, or merely hidden?** **Structurally absent** — see §13f.
9. **Visible close control present?** **Yes, but unnamed** — see §13g.
10. **Does closing clear state safely?** **Yes** — both `onClose` handlers clear the flag and
    `setPadletToEdit(null)`.

### 13f. Read-only enforcement result — **ALREADY GENUINE**

Measured by temporary probe (`renderToStaticMarkup`, run, deleted, never committed):

| Property | `readOnly={true}` | `readOnly={false}` |
|---|---|---|
| Content rendered | **yes** | yes |
| `<textarea>` `readonly` attribute | **true** (native) | false |
| Title `<input>` | **absent** | present |
| Formatting toolbar | **absent** (`CardEditor.tsx:133`) | present |
| Description footer | **absent** (`:156`) | present |
| Button count | **1** (close only) | 6 |
| Header label | **"View Document"** | title input |

`handleSave` (`:58-62`) short-circuits to `onClose()` when `readOnly`, so `onSave` is never
invoked; the viewer additionally passes a no-op `onSave`. **Double-safe.** Controls are *absent
from the tree*, not hidden by CSS and not merely disabled.

**Therefore Option D is not required.** Read-only contract items 1–9 already pass; only item 10
(accessible naming) and the §13g close-control naming gap are open.

### 13g. Close/back result — control exists, **accessible name missing**

`CardEditor.tsx:124-126` renders a visible close control in **both** modes
(`<Button variant="ghost" size="icon">` containing only an `<X>` icon). Probe result:
**zero `aria-label` attributes in the rendered read-only markup.**

- Visible in both modes ✔ · closes ✔ · clears selection ✔
- **Accessible name: absent** ✘ — violates ACCESSIBILITY ("no icon-only unnamed action") and
  read-only contract item 10.
- Escape: **not supported** (no key handler). Permitted to remain absent — Escape alone was
  never sufficient, and a visible control exists.

**Authorized:** add an accessible name to the existing control. **Not authorized:** redesigning
the modal header.

### 13h. Findings and their disposition

| ID | Finding | Disposition |
|---|---|---|
| **D1** | R1 ignores capability entirely — editable users get the viewer | **FIX in PATCH-139** |
| **D2** | Close control has no accessible name | **FIX in PATCH-139** |
| **D3** | Close (X **and** backdrop, `:78`) calls `handleSave`, so editable mode **saves implicitly**; `CardEditor` has **no explicit Save button at all** | **ROUTED to PATCH-149** — see §13m |
| **D4** | `?openPadlet=<cardId>` (`CanvasClient.tsx:344-350`) is **entirely ungated** and R6's card branch opens the **editable** editor → a read-only member reaches a full editing surface | **FIX in PATCH-139** |
| **D5** | R7 is dead code (`{false && …}`) | Record only; removal belongs to PATCH-149 |
| **D6** | Toolbar buttons (`Bold`/`Italic`/`Link`/`List`/`AlignLeft`, `:135-140`) have **no `onClick` at all** | **PATCH-149** — confirms "font buttons not working" is *no handler*, not a broken one |

**D4 is the load-bearing defect** and is why Option A alone is insufficient.

### 13i. Selected option — **OPTION C**

**Two independent action sources (R1 and R6) require the same viewer/editor decision**, which is
precisely Option C's stated trigger. Option A was the initial candidate but covers only R1 and
would leave D4 unfixed.

- **Not A** — single-owner selection does not reach R6.
- **Not B** — collapsing to one modal state rewrites `CanvasClient`'s modal region for no gain.
- **Not D** — read-only is already genuine (§13f).
- **Not E** — the capability is already in scope at both owners (§13d).

**Shape:** one pure selector, consumed by both owners.

```ts
// lib/domain/canvas/cardModalRoute.ts
export type CardModalRoute = 'editor' | 'viewer';
export function selectCardModalRoute(canEditWorkspace: boolean): CardModalRoute {
  return canEditWorkspace ? 'editor' : 'viewer';
}
```

This is **not** a permission service: it queries nothing, infers nothing from ownership, and
introduces no role model. It maps an **existing** boolean to a route name. It is also the only
seam at which the governed negative control 1 ("force `canEditWorkspace=false` through the
editable route") can be exercised in this repository's test environment (§13k).

### 13j. Contracts

**Capability contract.** `canEditWorkspace` is PATCH-139's **only** capability input · `true` ⇒
editor route · `false` ⇒ viewer route · **callback presence is not permission** (R1 proves the
hazard: a supplied callback granted a route with no capability check) · **client-side selection is
not the persistence boundary** — server/RLS authorization is unchanged and was **not** audited or
modified by this patch · no backend authorization work is authorized (no direct defect found in
the modal path: the viewer never invokes a write callback).

**Read-only contract** — all ten items binding; items 1–9 already pass (§13f), item 10 closed by
§13g. Setting `readOnly` on the textarea alone is explicitly **insufficient**; the toolbar, title
input and footer must remain structurally absent.

**Editable contract.** Editor opens for `canEditWorkspace === true` · existing editing controls
unchanged · **existing save/update route unchanged** (`onSave={saveCard}`) · close behaviour
available · no regression to R2/R3/R4/R5 or `CardPreview` interactions.

**Close/back contract.** Semantic `<button>` (already) · accessible name `Close` (to add) ·
visible in both modes (already) · closes and clears selection (already) · **does not save
implicitly — binding for the read-only route only**, where it already holds; the editable route's
implicit save is pre-existing and preserved under the editable contract (§13m).

### 13k. Allowlists and line limits

**Production allowlist — exact.**

| # | Path | Purpose | Max changed lines |
|---|---|---|---|
| 1 | **`lib/domain/canvas/cardModalRoute.ts`** *(new)* | pure route selector | **20** (whole file) |
| 2 | `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | R1 route selection at `:1757-1761` | **10** |
| 3 | `app/dashboard/canvas/[id]/CanvasClient.tsx` | R6 **card branch only** (`:5700`) route selection | **12** |
| 4 | `components/collabboard/CardEditor.tsx` | accessible name on existing close control `:124` | **6** |
| 5 | `components/collabboard/CardPreview.tsx` *(conditional)* | neutral accessible name — §13n | **2** |

**Production total ≤ 50 changed lines.** `CanvasClient` changes are confined to the `card`
branch of `openPadletInTypeEditor`; **no other type branch may be touched** — gating todo/link/
table/container/comment/drawing/ai-component is **out of scope**.

**Excluded by default (unchanged):** document-editor formatting internals · font/text-style
controls · text-container behaviour · underline/line tools · PATCH-137 / PATCH-142 tests ·
presentation code · Excalidraw fork · persistence/schema · `package.json` ·
`GROUP_H`/`OVERHEAD_H` · PATCH-135 tests · `CardActionsToolbar.tsx` · R7 dead code.

**Test allowlist — exact.**

| # | Path | Coverage | Max changed lines |
|---|---|---|---|
| 1 | **`lib/domain/canvas/cardModalRoute.test.ts`** *(new)* | `true → 'editor'`, `false → 'viewer'`, exhaustive over both inputs | **40** |
| 2 | **`components/collabboard/CardEditor.test.tsx`** *(new)* | read-only: content rendered, no title input, no toolbar, no footer, textarea `readonly`, exactly one button, close control carries `aria-label="Close"`; editable: toolbar present, textarea not `readonly`, footer present, close control named | **70** |

Both paths are already inside `vitest.config.ts`'s `include` (`lib/domain/**/*.test.ts`,
`components/collabboard/*.test.tsx`). **No `package.json` change. No new dependency.**
PATCH-138 **O2** is **not** absorbed.

**Environment constraint — recorded, and it bounds the test contract.** `vitest.config.ts` sets
`environment: 'node'`; `jsdom` is **not resolvable** and `@testing-library/react` is **not
declared in `package.json`**. Component proof therefore uses `renderToStaticMarkup`
(`react-dom/server`), the established pattern in `CardPreview.test.tsx`. This was **probe-verified
to work on `CardEditor`** (§13f).

**Consequence — accepted governance risk.** `CanvasClient.tsx` (~7.4k lines) and
`FreeformPadletCards.tsx` (~6k lines) are **not renderable** in this environment. The R1/R6
**wiring** therefore cannot be proven at unit level; only the **decision** (allowlist item 1) can.
Per the brief's test item 3, a focused integration test would be the fallback, but Playwright is
**not authorized here** — the wiring change is a one-line substitution per owner. **The closure
reviewer must verify R1 and R6 wiring by direct source inspection of the diff**, and is empowered
to require an integration test if the diff does not make the substitution self-evident.

### 13l. Induced-failure and negative-control plan

**Parent-state induced failure at `fcd1cc7` — load-bearing, on existing production code:**

- `components/collabboard/CardEditor.test.tsx` close-control test **must FAIL at `fcd1cc7`**,
  because the rendered markup contains **no `aria-label`** (probe-verified: `aria-label present:
  false`). This is a genuine parent failure, not a new-file artefact.
- `lib/domain/canvas/cardModalRoute.test.ts` cannot run at parent (module absent). It is
  **explicitly not counted** as the load-bearing proof.
- D1/D4 parent failures are **source-evidenced** (§13c R1, R6): R1 supplies `onEditContent`
  unconditionally; the `?openPadlet=` effect has no guard. Recorded as census evidence.

**Negative controls — temporary, reverted, never committed:**

| # | Perturbation | Must fail on |
|---|---|---|
| 1 | `selectCardModalRoute(false)` forced to return `'editor'` | route-selection test — the read-only user reaching the editor |
| 2 | restore an editing control in read-only (e.g. drop the `!readOnly` guard on the toolbar at `CardEditor.tsx:133`) | read-only contract test (button count / toolbar absence) |
| 3 | remove the close control's accessible name | close-control test |

Each must be shown failing with its exact message, then reverted, with the file verified
byte-identical (`git hash-object` against the committed blob).

### 13m. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| `canEditWorkspace` unreachable within a narrow owner | **NOT TRIGGERED** — already in scope at both owners (§13d) |
| Read-only safety requires rewriting the document editor | **NOT TRIGGERED** — read-only is already genuine (§13f) |
| Server-side authorization demonstrably missing | **NOT TRIGGERED** — no direct defect found in the modal path; RLS not audited and explicitly out of scope |
| Viewer writes through an unbounded indirect route | **NOT TRIGGERED** — `handleSave` short-circuits **and** the viewer's `onSave` is a no-op |
| **Unsaved-changes behaviour undefined and directly required** | **NOT TRIGGERED for PATCH-139's scope — but only just.** D3 is real: X and backdrop both call `handleSave`, and `CardEditor` has **no explicit Save button**, so close *is* the only persistence path. Making close non-saving would remove the editable route's only save — forbidden by the editable contract's "save/update route remains unchanged" — and adding a Save button is new document-editor UI, which is **PATCH-149**. For the **read-only** route the requirement already holds. **PATCH-139 must not alter editable save semantics.** |
| More than a narrow file set required | **NOT TRIGGERED** — 5 production files, ≤ 50 lines |

**No hard stop blocks PATCH-139.**

### 13n. PATCH-149 boundary and the terminology pair

**§3d's hard stop is retained.** PATCH-139 **must not** ship the isolated half-rename
`Edit card` → `View card` while R3 still reads `Card view`.

Under Option C, R1's destination becomes capability-dependent, so a fixed `"Edit card"` name is
wrong for read-only users (read-only contract item 10). **Authorized resolution — the narrowest
one:** rename R1's accessible name to a **neutral** term (e.g. `Open card`) **unconditionally**,
for both capabilities. It does not claim editing, it does not introduce `View card`, and it
therefore **cannot worsen the `Card view` / `View card` near-homograph pair**.

**Explicitly rejected alternative:** a capability-conditional accessible name. It requires a new
`CardPreview` prop for a wording difference PATCH-149 will re-decide anyway.

**Not repaired under PATCH-139** (all PATCH-149): font/text-style buttons (**D6** — no handlers
at all) · exiting a text/container after adding text · underline/line-post artefacts · broad
document-editor usability · **D3** missing Save button and implicit save-on-close · coordinated
`View card` / `Edit card` terminology and obsolete `Card view` removal · **D5** R7 dead code ·
`showCardView` (four readers, one declaration, **zero writers**).

**Not broadened into:** document-card substrate · links/backlinks · backend authorization.

### 13o. Validation matrix

| # | Gate | Requirement |
|---|---|---|
| 1 | Parent-state induced failure | `CardEditor.test.tsx` close-control test **fails at `fcd1cc7`** |
| 2 | Focused route-selection tests | `cardModalRoute.test.ts` green |
| 3 | Focused read-only tests | read-only contract items provable at markup level, green |
| 4 | Focused editable-mode regression | toolbar/title/footer present, textarea writable, green |
| 5 | Close/back tests | named close control in **both** modes |
| 6 | Existing card suites | `components/collabboard/CardPreview.test.tsx` unchanged and green |
| 7 | Full Vitest | **all pass**, unfiltered, no exclusions |
| 8 | Clean one-run `npm run typecheck` | remove vendored `dist/types` (**`components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types`**) + `.next`; one run → exit 0, declarations regenerated (PATCH-144 contract) |
| 9 | Ordinary `npx next build` | exit 0 |
| 10 | `node scripts/e2e/assertBridgeExclusion.mjs` | exit 0, no marker |
| 11 | Clean E2E build | exit 0, marker `1` |
| 12 | `git diff --check` | exit 0 |
| 13 | Final artefact | ordinary `.next` restored, **no** `E2E_BRIDGE_BUILD` marker |
| 14 | Worktree | only the five pre-existing protected paths outside committed history |
| 15 | Production frozen | `git diff --exit-code` clean on every §13k exclusion |

**No ten-run Playwright requirement.** E2E is not authorized unless the closure reviewer finds the
source proof of R1/R6 wiring insufficient (§13k).

### 13p. False-green protection

Reject any implementation that: relies on a hidden toolbar while editable inputs remain · uses
callback presence as permission · creates a permission architecture · changes persistence
authorization · duplicates the editor · treats `readOnly` **styling** as proof of immutability ·
omits a visible, **named** close control · adds implicit save to the read-only route · alters
editable save semantics · mixes PATCH-149 editor-control repairs · renames only one side of the
terminology pair or introduces `View card` · gates any non-`card` branch of
`openPadletInTypeEditor` · broadens to document-card substrate or links/backlinks · adds a test
dependency or touches `package.json`.

### 13q. Status and dependencies

**PATCH-139: OPEN · AUTHORIZED · OPTION C · PRODUCT DECISION SUPPLIED · NOT IMPLEMENTED ·
NOT PUSHED.**

| Patch | Status |
|---|---|
| PATCH-148 | **CLOSED** |
| **PATCH-139** | **OPEN · AUTHORIZED** (this amendment) |
| PATCH-140 | **NOT RELEASED** — **released when PATCH-139 closes** |
| PATCH-141 | DEFERRED in the authoritative sequence unless governance says otherwise |
| PATCH-149 | **RESERVED** — now also carries **D3**, **D5**, **D6** |
| PATCH-150 | RESERVED — presentation index-domain divergence; independent |
| PATCH-135 | Independently OPEN; PATCH-139 does not depend on it |
| PATCH-146 / 147 | RESERVED, non-blocking |

PATCH-139 may proceed independently of PATCH-135, PATCH-146/147 and PATCH-150.

---

## 14. Closure review — INDEPENDENT

**Reviewer:** independent Fable 5 closure reviewer. **Reviewed HEAD:** `20d6f65`.
**Governance base:** `b6786c5` (§13). **Implementation not modified. Commit not amended.
Nothing pushed.** All evidence re-run independently, not copied from the implementation report.

`.fable5.zip` (user-created, unrelated to implementation) confirmed **absent** at review time.

### 14a. Implementation commit review

`20d6f65` — `fix(canvas): route card modal by workspace capability`. **8 files, 108 insertions /
7 deletions.**

| File | Changed | §13k budget | Verdict |
|---|---|---|---|
| `lib/domain/canvas/cardModalRoute.ts` *(new)* | 5 | ≤20 | ✔ |
| `lib/domain/canvas/cardModalRoute.test.ts` *(new)* | 17 | ≤40 | ✔ |
| `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | 7 | ≤10 | ✔ |
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | 6 | ≤12 | ✔ |
| `components/collabboard/CardEditor.tsx` | 2 | ≤6 | ✔ |
| `components/collabboard/CardEditor.test.tsx` *(new)* | 70 | ≤70 | ✔ at limit |
| `components/collabboard/CardPreview.tsx` | 4 | ≤2 | **Deviation 1 — see §14g** |
| `components/collabboard/CardPreview.test.tsx` | 4 | not allowlisted | **Deviation 2 — see §14h** |

No `.fable5` file is in the commit. No excluded path changed: `git diff --exit-code` clean over
`presentationBridge.ts`, both slide-renderer files, `lib/infra/presentation/`, `package.json`,
`package-lock.json`, schema, Excalidraw fork, `CanvasSidebar.tsx`, `CardActionsToolbar.tsx`,
`lib/e2e/`.

### 14b. Helper review — **PASS**

```ts
export type CardModalRoute = 'editor' | 'viewer';
export function selectCardModalRoute(canEditWorkspace: boolean): CardModalRoute {
  return canEditWorkspace ? 'editor' : 'viewer';
}
```

Pure: no React, no imports, no global state, no side effects, no role inference — it consumes an
**already-computed** boolean. `true → 'editor'`, `false → 'viewer'`, verified by test and by
negative control (§14i). **No permission architecture was created**, exactly as §13a required.

### 14c. Freeform route result — **PASS**

`FreeformPadletCards.tsx:1758-1766`: `onEditContent` now calls
`selectCardModalRoute(canUseFreeformEditButton)` and branches to `setIsCardEditorOpen(true)` /
`setIsCardViewerOpen(true)`. `closeAllToolbars()` and `setPadletToEdit(padlet)` still run **before**
the branch, so selection state is set consistently for both routes. This closes **D1** — the
pre-existing inversion where an *editable* user's pencil opened the read-only viewer.

### 14d. Direct-link route result — **PASS**

`CanvasClient.tsx:5701-5704`: the `card` branch of `openPadletInTypeEditor` — the branch actually
reached by the ungated `?openPadlet=` effect at `:345-351` — now runs the same helper.
`setPadletToEdit(post)` at `:5692` still precedes it. **D4 is closed for plain cards.**

**No non-card branch was touched**, as §13k required: `todo`, `link`, `table`, `container`,
`comment`, `drawing`, `ai-component` and the `else` note branch are byte-identical.

### 14e. Read-only route safety — full re-census at `20d6f65`

All six `setIsCardEditorOpen(true)` sites re-enumerated and re-checked:

| Site | Route | Gate at HEAD |
|---|---|---|
| `CanvasClient.tsx:5417` | create-card toolbar (R5) | creation flow; toolbar itself gated by `canUseCanvasToolbar = canUseFreeformEditButton` (`:258`) |
| `CanvasClient.tsx:5702` | `?openPadlet=` card branch (R6) | **helper ✔ (new)** |
| `FreeformPadletCards.tsx:421` | `openFreeformPadletModal` (R4) | sole caller `:3227` gated by `showModalEditButton` (`:3091`) ✔ |
| `FreeformPadletCards.tsx:1762` | `CardPreview` pencil (R1) | **helper ✔ (new)** |
| `FreeformPadletCards.tsx:1811` | inline toolbar (R7) | **dead** — `{false && …}` still present ✔ |
| `FreeformPadletCards.tsx:6016` | `CardActionsToolbar` "Card view" (R3) | reachable only via R2, gated ✔ |

**Read-only enforcement in `CardEditor` is unchanged and remains genuine.** Independently
re-measured: read-only renders content, **no** title input, **no** formatting toolbar, **no**
footer, `readonly` textarea, **exactly one** button; `handleSave` still short-circuits to
`onClose()` and the viewer's `onSave` is still a no-op. Nine of the eleven `CardEditor` assertions
pass **at parent** (§14i), proving the implementation neither created nor weakened read-only safety.

### 14f. Editable route and close control — **PASS**

Editable route untouched: `CanvasClient.tsx:7374-7385` still `readOnly={false}` with
`onSave={saveCard}`. Toolbar, title input and footer all still render. **Save/close semantics were
not redesigned** — `onClick={handleSave}` is unchanged on both the button and the backdrop, so
**D3** remains exactly as governed (routed to PATCH-149, §13m).

Close control: the **only** change is `aria-label="Close"` added to the existing `<Button>`
(`CardEditor.tsx:124`). Semantic button retained, no second close control introduced, present in
**both** modes (proven by two separate tests). §13g satisfied.

### 14g. Deviation 1 — `CardPreview.tsx`, 4 lines against ≤2 — **CLASSIFIED A**

**A — acceptable arithmetic consequence of one governed change.**

The diff is exactly two occurrences of `aria-label="Edit card"` → `aria-label="Open card"`, at
`:71` (clipart branch) and `:149` (default branch). Both buttons invoke the *same*
`onEditContent` callback; they are two render branches of one affordance.

§13n mandated the rename **"unconditionally, for both capabilities"**. Since the control renders
in two branches, "unconditionally" necessarily means both — the ≤2-line figure in §13k undercounted
the mechanical cost of the decision §13n had already taken. **No behaviour, prop, conditional or
product decision was added**; the diff is 100 % string substitution.

Renaming only one branch would have produced an inconsistent affordance and a genuine defect. Per
the review brief, no artificial code extraction is required merely to satisfy the numeral.
**The §13k budget is amended to ≤4 for this file.**

### 14h. Deviation 2 — `CardPreview.test.tsx`, 4 lines, not allowlisted — **CLASSIFIED A**

**A — necessary test reconciliation implied by the authorized production rename.**

Two literals were updated, both pinning the renamed label:

- `:311` — the `findEditCardButton` predicate `element.props['aria-label'] === 'Edit card'` → `'Open card'`
- `:342` — `expect(rendered).toContain('aria-label="Edit card"')` → `'Open card'`

**No assertion was removed or weakened.** Independently verified:

| Measure | parent `b6786c5` | HEAD `20d6f65` |
|---|---|---|
| `expect(` count | **50** | **50** |
| `it`/`test` count | **15** | **15** |

The predicate remains **strict equality** (`===`), not loosened to a substring or regex match.
**Proven non-tautological by a reviewer-added control:** changing the production label to
`"Something else"` fails **4** `CardPreview` tests. The reconciled suite therefore still genuinely
pins the label — this is not a false green.

Leaving these two literals stale was not an option: §13o gate 7 requires a green full suite.
**The §13k test allowlist is amended to include `components/collabboard/CardPreview.test.tsx`,
limited to literal reconciliation of the renamed label (≤4 lines).**

### 14i. Induced failure and negative controls — all independently reproduced

| # | Control | Result |
|---|---|---|
| **Parent induced failure** | `CardEditor.tsx` restored to `b6786c5`, HEAD tests run | **2 failed / 9 passed** — *only* the two close-accessible-name tests fail, in both modes ✔ exactly as §13l predicted |
| **NC1** | `selectCardModalRoute` forced to return `'editor'` | **1 failed / 2 passed** — `expected 'editor' to be 'viewer'` ✔ |
| **NC2** | close accessible name removed (= the parent-state run above) | close tests fail in both modes ✔ |
| **NC3** | helper bypassed in `FreeformPadletCards` (inline `setIsCardEditorOpen(true)`) | detected by source review: `selectCardModalRoute(` call sites **1 → 0**, and `onEditContent` body shows an unconditional opener ✔ |
| **NC4** *(reviewer-added)* | production label changed to `"Something else"` | **4** `CardPreview` tests fail ✔ — proves §14h's reconciliation is not a tautology |

All four reverted; each file verified **byte-identical** to its committed blob via `git hash-object`
(`CardEditor.tsx` `a59bcf5b…`, `cardModalRoute.ts` `fb66023b…`, `FreeformPadletCards.tsx`
`e29d1996…`, `CardPreview.tsx` `85f6db67…`). **Nothing was committed.**

NC3 is the governed substitute for unit-level wiring proof (§13k's accepted risk). It worked: the
bypass was unambiguous under direct source inspection.

### 14j. Terminology result — **PASS**

- Both live `CardPreview` branches read `Open card` (`:71`, `:149`) ✔
- **`View card` is not introduced anywhere in the repository** — repo-wide grep returns nothing ✔
- `CardActionsToolbar.tsx:79` still reads `label: 'Card view'` — untouched ✔
- `CardActionsToolbar.tsx` is not in the commit ✔

The near-homograph pair was **not** worsened and PATCH-149's coordinated terminology scope is
intact. The broader wording decision is not reopened here.

### 14k. Test and environment validation

| Gate | Requirement | Measured |
|---|---|---|
| Route helper | green | **3 / 3** ✔ |
| `CardEditor` | green | **11 / 11** ✔ |
| `CardPreview` | green | **29 / 29** ✔ |
| Focused total | 43/43 | **43 / 43** ✔ |
| `ClipartCardDraftModal` (adjacent suite) | unaffected | **45 / 45** ✔ |
| Full Vitest, unfiltered | 66 files / 755 tests | **66 / 66 files · 755 / 755 tests** ✔ |
| Clean one-run `npm run typecheck` | exit 0, declarations regenerated | **410 fresh declarations**, exit 0 ✔ |
| `npx tsc --noEmit` | exit 0 | **exit 0** ✔ |
| `npx next build` | exit 0 | **exit 0** ✔ |
| Bridge exclusion | exit 0, no marker | **891 files**, no marker ✔ |
| Clean E2E build | exit 0, marker `1` | **exit 0**, marker **`1`** ✔ |
| Ordinary `.next` restored | exclusion re-proven, no marker | **891 files**, no marker ✔ |
| `git diff --check` | exit 0 | **exit 0** ✔ |

The generator's internal `exit 1` on the two pre-existing `SearchMenu.tsx` `TS18047` errors is the
accepted closed **PATCH-144** contract, not a PATCH-139 finding.

### 14l. Observations

**O1 — MATERIAL · clipart cards still bypass the capability decision. Reserved as PATCH-151.**

`openPadletInTypeEditor` tests the clipart branch **before** the gated card branch:

```
:5700  else if (post.type === 'card' && post.metadata?.svgUrl) setIsClipartDraftModalOpen(true);   // UNGATED
:5701  else if (post.type === 'card') { …selectCardModalRoute… }                                    // gated ✔
```

`ClipartCardDraftModal` is an **editing surface** — it exposes `onChange`, an editable title, and
internally renders a `CardEditor` with **`readOnly={false}`** (`ClipartCardDraftModal.tsx:442`).
Its render site (`CanvasClient.tsx:7390`) carries **no capability guard**, and its `onClose`
calls **`void saveCard(...)`**. So a read-only member opening `?openPadlet=<clipartCardId>` still
reaches an editable surface that persists on close.

**This is not an implementation defect.** §13k explicitly confined `CanvasClient` edits to *the
card branch* and forbade touching other branches; §13c's route census — authored by this reviewer
at `fcd1cc7` — **never enumerated the clipart branch**. The implementer followed governance
exactly. **This is a governance census gap, and it is mine.**

Scope note: the implementation brief already routes "clipart/header cleanup" to PATCH-149, and the
fix requires a decision about whether clipart cards get a read-only presentation at all — which
PATCH-139 has no mandate to make. **Reserved as PATCH-151 — clipart card capability routing.**
**The product owner should decide whether PATCH-151 must close before PATCH-140 releases**, since
the stated product contract ("direct `?openPadlet=` links obey the same decision") is only
satisfied for non-clipart cards today.

**O2 — cosmetic.** Two `CardPreview.test.tsx` *titles* still say "Edit card"
(`:318`, `:326`) though the asserted label is now `Open card`. Titles only — no assertion is
affected. Left alone deliberately: editing them is pure churn outside the reconciliation §14h
authorizes. Fold into PATCH-149's terminology pass.

**O3 — recorded.** `CardEditor` read-only still renders a real `<textarea>` (natively `readonly`)
rather than static markup. Governed as acceptable at §13f/§13j; noted only so a future reviewer
does not re-litigate it.

### 14m. Final classification

**3 — PASS · GOVERNANCE AMENDMENT REQUIRED FOR ARITHMETIC SCOPE DEVIATIONS.**

Both deviations classify **A**: each is a mechanical consequence of a decision §13 had already
taken, neither adds behaviour or product judgement, and neither weakens a test — the added NC4
proves the reconciled assertions still bind. §13k is amended accordingly (§14g, §14h).

The governed scope is delivered in full: one pure helper consumed by **both** owners, D1 and D4
closed, read-only safety intact and re-proven, editable route and save semantics untouched, a
named close control in both modes, neutral terminology that does not worsen the deferred pair, and
a clean full matrix.

The classification is **3 rather than 1** because closure requires appending amendments — and
because **O1 reserves PATCH-151 for a residual bypass of the same class on the adjacent clipart
branch**, which governance, not the implementation, failed to enumerate.

**PATCH-139: CLOSED · CAPABILITY-BASED CARD MODAL SPLIT ACCEPTED · PRODUCTION CHANGED WITHIN
AMENDED ALLOWLIST · NOT PUSHED.**

### 14n. Dependency status after closure

| Patch | Status |
|---|---|
| **PATCH-139** | **CLOSED** |
| **PATCH-140** | **RELEASED** by this closure — *subject to the product-owner call in O1 on whether PATCH-151 gates it* |
| PATCH-141 | DEFERRED unless governance says otherwise |
| PATCH-148 | CLOSED |
| PATCH-149 | **RESERVED** — carries D3, D5, D6, plus **O2** |
| PATCH-150 | RESERVED — presentation index-domain divergence |
| **PATCH-151** | **RESERVED · NEW** — clipart card capability routing (**O1**) |
| PATCH-135 | Independently OPEN |
| PATCH-146 / 147 | RESERVED, non-blocking |
