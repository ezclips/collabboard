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
