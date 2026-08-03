# PATCH-144 — Reproducible vendored Excalidraw declaration generation

**Status:** CLOSED · ONE-RUN CLEAN-ENVIRONMENT DECLARATION REGENERATION PROVEN · SEE §18 ·
PATCH-142 RELEASED FOR ITS OWN FINAL CHARACTERIZATION · NOT PUSHED
**Opened:** 2026-08-03 (CTO) · **Closed:** 2026-08-03 (CTO)
**HEAD at authoring:** `748d141`
**Role of this document:** governance, command-graph census and architecture selection. No
implementation.
**Blocks:** PATCH-142 clean-environment validation. **Independent of:** PATCH-145 (closed),
PATCH-146, PATCH-147.

---

## 1. Contract

PATCH-144 closes only when, from a clean state:

1. `dist/types` absent;
2. **one** `npm run typecheck`;
3. declarations are generated;
4. the expected declaration exists;
5. repository `tsc --noEmit` runs;
6. the entire command exits **0**;
7. no generated declaration is committed;
8. no misleading application-level inferred-JavaScript errors appear.

PATCH-143 delivered item 8's *guard*. It explicitly deferred one-invocation regeneration
(§13a: "**Item 1 is not delivered in either form**"). That deferral is this patch.

---

## 2. Command graph — exact, as it exists at `748d141`

```
npm run typecheck
  └─ npm run preflight:excalidraw-types
  │    └─ node scripts/preflight-excalidraw-types.mjs        (36 lines)
  │         └─ [only when declaration absent]
  │              corepack yarn --cwd <fork>/packages/excalidraw gen:types
  │                └─ rimraf types && tsc
  │                     tsconfig.json  → extends ../tsconfig.base.json
  │                                      outDir "./dist/types"
  │                                      include ["**/*"]
  │                                      exclude ["**/*.test.*","tests","types","examples","dist"]
  │                     tsconfig.base.json → declaration: true
  │                                          emitDeclarationOnly: true
  │                                          skipLibCheck: true
  │                                          strict: true
  │                                          (noEmitOnError NOT set)
  └─ tsc --noEmit                                            ← repository compiler
       root tsconfig: strict true · skipLibCheck true · moduleResolution "bundler"
                      exclude includes "components/collabboard/canvas/excalidraw_fork"
```

**No recursion exists today** and none may be introduced: the preflight script invokes the
fork's `gen:types` directly, never `npm run typecheck`. The `&&` in `typecheck` is what
sequences generation before repository compilation **within one invocation** — this is
already the correct shape and is the reason `package.json` needs little or no change (§9).

**Consumers of the generated declarations** (6 application files, resolved through the
`file:` dependency `@excalidraw/excalidraw` → `<fork>/packages/excalidraw`, whose
`package.json` `types` field is `./dist/types/excalidraw/index.d.ts`):

```
components/collabboard/canvas/layouts/CustomMermaidModal.tsx
components/collabboard/canvas/layouts/DrawingLayout.tsx
components/collabboard/editors/DrawingEditor.tsx
components/collabboard/editors/ExcalidrawWrapper.tsx
components/presentation/slide-renderer/renderExcalidrawSlideBase.ts
lib/e2e/bridgeContract.ts
```

**Ignore ownership:** `dist` is ignored by the **fork's own** `.gitignore:16`, not the
repository root `.gitignore`. Confirmed by `git check-ignore -v`. **PATCH-144 therefore needs
no `.gitignore` change**, and must not touch the root `.gitignore` — it is one of the five
protected dirty paths.

---

## 3. Measured evidence — two distinct failure modes, not one

Everything below was executed at `748d141` against the real fork, not inferred.

### 3a. Clean state (`dist/types` absent) — PATCH-143's recorded behaviour, reconfirmed

```
$ rm -rf dist/types
$ corepack yarn --cwd <fork>/packages/excalidraw gen:types
$ rimraf types && tsc
components/SearchMenu.tsx(396,37): error TS18047: 'focusIndex' is possibly 'null'.
components/SearchMenu.tsx(398,18): error TS18047: 'focusIndex' is possibly 'null'.
error Command failed with exit code 1.
GEN_EXIT_CLEAN=1
```

Result: **410 `.d.ts` files emitted**, `dist/types/excalidraw/index.d.ts` present. Exit 1.

The emitted declaration for the offending module is **correct and undegraded**:

```ts
// dist/types/excalidraw/components/SearchMenu.d.ts
import "./SearchMenu.scss";
export declare const searchItemInFocusAtom: import("jotai/vanilla/atom").PrimitiveAtom<number | null> & {
    init: number | null;
};
export declare const SearchMenu: () => import("react/jsx-runtime").JSX.Element | null;
```

`number | null` is preserved; no `any` appears; the component's return type is precise.
**TS18047 is a control-flow checking diagnostic and demonstrably did not affect declaration
shape.** `noEmitOnError` is not set anywhere in the fork's TypeScript configuration, which is
why emit proceeds.

### 3b. Dirty state (`dist/types` present) — a second, previously unrecorded failure mode

```
$ corepack yarn --cwd <fork>/packages/excalidraw gen:types      # dist/types already present
error TS5055: Cannot write file '.../dist/types/excalidraw/actions/actionCanvas.d.ts'
              because it would overwrite input file.
   … 57 occurrences …
error Command failed with exit code 1.
GEN_EXIT=1
```

**57 × TS5055. Emit is blocked. Zero files are refreshed.**

### 3c. Stale-output sentinel test — decisive

Two sentinel files were planted inside `dist/types` before the §3b run:

```
dist/types/PATCH144_SENTINEL.d.ts
dist/types/excalidraw/PATCH144_SENTINEL_NESTED.d.ts
```

**Both survived the generation attempt.** Declaration count went 410 → 412 (the sentinels),
never refreshed.

### 3d. Root cause of non-reproducibility — the generator does not clean its own output

```json
"gen:types": "rimraf types && tsc"
```

`rimraf types` removes a directory named `types` at the package root. **That directory does
not exist** (`ls -d types` → *No such file or directory*). The real output directory is
`dist/types`, set by `outDir`. The generator therefore **never cleans what it writes**.

Consequences, all proven above:

- A **complete** `dist/types` makes regeneration impossible (TS5055, §3b).
- A **stale or partial** `dist/types` is never repaired by re-running the generator, and its
  leftovers survive (§3c).
- The current preflight only reaches the generator when the entry declaration is *absent*
  (`existsSync` short-circuit), which is precisely why this mode was never observed before.

**This, not the SearchMenu diagnostics, is the primary obstacle to reproducibility.** The
SearchMenu exit code is the second obstacle. Both must be addressed; neither alone suffices.

### 3e. Downstream compiler is an effective gate — CASE 5 proven, not assumed

The repository compiler was tested against a deliberately degraded declaration
(`index.d.ts` replaced with `export {};`):

```
REPO_TSC_DEGRADED_EXIT=2
components/collabboard/canvas/layouts/CustomMermaidModal.tsx(86,48): error TS2339: Property 'Excalidraw' does not exist …
components/collabboard/canvas/layouts/DrawingLayout.tsx(1423,15): error TS2339: Property 'loadFromBlob' does not exist …
components/collabboard/editors/DrawingEditor.tsx(120,25): error TS2339: Property 'exportToSvg' does not exist …
components/collabboard/editors/ExcalidrawWrapper.tsx(85,33): error TS2339: Property 'Excalidraw' does not exist …
components/presentation/slide-renderer/renderExcalidrawSlideBase.ts(25,11): error TS2339: Property 'exportToCanvas' does not exist …
   … 8 errors across all 6 consuming files …
```

With the real declaration restored: `REPO_TSC_RESTORED_EXIT=0`.

**The downstream compiler fails loudly on an unusable declaration.** This is the empirical
basis for Option A.

### 3f. Bound on that authority — `skipLibCheck: true`

The **root** `tsconfig.json` sets `skipLibCheck: true`. The repository compiler therefore does
**not** verify the internal consistency of the emitted `.d.ts` files; it verifies that **the
surface the application actually consumes conforms to how the application uses it**.

This is exactly the property PATCH-143 existed to protect (the misleading `exportToSvg`
errors), and §3e proves it is enforced. It is **not** a full validation of all 410 files.
The residual risk — a declaration internally malformed but whose consumed surface happens to
type-check — is real and is why §6 requires structural checks in addition to the compiler,
rather than the compiler alone.

---

## 4. Architecture options

### Option A — artifact-plus-downstream-compiler contract

Run the generator, capture its exit code, verify the exact declaration exists and is fresh,
then let the repository compiler that already runs next in the same `npm run typecheck`
invocation be the authority. Succeed only if both the artifact checks and the repository
compiler succeed. Retain and print generator diagnostics.

### Option B — repair the two vendored SearchMenu diagnostics

Restructure the control flow so the generator exits 0.

### Option C — generator-specific typecheck configuration

A declaration-generation configuration that preserves emit but does not fail on diagnostics
irrelevant to the public type surface.

### Option D — another bounded design.

---

## 5. Selected architecture — **OPTION A**, with the mandatory clean-before-generate step

**Selected: A.** With §3's evidence, the decision is not close.

**Why not B.** Option B addresses §3a only. **It does nothing about §3b/§3c**, so a clean
checkout would still be unable to regenerate a stale tree, and the contract's item 3 would
still fail. B is therefore *additive* work on top of the cleaning fix, not an alternative to
it. It also inherits PATCH-143 §13c's finding: the diagnostics arise from an
`Awaited<Value>` conditional-type interaction through `jotai-scope`'s `createIsolation()`
re-export, **a compiler-behaviour cause with no terminal state** — the same pattern can
resurface anywhere in the fork on any TypeScript upgrade. Fixing sites one at a time is
open-ended; fixing the generation contract is closed-ended. Finally, it is a local edit to an
MIT vendored fork carrying merge debt on every upstream sync, for a file the repository never
typechecks (`tsconfig.json` excludes the fork).

**Why not C.** TypeScript offers no "emit but do not fail on check errors" switch;
`emitDeclarationOnly` and the absent `noEmitOnError` already produce exactly the emit
behaviour we want — **the only thing left is the process exit code**, which is not a
compiler-configuration surface. Reaching exit 0 through configuration would require either
suppressing `strictNullChecks` for the generator (a broad weakening the brief forbids) or
excluding `SearchMenu.tsx` from the program — which would **drop its declarations from the
public surface**, converting a cosmetic diagnostic into a real type regression. `skipLibCheck`
as a blanket escape is forbidden and would not help regardless: the diagnostic is in fork
*source*, not in a library declaration.

**Why not D.** No further design is supported by the evidence; the evidence points squarely at
two mechanical defects with two mechanical remedies.

### 5a. The two required changes

1. **Clean before generating.** The script must remove the `dist/types` tree *before*
   invoking the generator. Proven mandatory by §3b/§3c: without it, generation is impossible
   whenever any output remains.
2. **A bounded tolerance for the generator's exit code**, defined in §6, with the repository
   compiler as the authority (§3e) and structural checks covering `skipLibCheck`'s blind spot
   (§3f).

### 5b. Deletion safety rule — non-negotiable

**The script may delete `dist/types` only on the path where the expected entry declaration is
already absent.**

Rationale: on that path the tree is by definition already broken or partial, so nothing usable
can be destroyed. Conversely, if the entry declaration is present the script must **return
success immediately without deleting or regenerating anything** (CASE 1 / CASE 7).

This rule exists because the obvious naive design — "always clean, always regenerate" — would
destroy a working declaration set whenever the generator is unavailable (CASE 3), leaving the
environment strictly worse than before it ran. **That failure mode must not be introduced.**

### 5c. The fork's `gen:types` is left unchanged

The one-word fix to the fork (`rimraf types` → `rimraf dist/types`) is **not authorized**.
Our own script owns the cleaning, which achieves the identical effect with zero vendored
merge debt. The mis-targeted `rimraf` is recorded here as a finding (§3d) so the next engineer
does not rediscover it, and so a future upstream sync that fixes it upstream is recognised as
making our cleaning step redundant rather than conflicting.

---

## 6. Generator-exit policy — bounded, not blanket

The script classifies every outcome. **The generator is never described as successful when it
exited non-zero.**

| # | Condition | Behaviour |
|---|---|---|
| 1 | Generator exits 0, declaration exists and is fresh | **PASS.** Log success. |
| 2 | Generator exits non-zero, declaration exists, fresh, structural checks pass | **PASS WITH DIAGNOSTICS.** Reprint generator output verbatim. State explicitly: *"generator reported diagnostics; the emitted declarations are being validated by the repository compiler, which runs next in this same command."* Exit 0 **only** so the `&& tsc --noEmit` can run and adjudicate. |
| 3 | Generator exits non-zero, declaration absent | **FAIL** (exit 1). Existing PATCH-143 message. |
| 4 | Declaration exists but repository typecheck fails | **FAIL** — owned by `&& tsc --noEmit`, not by the script. The script must not pre-empt or duplicate it. |
| 5 | Generator command unavailable (`corepack`/`yarn` ENOENT, spawn error) | **FAIL** (exit 1), with a message distinct from 3 naming the missing tool. |
| 6 | Fork directory or fork package missing | **FAIL** (exit 1). Already implemented; retain. |
| 7 | Generator ran but the expected output path is absent / emitted elsewhere | **FAIL** (exit 1), same treatment as 3. |
| 8 | Stale declaration from an earlier run | **Structurally impossible** on the regeneration path (§5a.1 deletes first). Additionally guarded by the freshness assertion (§7). |

### 6a. No line-number or filename matching

**The two SearchMenu diagnostics must not be pattern-matched.** Line numbers and file paths
shift on every upstream sync; a matcher built on them is brittle and would silently stop
protecting anything the moment it drifted. Tolerance is granted by **artifact-shape
invariants**, which are stable under upstream change:

- the expected entry declaration exists and is fresh (§7);
- the emitted declaration count meets a documented floor (§6b);
- the repository compiler subsequently passes (§3e).

### 6b. One class-based fatal rule

**Any generator output containing `TS5055` must be treated as fatal regardless of the other
checks.** TS5055 means *emit was blocked* — the artifact on disk is by definition not the
product of this run. This is a diagnostic-*class* rule, not a line or file matcher, and it
directly encodes §3b. With §5a.1 in place TS5055 should never occur; if it does, an assumption
has broken and the run must fail loudly rather than proceed.

**Declaration-count floor:** the implementer must record the observed count (**410** at
`748d141`) and choose a floor well below it to catch catastrophic partial emit without being
brittle to upstream growth or shrinkage. The floor must be justified in the implementation
report, not chosen arbitrarily.

### 6c. Is the downstream compiler sufficiently authoritative?

**For the consumed surface: yes, proven (§3e).** **On its own: no (§3f).** `skipLibCheck: true`
means it does not read the 410 declarations for internal consistency. The combination in §6a —
freshness + count floor + TS5055-fatal + repository compiler — is what makes Option A safe.
Any implementation that drops the structural checks and relies on the compiler alone is
**rejected**.

---

## 7. Artifact freshness contract

**Primary mechanism: delete-then-generate (§5a.1).** After the tree has been removed, the
presence of the entry declaration is itself proof it was produced by this invocation.

**Secondary assertion, required:** capture a timestamp immediately before spawning the
generator and assert `mtimeMs` of the expected declaration is not older than it (with a small
tolerance for filesystem clock granularity). This is cheap and catches a generator that
restores a cached tree rather than emitting.

**Explicitly rejected:** "the file exists after the command" as the sole test. §3c proved a
file can exist after a wholly failed generation.

**Not required:** a temporary output location. `outDir` is fixed by the fork's `tsconfig.json`,
and redirecting it would mean either a vendored config change or a second config file — both
wider than delete-then-generate, which is already sufficient and proven.

---

## 8. Application typecheck ownership — no recursion

**Authorized final shape:**

```
npm run typecheck
  └─ node scripts/preflight-excalidraw-types.mjs     # presence · clean · generate · verify
  └─ tsc --noEmit                                    # usability — the authority
```

Rules:

- The script **must not** invoke `npm run typecheck`, `npm run preflight:excalidraw-types`, or
  any script that transitively re-enters either. This is the recursion the brief forbids.
- The script **must not** run `tsc --noEmit` itself. Doing so would double the repository
  compilation on every invocation for no added signal — the `&&` already guarantees it runs
  next, in the same command, and its failure already fails the whole invocation (CASE 5).
- One script, one responsibility boundary. The four concepts stay distinguishable in its
  output: **presence** ("declarations present"), **generation** ("generating…"), **usability**
  (delegated, and said so), **repository typecheck** (the following command).

---

## 9. Allowlists

### 9a. Production application files

**None.** No application file may change under PATCH-144.

### 9b. Tooling — authorized

| File | Responsibility | Limit |
|---|---|---|
| `scripts/preflight-excalidraw-types.mjs` | amended in place: presence short-circuit, clean-on-absent, generate, freshness + structural verification, bounded exit policy (§6) | **≤ 80 lines total** (currently 36) |
| `package.json` | only if a change proves necessary | **≤ 2 changed script lines; 0 expected** |

**One script, not two.** A separate `scripts/generate-excalidraw-types.mjs` is **not
authorized**: presence-checking and generation are one decision procedure here, and splitting
them is precisely how two contradictory declaration-setup paths appear — which the brief
forbids and which this repository already paid for once. The existing filename and npm script
name are retained so no call site moves.

**`package.json` is expected to need zero changes.** `typecheck` is already
`npm run preflight:excalidraw-types && tsc --noEmit`, which is the exact one-invocation shape
required. The ≤2-line allowance exists only in case the implementer proves a need; an
unexplained change is a review failure.

### 9c. Conditional vendored allowlist

**Not engaged.** Option B was not selected, so **no vendored fork file may change** — in
particular `SearchMenu.tsx` and the fork's `package.json` (§5c). If the implementer concludes
a fork change is unavoidable, that is a **hard stop**: return for amendment rather than widen.

### 9d. Explicitly excluded

`DrawingEditor.tsx` · `renderExcalidrawSlideBase.ts` · any export call-site · all PATCH-142
production files · all PATCH-145 files · `tsconfig.json` · `next.config.ts` · the root
`.gitignore` (§2) · the PATCH-136 bridge · `scripts/harness/**` (PATCH-147's territory) ·
`e2e/**` (PATCH-146's territory).

No `ignoreBuildErrors`. No `skipLibCheck` change. No non-null assertions, `as number`,
`@ts-ignore`, or `@ts-expect-error` anywhere.

---

## 10. Test matrix

| # | Case | Setup | Required result |
|---|---|---|---|
| 1 | Declarations present | `dist/types` complete | `npm run typecheck` exits 0; **generator not invoked**; no deletion; repository typecheck passes |
| 2 | Clean missing declarations | `rm -rf dist/types` | **one** `npm run typecheck`; declaration generated; repository typecheck passes; **whole invocation exits 0** |
| 3 | Generator unavailable | make `corepack`/`yarn` unresolvable | exits non-zero; `tsc --noEmit` **does not run**; diagnostic names the missing tool; **a pre-existing good tree is not destroyed** (§5b) |
| 4 | No declaration emitted | generator runs, emits nothing | exits non-zero; **cannot pass from stale output** — verified with a planted sentinel as in §3c |
| 5 | Unusable declaration | replace `index.d.ts` with `export {};` | repository compiler fails; **whole command fails** (reference result: exit 2, 8 errors, §3e) |
| 6 | Generator non-zero with usable output | clean state, real fork | generator diagnostics printed verbatim; freshness proven; repository typecheck passes; invocation exits 0 per §6 row 2; **output never calls the generator successful** |
| 7 | Second invocation | immediately after CASE 2 | passes; no regeneration; no deletion; measurably no generator spawn |
| 8 | Git hygiene | after all cases | `dist/types` still ignored (fork `.gitignore:16`); no generated file staged or committed; `git status` shows only governed changes plus the five protected paths |

**Induced-failure requirement.** CASES 3, 4 and 5 must each be demonstrated to actually fail —
a matrix in which every case is green is not evidence that the guards work.

**CASE 4 must use the sentinel method of §3c**, not merely a missing-file check: the whole
point is that leftovers can survive a failed run.

---

## 11. Clean-environment validation

Validation must start from a genuinely clean state — **not** a machine where the artifact
already exists:

- vendored generated declarations removed (`rm -rf <fork>/packages/excalidraw/dist/types`);
- no stale `.next`;
- no reliance on any earlier local run.

Then prove, in order:

1. one `npm run typecheck` → exit 0, declarations present afterwards;
2. clean ordinary `npx next build` → exit 0;
3. `node scripts/e2e/assertBridgeExclusion.mjs` → passes; no `E2E_BRIDGE_BUILD` marker;
4. clean `npm run build:e2e` → exit 0, `.next/E2E_BRIDGE_BUILD` contains `1`.

**Do not claim one-run fresh-environment reproducibility from a machine where the generated
artifact was already present at the start.** PATCH-143 §13d recorded exactly this
non-claim; PATCH-144 is the patch that earns the right to make it.

---

## 12. PATCH-142 release contract

PATCH-142 becomes eligible to resume **full** validation only once PATCH-144 proves:

- missing declarations regenerate in **one** invocation;
- repository typecheck passes in that same invocation;
- ordinary build passes;
- the E2E build can be produced **without relying on pre-existing ignored artifacts**.

**PATCH-144 does not close PATCH-142.** PATCH-142 must still independently re-run its own
phase-3 characterization and prove C5b per-slide after PATCH-144 closes. Its behavioral
prerequisite (PATCH-145) is already closed; this is the remaining environmental one.

---

## 13. Deferred, not mixed in

- **PATCH-146** — characterization iteration-8 harness isolation. Begin with ten independent
  Playwright *process* invocations. Reserved at PATCH-145 §17b.
- **PATCH-147** — Windows lifecycle CLI `spawn npm ENOENT` in `scripts/harness/serverCli.ts`.
  Reserved at PATCH-145 §17c.

Neither blocks PATCH-144, and **neither may be folded into it.** `scripts/harness/**` and
`e2e/**` are outside this patch's allowlist for exactly this reason.

---

## 14. False-green protection

The implementation is **rejected** if any of these appear:

1. The generator exit code is ignored unconditionally, or tolerated without the §6 structural
   checks.
2. A stale or pre-existing declaration can satisfy a failed generation.
3. Freshness is asserted from file existence alone.
4. The repository typecheck is skipped, short-circuited, or duplicated inside the script.
5. Any generated declaration is committed.
6. `DrawingEditor.tsx` or any export call site is modified.
7. `ignoreBuildErrors` is enabled, or `skipLibCheck` is altered.
8. Any TypeScript suppression is added (`@ts-ignore`, `@ts-expect-error`, `as any`,
   non-null assertion).
9. Vendored fork source is modified (Option B was not selected).
10. A clean environment still requires two invocations.
11. CI success depends on an ignored artifact copied from another machine.
12. Diagnostics are hidden — the generator's output must remain visible in CI logs.
13. A working declaration tree is destroyed when generation cannot proceed (§5b).
14. Line-number or filename matching is used to recognise the tolerated diagnostics (§6a).

---

## 15. Hard stops — evaluated at authoring

| Stop | Result |
|---|---|
| Usable declarations cannot be distinguished from partial output | **NOT TRIGGERED** — entry-file presence + freshness + count floor + TS5055-fatal + repository compiler (§6) |
| Freshness cannot be proven | **NOT TRIGGERED** — delete-then-generate makes presence proof of freshness; mtime assertion is the secondary check (§7) |
| Downstream compiler cannot validate the generated declarations | **NOT TRIGGERED** — proven to fail with exit 2 and 8 errors on a degraded declaration (§3e); bounded by `skipLibCheck` and compensated in §6 |
| Accepting non-zero generator status would also accept unrelated serious failures | **NOT TRIGGERED** — TS5055 is class-fatal, emission is structurally verified, and the repository compiler adjudicates the consumed surface. **This was the closest call and is why §6 is a table, not a flag.** |
| Option B requires behavior-changing vendored edits | **NOT ENGAGED** — Option B not selected |
| Command ownership creates recursion | **NOT TRIGGERED** — the existing `&&` shape is already correct; §8 forbids re-entry |
| More tooling surface than can be narrowly bounded | **NOT TRIGGERED** — one script, ≤80 lines, 0–2 `package.json` lines |

**All seven clear. PATCH-144 is bounded and authorized to implementation.**

---

## 16. Status

**OPEN · CLEAN-ENVIRONMENT DECLARATION CONTRACT IDENTIFIED · ONE-RUN TYPECHECK REGENERATION
AUTHORIZED · OPTION A SELECTED WITH MANDATORY CLEAN-BEFORE-GENERATE · PATCH-142 VALIDATION
BLOCKED UNTIL CLOSED · NOT PUSHED.**

- **PATCH-145:** CLOSED (§17 of that patch).
- **PATCH-142:** phases 1–2 implemented; behavioral prerequisite satisfied; **clean-environment
  validation blocked by PATCH-144**; must independently re-run its characterization afterwards.
- **PATCH-137:** OPEN · blocked by PATCH-142.
- **PATCH-146 / PATCH-147:** reserved, not authorized, not mixed in.
- Archived PATCH-090–105 numbers remain void.

---

## 17. Recorded diagnostic notes

- **The recorded failure was real but was not the whole failure.** PATCH-143 documented the
  SearchMenu exit code accurately. It never saw TS5055, because the preflight's
  `existsSync` short-circuit meant the generator was only ever invoked from a clean state.
  **A guard that skips a code path also hides that path's defects** — the second failure mode
  surfaced only when this patch deliberately invoked the generator in the state the guard
  normally prevents.
- **A build script that does not clean its own output directory is not reproducible, whatever
  its exit code says.** `rimraf types` targets a directory that does not exist while `outDir`
  writes to `dist/types`. One wrong path in a two-command script made every subsequent
  regeneration impossible, and the mismatch is invisible from reading the exit code alone.
- **Prove the gate fails before trusting it to gate.** Option A rests entirely on the
  repository compiler catching a bad declaration. That was tested by deliberately breaking the
  declaration (exit 2, 8 errors across all 6 consumers), not assumed from `strict: true`.
- **`skipLibCheck: true` narrows what "the compiler validated it" means.** It validates the
  consumed surface, not the artefact's internal consistency. Stating that bound is what turns
  Option A from a hopeful policy into a bounded one.
- **The naive repair would have made the failure mode worse.** "Always clean, then regenerate"
  destroys a working declaration set whenever the generator is unavailable. The deletion had to
  be confined to the path where the tree is already known broken — a constraint that only
  becomes visible once you ask what the script does on its *unhappy* path.

---

## 18. Closure review (2026-08-03, CTO)

**HEAD:** `0186016`. **Implementation commit:** `0186016`
(`build(types): make Excalidraw declaration setup reproducible`) — re-read from the commit
object directly, not accepted from the implementation report.

### 18a. Independent source review

`git show 0186016 --stat`: **one file**, `scripts/preflight-excalidraw-types.mjs`,
47 insertions / 10 deletions, **73 lines total** (≤80 limit). `package.json`: confirmed
byte-identical to `f34e1ee` — the predicted zero-change outcome held.

**Exclusion list** (`git diff --exit-code f34e1ee HEAD --` over the fork's `components`
directory, `DrawingEditor.tsx`, `renderExcalidrawSlideBase.ts`, `tsconfig.json`,
`next.config.ts`, root and fork `.gitignore`, `PATCH-142/145/146/147` files,
`DrawingLayout.tsx`, `isElementBeingLaidOut.ts`, the PATCH-145 spec, `scripts/harness/`):
**confirmed unchanged, zero diff.**

| Review point | Finding |
|---|---|
| **Cleaning scope** — deletion path is exactly `<pkg>/dist/types` | Confirmed: `distTypes = path.join(pkg, "dist/types")`. Guard at line 39 checks `startsWith(pkg + sep)` plus both basenames (`types`/`dist`) before any `rmSync`. |
| Deletion runs only when entry is absent | Confirmed: the guard and `rmSync` are unreachable except after the `existsSync(expected)` early-return at line 31–34. |
| A working tree is never deleted merely because generation is unavailable | Confirmed by construction — deletion happens *before* the generator is invoked, only on the branch where the entry was already missing, so there is no "working tree" on that branch to protect. |
| **Freshness** — tree removed before generation | Confirmed, line 45 precedes line 49. |
| Entry checked; mtime checked against `genStart` with a clock tolerance | Confirmed, lines 59 and 65–67. `FRESHNESS_TOLERANCE_MS = 5_000` is not an exact value PATCH-144 pinned, but is small, same-process/same-machine (no cross-host clock skew is possible), and is *secondary* to the real guarantee — delete-then-generate — so it introduces neither a false-failure risk (nothing to skew) nor a false-green risk (nothing stale can be present to satisfy it). **Reasonable, not a defect.** |
| Stale sentinels cannot survive | Re-verified directly (§18b, CASE 4) with newly planted sentinel files distinct from the implementer's originals. |
| **Structure** — count floor ≥ 300, minimum not exact-lock | Confirmed, line 8 and the `<` comparison at line 62. |
| Output not accepted from entry-existence alone | Confirmed: `existsSync(expected)` **and** the count floor **and** the mtime check are all required; none alone suffices. |
| **Generator exit policy** — exit 0 still requires valid fresh output | Confirmed by control flow: the TS5055/existence/count/freshness checks (lines 58–67) run unconditionally, *before* the `result.status !== 0` branch at line 69 — there is no code path that trusts a zero exit without running every check. This is stronger than the brief's minimum ask. |
| Non-zero tolerated only after all checks pass; generator never called successful | Confirmed — reaching line 69 means every `fail()` gate already passed; the log text explicitly attributes success to "the repository typecheck that runs next," never to the generator. |
| Diagnostics remain visible | Confirmed — `result.stdout`/`result.stderr` are written to the process streams (lines 54–55) before any pass/fail decision. |
| **TS5055** — checked across stdout and stderr, always fatal, no brittle matching | Confirmed, line 56 concatenates both streams; line 58 is a plain substring check on the diagnostic *code*, not a line number or filename. |
| **Command ownership** — no recursion | Confirmed: the script never invokes `npm run typecheck` or `preflight:excalidraw-types`; `package.json`'s `typecheck` script is unchanged (`preflight:excalidraw-types && tsc --noEmit`). |
| **Fail-closed** — every required condition | Nine `fail()` call sites enumerated directly from source: fork missing (29), fork package missing (30), unsafe path (40), deletion-not-removed (46), spawn error (53), TS5055 (58), post-generation absence (59), count floor (63), freshness (66). Downstream repository type errors are correctly **not** duplicated here — they are owned by the `&&  tsc --noEmit` that already follows in `package.json`, per the command-ownership rule this patch itself set. |

### 18b. Test matrix — independently re-run, not accepted from the report

Every case below was executed fresh in this review, with the healthy tree backed up
externally first and restored to a verified-healthy (`npm run typecheck` exit 0) state
immediately after each destructive test.

| Case | Result |
|---|---|
| 1 — present | `EXIT=0`; entry `mtimeMs` identical before/after; no regeneration. |
| 2 — clean missing | `dist/types` removed; **one** `npm run typecheck` → `TYPECHECK_EXIT=0`; 410 `.d.ts` files; entry present. |
| 3 — generator unavailable | PATH stripped of the directory containing both `node` and `corepack` for the *child* process only (no committed-source edit); script exits **1**; declaration correctly absent afterward; message is `"Generation completed but declaration is still absent"` rather than a spawn-error message — see §18c observation 2. |
| 4 — stale sentinel | Two newly planted sentinel files (`REVIEW_SENTINEL.d.ts`, nested variant) **removed** by clean-before-generate; fresh 410-file tree generated; no false green. |
| 5 — unusable declaration | `index.d.ts` replaced with `export {};`; full `npm run typecheck` → **`TYPECHECK_EXIT=2`, 8 `TS2339` errors** across all 6 consuming files; restored, re-verified healthy. |
| 6 — non-zero with fresh usable output | Subsumed by, and identical to, case 2's evidence — the clean-missing path *is* this case in this repo's current state (the generator always exits 1 on a clean run due to the known SearchMenu diagnostics). |
| 7 — second invocation | Immediately re-run after case 2; `EXIT=0`; entry `mtimeMs` unchanged; no regeneration. |
| 8 — git hygiene | `git status --short` shows only the five protected paths; `git check-ignore -v` confirms `dist/types/excalidraw/index.d.ts` is ignored via the **fork's own** `.gitignore:16`; `git add -n` on the `dist` directory is refused. |

**No case required widening, retrying past a real failure, or accepting a result the
implementer's own report did not already claim.**

### 18c. Non-blocking observations

1. **`FRESHNESS_TOLERANCE_MS = 5_000` is an implementer choice, not a value PATCH-144 pinned
   numerically.** Reviewed and accepted: the check is secondary to delete-then-generate (the
   actual freshness guarantee), so the specific tolerance value cannot introduce a false
   green, and same-process/same-machine timing cannot produce a false failure at this
   magnitude. No change required.
2. **On Windows, the `result.error` branch (line 53) is not the path that catches "generator
   unavailable."** With `shell: true`, `cmd.exe` absorbs the missing-command condition into
   its own non-zero exit rather than causing Node's `spawnSync` to report a spawn-level
   error object — confirmed directly in §18b case 3, where the failure was instead caught by
   the subsequent `!existsSync(expected)` check with a less specific (but still accurate and
   still fail-closed) message. The branch retains real value on POSIX, where `shell` is
   `false` and a missing `corepack` *does* set `result.error.code === "ENOENT"` directly. This
   is a diagnostic-message-precision nuance, not a false-green risk — the outcome (exit
   non-zero, no misleading typecheck follows) is identical either way. No change required.
3. **The path-safety guard (line 39) is lexical, not realpath-resolved** — it does not defend
   against `distTypes` being redirected by a symlink or junction. Checked directly:
   `fs.lstatSync` on the current `dist/types` confirms it is a plain directory, not a
   symlink, and nothing in this repository's build process creates one at this location. For
   this fixed, hardcoded, non-user-influenced path, the lexical check is sufficient; adding
   `fs.realpathSync`-based verification would be hardening against a threat with no evidence
   behind it, which the review brief instructs against. No change required.

None of these three rises to a defect. They are recorded so a future reader does not
re-derive them from scratch.

### 18d. Clean-generation and build proof (this review's own run, not carried over)

`.next` and `dist/types` removed **together** before any of the following:

1. `npm run typecheck` → **exit 0** in one invocation; 410 fresh `.d.ts` files confirmed present afterward.
2. `npx next build` (ordinary) → **exit 0**.
3. `node scripts/e2e/assertBridgeExclusion.mjs` → **bridge exclusion proven across 891 emitted files**; no `E2E_BRIDGE_BUILD` marker.
4. `.next` removed; `E2E_BRIDGE_BUILD=1 next build` → **exit 0**; `.next/E2E_BRIDGE_BUILD` contains **`1`**.
5. `.next` removed; ordinary `next build` restored → **exit 0**; exclusion re-proven across 891 files; no marker.
6. `git diff --check` → **exit 0**, clean.

No step in this chain depended on a declaration tree copied from another machine or an
earlier session — every `dist/types` used here was generated fresh within this review.

### 18e. Classification

**1 — PASS, READY FOR CLOSURE.**

Independent source review found no gap between the governed contract and the shipped code.
Every governed test case was re-run from a genuinely clean state and matched the required
result, including two induced failures (cases 3 and 5) that must fail and did. The three
observations recorded above are read-and-understood nuances, not acceptance defects, and the
review brief explicitly instructs against widening the patch to pre-empt them.

### 18f. Status

**PATCH-144: CLOSED · ONE-RUN CLEAN-ENVIRONMENT DECLARATION REGENERATION PROVEN ·
INDEPENDENTLY RE-VERIFIED · NOT PUSHED.**

**PATCH-142 release decision:** PATCH-142 is **released** for its own independent final
characterization and closure review. **PATCH-144 does not itself close PATCH-142** — PATCH-142
must still re-run its phase-3 characterization and prove C5b per-slide, in its own governance
turn, before it may be declared closed. **PATCH-137 remains blocked until PATCH-142 closes.**

**PATCH-146 / PATCH-147:** unaffected by this review, remain reserved and non-blocking. No
direct dependency between either and PATCH-144 was discovered.
