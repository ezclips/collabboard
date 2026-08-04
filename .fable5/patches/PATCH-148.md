# PATCH-148 — PRESENTATIONBRIDGE SLIDE-LOCAL INDEX TEST RECONCILIATION

**Status:** **CLOSED · TEST-ONLY SLIDE-LOCAL RECONCILIATION ACCEPTED · PRODUCTION FROZEN ·
NOT PUSHED** — closed at §16 by independent review of `d41b6e6`, classification **2 (pass with
non-blocking observations)**. Sections 1–15 are the authorization record and are preserved as
written; see **§16l O1** for the one superseded detail (gap-fixture shape).
**Authored:** 2026-08-04 (CTO). **Base:** `2eab01e`. **First authoring of this number.**
**Closed:** 2026-08-04 (independent reviewer). **Implementation:** `d41b6e6`.
**Origin:** PATCH-142 closure residue, diagnosed and reserved at PATCH-139 §4/§5b.
**Reserved by:** PATCH-139 §11. **Does not advance PATCH-140. Does not unblock PATCH-139.**

---

## 1. Origin

PATCH-142's implementation commit **`1fe6221`** ("scope slide overlay ordering to the slide")
moved `resolveSlidePadlets` and `planSlideComposition` from **scene-global array indices** to
**slide-local ordinals**. `lib/infra/drawing/presentationBridge.test.ts` was last updated at
`ed18524` (**PATCH-112**) and still asserts the pre-`1fe6221` global values.

`presentationBridge.ts` imports both changed modules (`:2-3`), so the stale expectations began
failing the moment `1fe6221` landed. PATCH-142 nevertheless closed green because its validation
matrix ran `lib/infra/presentation/` (36 tests) plus characterizations — **not** the full suite,
and not `lib/infra/drawing/`. PATCH-138's closure review found the failures; PATCH-139 §4 proved
the mechanism by reverting only the two slide-renderer files, which returns the file to **43/43**.

**PATCH-142 is not reopened.** Its production behaviour is accepted and correct. The residue is
entirely test-side.

### 1a. Path corrections

The brief named two paths that do not exist. Third occurrence of this class of drift in this
sequence (cf. PATCH-138 §16a, PATCH-139 §1a) — recorded so the implementer is not sent astray:

| Named in brief | Actual |
|---|---|
| `lib/infra/presentation/resolveSlidePadlets.ts` | **`components/presentation/slide-renderer/resolveSlidePadlets.ts`** |
| `lib/infra/presentation/planSlideComposition.ts` | **`components/presentation/slide-renderer/planSlideComposition.ts`** |

Prompt-path corrections, not scope changes.

---

## 2. Confirmed current state — re-measured at `2eab01e`

| Measurement | Result |
|---|---|
| `npx vitest run lib/infra/drawing/presentationBridge.test.ts` | **6 failed / 37 passed (43)** |
| `npx vitest run` (full suite) | **6 failed / 733 passed (739)**, 63/64 files green |
| Failing file | `lib/infra/drawing/presentationBridge.test.ts` only |

**These six are the only failures in the repository.** No unrelated failing suite exists.

All six fail on the identical expression `composition.resolvedPadlets.map((entry) => entry.zIndex)`.
Each test aborts at that line, so its remaining assertions never execute — which is why the
runner output alone understates how narrow the defect is.

---

## 3. Fixture-by-fixture census

Verified directly by read-only probe (temporary file, run, deleted, never committed), not by
reading the runner output.

| Fixture | Purpose | Asserted (scene-global) | Actual (slide-local) | Slide membership | Expected relative order | Gaps? | All padlets valid? | Why the old value is scene-global |
|---|---|---|---|---|---|---|---|---|
| **S1** `:263` | one padlet, natives before and after | `[2]` | `[1]` | `native-before`, `emb-a`, `native-after` | `emb-a` | no | **yes** | counts the frame element at index 0 |
| **S2** `:281` | adjacent padlets, natives outside | `[2, 3]` | `[1, 2]` | `native-before`, `emb-a`, `emb-b`, `native-after` | `emb-a`, `emb-b` | no | **yes** | frame at 0 |
| **S3** `:300` | natives between two padlets | `[1, 4]` | `[0, 3]` | `emb-a`, 2 natives, `emb-b` | `emb-a`, `emb-b` | **yes** (natives occupy 1–2) | **yes** | frame at 0 |
| **S4** `:319` | live G1d shape, two frames, overlap-fallback member | `[2, 3, 7]` | `[0, 1, 4]` | `emb-slide-a`, `emb-uploaded-image`, 2 natives, `runtime-container-c` | those three, in order | **yes** (natives occupy 2–3) | **yes** | counts **two** frames and the other slide's members |
| **S5** `:341` | duplicate padlet links | `[1, 3]` | `[0, 2]` | `emb-a`, `native-between`, `emb-a-copy` | `emb-a`, `emb-a-copy` | **yes** (native occupies 1) | **yes** | frame at 0 |
| **S7** `:377` | deleted element precedes a native | `[1, 4]` | `[0, 2]` | `emb-a`, `native-after-deleted`, `emb-b` (deleted excluded) | `emb-a`, `emb-b` | **yes** (native occupies 1) | **yes** | counts the frame **and** the deleted element |

**S6 `:360` is not in the failing set.** It asserts `toMatchObject([{ padletId, embeddableId }])`
plus bands and carries **no numeric `zIndex`** — which is precisely why `1fe6221` did not break
it. **S6 is the in-repo precedent this patch generalises.**

**Independently confirmed for all six:** `nativeBelowIds`, `nativeAboveIds` and the
`expectLosslessNativeBands` invariant **already match the tests' existing expectations**;
resolved `embeddableId` order is correct; `zIndex` is strictly increasing. **Only the numeric
list is stale.**

### 3a. Two-index-space divergence — verified, and NOT exercised by the six

PATCH-142 recorded that `resolveSlidePadlets` and `planSlideComposition` can occupy two different
slide-local index spaces. **Confirmed in source:**

- `resolveSlidePadlets.ts:25` builds `localOrdinalById` over **all** live slide members, then
  drops embeddables whose padlet record is missing or `type === "drawing"` (`:36`) — dropped
  members **keep** their ordinal slot.
- `planSlideComposition.ts:38` builds `localIndexById` over native members **plus only surviving
  `resolvedPadlets`** — densely re-indexed.
- `planSlideComposition.ts:82` then compares `firstPadletActiveIndex` (sparse space) against
  `localIndexById` (dense space).

**PATCH-139's report that none of the six exercises it is CONFIRMED** — every fixture supplies a
valid, non-drawing padlet for every embeddable, so the two spaces coincide and every band
placement is correct.

**However, a probe constructed for this census demonstrated the divergence is a real, reachable
production ordering defect** — see §8. It is **fenced out of PATCH-148** and reserved.

---

## 4. Semantic `zIndex` contract (accepted PATCH-142 behaviour)

| # | Rule | Status |
|---|---|---|
| 1 | Only elements belonging to the slide contribute to its ordering | **CONFIRMED** — §4a |
| 2 | Ordinals are slide-local, over the slide's own live members in scene order | **CONFIRMED** |
| 3 | Relative visual order is preserved | **CONFIRMED** — resolved order matches scene order in all six |
| 4 | Ordinals are strictly increasing among resolved entries | **CONFIRMED** — all six, and every probe case |
| 5 | Cross-slide scene elements do not shift another slide's ordinal domain | **CONFIRMED** — §4a |
| 6 | Dropped padlet records may leave gaps | **CONFIRMED, but see §4b — this is not the main cause of gaps** |
| 7 | Numeric ordinals are derived output, not persisted identity | **CONFIRMED** — they shift when any unrelated slide member is added or removed |
| 8 | Prefer membership and relative-order semantics over hard-coded numbers | **ADOPTED as this patch's test-design rule** |

The ordinal space excludes the frame element itself and all deleted elements; embeddables with a
`padlet://` link resolve membership via `resolveFrameMembership` (explicit `frameId`, else strict
centre containment), all other elements by `frameId === slideFrame.id`.

### 4a. Cross-slide independence — measured

Target slide `frame-a` with `emb-a`, `emb-b`:

```
baseline                                  → zIndex=[0,1]
+ unrelated frame-b embeddable AND an unrelated frame-b native inserted mid-scene
                                          → zIndex=[0,1]   (unchanged)
```

**Rule 5 holds.** This is currently **untested** and is required coverage (§6 item 4).

### 4b. Gap behaviour — measured, and the contract is broader than stated

The brief frames gaps as arising from "missing or dropped padlet records". **That is true but
secondary.** The dominant cause is that **native members share the ordinal space**:

```
S5  (all padlets valid, one native interleaved)          → zIndex=[0,2]   gap at 1
S3  (all padlets valid, two natives interleaved)         → zIndex=[0,3]   gap at 1–2
G-missing  (emb with no padlet record, no natives)       → zIndex=[0,2]   gap at 1
G-drawing  (emb whose padlet is type:"drawing")          → zIndex=[0,2]   gap at 1
```

**Contractual statement for the tests:** resolved-padlet ordinals are **ranks within the slide's
full member list**, so they are **expected to be non-contiguous** whenever a native member or a
dropped embeddable sits between two resolved padlets. **A test must never assert contiguity**, and
must not treat a gap as evidence of a dropped padlet — S3 and S5 prove gaps occur with every
padlet valid.

---

## 5. Test-design decision

**Replace unexplained numeric-list assertions with semantic ones.** Blindly substituting the
current output for the old output is explicitly rejected — it would re-freeze derived numbers and
prove nothing about the contract.

**Required properties, asserted per fixture:**

1. resolved entries appear in the intended **`embeddableId` order** (this is what "same visual
   ordering as before" actually means);
2. `zIndex` values are **strictly increasing**;
3. band placement (`nativeBelowIds` / `nativeAboveIds`) and the lossless invariant remain **exactly
   as they are today** — they already pass and must not be weakened.

**Suggested shape** (a single shared helper keeps each of the six sites to one replaced line, and
keeps the whole change inside the line limit):

```ts
function expectResolvedOrder(
  composition: ReturnType<typeof characterizeSlideComposition>,
  expectedEmbeddableIds: string[],
) {
  const z = composition.resolvedPadlets.map((entry) => entry.zIndex);
  // Identity + relative order: the contract's visual guarantee (rule 3).
  expect(composition.resolvedPadlets.map((entry) => entry.embeddableId)).toEqual(expectedEmbeddableIds);
  // Strictly increasing, never contiguous-by-assumption: natives and dropped
  // embeddables legitimately consume ordinal slots (rule 4, §4b).
  expect(z).toEqual([...z].sort((a, b) => a - b));
  expect(new Set(z).size).toBe(z.length);
}
```

**Exact numerals may be retained only where the number *is* the property under test**, and each
retained numeral needs a one-line comment naming that property. Exactly one such case is
anticipated: the §6 item 5 gap fixture, where `[0, 2]` encodes *"the dropped embeddable consumed
ordinal 1"* — that is the assertion's whole point.

**Forbidden:** asserting a slide-local **basis** (e.g. "the first resolved member is 0"). It is
not contractual — S1 and S2 legitimately start at 1 because a native precedes the first padlet.

---

## 6. Required test coverage

1. The six existing fixtures pass under slide-local semantics, via §5's helper.
2. ID/order assertions prove the same visual ordering as the old global numbers encoded.
3. `zIndex` strictly increasing, in every resolved fixture.
4. **New:** an unrelated-slide member (embeddable **and** native on another frame) does not change
   the target slide's resolved ordering — §4a's measured shape.
5. **New:** a fixture with a **missing or `type: "drawing"` padlet record** documents that the gap
   **is contractual** — the dropped embeddable consumes its ordinal slot. Use the **safe shape**
   defined in §8: **no native member may sit after a resolved padlet in this fixture.**
6. No corrected expectation restores scene-global indexing — checked against §4's contract, not by
   eye. (The S1/S2 offsets are `+1` and individually look plausible; that is exactly the trap.)
7. All existing membership and band assertions remain intact and unweakened.

---

## 7. Allowlists and limits

### Production allowlist — **EMPTY. Production is frozen.**

`presentationBridge.ts` is a pure pass-through: it calls `resolveSlidePadlets` and
`planSlideComposition` and reshapes their output, holding no index logic of its own. **There is no
production defect in the six failures.**

**Must not be modified:** `lib/infra/drawing/presentationBridge.ts` ·
`components/presentation/slide-renderer/resolveSlidePadlets.ts` ·
`.../planSlideComposition.ts` · `.../getSlideRenderSignature.ts` · thumbnail code ·
PATCH-142 characterization · PATCH-137 characterization · persistence/schema · `package.json` ·
the PATCH-136 bridge (`lib/e2e/**`) · Excalidraw fork · `CanvasSidebar.tsx`
(`GROUP_H`/`OVERHEAD_H`, PATCH-135) · `CardPreview.tsx` / `CardActionsToolbar.tsx` (PATCH-149).

### Test allowlist

| Path | Max changed lines |
|---|---|
| `lib/infra/drawing/presentationBridge.test.ts` | **60** |

**No new test file.** The current file expresses the contract; §5's helper design lands the six
replacements plus two new fixtures well inside 60 lines.

---

## 8. Fenced out — the divergence is a real production defect (reserved)

A probe built for this census **demonstrated** the §3a divergence produces incorrect layering:

```
scene order: emb-m1(no padlet), emb-m2(no padlet), emb-a(valid), native-x
expected:    native-x renders ABOVE emb-a  (it follows emb-a in scene order)
actual:      below=["native-x"]  above=[]      ← native-x placed BELOW
```

Mechanism: the two dropped embeddables inflate `firstPadletActiveIndex` to `2` in the sparse
space, while `native-x` is densely re-indexed to `1` in `planSlideComposition`'s space, so
`1 < 2` sends it to the wrong band.

**This is a genuine production ordering defect, not test residue.** It is **explicitly excluded
from PATCH-148**, because:

- it is **not** what any of the six failures exposes (§3a);
- it **has no defined correct result** under PATCH-142's closed contract — the hard stop;
- fixing it requires a **production** change, and this patch's production allowlist is empty.

**Reserved as PATCH-150 — presentation band-split index-space unification.** Deciding it means
choosing whether `planSlideComposition` should adopt `resolveSlidePadlets`' sparse ordinal or
`resolveSlidePadlets` should re-index densely after filtering — a PATCH-142-contract question.

**PATCH-148's gap fixture (§6 item 5) must therefore use the safe shape:** document the ordinal
gap with **no native member positioned after a resolved padlet**, so it records gap semantics
without silently encoding the defective band placement as expected behaviour. A fixture that
asserted `below=["native-x"]` would freeze the bug.

---

## 9. Induced-failure plan

**Parent state, at `2eab01e` — already measured (§2):**

- `presentationBridge.test.ts` → **6 failed / 37 passed**, all six on the `zIndex` expression;
- full suite → **6 failed / 733 passed**.

**After correction:**

- `presentationBridge.test.ts` → **43/43**, plus the two new fixtures;
- full suite → **green**;
- **no production change** — proven by `git diff --exit-code` over `presentationBridge.ts`, both
  slide-renderer files and `getSlideRenderSignature.ts`.

If the full suite surfaces any *other* failure, classify it separately and **do not widen this
patch**.

## 10. Negative-control plan

Temporary, run, reverted, **never committed**. The control must be **semantic** — a control that
only perturbs numbering would survive a test that merely re-froze the current output, which is
the exact false-green this patch exists to prevent.

| # | Perturbation | Must fail on |
|---|---|---|
| 1 | **Reverse two resolved slide members** (swap `emb-a` / `emb-b` scene positions in a fixture) | the `embeddableId` order assertion |
| 2 | **Admit an unrelated-slide member** (retarget the other frame's embeddable to the slide under test) | the cross-slide fixture's resolved-order assertion (§6 item 4) |

Both must be shown failing, then reverted, with the file verified byte-identical afterwards.

## 11. Validation matrix

| # | Gate | Requirement |
|---|---|---|
| 1 | Parent-state induced failure | **6 failed / 37 passed** at `2eab01e` |
| 2 | Focused corrected suite | `presentationBridge.test.ts` **43/43** (+2 new) |
| 3 | Full Vitest suite | **all pass** |
| 4 | PATCH-142 focused suites | `lib/infra/presentation` **36/36**, unchanged |
| 5 | Clean one-run `npm run typecheck` | remove vendored `dist/types` + `.next`; **one** run → exit 0, declarations regenerated (PATCH-144 contract) |
| 6 | Ordinary `npx next build` | exit 0 |
| 7 | `node scripts/e2e/assertBridgeExclusion.mjs` | exit 0, 891 files, no marker |
| 8 | Clean E2E build | exit 0, marker `1` |
| 9 | `git diff --check` | exit 0 |
| 10 | Final artifact | ordinary `.next` restored, **no** `E2E_BRIDGE_BUILD` marker |
| 11 | Worktree | only the five pre-existing protected paths outside committed history |
| 12 | Production frozen | `git diff --exit-code` clean on every §7 excluded path |

Gates 6–8 are **repository gates, not behavioural proof** — this patch changes tests only. The
behavioural proof is gates 1–4 plus §10's negative controls.

## 12. False-green protection

Reject any plan that: updates expected arrays to current values without a stated semantic reason ·
changes production to satisfy stale tests · restores scene-global indexing · drops relative-order
checking · removes or weakens membership/band assertions · hides missing-padlet behaviour ·
skips or excludes the file · asserts contiguous ordinals · asserts a fixed slide-local basis ·
encodes §8's defective band placement as expected · reopens PATCH-142 without a production defect ·
adds a test-environment dependency or touches `package.json` (PATCH-138 **O2** is **not**
absorbed here).

## 13. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| A failure reveals a real production ordering defect | **NOT TRIGGERED for the six.** All six are stale numerics against correct production output. A **separate** real defect was found and is fenced + reserved as PATCH-150 (§8) — it is not among the six and is not fixed here |
| Tests exercise the two-index-space divergence with no defined correct result | **NOT TRIGGERED, by construction** — §8 mandates the safe gap-fixture shape and forbids the divergence shape |
| Semantic expectations require changing PATCH-142's closed contract | **NOT TRIGGERED** — §4 restates PATCH-142's contract; it does not amend it |
| More than the single test file required | **NOT TRIGGERED** — one file, ≤ 60 lines |
| Full-suite failures remain after correction and are directly related | **Cannot trigger at authorization.** These six are the only repository failures (§2); gate 3 enforces it |

**No hard stop blocks PATCH-148.**

## 14. Status and dependencies

**PATCH-148: OPEN · PATCH-142 TEST RESIDUE CONFIRMED · TEST-ONLY SEMANTIC RECONCILIATION
AUTHORIZED · PRODUCTION FROZEN · NOT PUSHED.**

| Patch | Status |
|---|---|
| **PATCH-148** | **OPEN · AUTHORIZED** (this document) |
| PATCH-139 | **OPEN · BLOCKED** — modal capability decision; **unaffected by this patch** |
| PATCH-140 | **NOT RELEASED** — gated on PATCH-139, which PATCH-148 does not advance |
| PATCH-141 | DEFERRED — not authorizable |
| PATCH-135 | Independently OPEN — blocks only PATCH-138 C-4 |
| PATCH-142 | CLOSED — **not reopened**; residue is test-side |
| PATCH-146 / 147 | RESERVED, non-blocking; not mixed in |
| PATCH-149 | RESERVED · BLOCKED — card action terminology + Scope C (PATCH-139 §5b) |
| **PATCH-150** | **RESERVED · NEW** — presentation band-split index-space unification (§8) |

Closing PATCH-148 releases **nothing**: it is corrective test debt outside the 138–141 sequence.

## 15. Recorded diagnostic notes

- **The passing test explains the fix better than the failing ones.** S6 is the only fixture
  `1fe6221` did not break, and the only one with no numeric `zIndex`. The contract in §4 is less an
  invention than a description of why S6 survived — which is also the argument for §5's rule.
- **A gap does not mean what the brief assumed.** Gaps were framed as evidence of dropped padlet
  records. Measurement shows S3 and S5 have gaps with every padlet valid, because native members
  share the ordinal space. Had the fixture been written to the assumed rule, it would have asserted
  a false cause and passed anyway.
- **Fencing beats fixing when the correct answer is undefined.** The divergence probe turned a
  latent PATCH-142 observation into a reproducible mis-layering. The temptation was to fix it here —
  one file away. But the correct band for a native member after a dropped padlet is a question
  PATCH-142's contract never answered, so the honest output is a reserved patch and an explicit
  fixture-shape prohibition, not a quiet production edit inside a test-only patch.
- **Six identical failures are one defect, not six.** Every failing assertion is the same
  expression in six fixtures. Reporting them as six problems would have justified a far larger
  allowlist than one file and sixty lines.

---

## 16. Closure review — INDEPENDENT

**Reviewer:** independent Fable 5 closure reviewer. **Reviewed HEAD:** `d41b6e6`.
**Implementation not modified. Scope not broadened. Commit not amended. Nothing pushed.**
All evidence below was re-run independently at `d41b6e6`, not copied from the implementation report.

### 16a. Implementation commit review

| Check | Result |
|---|---|
| Commit subject | `test(presentation): reconcile bridge assertions with slide-local order` |
| Files changed | **exactly 1** — `lib/infra/drawing/presentationBridge.test.ts` |
| Changed lines | **59** (53 insertions / 6 deletions) — governed max **60** |
| Non-test file in commit | **none** (`git show --name-only` filtered for non-`.test.ts` → empty) |
| Parent → HEAD file delta | **1 file**; production byte-identical between `246d459` and `d41b6e6` |

### 16b. Source-scope result — **PASS**

`git diff --name-only 246d459 d41b6e6` over `presentationBridge.ts`, both slide-renderer files,
`lib/infra/presentation/`, `package.json`, `package-lock.json`, `supabase/`, `types/`,
`excalidraw-app/`, `vendor/` returns **empty**. All ten §7 exclusions confirmed unchanged:
`presentationBridge.ts` · `resolveSlidePadlets.ts` · `planSlideComposition.ts` · PATCH-142
production and tests · PATCH-136 bridge · `package.json` · schema/persistence · Excalidraw fork.
**Production allowlist was empty and was honoured.**

### 16c. Semantic-helper review — **PASS**

`expectResolvedOrder` (test file `:83-92`) asserts:

- resolved **`embeddableId` order** equals the expected list;
- `zIndex` sorted ascending (`expect(z).toEqual([...z].sort(...))`);
- `zIndex` **unique** (`new Set(z).size === z.length`).

Sorted **∧** unique ⟹ **strictly increasing**. It does **not** require contiguity, does **not**
require a fixed starting value, does **not** restore scene-global indices, and does **not** treat
`zIndex` as persisted identity. No bare unexplained numeric `zIndex` array survives as a primary
contract. The one retained numeral (`[0, 2]`, gap fixture) is the property under test and carries
the §5-required one-line justification.

### 16d. Fixture-by-fixture review — **PASS (6/6)**

| Fixture | Stale numeric removed | Replaced with | Membership / band / fixture-specific assertions |
|---|---|---|---|
| S1 | `[2]` | `["emb-a"]` | `nativeBelowIds` + `nativeAboveIds` + lossless — **intact** |
| S2 | `[2, 3]` | `["emb-a", "emb-b"]` | **intact** |
| S3 | `[1, 4]` | `["emb-a", "emb-b"]` | **intact** |
| S4 | `[2, 3, 7]` | `["emb-slide-a", "emb-uploaded-image", "runtime-container-c"]` | **intact** |
| S5 | `[1, 3]` | `["emb-a", "emb-a-copy"]` | **intact**; separate `padletId` identity assertion `["padlet-a","padlet-a"]` **retained verbatim** |
| S7 | `[1, 4]` | `["emb-a", "emb-b"]` | **intact** |

All six now proceed past the former failure line (parent aborted there; 45/45 pass at HEAD).
**No membership or band assertion was removed or weakened anywhere in the file.**

**§6 item 2 verified structurally, not by eye:** `localOrdinalById` is assigned over
`slideMembers` already sorted by `sceneIndex`, and `resolvedPadlets` is sorted by `zIndex`.
Ordinal order is therefore identical to scene order, which is what the old global numbers encoded.
The ID sequences necessarily preserve the prior visual ordering. **No expectation restores
scene-global indexing** — confirmed against the measured parent actuals
(`[1] [1,2] [0,3] [0,1,4] [0,2] [0,2]`), none of which appears as a literal in the commit.

### 16e. Cross-slide result — **PASS**

The new fixture builds a baseline composition and a second one containing a second frame
(`frame-b`), an unrelated embeddable (`emb-other`, `frameId: "frame-b"`) and an unrelated native
(`native-other`, `frameId: "frame-b"`) interleaved into scene order. It asserts resolved order is
`["emb-a", "emb-b"]` **and** that the full `zIndex` array equals the baseline's. It does **not**
merely check a final count. Genuineness proven by negative control 2 (§16h).

### 16f. Safe-gap result — **PASS**

Shape: `emb-x` (valid) → `native-gap` → `emb-z` (valid). Asserts resolved order `["emb-x","emb-z"]`,
then `zIndex` `[0, 2]` with the comment naming the cause, then lossless native bands. The gap is
correctly attributed to **rank within full slide membership**, not to a dropped padlet.

### 16g. PATCH-150 boundary — **PASS · DEFECT NOT FROZEN**

The §8 defect requires a **dropped** embeddable to inflate `firstPadletActiveIndex` in
`resolveSlidePadlets`' sparse space while `planSlideComposition` re-indexes densely. The delivered
fixture contains **zero dropped padlets** (`padlet-x` and `padlet-z` are both valid, non-drawing).
With no drops, `localOrdinalById` and `localIndexById` are **provably identical**
(`{emb-x:0, native-gap:1, emb-z:2}` in both), so the divergence is **structurally unreachable** by
this fixture. It cannot encode the defective band placement as correct. **PATCH-150 remains
reserved and untouched; it was neither reopened nor repaired here.**

### 16h. Induced-failure and negative-control results

| # | Control | Result |
|---|---|---|
| **Parent** | test file restored to `246d459` (production byte-identical, so this is an exact parent reproduction) | **6 failed / 37 passed (43)** — S1/S2/S3/S4/S5/S7, all on the `resolvedPadlets` `zIndex` expression ✔ matches §2 |
| **NC1** | expected order reversed in S4 (`emb-uploaded-image` before `emb-slide-a`) | **1 failed / 44 passed** — fails on the **`embeddableId` order** assertion ✔ |
| **NC2** | `emb-other` retargeted `frame-b` → `frame-a` | **1 failed / 44 passed** — cross-slide fixture: `['emb-other','emb-a','emb-b']` vs `['emb-a','emb-b']` ✔ |
| **NC3** *(reviewer-added)* | **scene input** perturbed — `emb-x`/`emb-z` swapped in the gap fixture | **1 failed / 44 passed** — `['emb-z','emb-x']` vs `['emb-x','emb-z']` ✔ |

NC3 was added because NC1 and NC2 perturb *expectations*; NC3 perturbs the *production input* and
so proves the assertions track real production output rather than re-frozen constants — the exact
false-green §12 exists to prevent.

**All three controls reverted. File verified byte-identical to the committed blob:**
`git hash-object` → `ec99696103da4638eb7e99c894d66b726550cdaf`, equal to
`d41b6e6:lib/infra/drawing/presentationBridge.test.ts`. **No control was committed.**

### 16i. Focused, full-suite and regression results

| Gate | Requirement | Measured |
|---|---|---|
| Focused suite | 43 + 2 new | **45 / 45 passed** ✔ |
| Full Vitest, no exclusions/filters | all pass | **64 / 64 files · 741 / 741 tests** ✔ |
| PATCH-142 focused (`lib/infra/presentation`) | 36/36 unchanged | **4 files · 36 / 36 passed** ✔ |

No suite skipped; `presentationBridge` not excluded; the final run was unfiltered.

### 16j. Clean-environment validation

| # | Gate | Result |
|---|---|---|
| 1–2 | Remove vendored `dist/types` + `.next` | done at the **real** fork path `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types` |
| 3–4 | `npm run typecheck`, one run | preflight reported *missing declaration* → regenerated **410 fresh declarations**, no TS5055 |
| 5 | `tsc --noEmit` | **exit 0** (bare `npx tsc --noEmit` re-run independently: exit 0) |
| 6 | `npx next build` | **exit 0** |
| 7 | `node scripts/e2e/assertBridgeExclusion.mjs` | **exit 0** — "Bridge exclusion proven across **891** emitted files", **no marker** |
| 8–10 | Clean E2E build | **exit 0**, marker `.next/E2E_BRIDGE_BUILD` = **`1`** |
| 11–13 | Ordinary `.next` restored, exclusion re-run | **exit 0**, 891 files, **no marker remains** |
| — | `git diff --check` | **exit 0** |

The generator's internal `exit 1` on the two pre-existing `SearchMenu.tsx` `TS18047` errors is the
**accepted, closed PATCH-144 contract** — declarations still regenerate and `npm run typecheck`
exits 0. Not a PATCH-148 finding.

### 16k. False-green review — **no rejection criterion triggered**

| §12 / review criterion | Result |
|---|---|
| Old numerics replaced with unexplained new numerics | **NO** — six replaced with semantic ID assertions; the single retained numeral is the property under test and is justified |
| Production altered | **NO** |
| Membership or band assertions removed / weakened | **NO** |
| Relative order no longer tested | **NO** — tested, and proven live by NC1 and NC3 |
| Cross-slide independence not genuinely tested | **NO** — proven live by NC2 (see O3 for a partial-coverage note) |
| PATCH-150 behaviour frozen as expected | **NO** — structurally unreachable (§16g) |
| Tests skipped or excluded | **NO** |
| Full Vitest remains red | **NO** — 741/741 green |
| Contiguity or fixed slide-local basis asserted | **NO** |
| `package.json` / test-environment dependency touched | **NO** |

### 16l. Observations — all NON-BLOCKING

**O1 · Governance text is now stale relative to what was authorized and delivered.**
§5, §6 item 5 and §8 specify the gap fixture must use a **missing or `type:"drawing"` padlet
record**, and forbid a native member sitting after a resolved padlet in that fixture. The delivered
fixture is the **inverse shape**: two valid padlets with a native between them. This is **not an
implementer deviation** — the implementation brief and the closure brief both specify exactly the
delivered shape, and it is the shape §15's own second diagnostic note argues for (natives, not
drops, are the dominant gap cause). It is also **strictly safer**: it removes the dropped-padlet
element that made the §8 prohibition necessary in the first place. **Recorded as an amendment:
§5 / §6 item 5 / §8's gap-fixture shape is superseded by the delivered native-interleaved shape.**
No re-work required.

**O2 · Dropped-padlet ordinal consumption is now untested.** As a consequence of O1, **no fixture
in the file exercises a missing or `type:"drawing"` padlet record** (verified by grep). That the
dropped embeddable consumes its ordinal slot is real, probe-confirmed production behaviour and is
currently uncovered. Covering it in isolation (**no** native members) is safe — with no natives the
band split has no observable output, so the §8 divergence stays unreachable. **Routed to PATCH-150's
test scope**, which is where the dropped-padlet index question belongs anyway.

**O3 · Cross-slide fixture covers the embeddable half only.** `native-other` is present in the
fixture *input* but the fixture asserts no band contents, so "an unrelated **native** does not enter
the target composition" is unasserted. Production does exclude it (`isNativeFrameMember` requires
`element.frameId === slideFrame.id`), and band coverage exists in S1–S7, so this is a coverage
edge, not a defect or a regression.

**O4 · Strict monotonicity is asserted indirectly.** It emerges from *sorted* **∧** *unique* as two
separate `expect` calls. Correct as written, but deleting either line silently weakens the contract
to non-strict. Worth a comment if the helper is ever edited.

**O5 · Cosmetic.** No blank line between the two new `it(` blocks (a line-budget trimming artifact).
Style only.

### 16m. Final classification

**2 — PASS WITH NON-BLOCKING OBSERVATIONS.**

PATCH-148 delivered exactly its governed scope: one test file, 59 of 60 permitted lines, production
untouched, six stale numeric assertions replaced with a semantic contract that three independent
negative controls prove is live, two new fixtures adding real coverage, and the reserved PATCH-150
defect provably not frozen. O1 is a governance-text correction, O2/O3 are routed coverage edges,
O4/O5 are notes. **None blocks closure.**

**PATCH-148: CLOSED · TEST-ONLY SLIDE-LOCAL RECONCILIATION ACCEPTED · PRODUCTION FROZEN ·
NOT PUSHED.**

### 16n. Dependency status after closure

| Patch | Status after PATCH-148 closes |
|---|---|
| **PATCH-148** | **CLOSED** |
| PATCH-139 | **OPEN · BLOCKED** — modal capability product decision; next blocked product patch; **not advanced** |
| PATCH-140 | **NOT RELEASED** — still gated on PATCH-139 |
| PATCH-141 | DEFERRED |
| PATCH-142 | CLOSED — not reopened |
| PATCH-149 | RESERVED · BLOCKED |
| **PATCH-150** | **RESERVED** — now also carries O2's dropped-padlet coverage |
| PATCH-146 / 147 | RESERVED, non-blocking |

**No numbered feature patch is released by this closure.** PATCH-148 was corrective test debt
outside the 138–141 sequence, exactly as §14 anticipated.
