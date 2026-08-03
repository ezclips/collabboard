# PATCH-136 — Shared characterization-suite build / harness failure

**Status: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED**

**Governance and diagnosis only. No production or test file was modified. Nothing pushed.**

Authored 2026-08-02 (CTO). HEAD: `6f86829`. Snapshot
`snapshot/pre-document-architecture-2026-08-02` / tag → `c0fa799`, **not modified**.
Protected paths untouched.

---

## 1. Why this patch exists

PATCH-132 (§20f), PATCH-135 (§16g.1) and PATCH-134 (§19h) each closed without a
review-time E2E run, each citing the same inherited failure. PATCH-134 §19k escalated the
repetition as a trend rather than a footnote. **This patch is that escalation.**

The individual closures remain valid — they rested on implementation-time green runs,
negative controls, geometry evidence, source review, unit tests and typecheck. **The
repeated environment failure is a distinct verification defect and is treated as one here.**

---

## 2. Reproduction — executed at `6f86829`

### 2a. Production build — **FAILS**

```
$ npx next build
   ▲ Next.js 15.5.20
   - Environments: .env.local
   Creating an optimized production build ...
uncaughtException [TypeError: Cannot read properties of undefined (reading 'length')]
EXIT=1
```

Reproduced **twice**, deterministically. Post-conditions:

| Artifact | State |
|---|---|
| `.next/BUILD_ID` | **absent** |
| `.next/static/` | **absent** |
| `.next/routes-manifest.json` | **absent** |
| `.next/server/`, `.next/types/`, `.next/trace` | present (partial) |
| `.next/diagnostics/build-diagnostics.json` | `{"buildStage":"compile","buildOptions":{"useBuildWorker":"false"}}` |

**The build dies during `compile`, before any manifest is emitted.**

**Correction to my own first reading, recorded because it would have become a false
finding.** My first run was `npm run build 2>&1 | tail -60`, and the task reported exit
code **0**. That was `tail`'s exit code — the pipe masked it. Run directly, `npx next
build` exits **1**. **There is no "silent exit 0" defect; the build reports failure
correctly.** Had this gone unchecked, PATCH-136 would have opened with a fabricated
root cause.

### 2b. What this means for the four representative tests

`playwright.config.ts:47-55` starts `npm run start -- --port 3100` unless `PW_BASE_URL`
is set. **`next start` cannot serve without a `BUILD_ID`.** Therefore every
characterization spec fails before its assertions — **not because of anything in the
specs**, and not at a boundary any of them own.

**Per-test reproduction against the production path was not run**, because the shared
precondition (a servable build) is absent — running four specs to observe four identical
"server never came up" failures would produce no additional information. **This is a
recorded gap against the task's first requirement, not a claim of completeness.** §7's
next action supplies the missing per-test evidence once a build exists.

---

## 3. ⚠ The four tests do NOT share a boundary — HARD STOP TRIGGERED

The brief states that all four fail at "shared `waitForHarness` waits for `window.h.app`".
**Source contradicts this for half of them.**

A repository-wide search for `window.h`, `waitForHarness` and `window.h.app` (excluding the
vendored fork) returns **six** files:

| File | Uses `waitForHarness` / `window.h`? |
|---|---|
| `e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts` | **Yes** |
| `e2e/characterization/patch-128-slide-sync.spec.ts` | **Yes** |
| `e2e/characterization/patch-129-preview-fit.spec.ts` | **Yes** |
| `e2e/characterization/patch-130-slide-navigation.spec.ts` | **Yes** |
| `e2e/characterization/patch-132-thumbnail-visibility.spec.ts` | **Yes** |
| `.fable5/patches/PATCH-132.md` | documentation only |
| **`patch-134-document-toolbar.spec.ts`** | **NO** |
| **`patch-135-toolbar-overflow.spec.ts`** | **NO** |

PATCH-134 and PATCH-135 navigate with `page.goto('/dashboard/canvas/…', { waitUntil:
'domcontentloaded' })` and then wait on **DOM**. Neither references `window.h`, and neither
defines or imports `waitForHarness`.

**Also note: `waitForHarness` is not shared infrastructure.** It is **copy-pasted per spec**
— `patch-130-slide-navigation.spec.ts:43-48` declares its own local copy, as does each of
the other four. There is no common helper module to repair. The brief's "shared
`waitForHarness`" does not exist as a single artifact.

**Hard stop *"the failure differs materially across the four representative tests"* —
TRIGGERED.** PATCH-130 and PATCH-132 would fail at a harness wait; PATCH-134 and PATCH-135
would fail at navigation. **They share a *cause* (no servable build), not a *boundary*.**
Any repair scoped to `waitForHarness` would fix neither.

---

## 4. ⚠ `window.h` cannot exist in a production build — HARD STOP TRIGGERED

`components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx:12420-12423`:

```ts
export const createTestHook = () => {
  if (isTestEnv() || isDevEnv()) {
    window.h = window.h || ({} as Window["h"]);
    …
```

`packages/common/src/utils.ts:769-773`: `isTestEnv() === (getEnvMode() === ENV.TEST)`,
`isDevEnv() === (getEnvMode() === ENV.DEVELOPMENT)`.

**In a production build `NODE_ENV=production`, so neither predicate holds and `window.h` is
never created.** The five harness-dependent specs wait for `window.h?.app` with a 90 s
timeout; against a production server **that wait can never resolve, even with a perfect
build.**

Three consequences:

1. **The objective "restore review-time execution against the production-style test server"
   is unachievable for those five specs as written.** It is not a regression to repair; it
   is a configuration that has never worked.
2. **Those specs have therefore always run in dev mode**, via `PW_BASE_URL=http://localhost:3000`
   against `npm run dev` — which is exactly how PATCH-132's implementation-time green run was
   obtained (PATCH-132 §20f evidence). The green runs are real; **they were produced under a
   different server mode than the one review attempted.**
3. **`window.h` is vendored-Excalidraw dev-only debug scaffolding, not a Fable 5 test
   contract.** It is Excalidraw's own internal hook, exposed by the fork for its own dev
   tooling. The specs adopted it opportunistically.

**Answer to the readiness-contract question (§ brief "READINESS CONTRACT"): `window.h` is
option 3 on the brief's own list — an accidental development-only side effect — and must
not remain the shared readiness contract.**

**Hard stop *"the shared harness is not an intentional supported contract"* — TRIGGERED.**

**Hard stop *"the error originates in a broad vendored Excalidraw fork requiring unrelated
changes"* — NOT triggered, but adjacent:** the correct repair is almost certainly to stop
depending on the fork's debug global (brief options 2/3/4), **not** to modify the fork to
expose it in production — which would also be the "test-only backdoor" the brief forbids.

---

## 5. Failure-layer classification

| Layer | Verdict |
|---|---|
| **A — production build fails before server startup** | **CONFIRMED · PRIMARY** (§2a) |
| **B — server starts with an invalid or stale build** | **CONFIRMED as a consequence** — no `BUILD_ID`, so `next start` cannot serve. **A stale complete `.next` from an earlier build could produce a false green; none is present now** (acceptance item 17) |
| **F — harness exposure differs between dev and production** | **CONFIRMED · INDEPENDENT SECOND DEFECT** (§4) |
| **G — test waits for an obsolete global shape** | **CONFIRMED in substance** — the global is not obsolete, it is environment-gated and was never a supported contract |
| C, D, E, H, I, J, K | **NOT REACHED** — cannot be evaluated until a servable build exists |
| **L — server lifecycle / orphan interference** | **SEPARATE, and separately owned** (§6) |
| **N — insufficient evidence** | **APPLIES to the exact failing expression** (§8) |

**A and F are independent.** Fixing the build does not make `window.h` appear in
production; fixing readiness does not make the build compile. **Two defects, one symptom.**

---

## 6. Orphan listeners — separate, with a correct owner that was not used

Censused separately, as the brief required.

`scripts/harness/serverLifecycle.ts` already implements correct ownership: `spawn(…,
{ detached: false })` (`:81-84`), tracked PIDs in `ownedProcesses` (`:92`), and termination
via `child.kill('SIGTERM')` **followed by `taskkill /PID <pid> /T /F`** (`:102-108`) — the
`/T` tree kill is precisely what reaps the `next-server` grandchild. It is exposed as
`npm run harness:server:start` / `harness:server:stop` (`package.json:19-20`).

**The orphans recorded across PATCH-130 §13/§16h/§17e/§18b and PATCH-132 did not come from
this path.** They came from starting `npm run dev` as a raw background Bash task and calling
`TaskStop`, which kills the `npm`/shell wrapper and leaves the `next-server` Node child
holding the port. **A correct, tested lifecycle owner exists and was bypassed.**

**Conclusion: orphan behavior and harness readiness do NOT share one bounded infrastructure
owner** — the first is owned by `scripts/harness/serverLifecycle.ts` and by operator
procedure; the second by the specs and the fork's env gate. **Per the brief's own hard stop,
they must not be combined into one patch.** The orphan issue needs no code change at all:
it needs the existing harness commands to be used. Recorded as a **procedural finding**, not
a PATCH-136 work item.

**No evidence was found that stale servers or stale builds *caused* the harness failure**
— §2a reproduces from a clean invocation with no listener on 3000–3003 (verified before
building).

---

## 7. Dev versus production comparison — NOT RUN

The brief requires the same flow against dev, production, and the Playwright `webServer`
config. **Only the production build path was exercised**, because it fails before a server
can exist. A dev-mode run was **not** performed in this turn.

**Recorded as an evidence gap, not as a finding.** What §4 establishes by source — that
`window.h` exists in dev and cannot exist in production — is the single most important
dev/prod difference and does not require a run to establish. The remaining comparisons
(env vars, chunk loading, auth, timing, hydration) are deferred to the §9 next action.

---

## 8. Root cause — the exact expression is NOT identified

**The brief explicitly forbids leaving this as "Cannot read properties of undefined (reading
'length')". I have not been able to do better, and I am not going to dress up a guess as a
finding.**

Attempted: `NODE_OPTIONS="--trace-uncaught --stack-trace-limit=60" npx next build`. **No
stack was emitted** — Next's own `uncaughtException` handler formats and re-logs the error,
discarding the trace before Node's tracer sees it. The message is all that survives.

**Established:** the throw occurs at `buildStage: "compile"`, with
`useBuildWorker: "false"`, before any manifest is written, deterministically, on a clean
tree at `6f86829`.

**Leading candidate — hypothesis, explicitly NOT a conclusion.** `next.config.ts:19-47`
installs a client-only webpack customization: a
`NormalModuleReplacementPlugin(/^node:/, …)` whose callback mutates `resource.request`
(`:23-27`), plus a large `config.resolve.fallback` block. A resolver plugin that rewrites
requests is a plausible source of an `undefined.length` during compile, and it is the only
compile-stage customization in the repository. **It is equally possible the fault lies in a
dependency, in the vendored fork's build surface, or in Next 15.5.20 itself.** Naming a
candidate is not diagnosing a cause; §9 says how to decide.

---

## 9. Next authorized action — one bounded diagnostic, then re-author

**No implementation is authorized. No allowlist is granted** — per the brief, source
ownership must be established before an allowlist, and §8 means it is not.

Authorized diagnostic steps, in order:

1. **Obtain the stack.** Run the build with Next's error formatter bypassed — e.g. an
   `--inspect-brk` session breaking on the throw, or a temporary `process.on('uncaughtException')`
   registered ahead of Next's via `NODE_OPTIONS="--require ./scratch/trace.cjs"` **written
   outside the repository**. This yields the exact file, expression and undefined value the
   brief requires.
2. **Falsify or confirm the §8 candidate** by A/B: build once with the `next.config.ts`
   webpack hook temporarily neutralized in a **scratch copy of the repo or a git worktree** —
   never in the working tree, never committed. A clean build with the hook removed converts
   the hypothesis into a finding; an identical failure eliminates it.
3. **Establish the true baseline.** Determine whether this build ever succeeded — PATCH-128
   §34m recorded it as pre-existing and reproduced on that patch's baseline, so
   `git bisect` over `npm run build` against a known-good commit is bounded and cheap.
4. **Then, and only then**, re-author PATCH-136 with a root cause, a repair, a readiness
   contract decision (§4 recommends brief options 2/3/4 over 1), and an allowlist.

**Do not** raise timeouts, switch the suite to dev mode as a permanent answer, mock
`window.h`, skip `waitForHarness`, or weaken any closed assertion. All are named in the
brief's false-green list, and §4 shows the dev-mode switch in particular would be
**codifying an accident rather than fixing a defect**.

---

## 10. Test plan — reserved, not authorized

`e2e/characterization/patch-136-harness-readiness.spec.ts` is **reserved** for the
eventual repair, to prove: readiness appears in the governed server mode; readiness is
absent before real app initialization; the bridge references the currently mounted
application; reload restores readiness; navigation between disposable boards retains no
stale instance; cleanup removes the fixture; server restarts reuse no stale readiness; no
polling loop remains.

**The decisive acceptance suite remains the existing closed specs, run unchanged** —
PATCH-130, PATCH-132, PATCH-134, PATCH-135 must reach and pass their real assertions
(acceptance items 7–10). **One passing while the others still fail at a shared boundary is
an explicit rejection.**

---

## 11. Hard stops — evaluated

| Hard stop | Verdict |
|---|---|
| Failure differs materially across the four representative tests | **TRIGGERED** (§3) |
| The shared harness is not an intentional supported contract | **TRIGGERED** (§4) |
| Fixing it requires changing closed feature behavior | **Not established** — cannot be, without §8 |
| Error originates in a broad vendored fork requiring unrelated changes | **Not established** (§8) |
| Test-only exposure would create a production security risk | **Live risk to design against** — §4's repair must not become an unrestricted internal-command API |
| Production and development paths cannot be aligned within a narrow allowlist | **Not established** |
| Orphan behavior and harness readiness require separate patches | **TRIGGERED** — separate owners (§6) |

**Three of seven triggered, and the exact root cause is unidentified. Implementation
remains blocked.**

---

## 12. Sequence

| Number | Subject |
|---|---|
| **PATCH-136** | Shared characterization harness / build repair — **this patch, prerequisite** |
| PATCH-137 | Document canvas card + free-standing open affordance (**inherits PATCH-134 Scope C**, and the `GROUP_H`/`OVERHEAD_H` cleanup) |
| PATCH-138 | Editor / read-only modal split |
| PATCH-139 | Document persistence, lifecycle, reconciliation |
| PATCH-140 | Links, backlinks, archive, reusable appearances |

PATCH-136 is a **prerequisite for further document-feature implementation**, so the next
feature patches regain independent review-time verification.

`GROUP_H` / `OVERHEAD_H` in `CanvasSidebar.tsx` remain a non-blocking cleanup and are
**excluded** from PATCH-136 — they do not affect the harness failure.

---

## 13. Commit contract

Governance only: `docs(patch-136): diagnose characterization harness failure`.
**Do not implement. Do not push. Do not close.**

---

## 14. Status

**PATCH-136: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED · PRODUCTION BUILD FAILURE
REPRODUCED DETERMINISTICALLY (EXIT 1, NO `BUILD_ID`) · FOUR REPRESENTATIVE TESTS PROVEN NOT
TO SHARE A BOUNDARY · `window.h` PROVEN UNAVAILABLE IN PRODUCTION BUILDS AND NOT A SUPPORTED
CONTRACT · ORPHAN LISTENERS SEPARATELY OWNED AND ALREADY SOLVED BY EXISTING HARNESS TOOLING ·
EXACT FAILING EXPRESSION NOT YET IDENTIFIED · NO ALLOWLIST GRANTED · NOT PUSHED.**

**PATCH-135 / 134 / 132 / 130 / 129 / 128: CLOSED — not modified or reopened. PATCH-133:
OPEN. PATCH-131: OPEN · BLOCKED — not modified.**

---

## 15. Recorded diagnostic notes

- **The brief's premise was half wrong, and checking it was the cheapest work in the
  patch.** "All four fail at the shared `waitForHarness`" — two of the four never call it,
  and `waitForHarness` is not shared code but five copy-pasted local functions. **A repair
  scoped to the stated boundary would have fixed nothing and passed review.**
- **The green runs and the failing runs used different server modes, and nobody noticed for
  three patches.** `window.h` exists only under `isTestEnv() || isDevEnv()`. Implementation
  runs used `PW_BASE_URL` against `npm run dev`; review attempted the production `webServer`.
  **The same suite, the same commit, two server modes, opposite results — and the caveat text
  in three closures described it as one environment failure.** Repeating a caveat verbatim is
  how a compound problem stays singular in the record.
- **A pipe ate an exit code and nearly produced a fabricated root cause** (§2a). `npm run
  build | tail` reported success because `tail` succeeded. One direct re-run turned "the
  build silently exits 0" into "the build correctly exits 1". **Never read an exit code
  through a pipe, and never build a diagnosis on the first observation of a failure you
  expected to find.**
- **The infrastructure to solve the orphan problem was already written, tested and
  npm-scripted** (§6). Four patches worked around it manually with `Get-NetTCPConnection` and
  `Stop-Process`. **Before governing a recurring operational failure, check whether the repo
  already owns the fix** — the census cost minutes and removed a work item.
- **I could not identify the failing expression, and the patch says so in its status.** The
  brief forbade restating the bare message; the honest alternative to a fabricated cause is a
  named gap with a specific technique to close it (§9). **A diagnosis patch that reports
  DIAGNOSIS INCOMPLETE is doing its job; one that reports a plausible cause it cannot
  demonstrate is not.**

---

## 16. Amendment — BUILD ROOT CAUSE FOUND; TWO TRACKS SEPARATED (2026-08-02, CTO)

The build-root-cause diagnostic completed. **The build succeeds. The prior failure was
environmental, not a source regression.** The readiness defect is unaffected and remains
open. §§2–15 stand except where corrected below.

### 16a. Root cause — stale webpack filesystem cache

**Classification: BUILD SUCCEEDS · PRIOR FAILURE ENVIRONMENTAL.** Stale Next/webpack
filesystem-cache state inside the active `.next` directory.

| Field | Value |
|---|---|
| Package | `node_modules/next/dist/compiled/webpack/bundle5.js` |
| Component | compiled webpack `WasmHash` implementation |
| Function | `WasmHash._updateWithBuffer` |
| Expression | `const $ = v.length` |
| Undefined value | **`v`** |
| Upstream path | `FileSystemInfo` cache hashing → `q.update(v.hash)` → `BatchedHash.update` → `WasmHash.update` → `WasmHash._updateWithBuffer` |
| Failing condition | a stale filesystem-cache entry supplied an **undefined hash value** |

**§8's demand is now satisfied.** The exact file, expression and undefined value are named;
the fault is in compiled webpack inside Next, reached through cache-entry hashing — **not
application code, not fixture code, not the vendored fork, not the test harness.**

**§8's leading candidate was wrong, and the A/B eliminated it** — see §16c. Recorded plainly:
the `next.config.ts` webpack hook was the only compile-stage customization in the repository
and therefore the obvious suspect. **It was the obvious suspect and it was not the cause.**
§8 labelled it a hypothesis rather than a finding, which is the only reason this amendment
corrects a candidate instead of retracting a root cause.

**Stack capture.** `NODE_OPTIONS="--trace-uncaught"` failed (§8) because Next intercepts and
reformats the exception before Node's tracer runs. The stack was obtained with an **external
preloaded handler**: `NODE_OPTIONS="--require <temp>\trace-preload.cjs --stack-trace-limit=100"`,
registering `process.on('uncaughtException')` **ahead of** Next's. **Recorded as the reusable
technique**: when a framework swallows a stack, preload your handler before the framework
installs its own — from outside the repository.

### 16b. Reproduction and recovery

| Phase | Result |
|---|---|
| **Before cache reset** | deterministic `TypeError`; exit **1**; failure during `compile`; no `BUILD_ID`; no `.next/static`; no `routes-manifest.json` |
| **After renaming/removing stale `.next`** | HEAD reached typecheck; a second direct `npx next build` **completed successfully**; exit **0**; `BUILD_ID`, `static/` and `routes-manifest.json` all present |

**Independently verified at `83cd596` while authoring this amendment:**
`.next/BUILD_ID` = `wUDmt3FIDYeQbwujeSmXb`, `.next/routes-manifest.json` present,
`.next/static` present. **The working tree currently holds a valid production build.**

Environment: Windows 11 Pro 10.0.22631 · Node v24.11.1 · npm 11.4.2 · Next 15.5.20 ·
React / React DOM 19.2.7.

**This retroactively explains PATCH-128 §34m.** The error was recorded there as
"pre-existing and unrelated", reproduced on that patch's baseline. It was pre-existing and
unrelated — **and it was also not a defect at all**, merely a poisoned cache that survived
every subsequent patch because nothing cleared `.next`. **A defect classified as
"pre-existing" stops being investigated; this one rode along for eight patches.**

### 16c. `next.config.ts` — NO CHANGE AUTHORIZED

A/B results:

| | Configuration | Result |
|---|---|---|
| A | current | **build passes** from a clean cache |
| B | plugin removed | **fails** — webpack `UnhandledSchemeError` for `node:fs`, `node:https` via `pptxgenjs` |
| C | callback guarded | build passes |
| D | callback logging | **two invocations** — `node:fs`, `node:https`; **no undefined resource; no undefined `resource.request`** |
| E | no-op plugin | same `UnhandledSchemeError` |

**The plugin callback is not the TypeError source** (D), and the plugin **performs required
module handling** (B, E). **Removal of the `NormalModuleReplacementPlugin` is NOT
authorized**, and no `next.config.ts` correction is authorized.

### 16d. Dependencies — no change authorized

A clean scratch `npm ci` does not reproduce the active workspace directly, because the
file-based vendored Excalidraw package lacks generated `dist` outputs; copying the active
generated vendored dist into the scratch environment lets the **same HEAD build pass**. **No
dependency change was made. No Next downgrade or upgrade is authorized.**

**`git bisect` was unnecessary** — §9.3 proposed it to find a regression range, and there is
no regression: current HEAD builds successfully after a cache reset. **The bisect would have
searched for a commit that does not exist.**

### 16e. Required clean production-build procedure

1. Stop all development and Next server processes.
2. Confirm no listener remains on the intended ports.
3. Remove or rename `.next`.
4. Run `npx next build` **directly**.
5. **Do not pipe the command when determining exit status** (§2a — a pipe reports the last
   stage's code).
6. Verify the actual command exit code.
7. Verify `.next/BUILD_ID`, `.next/static`, `.next/routes-manifest.json`.
8. Start the production server only after that verification.
9. Use the governed lifecycle scripts for startup and shutdown (§6, §16h).

**No application code may be introduced to handle stale `.next` cache entries.**

**Placement decision:** this belongs in an **existing contributor/test document** —
`.fable5/docs/TESTING.md` is the owning doc under P6 — **plus** this patch's record.
**No script is authorized**: the census shows the procedure is nine steps of operator
discipline over commands that already exist (`npx next build`,
`npm run harness:server:start`), and the brief forbids authorizing a script until a census
proves one necessary. It does not. **Adding a wrapper script would create a third
build-invocation path beside `npm run build` and `npm run verify`, which is a P6 problem, not
a solution.** The doc update is a PATCH-137-or-maintenance item, not PATCH-136 work.

### 16f. Corrected framing of the `window.h` scope

**§4 and §5 stand; their attribution is sharpened.** Recorded corrections, without rewriting
any closed patch:

- `window.h` is created only under `isTestEnv() || isDevEnv()`; under `NODE_ENV=production`,
  ordinary `next build` + `next start` **does not create it**;
- therefore any spec waiting on `window.h?.app` **can never succeed against a normal
  production server**;
- **this was not caused by PATCH-128 and not caused by the stale cache** — it is independent
  of both, and the build recovery does **not** restore those five specs under production mode;
- previous green runs used **development mode** via `PW_BASE_URL` + `npm run dev`;
- **PATCH-134 and PATCH-135 must not be described as failing at the `window.h` boundary** —
  they never reference it (§3). Their review-time failures were caused solely by the absent
  build, and are fully explained by §16a.

**Net effect of this amendment on the earlier closures:** PATCH-134's and PATCH-135's
review-time E2E blocks are now **fully explained and procedurally resolved** — a clean build
plus a dev-mode-independent spec is all they need. **PATCH-132's block is only half
explained**: it also depends on `window.h`, so it remains blocked under production mode by
Track B. **No closed patch is reopened**; their acceptance rested on other evidence and is
unchanged.

### 16g. `waitForHarness` census — confirmed, and the dependency is lighter than feared

`waitForHarness` is **not one shared helper**. It is **five copy-pasted local functions** in
the specs for PATCH-124, PATCH-128, PATCH-129, PATCH-130 and PATCH-132. **They share a
development-only dependency, not a shared implementation.**

**Performed in this turn — the per-spec usage census, which bounds Track B sharply:**

| Spec | `window.h` surface used | Classification |
|---|---|---|
| PATCH-124 | `h.elements` | readiness + **scene observation** |
| PATCH-129 | `h.elements` | readiness + **scene observation** |
| PATCH-130 | `h.elements` | readiness + **scene observation** |
| PATCH-132 | `h.elements` | readiness + **scene observation** |
| **PATCH-128** | `h.elements` ×4, `h.state` ×2, **`h.app.onChangeEmitter` ×2**, `h.app.getSceneElements`, `h.app.getAppState` | readiness + scene + **app-state observation** + **imperative event subscription** |

**Four of the five need only two things: a readiness signal and read-only scene elements.**
**None of the five mutates internal state.** The entire imperative surface in the suite is
PATCH-128's `onChangeEmitter` subscription — already recorded in PATCH-128 §34m as debt
dependent on the current vendored fork API.

**This is the most useful result in the amendment.** A bridge serving 4 of 5 specs needs
`ready` + `getSceneElements()`. Only PATCH-128 needs more, and its need is a change-event
subscription that may be replaceable with DOM evidence. **Do not authorize editing all five
specs until the replacement contract is designed** — but the contract is now visibly small.

### 16h. Readiness contract decision

**The current `window.h` dependency is: ACCIDENTAL DEVELOPMENT-ONLY DEBUG SCAFFOLDING · NOT
A SUPPORTED PRODUCTION CHARACTERIZATION CONTRACT.**

**Rejected:** mocking `window.h`; enabling the debug hook in every production build;
increasing `waitForHarness` timeouts; permanently switching the suite to dev mode; changing
closed tests merely to skip readiness; exposing unrestricted Excalidraw mutation internals.

**Preferred direction — a narrow explicit production-test bridge** that: is available only in
an explicitly authorized E2E build/runtime; is **absent from ordinary production
deployments**; exposes a minimal **read-mostly** readiness and observation API; refers to the
**currently mounted** application instance; **clears on unmount/navigation**; does **not**
expose arbitrary command execution; **cannot mutate persistence**; and supports exactly the
observations §16g enumerates — no more.

**Security note, load-bearing:** the difference between this bridge and the rejected
"enable the debug hook in production" is that `window.h` exposes **setters** —
`window.h.elements = […]` calls `scene.replaceAllElements(…)` (`App.tsx:12428-12433`).
**Any bridge must be observation-only by construction, not by convention.**

### 16i. Process lifecycle — separate procedural finding, unchanged

`scripts/harness/serverLifecycle.ts` already tracks processes and terminates on Windows with
`taskkill /PID <pid> /T /F`, which correctly kills the tree. Prior orphan listeners came from
raw background `npm run dev` plus wrapper-only `TaskStop`. **No `serverLifecycle.ts` repair
is justified.**

**Mandated for future implementation and review prompts:** use
`npm run harness:server:start` / `harness:server:stop`. **Do not combine process lifecycle
and readiness-bridge code without evidence of a shared owner** — §6 established there is none.

### 16j. Temporary diagnostic directories

Diagnostic evidence is stored **outside the repository** at
`C:\Users\rmeic\AppData\Local\Temp\patch-136-diagnostic-20260802-232207`.

Two additional temporary worktree directories **could not be recursively deleted** because
local command policy blocked recursive deletion. They are **outside the repository**, are
**not registered Git worktrees**, and **no repository state depends on them**. **Manual
deletion is required later**, after confirming they hold no needed evidence or credentials —
they may contain fixture data or environment values, so they should be reviewed, not deleted
blind. **No repository failure classification is warranted.**

### 16k. Status — two tracks

**TRACK A — BUILD FAILURE: RESOLVED PROCEDURALLY · STALE `.next` WEBPACK CACHE IDENTIFIED ·
NO SOURCE REPAIR AUTHORIZED.**

**TRACK B — PRODUCTION CHARACTERIZATION READINESS: OPEN · DEVELOPMENT-ONLY `window.h`
DEPENDENCY CONFIRMED · REPLACEMENT CONTRACT NOT YET BOUNDED · IMPLEMENTATION BLOCKED.**

**PATCH-136 overall: OPEN · BUILD FAILURE ROOT CAUSE IDENTIFIED AND PROCEDURALLY RESOLVED ·
PRODUCTION TEST READINESS DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED · NO PRODUCTION OR
TEST FILE CHANGED · NOT PUSHED.**

**PATCH-135 / 134 / 132 / 130 / 129 / 128: CLOSED — not modified or reopened. PATCH-133:
OPEN. PATCH-131: OPEN · BLOCKED — not modified.** Snapshot and tag remain at `c0fa799`.

**Hard stops re-evaluated:** §11's *"failure differs materially across the four"* and *"the
shared harness is not an intentional supported contract"* both **still stand** — the first is
now explained (two causes, one of which is resolved), the second is Track B itself. *"Orphan
behavior requires a separate patch"* stands. The vendored-fork and source-ownership stops are
**cleared for Track A** and **not yet evaluable for Track B**.

### 16l. Next governance work — diagnosis only

Authorized for the five `window.h`-dependent specs, **diagnosis only, no implementation**:
(1) exact use of `window.h.app` per spec — **partially delivered in §16g and to be completed
line-by-line**; (2) observations replaceable with DOM/UI assertions; (3) irreducible internal
observations; (4) minimal bridge API proposal; (5) build/runtime gate excluding the bridge
from normal production; (6) security assessment (§16h); (7) lifecycle and stale-instance
handling; (8) exact source ownership; (9) narrow production allowlist; (10) narrow test
allowlist; (11) migration preserving closed feature assertions; (12) validation against
production build + `next start`.

**No implementation until that census is complete.**

### 16m. Sequence — unchanged

**136** production characterization readiness (prerequisite) → **137** document card,
free-standing open affordance, deferred Card view removal, bounded dead-constant cleanup →
**138** editor/read-only modal split → **139** persistence/lifecycle → **140**
links/backlinks/archive.

### 16n. Recorded diagnostic notes

- **"Pre-existing and unrelated" is a classification that stops investigation.** PATCH-128
  §34m correctly proved the build error was not that patch's fault and correctly parked it.
  It then survived eight patches and cost three closures their review-time verification —
  because *nobody's* patch owned it. **Debt that is correctly attributed to no one still needs
  an owner; "unrelated to this patch" should route it somewhere, not just clear it.**
- **The obvious suspect was innocent, and labelling it a hypothesis is what made that
  cheap.** §8 named the `next.config.ts` webpack hook as the only compile-stage customization
  and explicitly refused to call it the cause. The A/B killed it in five configurations. **Had
  §8 asserted it, this amendment would be a retraction and the plugin might have been removed
  — which B and E prove would have broken the build outright.**
- **A framework that formats exceptions destroys the evidence you need to diagnose it.**
  `--trace-uncaught` produced nothing; a `--require` preload registering a handler *before*
  Next installed its own produced the full stack immediately. **Preload ahead of the
  framework, from outside the repo.**
- **The feared dependency was four calls to one read-only getter.** Track B looked like
  "rewrite five characterization specs against a new test bridge"; the census shows four of
  them use only `h.elements`, and the entire imperative surface is one `onChangeEmitter`
  subscription in PATCH-128. **Census before designing the replacement — the contract you must
  support is usually smaller than the API you are replacing.**

---

## 17. Amendment — TRACK B BOUNDED; PRODUCTION E2E BRIDGE AUTHORIZED (2026-08-02, CTO)

Track A is settled (§16) and is not revisited. Track B is now bounded.

**The decisive finding: no vendored modification is required.** The application-owned
Drawing host already holds Excalidraw's **public** `ExcalidrawImperativeAPI`, and that API
supplies every observation the five specs need — including the change subscription PATCH-128
currently takes from the internal emitter.

### 17a. Exact five-spec census — corrected and completed

§16g under-counted: it matched `h.app.X` forms only, and missed `getAppState` in PATCH-130
and PATCH-132. Corrected:

| Spec | Readiness | Scene elements | App state | Subscription |
|---|---|---|---|---|
| PATCH-124 | `h?.app && Array.isArray(h.elements)` (`:165-166`) | `h.elements` | — | — |
| PATCH-129 | `:54-55` | `h.elements` (`:61`) | — | — |
| PATCH-130 | `:45-46` | `getSceneElements() ?? h.elements` (`:52-53, :87-88, :102`) | `getAppState() ?? h.state` (`:103, :231-232`) | — |
| PATCH-132 | `:153-154` | `getSceneElements() ?? h.elements` (`:160-161`) | `getAppState() ?? h.state` (`:243-244, :255-256`) | — |
| **PATCH-128** | `:148` | `h.elements` ×3, `getSceneElements()` (`:161, :167-168, :992`) | `getAppState()` via local helper (`:152-155`), `h.state` (`:1116`) | **`h.app.onChangeEmitter.on(...)`** (`:447-448`) |

**Classification:** readiness ×5 · scene observation ×5 · app-state observation ×3 ·
**imperative event subscription ×1 (PATCH-128 only)** · **direct internal mutation ×0**.

**No spec mutates through the harness.** The entire imperative surface in the suite is one
subscription.

### 17b. App-state projection — six fields, all geometry

Every `getAppState()` consumer across all three specs reads only:

| Field | Used by | Assertion enabled |
|---|---|---|
| `scrollX` | 128, 130, 132 | canvas pan position |
| `scrollY` | 128, 130, 132 | canvas pan position |
| `zoom.value` | 128, 130, 132 | zoom level |
| `offsetLeft` | 128 (`:175`) | viewport→scene coordinate mapping |
| `offsetTop` | 128 (`:176`) | viewport→scene coordinate mapping |
| `selectedElementIds` | 132 (`:257`) | which frame is active |

**`getAppState()` must NOT be exposed.** Excalidraw's `AppState` carries dozens of fields
including collaborator identities, clipboard-adjacent state and UI internals. **The bridge
exposes exactly these six, as a flat frozen projection.** This directly answers the brief's
question — PATCH-128 does not need full app state; it needs five numbers, and PATCH-132
needs one id map.

### 17c. API minimization — property by property

| Property | Needed by | Enables | Replaceable by DOM/UI? | Irreducible because |
|---|---|---|---|---|
| `version: 1` | all | fail fast on contract drift | no | migration safety |
| `ready` (implicit: bridge presence) | all 5 | replaces `waitForHarness` | **no** — canvas mount is a `<canvas>`; nothing in DOM states the scene is loaded | Excalidraw renders to canvas; there is no stable DOM readiness signal |
| `getSceneElements()` | all 5 | frame identity/order/geometry | **no** | frames are canvas pixels; ids and fractional indices exist nowhere in the DOM |
| `getViewport()` — the §17b six fields | 128, 130, 132 | pan/zoom/selection assertions | **partially** — PATCH-132's `selectedElementIds` is *mirrored* by the sidebar's `border-violet-400` class, already asserted there | pan/zoom are canvas-internal with no DOM equivalent; selection is kept because 132 asserts the **scene-level** selection, not the sidebar's rendering of it |
| `subscribeToSceneChange(cb)` | **128 only** | proves change events arrive | **no** — the assertion is that a change *fired*, which is invisible in the DOM | see §17d |

**Rejected from the contract:** `getAppState()` (too broad, §17b) · any `app` reference ·
any emitter object · any setter · anything not in the table above.

**Renamed deliberately:** `getViewport()` rather than `getAppState()`, so the name cannot
invite future field creep. **If a future spec needs a seventh field, that is an amendment,
not an implementation detail.**

### 17d. Change subscription — narrow wrapper over the PUBLIC API

PATCH-128 uses `h.app.onChangeEmitter.on(...)` — an **internal** emitter. **The bridge must
not expose it.** Excalidraw's public `ExcalidrawImperativeAPI.onChange(callback)`
(`excalidraw_fork/packages/excalidraw/types.ts:870`) provides the same signal and is already
part of the supported surface the host consumes.

Contract:

```
subscribeToSceneChange(listener: (revision: number) => void): () => void
```

| Aspect | Decision |
|---|---|
| Payload | **A monotonically increasing revision number only.** Not elements, not state |
| Why | PATCH-128's assertion is that changes *arrived* and how many; it re-reads elements via `getSceneElements()` when it needs them. Passing elements would hand test code live references (§17f) |
| Initial emission | **None.** Subscription does not fire on subscribe; the revision at subscribe time is readable via `getSceneRevision()` if needed |
| Timing | Registered against the currently mounted instance; fires only for that instance |
| Cleanup | Returns an unsubscribe function; **all listeners are dropped on unmount/navigation** |
| Duplicate listeners | Same function reference registered twice registers twice and requires two unsubscribes — **no silent dedupe**; documented, and asserted |
| Remount | Listeners are **not** carried across; a stale unsubscribe is a no-op |
| Stale listeners | **Must not fire for a new board** — test item 16 |

### 17e. Source ownership — **application-owned, no vendored change**

`components/collabboard/canvas/layouts/DrawingLayout.tsx` already holds the mounted API:
`excalidrawAPIRef` (`:236, :259, :390, :555, :791, :1065`), `excalidrawAPI` state (`:788`),
and already calls `excalidrawAPI.getSceneElements()` (`:1310`).

The public API type provides exactly what is needed:
`getSceneElements` (`types.ts:849`) · `getAppState` (`:850`) · `onChange` (`:870`).

**Hard stop *"no application-owned integration point can expose observations without
vendored modification"* — NOT TRIGGERED.** The vendored `App.tsx` is **not** on the
allowlist, and `window.h` is neither enabled nor extended.

`DrawingLayout.tsx` is **2,794 lines** — far over the 800-line ceiling and it must not grow.
**Registration logic therefore lives in a new dedicated module**, called from the host with
the API and lifecycle; the host's own change is a few lines.

### 17f. Type and snapshot contract

- `version: 1`, frozen.
- Global augmentation on an **application-owned** declaration file — never the fork's.
- `getSceneElements()` returns a **defensive snapshot**: a new array of **frozen shallow
  clones** of the plain element fields the specs read. **Not live references.**
- `getViewport()` returns a **new frozen flat object** of the six §17b fields.
- **`Object.freeze` at runtime, not `readonly` alone** — the brief is explicit, and TypeScript
  `readonly` is erased at runtime while Playwright's `page.evaluate` runs untyped JS.
- **No setters. No accessor properties. No function that accepts scene data.**

### 17g. Runtime gate — option B, build-time public flag

**Chosen: `NEXT_PUBLIC_E2E_BRIDGE=1` read at build time.**

Next inlines `NEXT_PUBLIC_*` at build time, so `if (process.env.NEXT_PUBLIC_E2E_BRIDGE !== '1') return;`
is **statically eliminated** from ordinary production bundles — the registration code is not
merely inert, it is **absent**.

| Requirement | How met |
|---|---|
| Ordinary production cannot expose it accidentally | The var is unset in normal builds → branch eliminated → **no bridge code in the bundle** |
| Enablement is explicit | A named env var must be set on the **build** command |
| Tests fail clearly if absent | The shared helper (§17i) fails with "E2E bridge absent — build with NEXT_PUBLIC_E2E_BRIDGE=1", not a bare timeout |
| No secret embedded | The value is the literal `1` — it is a switch, not a credential |
| Users cannot toggle at runtime | Build-time only. **A query parameter or runtime flag is explicitly rejected** (false-green list) |
| Stale enabled builds cannot be reused unknowingly | §17h |

Rejected: **A** (server-only var — cannot reach client code); **C** (test-only route/session —
introduces an authorization surface, the exact thing the bridge must not touch); **D**
(injected HTML marker — a runtime signal a proxy or user could forge).

**An E2E-enabled production build IS a separate artifact.** It must never be presented as
evidence for an ordinary production build.

### 17h. Governed production-build test flow

1. Stop prior servers via `npm run harness:server:stop`.
2. Verify no listener on 3000–3003 / 3100.
3. Remove or rename `.next` (§16e).
4. `NEXT_PUBLIC_E2E_BRIDGE=1 npx next build` — **run directly, never piped** (§16e.5).
5. Verify exit code, then `BUILD_ID`, `static/`, `routes-manifest.json`.
6. **Mark the artifact:** write `.next/E2E_BRIDGE_BUILD` as a marker file.
7. Start via `npm run harness:server:start`.
8. Create the disposable authenticated fixture.
9. Navigate to the board.
10. Await bridge presence **and** `version === 1`.
11. Execute the existing assertions.
12. Clean the fixture.
13. Stop the full process tree via the lifecycle script; verify ports free.
14. **Delete the E2E-enabled `.next` afterwards.** The marker in step 6 exists so a later
    ordinary-production verification cannot silently inherit it.

### 17i. Migration table and shared helper

| Spec | Old usage | Replacement | Delete local `waitForHarness`? |
|---|---|---|---|
| PATCH-124 | readiness, `h.elements` | `waitForE2EBridge`, `getSceneElements()` | **Yes** |
| PATCH-129 | readiness, `h.elements` | same | **Yes** |
| PATCH-130 | readiness, elements, `getAppState` | + `getViewport()` | **Yes** |
| PATCH-132 | readiness, elements, `getAppState` | + `getViewport()` | **Yes** |
| PATCH-128 | all of the above + `onChangeEmitter.on` | + `subscribeToSceneChange()` | **Yes** |

**Shared helper: AUTHORIZED** — `e2e/characterization/e2eBridge.ts`. The brief's concern is
exact: five copy-pasted waiters became five copy-pasted bridge waiters. It owns **only**
bridge presence/version wait, typed access, and timeout diagnostics. **It must contain no
feature assertion.**

**Closed-test integrity:** same UI actions, same scene assertions, same negative controls,
same fixture isolation, same viewports. **Only the readiness/observation transport changes.**
No skips, no timeout-only fixes, no database injection replacing UI, no assertion replaced by
source inspection. PATCH-132's `selectedElementIds` read is retained as-is — **simplifying it
to the sidebar class would be a semantic change and requires its own decision.**

### 17j. Lifecycle contract

Bridge absent before init · present after mount · bound to the current board instance ·
replaced on reload · replaced on board navigation · **deleted on unmount** · old subscribers
detached · stale callbacks never receive new-board events · **Strict Mode double-mount must
not leak** (register in an effect whose cleanup deletes; the second mount overwrites the same
global) · **multiple canvases: last mount wins, and the bridge records `instanceId` so a test
can detect replacement.** If two Drawing canvases ever mount simultaneously the bridge is
**ambiguous by design** — the spec must assert single-instance, and ambiguity is a failure,
not a silent overwrite.

### 17k. Security review

**Threat model:** a browser-side global in an E2E-only artifact.

- **Scene elements** expose board content the user is **already viewing in their own
  browser** — no new disclosure.
- **Viewport projection** is six geometry values — no user or account data.
- **No cross-board access:** the bridge reflects only the mounted instance; reading another
  board requires navigating to it, which RLS already governs.
- **Authorization unchanged:** the bridge performs no fetch, holds no Supabase client, and
  cannot write. **It cannot bypass RLS because it never talks to the network.**
- **Global naming is not a security control** — obscurity is explicitly rejected. Exclusion
  rests on build-time elimination (§17g).
- **CSP:** unaffected — no inline script, no external resource.
- **Ordinary-production exclusion proof:** the required test is a **bundle-content
  assertion** — grep the built client chunks of an ordinary build for the bridge global and
  assert **zero** occurrences (test item 1). Absence from `window` at runtime is necessary
  but not sufficient; absence from the bundle is the proof.

### 17l. Allowlists

**Production — exactly 3 files:**

| File | Change |
|---|---|
| `lib/e2e/productionBridge.ts` | **NEW** — bridge type, `Object.freeze` projections, register/unregister, revision counter, subscription wrapper, the `NEXT_PUBLIC_E2E_BRIDGE` gate. **Bounded at 150 lines.** No command ownership, no Supabase, no persistence |
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | **Registration call only** — one effect that registers on API availability and unregisters on cleanup. **Must not grow materially**; report before/after line count |
| `types/e2e-bridge.d.ts` | **NEW** — `Window` augmentation |

**Explicitly excluded:** vendored `App.tsx` and anything under `excalidraw_fork/` ·
`next.config.ts` · `serverLifecycle.ts` · `CanvasClient.tsx` · persistence and Supabase
modules · document-feature code · toolbar code · `canvasToolbarRegistry.tsx` ·
`CanvasSidebar.tsx` · shared UI.

**Test — exactly 7 files:**

```
e2e/characterization/patch-136-production-readiness.spec.ts   (new)
e2e/characterization/e2eBridge.ts                             (new shared helper)
e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts
e2e/characterization/patch-128-slide-sync.spec.ts
e2e/characterization/patch-129-preview-fit.spec.ts
e2e/characterization/patch-130-slide-navigation.spec.ts
e2e/characterization/patch-132-thumbnail-visibility.spec.ts
```

The five are authorized **only** for replacing local `window.h` access and deleting the local
`waitForHarness`. **No PATCH-134 or PATCH-135 test edit.**

**Docs:** a `.fable5/docs/TESTING.md` update (stale `.next` recovery, direct exit-code
verification, the E2E-enabled artifact distinction, lifecycle-script requirement, cleanup) is
**authorized as part of the implementation patch's commit** — not written in this governance
turn.

### 17m. Test plan

`e2e/characterization/patch-136-production-readiness.spec.ts` must prove all twenty brief
items, with these sharpenings: **item 1** by bundle-content grep (§17k); **items 6, 8, 9** by
attempting mutation and asserting no effect on the live scene; **item 10** by asserting no
property of the bridge exposes a function named `updateScene`/`replaceAllElements` or an
object with a `scene` property; **item 20** by running all five migrated specs unchanged in
behavior. Shared-helper tests: timeout diagnostics, version mismatch, absent gate, stale
instance, reload, cleanup. Carried standard **`--repeat-each=3`**.

**False-green rejection** as the brief lists it, in full.

### 17n. Hard stops — evaluated

| Hard stop | Verdict |
|---|---|
| No application-owned integration point without vendored modification | **NOT triggered** — `DrawingLayout` holds the public API (§17e) |
| Bridge cannot be excluded from ordinary production | **NOT triggered** — build-time elimination, proven by bundle grep (§17g, §17k) |
| Tests require mutation after all | **NOT triggered** — zero mutation across five specs (§17a) |
| Projected app state broad or unstable | **NOT triggered** — six geometry fields (§17b) |
| Scene snapshots expose live mutable references | **NOT triggered** — frozen defensive clones (§17f) |
| Subscription cleanup cannot be guaranteed | **NOT triggered** — unsubscribe + unmount teardown, asserted (§17d, §17j) |
| Multi-instance ownership ambiguous | **NOT triggered** — last-mount-wins with `instanceId`; ambiguity is asserted as failure (§17j) |
| Five migrations require semantic weakening | **NOT triggered** — transport-only (§17i) |
| E2E artifact indistinguishable from ordinary production | **NOT triggered** — marker file + mandatory deletion (§17h) |
| Allowlist cannot be bounded | **NOT triggered** — 3 production, 7 test (§17l) |

**Zero of ten triggered.**

### 17o. Status

**PATCH-136: OPEN · BUILD TRACK RESOLVED · PRODUCTION E2E BRIDGE ARCHITECTURE BOUNDED ·
NARROW IMPLEMENTATION AUTHORIZED · NO VENDORED FORK CHANGE · OBSERVATION-ONLY BY
CONSTRUCTION · BUILD-TIME GATE · NOT PUSHED.**

**Track A: RESOLVED PROCEDURALLY** — settled, not revisited.
**Track B: BOUNDED · IMPLEMENTATION AUTHORIZED.**

**PATCH-135 / 134 / 132 / 130 / 129 / 128 / 124: CLOSED — not modified or reopened; the five
specs are authorized for transport-only migration under this patch. PATCH-133: OPEN.
PATCH-131: OPEN · BLOCKED — not modified.** Snapshot and tag remain at `c0fa799`.

Commit contract — implementation, when run: `feat(e2e): add production observation bridge`,
then `test(e2e): migrate characterization specs to the bridge`, then
`docs(testing): record production e2e build procedure`. **Do not push.**

Sequence: **136** → **137** document card, free-standing open affordance, deferred Card view
removal, dead-constant cleanup → **138** modal split → **139** persistence → **140**
links/backlinks.

### 17p. Recorded diagnostic notes

- **The replacement API was already a supported public interface.** The suite reached for
  `window.h` — an internal debug global with setters — while the host component sitting one
  file away held `ExcalidrawImperativeAPI` with `getSceneElements`, `getAppState` and
  `onChange`. **When test code depends on a vendor's private surface, check whether the
  application already holds the public one; the integration point is usually the code that
  mounts the vendor, not the vendor.**
- **The scary number was six.** "Replace `getAppState()`" sounds like modelling Excalidraw's
  entire `AppState`; the census shows three specs read `scrollX`, `scrollY`, `zoom.value`,
  `offsetLeft`, `offsetTop` and `selectedElementIds`. **Naming the projection `getViewport()`
  rather than `getAppState()` is deliberate — an API named after what callers need resists
  field creep that an API named after its source invites.**
- **Runtime absence is not exclusion; bundle absence is.** A bridge that returns `undefined`
  in production still ships its code and can be re-enabled by anything that flips a runtime
  check. Build-time `NEXT_PUBLIC_*` elimination removes the code, and the test asserts it by
  grepping the built chunks. **Prove a security boundary at the layer that enforces it.**
- **Five copy-pasted waiters nearly became five copy-pasted bridge waiters.** The migration
  touches all five specs at once, which is exactly the moment to introduce the shared helper
  — and exactly the moment it could quietly grow feature assertions. **Its charter is written
  down as three responsibilities precisely because it will be tempting to add a fourth.**

---

## 18. Amendment — MUTATION CENSUS CORRECTED; PATCH-124 SPLIT OUT (2026-08-03, CTO)

Implementation stopped at the governed mutation hard stop **before touching anything** — no
files modified, no builds or tests run, no commits, nothing pushed. **That was the correct
call, and the stop caught a false statement in my own governance.**

### 18a. The contradiction — §17a was wrong

§17a stated: *"No spec mutates through the harness. The entire imperative surface in the
suite is one subscription."* **That is false.**

**PATCH-124 performs direct scene mutation through the private debug harness.**

`e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts`:

| Line | Evidence |
|---|---|
| `:170` | `addRectToFrame(page, frameId, id, color, x, y)` helper defined |
| `:174` | types `app` as `{ updateScene: (scene: { elements: unknown[]; appState?; commitToHistory? }) => void }` |
| `:180` | `if (!app?.updateScene) throw new Error('Excalidraw updateScene harness unavailable')` |
| `:181-207` | constructs a full `SceneElement` — `frameId: targetFrameId`, explicit `backgroundColor`, `fillStyle: 'solid'`, 120×80, fractional `index` |
| `:209-213` | **`app.updateScene({ elements: [...elements.filter(…), nextElement], appState: { selectedElementIds: {} }, commitToHistory: true })`** — whole-scene replacement |
| `:263, :268, :272, :284, :285` | five call sites driving the thumbnail-refresh assertions |

**How §17a got it wrong:** the census was built from `grep -o "h\.app\.[a-zA-Z]*"`, which
matches `h.app.getSceneElements` but **not** `const app = target.h?.app;` followed by
`app.updateScene(...)` two statements later. **A pattern that assumes a single-expression
call site cannot see a mutation performed through a local alias.** §17a even carried a
correction of §16g for the same class of error — and repeated it one indirection deeper.

### 18b. Corrected five-spec census — from full source

Re-audited by scanning each spec for `updateScene`, `replaceAllElements`, `setState`,
`.scene`, `.history`, `.store`, assignment to `h.elements`/`h.state`, and any `app.*(` call —
**not by pattern-guessing the shape of the access**.

| Spec | 1 readiness | 2 scene obs. | 3 viewport obs. | 4 subscription | 5 **imperative mutation** | 6 direct command | 7 other private API |
|---|---|---|---|---|---|---|---|
| **PATCH-124** | ✅ `:163-168` | ✅ `h.elements` | — | — | **✅ `app.updateScene` `:209`** | — | — |
| PATCH-128 | ✅ `:148` | ✅ `h.elements` ×3, `getSceneElements` | ✅ `getAppState`, `h.state` | ✅ `onChangeEmitter.on` `:447` | **none** | — | emitter (→ public `onChange`, §17d) |
| PATCH-129 | ✅ `:54-55` | ✅ `h.elements` `:61` | — | — | **none** | — | — |
| PATCH-130 | ✅ `:45-46` | ✅ `getSceneElements` | ✅ `getAppState` | — | **none** | — | — |
| PATCH-132 | ✅ `:153-154` | ✅ `getSceneElements` | ✅ `getAppState` | — | **none** | — | — |

Two clarifications from the scan:

- **PATCH-128's `:2046` `setState` match is an annotation string**, not code — it explicitly
  says internal React `setState` is *not* exposed. Not a mutation.
- **PATCH-132's `:204` `dispatchEvent(new MouseEvent('click'))` targets a production
  button** — that is the PATCH-132 §20d false-green correction, a real DOM event on real UI.
  **Not harness mutation.**

**Conclusion: exactly one spec mutates. The Group 1 / Group 2 split the brief predicted is
confirmed by source.**

### 18c. Governance consequence

**The single migration contract in §17i cannot stand.** PATCH-124 cannot reach an
observation-only bridge through a transport-only edit, and **§17i's row describing it as
transport-only is withdrawn.**

**The observation-only bridge is NOT weakened.** §17c–§17g stand unchanged: no setters, no
scene replacement, no raw app/API, no persistence mutation, no arbitrary commands.
**Mutation is not added to the bridge merely because PATCH-124 currently uses it.**

### 18d. PATCH-124 semantic contract — what the rectangles actually prove

| Question | Answer |
|---|---|
| Which frame? | `frame-landscape` (slide A) ×4, `frame-portrait` (slide B) ×1 — set by explicit `frameId`, **and** by x/y inside the frame |
| Exact geometry needed? | **No** — but the element must be **inside the target frame** and large enough to survive downscaling |
| Frame membership required? | **Yes — it is the whole point.** A rect in A must change A's thumbnail and leave B's hash **identical** (`:265-266`) |
| What does the thumbnail assertion depend on? | **element creation** → per-slide isolation → **manual refresh** re-render (`:275-277`) → absence of transient chrome → **debounce coalescing** |
| The measurement instrument | **Pixel colour sampling.** Each rect carries a distinct Tailwind hex (`#dc2626`, `#16a34a`, `#7c3aed`, `#f97316`, `#14b8a6`) with `fillStyle: 'solid'`, and assertions count pixels: `colorHits.orange > 12`, `colorHits.teal > 12` (`:287-288`) |
| Hardest assertion | **`:284-288` — two rects in rapid succession, and the settled thumbnail must contain BOTH colours.** This is the coalescing proof: neither add may be dropped |

**Equivalence contract for any migration.** The same frame receives the new element; the
same per-slide isolation holds (other slide's hash unchanged); the manual-refresh and
no-transient-chrome assertions are unchanged; **the rapid-succession both-colours-present
assertion is preserved**; no database or internal-command bypass; no fixed sleeps replace
readiness.

### 18e. Option A vs Option B — A preferred, **feasibility NOT yet established**

**Option A (real UI drawing) is preferred** and is evaluated first, as directed. Evidence
for it: `drawing-canvas-line-coordinates.spec.ts` proves the suite **already has a real-UI
drawing pattern** — `[data-testid="toolbar-line"]`, real pointer events, and an
`ensureDrawingReady` helper that waits on **production DOM only** (`.excalidraw`,
`canvas.excalidraw__canvas.interactive`, the toolbar testid) with no `window.h`. A
`readDrawingViewport` helper for scene↔screen conversion also already exists.

**But four specific blockers stand between that pattern and PATCH-124's assertions:**

1. **Colour is the measurement instrument, and the real UI cannot produce these colours.**
   Excalidraw's rectangle tool draws with the *current* stroke/background settings;
   `#dc2626`/`#16a34a`/`#7c3aed`/`#f97316`/`#14b8a6` are Tailwind hexes, not Excalidraw
   palette entries. Reaching them through the UI means opening the shape properties panel and
   entering a custom hex per shape — **five times, mid-test**. Changing the colours to palette
   values would change the sampling thresholds, i.e. **change the assertion**.
2. **`fillStyle: 'solid'` is not the default** — a transparent rectangle produces almost no
   colour hits, so the `> 12` thresholds would fail.
3. **The rapid-succession assertion is timing-critical by design** (`:284-288`). Two pointer
   drags plus two colour-panel interactions are far slower than two `evaluate` calls, and may
   no longer coalesce inside the 250 ms debounce — **which would silently convert a coalescing
   test into a sequential one**.
4. **Scene→screen conversion must be exact** under live scroll/zoom for the shape to land
   inside the intended frame; `readDrawingViewport` exists but has not been proven against
   frame-relative targeting.

**Option B (a bounded `addTestRectangleToFrame` fixture command) is NOT authorized**, and
must not be reached for on grounds of convenience. It would place a mutation surface inside
the production-test artifact and weaken the observation-only boundary that is the entire
point of §17.

**Decision: neither option is authorized yet.** A bounded feasibility spike must run first
(§18f). **Recorded plainly: I cannot honestly authorize Option A from reading, because three
of the four blockers concern whether the assertion survives, not whether the interaction is
possible.**

### 18f. Sequencing — **Option B (split)**, and the document sequence shifts again

The brief says prefer splitting if the real-UI migration needs substantial pointer geometry,
fixture redesign or separate acceptance evidence. **It needs all three** (§18e).

| Number | Subject | Status |
|---|---|---|
| **PATCH-136** | Observation bridge + **four** transport migrations (128, 129, 130, 132) | **BOUNDED · AUTHORIZED** |
| **PATCH-137** | **PATCH-124 private-mutation removal** — feasibility spike, then Option A or a re-argued Option B | **NEW · BLOCKED pending spike** |
| PATCH-138 | Document card, free-standing open affordance, deferred Card view removal, dead-constant cleanup | |
| PATCH-139 | Editor / read-only modal split | |
| PATCH-140 | Document persistence / lifecycle | |
| PATCH-141 | Links, backlinks, archive, reusable appearances | |

**PATCH-136 no longer blocks on PATCH-124.** Four specs regain production-mode execution
immediately; PATCH-124 keeps running in dev mode until PATCH-137 lands. **That is a strictly
better position than today and does not pretend the fifth spec is solved.**

**PATCH-137's required first output — the feasibility spike:** attempt one real-UI rectangle,
with a custom colour, inside `frame-landscape`, and report whether all five §18d equivalence
terms survive — especially the rapid-succession coalescing. **No spec edit until that report
exists.**

### 18g. Allowlists — PATCH-136 only

**Production — unchanged, exactly 3:** `lib/e2e/productionBridge.ts` (new, ≤150 lines) ·
`components/collabboard/canvas/layouts/DrawingLayout.tsx` (registration effect only) ·
`types/e2e-bridge.d.ts` (new). Vendored `App.tsx` and all of `excalidraw_fork/` remain
excluded, as do `next.config.ts`, `serverLifecycle.ts`, `CanvasClient.tsx`, persistence,
Supabase, and all feature code.

**Test — 6 (reduced from 7):**

```
e2e/characterization/patch-136-production-readiness.spec.ts   (new)
e2e/characterization/e2eBridge.ts                             (new shared helper)
e2e/characterization/patch-128-slide-sync.spec.ts
e2e/characterization/patch-129-preview-fit.spec.ts
e2e/characterization/patch-130-slide-navigation.spec.ts
e2e/characterization/patch-132-thumbnail-visibility.spec.ts
```

**`patch-124-slide-thumbnail-refresh.spec.ts` is REMOVED from the PATCH-136 test allowlist**
and belongs to PATCH-137. No PATCH-134 or PATCH-135 test edit.

### 18h. Hard stops — updated

| Hard stop | Verdict |
|---|---|
| Another affected spec also requires mutation | **RESOLVED — none do** (§18b) |
| Mutation and observation cannot be separated within the allowlists | **NOT triggered** — separated by patch (§18f) |
| Real UI drawing cannot target the intended frame deterministically | **UNRESOLVED — PATCH-137 spike** |
| Test requires exact internal geometry/colour unavailable from governed observation | **LIKELY TRIGGERED for colour** (§18e.1–2) — the strongest argument against Option A |
| Only workable solution is raw `updateScene` | **UNRESOLVED** — if the spike says yes, **stop again**; raw `updateScene` stays prohibited |
| Pointer actions make the test materially flaky | **UNRESOLVED** (§18e.3) |
| PATCH-124's feature assertion cannot be preserved | **UNRESOLVED — the decisive question** |
| A test fixture API would become generic command infrastructure | **Live risk if Option B returns** |

**Four unresolved, all confined to PATCH-137. None affects PATCH-136.**

### 18i. Status

**PATCH-136: OPEN · BUILD TRACK RESOLVED · OBSERVATION BRIDGE AUTHORIZED · FOUR TRANSPORT
MIGRATIONS AUTHORIZED (128, 129, 130, 132) · PATCH-124 MUTATION DEPENDENCY CONFIRMED AND
SPLIT INTO PATCH-137 · NO MUTATION ADDED TO THE BRIDGE · NOT PUSHED.**

**PATCH-137: OPEN · PATCH-124 PRIVATE-MUTATION REMOVAL · FEASIBILITY SPIKE REQUIRED ·
IMPLEMENTATION BLOCKED.**

**Track A: RESOLVED PROCEDURALLY.** **PATCH-135 / 134 / 132 / 130 / 129 / 128 / 124: CLOSED —
not modified or reopened; 128/129/130/132 authorized for transport-only migration here, 124
for its own contract under PATCH-137. PATCH-133: OPEN. PATCH-131: OPEN · BLOCKED.**
Snapshot and tag remain at `c0fa799`.

### 18j. Recorded diagnostic notes

- **A census built from a grep pattern found what the pattern could express, and nothing
  else.** `h.app.getSceneElements` matched; `const app = target.h?.app` … `app.updateScene(…)`
  did not. **One local alias hid a whole-scene replacement from two consecutive censuses**,
  and §17a stated the false negative as a positive finding — "no spec mutates" — which is the
  strongest form a census claim can take. **A census that enumerates absence must read the
  files; pattern matching can only enumerate presence.**
- **The hard stop fired against the governance that authorized it, before any code was
  written.** §17n listed "tests require mutation after all" as NOT triggered, on my own bad
  census; implementation hit it immediately and stopped with zero files touched. **The stop
  list is worth most when it can contradict the patch that wrote it — this is the second time
  in this sequence (PATCH-134 §0b was the first).**
- **The measurement instrument is part of the assertion.** PATCH-124's rectangles are not
  arbitrary shapes; their Tailwind hexes and solid fill are how the test *sees* the thumbnail.
  Option A reads as "draw a rectangle through the UI instead" and is really "reproduce five
  exact RGB values through a palette UI without changing the sampling thresholds."
  **Before calling a test migration transport-only or UI-equivalent, identify what the test
  measures with — the setup may be the instrument.**
- **Splitting cost one patch number and unblocked four specs immediately.** Keeping PATCH-124
  in would have held the bridge hostage to an unresolved pointer-geometry question. **When
  one member of a batch turns out to be a different problem, the batch is the thing to
  change.**

---

## 19. Amendment — RESIZE-STATE OBSERVATION CONTRACT; BRIDGE SURFACE CLOSED (2026-08-03, CTO)

Implementation stopped a second time, correctly, and reverted completely. Verified:
PATCH-124 byte-identical to `5953533`; no vendored, `next.config.ts` or
`serverLifecycle.ts` change; no commits; nothing pushed; worktree holds only the five
protected paths.

**The stop was right, and it caught a second gap in my own bridge census.**

### 19a. The contradiction

§17c authorized `getViewport()` limited to `scrollX`, `scrollY`, `zoom.value`,
`offsetLeft`, `offsetTop`, `selectedElementIds`. **PATCH-128 reads a seventh field:**

```
patch-128-slide-sync.spec.ts:1127
  resizingElementId: stateAfter?.resizingElement?.id ?? null,
patch-128-slide-sync.spec.ts:1138
  resizingElementId: embeddableId,          // the assertion
```

The authorized bridge cannot preserve that closed assertion. The implementation
**refused to expose full `AppState`, refused a private surface, refused to weaken or
delete the assertion, and refused to misfile `resizingElement` as viewport state.** All
four refusals were correct.

### 19b. What the PATCH-128 assertion actually proves

Full context, `:1112-1140`:

| Line | Step |
|---|---|
| `:1111` | `southeastResizeHandle(page, embeddableId)` computes the SE handle position |
| `:1113` | `page.mouse.move(handle.x, handle.y)` — hover only |
| `:1116-1117` | **before** the gesture: `stateBefore.selectedElementIds[id]` → `beforeSelected` |
| `:1119-1121` | records `document.elementFromPoint(x, y)` as `eventTarget` |
| `:1121-1131` | one-shot capture-phase `pointerdown` listener; inside `requestAnimationFrame`, samples `stateAfter` |
| `:1127` | **`resizingElementId: stateAfter?.resizingElement?.id ?? null`** |
| `:1128` | `selectedAfterDown` |
| `:1134` | `page.mouse.down()` |
| `:1136-1140` | `expect(pointerDownProof).toMatchObject({ beforeSelected: true, resizingElementId: embeddableId, selectedAfterDown: true })` |
| `:1142-1144` | two `mouse.move` steps, then `mouse.up()` |
| `:1146-1150` | poll: live element `width×height:version:versionNonce` **changed** |

**Classification: B and C together, over A.** It proves **(B)** the pointer actually
acquired the resize handle — not the canvas, not empty space, not a new element — and
**(C)** that the resize lifecycle began **at pointerdown, before any movement**; and it
binds both to **(A)** the *correct* element by asserting the id equals `embeddableId`.

**This is a negative control for the gesture itself.** Without it, the later "dimensions
changed" poll (`:1146`) could pass for a reason unrelated to a resize — a drag that moved
and re-laid-out the element, a stray tool, a coincidental sync. **The assertion exists
precisely so the completion evidence cannot be satisfied by the wrong mechanism.** It is
in no sense an incidental internal read, and moving it to after `mouse.up()` — which would
make it trivially accessible — **would destroy the property it proves.**

### 19c. Full-source app-state census — all four specs

Method, stated because two prior censuses failed: candidate sites located by searching
`h.state`, `h?.state`, `getAppState`, `appState`, **bare `\bstate\b`** (catching aliases such
as `stateBefore`/`stateAfter`/`const state =` regardless of the variable's name), then **every
hit read in source**. Mutation absence established by **method-name** search
(`updateScene`, `replaceAllElements`, `setState`, `.history`, `.store`, `.scene`), which is
**alias-independent** and therefore sound for proving absence of those methods.

**Every `h.<member>` touched by the four specs: `h.app`, `h.elements`, `h.state` — and
nothing else.** The fork's debug object also carries `scene`, `setState`, `watchState`,
`history` and `store` (`App.tsx:12407-12415`); **none of the five is used.**
(`h.sceneVersionChanges`, `h.settledTimerSchedules`, `h.thumbnailRenderRequests` in
PATCH-128 are that spec's own instrumentation counters — not members of the fork's `h`
type. `h.abs`/`h.min`/`h.max`/`h.floor`/`h.round`/`h.imul` are `Math.*` matches.)

| Spec | Field path | Reads | Assertion served | Category | DOM-replaceable? | Verdict |
|---|---|---|---|---|---|---|
| **128** | `zoom.value` | 2 (`:174`, `:207`) | scene↔screen conversion for canvas clicks | viewport geometry | no | `getViewport()` |
| 128 | `offsetLeft` | 1 (`:175`) | same | viewport geometry | no | `getViewport()` |
| 128 | `offsetTop` | 1 (`:176`) | same | viewport geometry | no | `getViewport()` |
| 128 | `scrollX` | 1 (`:177`) | same | viewport geometry | no | `getViewport()` |
| 128 | `scrollY` | 1 (`:178`) | same | viewport geometry | no | `getViewport()` |
| 128 | `selectedElementIds` | 4 (`:192`, `:195`, `:1117`, `:1128`) | selection before/after pointerdown | selection | **partially** — the sidebar mirrors *slide* selection, not *scene element* selection | `getViewport()` |
| **128** | **`resizingElement.id`** | **1 (`:1127`)** | **§19b gesture-acquisition proof** | **interaction lifecycle** | **no** — §19e | **`getInteractionState()`** |
| **129** | — | **0** | — | — | — | **no app-state projection needed** |
| **130** | `zoom.value`, `scrollX`, `scrollY`, `offsetLeft`, `offsetTop` | `:110-114`, `:233`, `:240`, `:245`, `:251` | frame→screen mapping; pan-stability | viewport geometry | no | `getViewport()` |
| 130 | `selectedElementIds` | 1 (`:154`) | which frame is active | selection | no | `getViewport()` |
| **132** | `scrollX`, `scrollY`, `zoom.value` | `:246-248` | canvas unchanged by sidebar scroll | viewport geometry | no | `getViewport()` |
| 132 | `selectedElementIds` | 1 (`:257`) | active slide's frame | selection | no | `getViewport()` |

**Union across all four = the six `getViewport()` fields + `resizingElement.id`. Exactly one
field is ungoverned, and it is the one the implementation stopped on.**

No collaborator data, no auth data, no UI state, no pointer coordinates, no raw elements are
read from state anywhere in the four specs.

**Residual limit, stated honestly:** method-name search proves absence of the *named*
methods; it cannot prove absence of a method nobody thought to name. The `h.<member>`
enumeration above closes that gap for this surface — the four specs touch three of the
debug object's eight members, and all three are now fully accounted for. **I consider the
bridge surface closed, and I have been wrong twice, so the readiness spec's §19h assertions
are what will actually establish it.**

### 19d. `resizingElement` is publicly typed — hard stop NOT triggered

```
excalidraw_fork/packages/excalidraw/types.ts:293
  resizingElement: NonDeletedExcalidrawElement | null;
```

It is a member of the public `AppState` interface, and
`ExcalidrawImperativeAPI.getAppState()` (`types.ts:850`) returns
`InstanceType<typeof App>["state"]` — i.e. that `AppState`. **The projection reads a
supported, typed, public field. No cast into private internals is required.**

### 19e. Irreducibility — UI evidence is not equivalent

Alternatives inspected and rejected:

| Alternative | Why not equivalent |
|---|---|
| Element bounds change after movement | Already asserted at `:1146`. It proves a resize *happened*, **not** that the correct element entered resize state at pointerdown — the exact gap `:1127` closes |
| Resize-handle DOM | Excalidraw renders handles **to canvas**, not DOM. There is nothing to query |
| Cursor state | `cursor` is a CSS property of the canvas element; it does not identify *which* element is being resized |
| Pointer capture | Captured by the canvas, not per element — no element identity |
| Selection state | Already captured (`beforeSelected`, `selectedAfterDown`); selection ≠ active resize |
| Production callback behavior | The app's own change handlers fire after mutation, i.e. too late for a pointerdown-time proof |

**Conclusion: irreducible.** The preferred outcome applies — **retain the accepted assertion
through a narrow interaction projection.**

### 19f. Final bridge API

```
window.__COLLABBOARD_E2E__ = {
  version: 1,
  instanceId,
  getSceneElements(),
  getViewport(),
  getInteractionState(),
  getSceneRevision(),
  subscribeToSceneChange(callback),
}
```

`getViewport()` returns **exactly**
`{ scrollX, scrollY, zoom: { value }, offsetLeft, offsetTop, selectedElementIds }`.

`getInteractionState()` returns **exactly** `{ resizingElementId: string | null }`.

**The two objects must not be merged.** Viewport geometry and interaction lifecycle are
separate contracts with different stability and different reasons to change; merging them
is how `getViewport()` would acquire a seventh field, then an eighth.

Semantics for `getInteractionState()`: frozen defensive object · reads
`api.getAppState().resizingElement?.id ?? null` · **never returns the element**, only the id ·
no geometry, handles, pointers, group state, collaborators or UI state · `null` when idle ·
the current id during an active resize gesture · no setters · no mutation · no raw `AppState`
· no raw API.

**Explicitly prohibited, now and in future amendments:** `getAppState()`,
`getInternalState()`, `getStateField(path)`, `inspectApp()`, or any accessor parameterised by
a field name. **The projection stays explicit and closed** — a path-parameterised getter would
re-create the very surface these two hard stops removed.

### 19g. Line limit — raised to 180, deliberately

§17l bounded `lib/e2e/productionBridge.ts` at 150 lines for five members. A sixth member adds
the projection, its frozen return, its type, and its declaration — roughly 15–25 lines.

**Authorized limit: 180 lines.** The brief is explicit that unreadable code must not be
forced to preserve an old number, and compressing a security-boundary module is exactly the
wrong economy. **No helper file is authorized** — splitting a 180-line module would scatter
the boundary across two files and make "what does the bridge expose?" a two-file question.
If the implementation exceeds 180, **stop and report** rather than compress.

### 19h. Readiness-spec additions

Beyond §17m's twenty items, `patch-136-production-readiness.spec.ts` must prove, **against a
real resize gesture on a real element — never a mocked `AppState`**:

1. `getInteractionState` exists **only** in the E2E-enabled build;
2. its return has **exactly one key**, `resizingElementId` (assert `Object.keys().length === 1`);
3. the returned object is **frozen**;
4. idle value is `null`;
5. **pointerdown on a real SE resize handle** yields the expected element id;
6. after pointerup/resize completion it returns to `null`;
7. no full `resizingElement` object is reachable;
8. no full `AppState` is reachable;
9. the returned object cannot be mutated (assignment throws or has no effect);
10. ordinary production chunks still exclude the bridge (**bundle-content grep**, §17k).

### 19i. PATCH-128 migration mapping

| Old | New |
|---|---|
| `h.state.selectedElementIds[id]` (`:1117`, `:1128`) | `bridge.getViewport().selectedElementIds[id]` |
| `h.state.resizingElement?.id` (`:1127`) | `bridge.getInteractionState().resizingElementId` |
| `getAppState()` helper (`:152-157`) → `zoom/offset/scroll` | `bridge.getViewport()` |
| `h.elements` / `getSceneElements()` | `bridge.getSceneElements()` |
| `h.app.onChangeEmitter.on(...)` (`:447`) | `bridge.subscribeToSceneChange(...)` (§17d) |
| local `waitForHarness` (`:146-150`) | shared `waitForE2EBridge` |

**Preserved exactly:** the hover-then-`pointerdown` sequence; the capture-phase one-shot
listener inside `requestAnimationFrame`; the assertion's position **before** `mouse.down()`
resolves and **before** any movement; the same expected element id; the same two `mouse.move`
steps and `mouse.up()`; the same `beforeSelected`/`selectedAfterDown` negative controls; the
same completion poll. **The check must not be moved after resize completion to simplify
access** (§19b).

**PATCH-130 and PATCH-132: fully covered by `getViewport()`** — confirmed field-by-field in
§19c. **No interaction field is added for them.** **PATCH-129 uses no app-state projection at
all** — readiness plus `getSceneElements()` only.

### 19j. Security

The addition exposes **one string or `null`**: the id of an element **already present in the
scene the user is viewing in their own browser**, during a gesture **that user is
performing**. No content beyond that id, no collaborator data, no raw element, no geometry,
no pointer coordinates, no command interface, no persistence access, no authorization change.
The bridge still performs no network I/O and holds no Supabase client, so **it cannot bypass
RLS because it never speaks to the network**. Build-time `NEXT_PUBLIC_E2E_BRIDGE` gating and
the bundle-grep exclusion proof are unchanged.

### 19k. Allowlists — unchanged

**Production, exactly 3:** `lib/e2e/productionBridge.ts` (new, **≤180 lines**) ·
`components/collabboard/canvas/layouts/DrawingLayout.tsx` (registration effect only) ·
`types/e2e-bridge.d.ts` (new). **No additional production file is required** — the projection
reads the public API the host already holds. Vendored fork, `next.config.ts`,
`serverLifecycle.ts`, `CanvasClient.tsx`, persistence, Supabase and all feature code remain
excluded.

**Test, exactly 6:** `patch-136-production-readiness.spec.ts` (new) · `e2eBridge.ts` (new
shared helper) · PATCH-128 · PATCH-129 · PATCH-130 · PATCH-132.
**PATCH-124 remains excluded — PATCH-137.** No PATCH-134/135 edit.

### 19l. Hard stops

| Hard stop | Verdict |
|---|---|
| `resizingElement` unavailable through the supported public `AppState` | **NOT triggered** — `types.ts:293` (§19d) |
| Another ungoverned state field found | **NOT triggered** — union is six + one (§19c) |
| A migrated spec requires mutation | **NOT triggered** — §18b; the only mutator is PATCH-124, split out |
| Assertion requires raw element or raw API | **NOT triggered** — an id string suffices (§19f) |
| UI equivalence impossible and the projection unsafe | **NOT triggered** — irreducible **and** safe (§19e, §19j) |
| Bridge line/file limits no longer viable | **NOT triggered** — 150 → 180, no helper file (§19g) |
| Ordinary bundle exclusion weakened | **NOT triggered** — gate unchanged (§19j) |

**Zero of seven triggered.**

### 19m. Status

**PATCH-136: OPEN · BUILD TRACK RESOLVED · OBSERVATION BRIDGE AUTHORIZED · INTERACTION-STATE
PROJECTION AUTHORIZED · FOUR MIGRATIONS AUTHORIZED (128, 129, 130, 132) · PATCH-124 SPLIT INTO
PATCH-137 · NOT PUSHED.**

**PATCH-137: OPEN · PATCH-124 PRIVATE-MUTATION REMOVAL · FEASIBILITY SPIKE REQUIRED ·
BLOCKED.** Sequence: 136 → 137 → **138** document card → **139** modal split → **140**
persistence → **141** links/backlinks.

**Track A: RESOLVED PROCEDURALLY. PATCH-135 / 134 / 132 / 130 / 129 / 128 / 124: CLOSED — not
modified or reopened. PATCH-133: OPEN. PATCH-131: OPEN · BLOCKED.** Snapshot and tag remain
at `c0fa799`.

### 19n. Recorded diagnostic notes

- **Two stops, two censuses, two different blind spots — and both censuses were mine.**
  §17a missed an aliased `app.updateScene`; §18b's app-state work missed
  `state.resizingElement` because it enumerated the fields I expected a viewport projection to
  need. **The second failure was not a repeat of the first: the first was a pattern that
  couldn't see through an alias, the second was a census that answered "which viewport fields
  are read?" instead of "which state fields are read?"** A census answers the question it
  asks; the question has to be the general one.
- **The assertion that blocked the bridge is the one that makes the test honest.**
  `resizingElement.id` at pointerdown is a negative control: it proves the gesture grabbed the
  right handle, so the later "dimensions changed" evidence cannot be satisfied by a drag, a
  stray tool, or a coincidental sync. **The cheapest resolution — move the check after
  `mouse.up()` where the state is easy to read — would have preserved the line and destroyed
  the proof.** Access convenience and assertion meaning are unrelated properties.
- **A one-field projection is the whole design decision.** The alternatives were exposing
  `AppState` (hundreds of fields, collaborators included) or adding a seventh key to
  `getViewport()` (which would have made the object a grab-bag and the next field an easy
  precedent). **Keeping interaction state in its own two-key-free object is what makes the
  eighth field an amendment rather than a detail.**
- **I raised my own line limit rather than compress a security boundary.** 150 was a guess
  made before the sixth member existed. **A limit that forces unreadable code in the one
  module whose readability *is* the control has stopped doing its job** — the honest move is
  to move the number and say why.

## 20. Amendment — BUILD-TIME BRIDGE SELECTION AUTHORIZED (2026-08-03, CTO)

**Trigger:** the third implementation hard stop, and the first one caused by a *governance
design defect* rather than a census error. §17g asserted that a `NEXT_PUBLIC_*` guard makes
the bridge **absent** from ordinary bundles. Runtime disablement passed. **Bundle exclusion
failed.** The assertion was wrong, and it was mine.

### 20a. Revert confirmed

`23e39d1` is HEAD. No bridge module exists (`lib/e2e/` absent). No test changed. PATCH-124
byte-identical. No vendored change. `next.config.ts` unchanged at 52 lines.
`serverLifecycle.ts` unchanged. No commits, nothing pushed. Worktree holds only the five
protected pre-existing paths.

### 20b. What the attempted implementation proved

The attempt was **correct work against a wrong specification**. It used only
`getSceneElements()`, `getAppState()`, `onChange()` — no private API. 134 lines, under the
180 limit. `DrawingLayout.tsx` 3514 → 3530. `npx tsc --noEmit` passed. A clean ordinary
`npx next build` passed.

And the ordinary client chunks still contained `__COLLABBOARD_E2E__`,
`COLLABBOARD_E2E_BRIDGE_DIAGNOSTIC`, `productionBridge`, `getInteractionState`.

**RUNTIME DISABLEMENT PASSED · BUNDLE EXCLUSION FAILED.** The §17k exclusion test — the one
this patch itself demanded — is what caught it. The stop is the process working.

### 20c. The mechanism — resolution and dead-code elimination are different phases

The guard was:

```ts
process.env.NEXT_PUBLIC_E2E_BRIDGE === '1'   // guarding a dynamic import()
```

Next inlines the literal, so the branch is statically false and the **call site** is removed.
But an `import()` is a *dependency*, and webpack resolves and emits dependencies while
**building the module graph** — before the optimizer ever evaluates the guard. Value-level
DCE deletes the code that would have *called* the chunk; it does not un-create the chunk. The
module had already been resolved, compiled, assigned to a chunk and written to `static/`.

Record as a general rule, because it will recur:

> **A build-time environment condition governs runtime reachability, not graph membership.
> Only module *resolution* governs graph membership.** If a module must not be in an
> artifact, the compiler must never resolve it — no conditional expression can achieve that
> after the fact.

Corollary: **runtime absence and bundle absence are separate requirements with separate
proofs.** §17g conflated them. §17g's gate mechanism is **superseded** by this section; its
security *requirements* stand unchanged.

**Further restructuring of the same conditional import is not authorized.** The exclusion
requirement is not weakened.

### 20d. Options evaluated

| | Option | Verdict |
|---|---|---|
| **A** | Build-time **resolve alias** on an invariant import path | **SELECTED** — proven in §20f |
| **B** | `NormalModuleReplacementPlugin` replacing real → no-op in **ordinary** builds | **REJECTED** — see below |
| **C** | Separate static entry modules selected by alias | Same mechanism as A with more files; A is C with the minimum file count |
| **D** | Source generation / file swapping before build | **REJECTED** — dirties the worktree, creates stale artifacts, makes builds non-reproducible; the brief already flags it high risk and it is |
| **E** | Conditional exports / internal package | **REJECTED** — requires a workspace package for one module; `exports` conditions are resolved by the packager and would interact with Next's own resolution in ways this repo has no precedent for. Cost is not smallness, it is unfamiliarity in the resolver |

**Why B is rejected, and this is the load-bearing decision.** A and B differ in *which build
carries the rule*, and therefore in **what happens when the rule fails**.

- **B**: the real module is the default; the *ordinary* build must actively replace it. A
  typo in the regex, a plugin ordering change, a Next upgrade that alters the hook — and the
  ordinary artifact **ships the real bridge**. The failure mode is silent and is the exact
  security failure this patch exists to prevent.
- **A as specified below**: the **no-op is the default** and the *E2E* build applies the rule.
  If the rule fails, the E2E build gets a no-op and **every E2E spec fails loudly on the
  first `waitForE2EBridge`**. The ordinary artifact cannot be affected by a rule it does not
  execute — `E2E_BRIDGE_BUILD` is unset, the `if` is false, `resolve.alias` is untouched.

**The ordinary build carries no bridge rule at all.** That is the property being bought. A
security boundary should fail toward exclusion, and only one of these two does.

### 20e. Selected architecture

```
lib/e2e/bridgeContract.ts          type-only contract, shared by both implementations
lib/e2e/bridgeRegistration.ts      DEFAULT resolution target — no-op. Ordinary builds get this
                                   with no configuration whatsoever.
lib/e2e/bridgeRegistration.e2e.ts  Real implementation. Reachable ONLY through the E2E alias.
```

`DrawingLayout.tsx` imports **`./…/lib/e2e/bridgeRegistration`** — one invariant specifier, no
conditional, no `import()`, no environment read in client source. The host cannot tell which
implementation it received, which is why the host contains no bridge logic.

**Exact alias rule** — the E2E branch only:

```ts
config.resolve.alias = {
  ...config.resolve.alias,
  [`${path.resolve(process.cwd(), "lib/e2e/bridgeRegistration.ts")}$`]:
    path.resolve(process.cwd(), "lib/e2e/bridgeRegistration.e2e.ts"),
};
```

**The key is an absolute file path with a `$` terminator, not a request string.** This is not
stylistic. §20f proved that the natural-looking key `"@/lib/e2e/bridgeRegistration$"`
**silently does nothing** in Next 15.5.20: Next installs the tsconfig `paths` mapping as a
resolver plugin that rewrites `@/…` to an absolute path *before* the alias plugin is
consulted, so the alias never sees the request it was written for. The build succeeds and the
bridge is simply absent. An implementer would have shipped that and believed it worked.

The absolute-path key is also **specifier-independent**: `DrawingLayout.tsx` uses relative
imports throughout (zero `@/` imports in the file), and the rule works regardless.

**Mandatory companion — cache keying:**

```ts
if (config.cache && typeof config.cache === "object" && "version" in config.cache) {
  config.cache.version = `${config.cache.version ?? ""}|e2eBridge=${E2E_BRIDGE_BUILD ? "1" : "0"}`;
}
```

This is **not** defence in depth. §20f proved that without it, flipping the flag over an
existing `.next` produces a **fully cached, silently wrong artifact**. It applies in both
branches, which is why it sits outside the `if`.

### 20f. Scratch proof — results

Performed in an isolated Next **15.5.20** application outside the repository
(`scratchpad/bridge-proof`, React 19.2.0, same `@/*` tsconfig mapping, the repo's `node:`
`NormalModuleReplacementPlugin` and `resolve.fallback` block copied verbatim). No repository
file was created, modified, staged or built.

**Scope limit, stated plainly:** this proves *webpack/Next resolution and emission behaviour*,
which is the entire question at issue. It does **not** prove the rule against this
repository's real module graph. That proof is an implementation deliverable (§20j), and the
implementation is not authorized to skip it because a scratch build passed.

Marker strings: `__COLLABBOARD_E2E__`, `COLLABBOARD_E2E_BRIDGE_DIAGNOSTIC`,
`getInteractionState`, `subscribeToSceneChange`, `getSceneRevision`.

| # | Test | Result |
|---|---|---|
| 1 | Clean ordinary build succeeds | **PASS** exit 0 |
| 2 | Ordinary `.next/static` + `.next/server`: all five markers | **0 occurrences** |
| 3 | Ordinary: real module path in any manifest | **0** |
| 4 | Ordinary: emitted async bridge chunk | **none** — the design has no `import()` |
| 5 | Ordinary: no-op inlined | emitted client code is literally `()=>{}` |
| 6 | Clean E2E build succeeds | **PASS** exit 0 |
| 7 | E2E: real module present **exactly once** | 1 chunk, `static/chunks/app/page-*.js` |
| 8 | E2E: full governed API emitted | `version`, `instanceId`, `getSceneElements`, `getViewport`, `getInteractionState`, `getSceneRevision`, `subscribeToSceneChange` all present |
| 9 | Request-string key `"@/lib/e2e/bridgeRegistration$"` | **FAILS SILENTLY** — E2E build succeeded with the **no-op** bundled |
| 10 | Absolute-path key, `$`-terminated | **WORKS** in both directions |
| 11 | Exactness — prefix-superset module `lib/e2e/bridgeRegistrationExtra.ts` | **INTACT** in both builds |
| 12 | Exactness — unrelated module `lib/unrelatedBridgeRegistrationHelper.ts` | **INTACT** in both builds |
| 13 | `node:` plugin coexistence — client `import "node:path"` alongside the alias | **PASS**, build exit 0, stub emitted, behaviour unchanged |
| 14 | Ordinary build source maps in `static/` / `server/` | **0 `.map` files** (`productionBrowserSourceMaps` unset → default `false`, matching the repo) |
| 15 | **Dirty ordinary rebuild over an E2E `.next`, no cache key** | **FAIL — CRITICAL** |
| 16 | Dirty ordinary rebuild over an E2E `.next`, **with** cache key | **PASS** — 0 marker hits, stale chunk pruned, manifest correct |
| 17 | Dirty E2E rebuild over an ordinary `.next`, with cache key | **PASS** — bridge present |

**Test 15 in full, because it is the most dangerous finding in this section.** After a clean
E2E build emitting `page-4f09f789b06c320c.js`, an ordinary `next build` over the same `.next`
exited 0, emitted **no new page chunk**, left the E2E chunk on disk, and
`app-build-manifest.json` **still pointed at it**. The webpack filesystem cache scored the
build a complete hit — the alias is invisible to the cache key, so nothing appeared to have
changed. **An ordinary production build served the real bridge, with a successful build log
and no warning.** This is §16a's stale-cache defect recurring with a security consequence
instead of a crash. Test 16 closes it.

### 20g. Build flag — `E2E_BRIDGE_BUILD=1`, non-public

**`NEXT_PUBLIC_E2E_BRIDGE` is retired.** Selection now happens in `next.config.ts`, so no
client module reads the flag, so nothing needs `NEXT_PUBLIC_` inlining. Keeping the public
prefix would ship the value into the ordinary bundle for a decision the ordinary bundle no
longer participates in.

| Requirement | How met |
|---|---|
| Explicit | A named variable must be set on the **build** command |
| Build/config resolution only | Read once at `next.config.ts` module scope; never in client source |
| Cannot become a runtime toggle | Absent from every emitted chunk. No query parameter, no `localStorage`, no global. **There is nothing to toggle: the module is not there** |
| Distinguishes artifacts | Marker file `.next/E2E_BRIDGE_BUILD` (§17h.6), plus `.next/BUILD_ID` recorded by the run |
| Documented | `.fable5/docs/TESTING.md`, in the implementation commit |
| Not a secret | Literal `1`; a switch |

Build command: `E2E_BRIDGE_BUILD=1 npx next build`, run directly, never piped (§16e.5).

### 20h. Module contracts

**No-op — `lib/e2e/bridgeRegistration.ts`, ≤20 lines.** Identical signature to the real
module; returns a no-op cleanup. **No global name. No API method names. No diagnostic marker.
No Excalidraw import. No environment check.** `import type` only, from `bridgeContract.ts`.
Tree-shakable but **must not depend on tree shaking for correctness** — it is inert as
written. It carries a comment stating it is the ordinary-build target and is replaced by the
E2E alias.

**The no-op is not a security control.** Exclusion of the real module is. The no-op exists so
`DrawingLayout.tsx` contains no conditional.

**Real — `lib/e2e/bridgeRegistration.e2e.ts`, ≤180 lines.** The §19f API unchanged:
`version` · `instanceId` · `getSceneElements()` · `getViewport()` · `getInteractionState()` ·
`getSceneRevision()` · `subscribeToSceneChange()`. Frozen projections, defensive snapshots,
no setters, no mutation, no raw API exposure, no Supabase, no persistence, no network. §17f,
§17j, §19f apply verbatim.

**Contract — `lib/e2e/bridgeContract.ts`, ≤40 lines.** Type-only. Both implementations satisfy
one shared registration type; **the full global bridge API type is not duplicated**. Both
import it with `import type`, so it is erased — test 5 confirms the ordinary no-op emits as
`()=>{}` with no contract residue. **The no-op must not import the real module for any
runtime value.**

**`types/e2e-bridge.d.ts`** — `Window` augmentation, ambient, erased. Application-owned, never
the fork's.

**`lib/e2e/productionBridge.ts` is retired and must not be created.** The name asserts the
module is production; the entire architecture asserts it is not.

### 20i. `next.config.ts` — bounded change

**52 lines → ≤ 80 lines.** Authorized additions, and nothing else:

1. `import path from "node:path";`
2. `const E2E_BRIDGE_BUILD = process.env.E2E_BRIDGE_BUILD === "1";` at module scope
3. The cache-version keying block (unconditional)
4. The `if (E2E_BRIDGE_BUILD)` alias block

**Preservation requirements — the existing `node:` handling is not to be touched.** The
`NormalModuleReplacementPlugin(/^node:/)` and the `resolve.fallback` block stay inside
`if (!isServer)`, byte-identical, in the same order, with the same comments. The new blocks
go **after** them. Test 13 proves coexistence. Prohibited: any Next version change,
`transpilePackages` change, broad `optimization` change, general E2E webpack infrastructure,
and **any broad regex** — the alias key is a single absolute file path.

The alias is applied to **both** compilations. Ordinary builds are unaffected either way (no
rule runs); for E2E builds this keeps the server graph consistent with the client graph.

### 20j. Bundle-proof method — required implementation evidence

Both artifacts built from a **removed** `.next`, both verified before either is trusted.

**Scoping rule.** Assertions run over `.next/static` and `.next/server`. `.next/cache` and
`.next/trace` are excluded **with justification**: neither is served by `next start` nor
included in a deployment output, and the scratch ordinary build's only hits there were the
*filename* `bridgeRegistration.e2e` recorded in the resolver's directory cache — never
implementation content. The implementation must **verify that characterization**, not assume
it: any `.next/cache` or `.next/trace` occurrence must be shown to be a path string only.

**Ordinary artifact must show:** build exit 0 · zero occurrences of the global name, the
diagnostic constant, the bridge-only method-name cluster and the real module path across
`static/` + `server/` and every manifest · no emitted bridge chunk · no unused async chunk ·
runtime global absent after mount · **the no-op present and inert**.

**E2E artifact must show:** build exit 0 · real module present **exactly once** · runtime
bridge present after mount with `version === 1` · every governed method functional · marker
file present.

**Not accepted as proof:** runtime global absence alone · minified renaming instead of
exclusion · the module emitted but unused · presence in ordinary source maps or manifests ·
text obfuscation · a passing grep whose pattern cannot match minified output. Chunk and module
manifests are compared, not only text. If the ordinary build ever emits source maps, they are
inside the exclusion scope.

### 20k. Security model

- **The ordinary compiler never resolves the real module.** It is not in the graph, not in a
  chunk, not in a manifest, not in a source map.
- **No runtime state can activate it** — no query parameter, no `localStorage`, no global, no
  cookie, no header. There is no code to activate.
- **The ordinary artifact executes no bridge-selection rule**, so no misconfiguration of that
  rule can affect it.
- **The E2E artifact is separately marked and disposable**, and is deleted after the run
  (§17h.14). It must never be presented as evidence for an ordinary production build.
- §17k's threat model for the E2E artifact itself is unchanged and still governs.
- **Obscurity remains explicitly rejected.** The global name is not a control.

### 20l. Allowlists

**Production — exactly 6 files** (was 3; the increase is the cost of moving selection out of
client source, and each file has one owner):

| File | Change | Limit |
|---|---|---|
| `lib/e2e/bridgeContract.ts` | **NEW** — type-only shared contract | ≤40 lines |
| `lib/e2e/bridgeRegistration.ts` | **NEW** — no-op, default resolution target | ≤20 lines |
| `lib/e2e/bridgeRegistration.e2e.ts` | **NEW** — real implementation | ≤180 lines |
| `types/e2e-bridge.d.ts` | **NEW** — `Window` augmentation | ≤30 lines |
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | **Registration only** — one import, one effect that registers on API availability and unregisters on cleanup. Report before/after line count | **≤ +20 lines** from 3514 |
| `next.config.ts` | The four §20i additions only | 52 → **≤80 lines** |

**Do not force unrelated concerns into one file to preserve the old count**, and do not split
the real bridge to stay under 180 — §19g's reasoning stands.

**Tooling — exactly 2 entries:**

| File | Change | Limit |
|---|---|---|
| `scripts/e2e/assertBridgeExclusion.mjs` | **NEW** — artifact census used by both the manual procedure and the readiness spec | ≤80 lines |
| `package.json` | **≤2 added script lines** (`build:e2e`, `verify:bridge-exclusion`). No dependency change | — |

**Explicitly excluded, unchanged:** vendored `App.tsx` and everything under
`excalidraw_fork/` · `serverLifecycle.ts` · `CanvasClient.tsx` · persistence and Supabase
modules · document-feature code · toolbar code · `canvasToolbarRegistry.tsx` ·
`CanvasSidebar.tsx` · shared UI · **`patch-124-slide-thumbnail-refresh.spec.ts`**.

**Test — exactly 6 files** (unchanged from §19k):

```
e2e/characterization/patch-136-production-readiness.spec.ts   (new)
e2e/characterization/e2eBridge.ts                             (new shared helper)
e2e/characterization/patch-128-slide-sync.spec.ts
e2e/characterization/patch-129-preview-fit.spec.ts
e2e/characterization/patch-130-slide-navigation.spec.ts
e2e/characterization/patch-132-thumbnail-visibility.spec.ts
```

**Docs:** `.fable5/docs/TESTING.md` update, in the implementation commit.

### 20m. Module-selection test requirements

The ten brief items, allocated by cost. Items 1–4, 9, 10 are cheap and **automated** in
`patch-136-production-readiness.spec.ts` via `assertBridgeExclusion.mjs` against the artifact
on disk. Items 5–8 each require a full build and are a **scripted, recorded procedure** in
`TESTING.md`, executed once during implementation with output pasted into the closure
evidence — not a per-run gate.

| # | Requirement | Where |
|---|---|---|
| 1 | Ordinary config resolves the stable import to the no-op | automated |
| 2 | E2E config resolves it to the real module | automated |
| 3 | Ordinary module graph contains no real bridge | automated |
| 4 | E2E module graph contains it exactly once | automated |
| 5 | A stale E2E `.next` cannot be mistaken for ordinary | procedure — marker file + `BUILD_ID` |
| 6 | Rebuilding ordinary after E2E removes the bridge entirely | procedure — **§20f test 15/16; must be re-proven in-repo** |
| 7 | Rebuilding E2E after ordinary restores it | procedure |
| 8 | Flag changes require a clean build | procedure — asserted **with** the cache key in place |
| 9 | The rule matches no unrelated module | automated — prefix-superset and unrelated-name fixtures, as §20f tests 11–12 |
| 10 | `node:` replacement behaviour unchanged | automated — the existing `pptxgenjs`/`jspdf` export paths still build and still run |

**Additional required negative control:** delete `bridgeRegistration.e2e.ts` and confirm the
E2E build **fails loudly** rather than silently falling back to the no-op. A silent fallback
would make every future E2E green meaningless, and §20f test 9 shows a silent no-op fallback
is a real failure mode of this mechanism.

### 20n. Commit plan — four commits

1. `build(e2e): select observation bridge by artifact` — `next.config.ts`, `bridgeContract.ts`,
   `bridgeRegistration.ts`, `bridgeRegistration.e2e.ts`, `types/e2e-bridge.d.ts`,
   `scripts/e2e/assertBridgeExclusion.mjs`, `package.json`
2. `feat(e2e): add production observation bridge` — `DrawingLayout.tsx` registration
3. `test(e2e): migrate canvas specs to observation bridge` — the four migrations
4. `test(e2e): characterize observation bridge lifecycle` — the readiness spec + `TESTING.md`

Commit 1 must be verifiable on its own: with no registration call yet, both builds must
succeed and the ordinary artifact must already be clean.

### 20o. PATCH-124 and PATCH-137

PATCH-124 remains **excluded** and byte-identical. PATCH-137 remains the separate
private-mutation-removal patch, still blocked on its feasibility spike.

### 20p. Hard stops — evaluated

| Stop | Result |
|---|---|
| Next/webpack cannot exclude the real module through a narrow exact rule | **NOT TRIGGERED** — §20f tests 2, 7, 10 |
| Config selection affects unrelated imports | **NOT TRIGGERED** — tests 11, 12; the key is one absolute path with `$` |
| Module replacement conflicts with existing `node:` handling | **NOT TRIGGERED** — test 13; different mechanism, different stage, no overlap |
| Ordinary source maps or manifests still include the real module | **NOT TRIGGERED** — tests 3, 14; ordinary emits no maps |
| E2E and ordinary artifacts cannot be distinguished safely | **NOT TRIGGERED** — marker file + `BUILD_ID` + exclusion census |
| Architecture requires source-file mutation before each build | **NOT TRIGGERED** — option D rejected; no file is written at build time |
| **Stale artifact switching remains possible** | **TRIGGERED AND CLOSED** — test 15 proved it *is* possible; the §20e cache key closes it (test 16), and the clean-build requirement plus the marker file remain mandatory regardless. Residual: serving a previously built `.next` wholesale is an artifact-handling risk, addressed by §17h.14 deletion |
| More than the bounded files are required without a clear owner | **NOT TRIGGERED** — 6 production + 2 tooling + 6 test, each with a named owner and limit |

### 20q. Status

**OPEN · BUILD TRACK RESOLVED · OBSERVATION BRIDGE AUTHORIZED · BUILD-TIME MODULE SELECTION
AUTHORIZED · FOUR MIGRATIONS AUTHORIZED (128, 129, 130, 132) · PATCH-124 SPLIT INTO PATCH-137
· NOT PUSHED.**

Implementation is unblocked. §17g's gate mechanism is superseded by §20e/§20g; every other
§17, §18 and §19 constraint stands.

### 20r. Recorded diagnostic notes

- **Runtime gating is not graph exclusion.** An inlined `process.env` guard removes a call
  site; it cannot remove a resolved dependency. Only resolution decides membership.
- **Make the security boundary the default, not the override.** The rule belongs on the build
  that *adds* the risky module, so that rule failure excludes rather than includes.
- **A webpack `resolve.alias` key must be an absolute path when tsconfig `paths` are in play.**
  Next's paths plugin rewrites `@/…` before the alias runs; a request-string key fails
  **silently**, producing a build that succeeds and does the wrong thing.
- **Any build input not in the webpack cache key can produce a fully cached wrong artifact.**
  The alias flip was invisible to the cache and an ordinary rebuild re-served the E2E chunk
  with exit 0. Second time a stale `.next` has caused a false result in this patch (§16a);
  first time it could have shipped a security defect.
- **The test that catches the governance error is worth more than the governance.** §17k's
  bundle-grep requirement is the only reason this was caught before merge. Write the
  falsifier into the spec, not only the intent.

## 21. CLOSURE — PRODUCTION OBSERVATION BRIDGE (2026-08-03, CTO)

Independent acceptance review: **PASS WITH NON-BLOCKING OBSERVATIONS.** Every claim below
that is marked *verified here* was re-checked against source or re-executed by the CTO, not
taken from the review summary.

### 21a. Implementation commits

| Commit | Subject |
|---|---|
| `ec17047` | `build(e2e): select observation bridge by artifact` |
| `a1d6617` | `feat(e2e): add production observation bridge` |
| `3bc69aa` | `test(e2e): migrate canvas specs to observation bridge` |
| `b421e04` | `test(e2e): characterize observation bridge lifecycle` |

`git diff --stat b37bc46 b421e04` = **14 files, +454 / −73** — *verified here*. Exactly the
§20l allowlist: 6 production, 2 tooling, 6 test. **No file outside it was touched.**

### 21b. Build track — closed

The original production-build failure was **procedural, not a code defect**. A stale `.next`
webpack filesystem-cache state produced the WasmHash failure (§16a). Current source builds
successfully. **No application change and no dependency change was required** — the
`next.config.ts` `node:` handling was a candidate that the owner's five-configuration A/B
eliminated (§8, corrected). The clean-build procedure (§16e) and the process-lifecycle
handling (§16i) remain **standing governance requirements**, not one-time fixes.

### 21c. Build-time module selection — accepted

Ordinary default `lib/e2e/bridgeRegistration.ts` is **4 lines** — *verified here*:
`import type` only, one arrow returning a no-op cleanup. No global, no API strings, no
diagnostic, no real-module import, no dynamic import, no client environment check.

E2E target `lib/e2e/bridgeRegistration.e2e.ts` is selected **only** under
`E2E_BRIDGE_BUILD=1`, through the exact absolute `$`-terminated alias key specified in §20e —
*verified here, byte-for-byte*. No `@/…` request-string alias. No regex. **Ordinary builds
install no bridge alias at all**, and no client module reads the flag.

The readiness spec permanently encodes the §20f test-9 trap: it asserts `next.config.ts`
**does not contain** `'@/lib/e2e/bridgeRegistration$'`. That is the right shape for a finding
of this kind — the silent-failure mode is now a test, not a memory.

Missing-real-module negative control: the E2E build **fails loudly** rather than falling back
to the no-op.

### 21d. Cache safety — accepted

The existing cache version is preserved and appended with a deterministic
`|collabboard-e2e-bridge:on|off` — *verified here*, and applied **unconditionally**, outside
the `if`, which is what makes both directions safe. Both were exercised: E2E → ordinary stale
bridge reuse, and ordinary → E2E stale no-op reuse.

**Clean builds remain the required operational procedure** even though the cache key closes
the §20f test-15 vulnerability. Two independent controls, because the demonstrated failure
mode was an exit-0 build serving the wrong artifact with no warning.

### 21e. Existing `next.config.ts` behaviour — unchanged

*Verified here by diff.* `NormalModuleReplacementPlugin(/^node:/)`, the `resolve.fallback`
block, the `if (!isServer)` scope and the ordering are untouched; all new blocks are appended
after. `pptxgenjs` / `jspdf` `node:` handling is unaffected. **No conflict with bridge
aliasing** — different mechanism, different resolution stage.

52 → **76 lines**, within the ≤80 limit — *verified here*.

### 21f. Ordinary artifact exclusion — accepted

**Re-executed by the CTO, not accepted from the report:**

```
node scripts/e2e/assertBridgeExclusion.mjs
Bridge exclusion proven across 891 emitted files.   EXIT=0
```

Zero bridge markers · no E2E artifact marker · no emitted real bridge chunk · no real bridge
source or module reference · no API marker cluster · nothing in client or server surfaces.

The script checks `BUILD_ID`, static chunks, server chunks, eight manifests, source maps
where present (it reads every file under the scanned scopes), and **seven independent
forbidden markers**, failing with exact per-file diagnostics. Its scope excludes `.next/cache`
and `.next/trace` per §20j — correct, and justified there.

### 21g. E2E artifact — accepted

Build succeeds · marker file contains exactly `1` · real bridge markers in **exactly one**
emitted canvas chunk · the exclusion script correctly **fails** against the E2E artifact ·
missing-module negative control fails the build · the repository's final `.next` is
**ordinary with no marker** — *verified here: `.next/E2E_BRIDGE_BUILD` absent*.

### 21h. Bridge API — accepted, exactly seven members

```
window.__COLLABBOARD_E2E__ = { version, instanceId, getSceneElements, getViewport,
                               getInteractionState, getSceneRevision, subscribeToSceneChange }
```

The readiness spec asserts the **exact sorted key list**, so an eighth member is a test
failure rather than a review question. *Verified here by reading the implementation:* no
`updateScene`, no `setState`, no raw Excalidraw API, no raw application object, no raw
`AppState`, no generic state getter, no persistence, no network, no writable scene setter, no
command invocation. `hasMutationSurface` is asserted `false`.

Built on the supported `ExcalidrawImperativeAPI` only — `getSceneElements()`,
`getAppState()`, `onChange()` returning unsubscribe. **No `onChangeEmitter`, no `window.h`,
no private `App` instance, no vendored test hook, no undocumented cast** — *verified here:
zero `window.h` references remain anywhere under `e2e/` outside PATCH-124.*

**Scene snapshots:** `structuredClone` then recursive `Object.freeze` over the outer array,
each element and nested reachable structures. Live references do not escape; snapshot
mutation cannot reach the mounted scene.

**Viewport:** exactly `scrollX`, `scrollY`, `zoom.value`, `offsetLeft`, `offsetTop`,
`selectedElementIds`. Outer object, `zoom` and the cloned `selectedElementIds` all frozen. No
seventh field, no collaborators, no raw `AppState`.

**Interaction:** exactly `{ resizingElementId }`, sourced from the **public**
`AppState.resizingElement` (§19d), id only, frozen, `null` when idle. No raw element, no
pointer or UI internals.

**Revision and subscription:** deterministic initial value · monotonic increments from public
`onChange` · reads do not increment · callbacks receive a number only · listener exceptions
isolated in a `try/catch` so a test observer cannot alter application behaviour · unsubscribe
idempotent · Excalidraw subscription released on cleanup · listeners cleared on teardown ·
stale listeners do not survive instance replacement.

**Instance ownership:** `crypto.randomUUID()`, carrying no user or board information. Cleanup
deletes the global **only when it still owns it**, so a late cleanup cannot remove a newer
bridge. Reload and board navigation produce new IDs, both asserted. Simultaneous ownership
**throws an E2E-only diagnostic** — §17j required ambiguity to be a failure, and it is; the
incumbent bridge survives and no silent overwrite occurs.

### 21i. `DrawingLayout.tsx` — accepted

One invariant import, one registration effect keyed on `excalidrawAPI`, returning the
cleanup. No environment branch, no feature behaviour change. **3514 → 3519 (+5)** — *verified
here* — well inside the ≤ +20 limit.

### 21j. The four migrations — accepted

**PATCH-128.** Scene reads, viewport reads, interaction state and change observation all move
to the bridge. The resize-handle assertion survives **in position**: after southeast-handle
hover, inside the pointerdown capture / `requestAnimationFrame` sequence, after `mouse.down()`,
**before movement and before pointerup**, against the same embeddable ID. §19b's negative-
control property — that the later dimension poll cannot pass via a drag, a stray tool or a
coincidental sync — is intact. This was the single most likely thing to be quietly lost, and
it was not.

**PATCH-129** — readiness and scene observation only; transport-only.
**PATCH-130** — scene observations plus all six viewport fields; assertion semantics preserved.
**PATCH-132** — scene observations, governed viewport fields, `selectedElementIds` retained as
a scene-level assertion. **No DOM/CSS substitution** — §17i explicitly refused that
simplification and the refusal held.

Across all four: fixtures, viewports, real UI actions, expectations, negative controls and
meaningful timing unchanged · no direct commands · no skips · no dev-server fallback · no
`window.h`.

### 21k. PATCH-124

**Byte-identical** — *verified here*: `git diff b37bc46 b421e04 --` on the spec returns **0
lines**. Excluded because it still performs private scene mutation via `app.updateScene`,
governed separately by **PATCH-137**, which remains blocked on its feasibility spike.

### 21l. Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** — *re-executed by the CTO* |
| Bridge exclusion, 891 files | **exit 0, zero hits** — *re-executed by the CTO* |
| Ordinary production build | passed |
| E2E production build | passed |
| E2E exclusion negative control | failed as expected |
| PATCH-136 readiness spec | 4 passed |
| Four migrated specs, one worker | 11 passed |
| PATCH-136 + PATCH-128 focused repeat | 11 passed |
| PATCH-128 Gate D alone | passed |
| `git diff --check` | passed |
| PATCH-124 byte identity | passed — *verified here* |
| Playwright artifacts / ports 3000–3003, 3100 | clean |
| Final `.next` | ordinary, no E2E marker — *verified here* |

### 21m. Non-blocking observations

**1 — Contention (from review).** PATCH-128 Gate D timed out once in a two-worker combined
run, at the test level. Gate D uses neither the bridge subscription nor the interaction
projection; it passed alone, in the full serial run and in focused repeat, and the React-fiber
instrumentation is unchanged. **ORDINARY RESOURCE/TEST CONTENTION · NOT A PATCH-136 BRIDGE
REGRESSION.** **Do not claim unrestricted parallel stability** — it has not been demonstrated
and this closure does not assert it.

**2 — Gate G instrumentation narrowed (CTO finding, not in the review).** Gate G previously
derived a *content* revision (`JSON.stringify` of id/version/versionNonce/x/y/w/h/frameId/
updated) and compared consecutive values to detect redundant `onChange` emissions carrying
identical content. It now consumes the bridge's **monotonic counter**, which by construction
never repeats. Therefore `unchangedRevisionOnChangeCalls` is now **structurally unreachable**
and `sceneVersionChanges` is now just `totalExcalidrawOnChangeCalls − 1`.

**Not a false green:** both counters are recorded but **never asserted** — the only Gate G
onChange assertion is `totalExcalidrawOnChangeCalls > settledSetElementsCalls`, which the
counter satisfies identically. *Verified here by grep across the full spec.* The risk is
prospective: the two counters are now misleading dead instrumentation, and a future assertion
written against `unchangedRevisionOnChangeCalls` would be **vacuously satisfied**. Follow-up
for PATCH-137's spec pass: delete both counters, or restore content-revision derivation from
`getSceneElements()` — do not leave them as decoration.

**3 — `build:e2e` is Windows-`cmd` only (CTO finding).** The script is
`set E2E_BRIDGE_BUILD=1&& next build`. On POSIX or CI this does **not** set the variable, so
it produces an **ordinary** build under an E2E-looking name. It fails **safe**: the artifact
gets the no-op, the marker file is absent, and every spec fails loudly at `waitForE2EBridge`.
That is §20d's fail-toward-exclusion property behaving exactly as designed on the first
unplanned occasion — worth recording as evidence the architecture choice was right. Before any
CI use, replace with `cross-env` or a small node runner.

**4 — A fifth `next.config.ts` block (CTO finding).** §20i enumerated four authorized
additions; the implementation added a webpack `done`-hook plugin that writes
`.next/E2E_BRIDGE_BUILD` on E2E builds and **removes it on ordinary builds**. **Accepted.** It
implements the pre-existing §17h.6 marker requirement, writes only inside `.next` (never
source — §20d's option-D rejection is not engaged), and the removal branch closes a stale-
marker gap the manual procedure had. Style note: it uses `apply(compiler: any)`.

**5 — Exclusion script reads every scanned file as UTF-8**, including binary assets under
`static/media`. Harmless and wasteful only.

**6 — Governance wording correction.** §20e stated `DrawingLayout.tsx` had zero pre-existing
`@/` imports. **That was wrong** — the file uses `@/` imports throughout, and the new import
correctly follows that convention. Root cause: the CTO's check was `grep 'from "@/'` with
**double quotes** while the file uses single quotes. This is the same failure class as §17a
and §18b — a pattern that cannot see the form the code actually takes, reported as absence.

The security conclusion is **unaffected**: the alias key is an absolute resolved path
precisely *because* request-string keys are unreliable here (§20f test 9), so the specifier
style at the import site is irrelevant to the rule. **Governance wording correction, not an
implementation defect.**

### 21n. Status

**PATCH-136: CLOSED · STALE BUILD CACHE ROOT CAUSE IDENTIFIED · ORDINARY PRODUCTION ARTIFACT
EXCLUDES E2E BRIDGE · E2E ARTIFACT SELECTS OBSERVATION BRIDGE BY EXACT BUILD-TIME ALIAS ·
CACHE MODE ISOLATION IMPLEMENTED · OBSERVATION-ONLY API IMPLEMENTED · FOUR CLOSED SPECS
MIGRATED · PATCH-124 DEFERRED TO PATCH-137 · INDEPENDENT REVIEW PASSED WITH NON-BLOCKING
OBSERVATIONS · NOT PUSHED.**

### 21o. Recorded diagnostic notes

- **Three hard stops, three governance defects, zero bad code merged.** Every stop was an
  implementer refusing to proceed against a specification the CTO had got wrong: a census
  blind to aliasing (§18), a census that asked the narrow question (§19), and an exclusion
  mechanism that confused runtime gating with graph membership (§20). The stops are the
  control that worked.
- **Write the falsifier into the test, not the intent.** §17k's bundle-grep requirement caught
  §17g's wrong premise; the readiness spec now asserts the *absence* of the failing alias
  form, so §20f test 9 cannot be re-learned the hard way.
- **Grep-shaped questions keep producing false absences here** — quote style this time, alias
  binding and question scope before. Fourth occurrence. Absence claims in this repository
  must come from reading the affected file or from a form-independent method; a pattern that
  finds nothing has proven nothing.
- **Fail-safe direction is worth more than rule elegance**, and it paid out immediately: a
  platform-specific npm script silently produced an ordinary build, and because exclusion is
  the default the result was a loud test failure rather than a shipped bridge.
