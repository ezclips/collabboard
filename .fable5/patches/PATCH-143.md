# PATCH-143 — VENDORED EXCALIDRAW TYPE DECLARATIONS MISSING FROM `dist`

**Status:** governance and diagnosis. **No implementation.**
**Authored:** 2026-08-03 (CTO). **Base:** `23a91bb`.
**Blocks:** PATCH-142 production validation (typecheck / `next build`) — and nothing else.

## 1. The reported defect, and why the classification is wrong

The prerequisite was raised as a *pre-existing DrawingEditor API mismatch*: `exportToSvg` at
`components/collabboard/editors/DrawingEditor.tsx:122` missing five required `ExportOpts`
fields, to be repaired by supplying them explicitly.

**That diagnosis is incorrect, and the repair it implies would have been harmful.** The call
site is valid. Nothing in `DrawingEditor.tsx` needs to change.

**Actual root cause: the vendored Excalidraw package has no type declarations on disk.** With no
`.d.ts`, TypeScript infers the package's API from its compiled JavaScript bundle, and every
destructured parameter loses its optionality. The five "missing required fields" are an
artefact of that inference.

## 2. Proof

**`npx tsc --noEmit` at `23a91bb` reports four errors, not one:**

```
components/collabboard/editors/DrawingEditor.tsx(122,47)          TS2345  missing exportPadding, renderEmbeddables, exportingFrame, skipInliningFonts, reuseImages
components/presentation/slide-renderer/renderExcalidrawSlideBase.ts(27,25) TS2345  missing maxWidthOrHeight
lib/e2e/bridgeContract.ts(1,46)                                   TS2307  Cannot find module '@excalidraw/excalidraw/types'
lib/e2e/bridgeRegistration.e2e.ts(57,71)                          TS7006  Parameter 'el' implicitly has an 'any' type
```

Three observations settle it:

1. **Error 3 cannot be repaired at any call site.** "Cannot find module `@excalidraw/excalidraw/types`" is a package resolution failure. Editing `DrawingEditor.tsx` cannot touch it. Its presence alone proves the fault is package-level.
2. **The reported error text is full of inference garbage** — `reuseImages: any`, `maxWidthOrHeight: any`, `currentItemBackgroundColor: ExcalidrawElement`, "79 more". Hand-written declarations do not look like this; types inferred from JavaScript do.
3. **The source signature marks every one of those fields optional** (`packages/utils/src/export.ts:166-179`):

```ts
export const exportToSvg = async ({ … }: Omit<ExportOpts, "getDimensions"> & {
  exportPadding?: number;
  renderEmbeddables?: boolean;
  skipInliningFonts?: true;
  reuseImages?: boolean;
}): Promise<SVGSVGElement>
```

plus `exportingFrame?: ExcalidrawFrameLikeElement | null`, `appState?: Partial<…>` and
`maxWidthOrHeight?: number` in `ExportOpts` (`:28-38`). **Against the real type, both call sites
are already correct.**

### 2a. The missing artefact

`package.json:43` resolves the package by file link:

```
"@excalidraw/excalidraw": "file:components/collabboard/canvas/excalidraw_fork/packages/excalidraw"
```

That package declares `"types": "./dist/types/excalidraw/index.d.ts"` and exports
`"./*": { "types": "./dist/types/excalidraw/*.d.ts" }`.

**`dist/` currently contains only `dev/` and `prod/`. `dist/types/` does not exist.**

The fork's own build script explains exactly how that state arises
(`packages/excalidraw/package.json`):

```
"gen:types":  "rimraf types && tsc"                                        // outDir ./dist/types
"build:esm":  "rimraf dist && node ../../scripts/buildPackage.js && yarn gen:types"
```

`build:esm` deletes `dist`, writes the JS bundles, **then** generates declarations. A run that
stops after `buildPackage.js` leaves precisely the observed state: `dev/` and `prod/` present,
`types/` absent. `dist` is **gitignored** (`excalidraw_fork/.gitignore:16`), so it is a build
artefact and nothing in git records the difference.

### 2b. Direct confirmation

Regenerating declarations only — `npx tsc -p tsconfig.json --emitDeclarationOnly --declaration`
inside `packages/excalidraw` — recreated `dist/types/{common,element,excalidraw,math,utils}`.
Immediately afterwards, with **no source file changed anywhere in the repository**:

```
npx tsc --noEmit   →   exit 0, zero errors
```

**All four errors, including the DrawingEditor one, disappeared without touching a single line
of application code.** The call site was never defective.

(The declaration build surfaced two pre-existing errors inside the fork's own
`components/SearchMenu.tsx:396,398` — `'focusIndex' is possibly 'null'`. They did not prevent
emit and are recorded here only so a future run is not surprised by them. **Not in scope.**)

## 3. Revision matrix — the evidence proves the opposite of the claim

The prerequisite reported the error at `c852d95`, `19ed55d`, `f9032ce`, `1fe6221` and `23a91bb`,
with **no relevant diff** in `DrawingEditor.tsx`, the fork, `package.json`, `package-lock.json`,
`tsconfig.json` or `next.config.ts`.

Those two facts together are the refutation, not the confirmation:

- **`npx tsc --noEmit` was run at `c852d95` during PATCH-136 closure and returned exit 0** (PATCH-136 §21l, re-executed by the CTO). At that commit `lib/e2e/bridgeContract.ts` already imported `@excalidraw/excalidraw/types`, which **cannot resolve without `dist/types`**. The declarations existed then.
- A failure that reproduces at a revision where the same command previously passed, with no diff in between, **is not a property of the source tree.** The changed variable is not in git — and `dist/` is exactly that: gitignored, rebuilt today (directory timestamps 13:17–13:20).

This is the same failure class as PATCH-136 §16a (stale `.next` webpack cache): a build artefact
misreported as a code defect. **Second occurrence in this patch series.**

## 4. Intended DrawingEditor export behaviour — recorded, unchanged

Preserved for the record, and because it demonstrates that no value needs choosing.

**Caller:** `handleSaveAndClose` in `DrawingEditor.tsx`. **User action:** saving and closing the
drawing editor modal. **Exports:** the entire current scene — `elementsRef.current`, filtered to
`!isDeleted` by `handleChange`. **Destination:** serialised via `XMLSerializer`, base64-encoded
into a `data:image/svg+xml` string, returned as `previewUrl` on the saved drawing post — a card
thumbnail, never a user download. **Background:** forced white, `exportBackground: true`,
`exportWithDarkMode: false`. **Files/images:** `filesRef.current` passed through. **Frame:** none
— whole-scene export, no frame concept in this editor. **Padding/dimensions:** whatever the
library default produces; the product has never specified one.

**Values for the five options: none are supplied, and none should be.** Every one is optional in
source, and omitting them preserves today's shipped behaviour exactly. Supplying explicit values
would change `exportPadding`, embeddable rendering, font inlining or image reuse against a
degraded inferred type — the precise false-green the prerequisite forbids ("required fields
filled with arbitrary values", "export behaviour changes without evidence"). **Not authorized.**

## 5. Call-site census

| Site | Call | Status |
|---|---|---|
| `components/collabboard/editors/DrawingEditor.tsx:122` | `exportToSvg({ elements, appState, files })` | **Valid.** No change |
| `components/presentation/slide-renderer/renderExcalidrawSlideBase.ts:27` | `exportToCanvas({ …, exportingFrame, getDimensions, exportPadding })` | **Valid.** No change. Omits optional `maxWidthOrHeight` |

Both were reported as errors; both are correct against the real declarations; both compile once
`dist/types` exists. No other `exportToSvg` / `exportToCanvas` / `exportToBlob` application call
site requires attention, and **no call site is authorized for modification**.

## 6. Authorized repair

**Zero application source change.** The repair is to restore the artefact and prevent the state
from recurring silently.

1. **Regenerate the declarations** as part of dependency setup: run the package's full
   `build:esm` (or `gen:types`) so `dist/types` is produced whenever the fork's JS bundles are.
2. **Add a guard** so a partial build fails loudly instead of degrading every type in the
   repository: a preflight check that `dist/types/excalidraw/index.d.ts` exists, wired into
   `npm run typecheck` / `verify`, failing with an explicit message naming the fix command.
3. **Document it** in `.fable5/docs/TESTING.md` alongside the §16e clean-build procedure, as a
   second instance of the same class.

Explicitly **not** authorized: editing `DrawingEditor.tsx` · editing
`renderExcalidrawSlideBase.ts` · any file under `excalidraw_fork/packages/**` source · any
`package.json`, `package-lock.json`, `tsconfig.json` or `next.config.ts` change ·
`typescript.ignoreBuildErrors` · `as any`, `@ts-ignore`, `@ts-expect-error`, `Partial<…>` casts
or wrapper functions hiding the signature · committing `dist` (it is gitignored and must stay
so).

**Environment note, stated plainly:** the declarations were regenerated during this diagnosis
(§2b) to prove the root cause, so the working environment currently typechecks clean. That was
repair of a gitignored build artefact, not implementation — no tracked file changed, and
`git status` is unchanged. The guard in item 2 is what makes the fix durable; without it the
next partial build reproduces this.

## 7. Allowlists

**Production: none.** No application source file requires modification.

**Tooling — at most 2:**

| File | Change | Limit |
|---|---|---|
| `scripts/` — one new preflight check | Assert `dist/types/excalidraw/index.d.ts` exists; exit non-zero with the fix command | **≤40 lines** |
| `package.json` | Wire the check into `typecheck` / `verify`. **No dependency change** | **≤2 changed lines** |

**Test: none authorized.** The prerequisite's twelve proposed cases all test `exportToSvg`
behaviour that **is not changing**. Writing them would assert current behaviour against a call
site nobody is touching, which is characterization work with no defect behind it. If SVG export
deserves coverage, that is its own patch with its own justification.

**Docs:** `.fable5/docs/TESTING.md`, in the implementation commit.

## 8. Validation plan

`npx tsc --noEmit` → exit 0 **from a state where `dist/types` was absent**, after running the
documented regeneration · the preflight check fails correctly when `dist/types` is removed, with
the intended message (induced-failure proof) · a clean `next build` from a removed `.next`
(PATCH-136 §16e), verified by exit code, never by a pipe (§16e.5) · `git status` shows no new
tracked file beyond the two tooling entries · `dist` remains untracked.

**Build success must not be claimed from a stale `.next`** — the standing rule, and doubly
relevant in a patch about stale artefacts.

## 9. PATCH-142 dependency

**This patch blocks only PATCH-142's production validation.** It touches no logic in any patch.

`1fe6221` (slide-local ordinal) and `23a91bb` (overlay readiness) **remain valid and untouched**;
neither introduced these errors and neither is implicated. PATCH-142 resumes from a HEAD
containing `1fe6221`, `23a91bb` and this repair, and proceeds to its Phase 3 characterization
and performance proof.

**PATCH-142** remains **OPEN · SLIDE-LOCAL ORDINAL REPAIR AUTHORIZED · THUMBNAIL RENDER-HOST
READINESS CONTRACT AUTHORIZED · PHASES 1–2 IMPLEMENTED · VALIDATION BLOCKED UNTIL PATCH-143
CLOSES.** **PATCH-137** remains **OPEN · MIGRATION BLOCKED BY PATCH-142.**

## 10. Hard stops — evaluated

| Stop | Result |
|---|---|
| The intended old behaviour cannot be determined | **NOT TRIGGERED** — §4; and it is preserved by changing nothing |
| The correct `exportingFrame` value depends on unavailable state | **NOT TRIGGERED** — no value is supplied; the field is optional |
| Embeddable rendering semantics are ambiguous | **NOT TRIGGERED** — semantics are untouched |
| **Fixing the call requires changes inside Excalidraw** | **TRIGGERED, AND RESOLVED IN THE ARTEFACT LAYER** — the fault is inside the vendored package, but in its **generated `dist` output**, not its source. No fork source file changes |
| More than the narrow allowlist is required | **NOT TRIGGERED** — zero production files, two tooling entries |

## 11. Status

**OPEN · REPORTED DRAWINGEDITOR API MISMATCH REFUTED · ROOT CAUSE: VENDORED PACKAGE TYPE
DECLARATIONS ABSENT FROM `dist` · ZERO APPLICATION SOURCE CHANGE AUTHORIZED · REGENERATION PLUS
PREFLIGHT GUARD AUTHORIZED · PATCH-142 VALIDATION BLOCKED UNTIL CLOSED · NOT PUSHED.**

## 12. Recorded diagnostic notes

- **Count the errors before accepting the diagnosis.** The report named one; the compiler emitted four. The three unnamed ones — especially a module-not-found that no call site can cause — pointed straight at the real layer.
- **Inferred types announce themselves.** `reuseImages: any`, `maxWidthOrHeight: any`, "79 more" and a colour field typed `ExcalidrawElement` are not declarations anyone wrote. When a library's parameter type suddenly demands every field, ask whether it still has a `.d.ts`.
- **"Reproduces at every revision with no diff between them" is a proof of environment, not of source.** The revision matrix offered as confirmation was the strongest evidence against the conclusion it was offered for.
- **A partial build is worse than a failed one.** `rimraf dist && bundle && gen:types` degrades an entire repository's type safety if it stops two thirds of the way through, and says nothing. Any build that publishes an interface in two steps needs a completeness check on the artefact.
- **Second stale-artefact misdiagnosis in this series** (PATCH-136 §16a was the first). The recurring tell is a failure that survives `git checkout` of every candidate revision.
