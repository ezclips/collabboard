# PATCH-139 — EDITOR / READ-ONLY MODAL SPLIT

**Status:** **OPEN · BLOCKED · OPTION G (PRODUCT/OWNER DECISION REQUIRED)** · NO IMPLEMENTATION
AUTHORIZED · PRODUCTION ALLOWLIST **EMPTY** · TEST ALLOWLIST **EMPTY** · **PATCH-140 NOT RELEASED**
· **NEITHER PATCH-138 CLOSURE FINDING IS OWNED BY THIS NUMBER** · NOT PUSHED
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
