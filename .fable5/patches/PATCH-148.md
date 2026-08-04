# PATCH-148 — PRESENTATIONBRIDGE SLIDE-LOCAL INDEX TEST RECONCILIATION

**Status:** **OPEN · PATCH-142 TEST RESIDUE CONFIRMED · TEST-ONLY SEMANTIC RECONCILIATION
AUTHORIZED · PRODUCTION FROZEN · NOT PUSHED**
**Authored:** 2026-08-04 (CTO). **Base:** `2eab01e`. **First authoring of this number.**
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
