# PATCH-127 — Remove browser `padlet://` hover labels from internal canvas links

**Status:** OPEN · **AUTHORIZED FOR DIAGNOSIS ONLY** · IMPLEMENTATION BLOCKED
ON OWNER DECISION (§6)
**Base commit:** `3ea20ec` (PATCH-125 closure)
**Authored:** 2026-07-30, CTO
**Model assignment:** GPT-5.5 implements once §6 is decided. Independent
reviewer reviews. The authoring CTO neither implements nor reviews.

---

## 0. Numbering conflict — resolved

The request named this PATCH-126. **PATCH-126 is already DESIGNATED** in
authoritative governance: `PATCH-125.md` §3d, §12 and §13m assign it to
reaction-semantics unification (Note dedup-append vs Todo/Link toggle vs
append). That designation is load-bearing — PATCH-125's closure points readers
at PATCH-126 for behaviour it deliberately did not change.

**This patch is therefore PATCH-127.** PATCH-126 remains DESIGNATED,
UNAUTHORED, UNAUTHORIZED and reserved for reaction semantics.

---

## 1. The defect

Hovering part of the canvas causes Chrome to display its native link-destination
label, e.g. `padlet://bedf3ed2-9e01-4b31-a45f-b1368b2efa1b`. The owner wants it
never to appear again.

---

## 2. Census — complete, from source at `3ea20ec`

### 2a. `padlet://` is NOT an app anchor. It is an Excalidraw element property.

**The single most important census result: the application renders zero
`<a href="padlet://…">` elements.** A repository-wide search for `href=` bound
to `padlet://` or to `element.link` returns exactly **one** hit, and it is
inside a vendored Excalidraw fork (§2d), not in application code.

`padlet://<id>` is the value of the **`link` property on Excalidraw
`embeddable` elements**. It is an **identity marker binding an embeddable to a
padlet row** — not a user-facing navigation target.

### 2b. Producers — where `padlet://` values are created

```
DrawingLayout.tsx:1803    link: `padlet://${padlet.id}`      PRIMARY writer (embeddable creation)
DrawingLayout.tsx:1814    const link = `padlet://${padlet.id}`
DrawingLayout.tsx:1267    re-bind orphaned embeddable to a new padlet
DrawingLayout.tsx:1625    clonedLinkByElementId — deep-clone re-linking
DrawingLayout.tsx:1841-42 activePadletLinks / padletsByLink lookup maps
```

### 2c. Consumers — where `padlet://` values are read

**Single authoritative parser:** `extractPadletIdFromEmbeddableLink`
(`lib/infra/drawing/importScene.ts:63`), consumed by
`lib/infra/drawing/bridge.ts:2,92`. PATCH-064 §266 explicitly forbade a second
parser; that rule still holds.

**Direct string handling outside the helper:**

```
DrawingLayout.tsx        :389 :531 :537 :1183-84 :1203 :1220 :1575 :1579
                         :1857 :1864 :1887 :1979 :2012 :2067-68 :3060
useCanvasActions.ts      :141   membership/dedup comparison
ExcalidrawWrapper.tsx    :110   validateEmbeddable predicate
CanvasClient.tsx         :5176  container lookup
resolveSlidePadlets.ts   :20 :23   presentation slide resolution
planSlideComposition.ts  :14       presentation composition
```

Plus **~12 e2e characterization specs** that assert on `padlet://` identity
(`drawing-presentation`, `drawing-duplicate-deep-clone`,
`drawing-slide-frame-membership`, `drawing-slide-duplication`,
`presentation-snapshot-*`, `drawingBridgeHarness.ts`, and others).

**Prior governance depends on this format:** PATCH-062 (RC-1 duplicate-link
detection), PATCH-064 (§266 target identity), PATCH-065.

### 2d. The element producing the browser label — third party

```
node_modules/@excalidraw/excalidraw   Hyperlink component
  <a href={normalizeLink(element.link)}
     className="excalidraw-hyperlinkContainer-link"
     target={isLocalLink(element.link) ? "_self" : "_blank"}>
```

Confirmed present in the shipped bundle
(`dist/dev/index.js`, class `excalidraw-hyperlinkContainer-link`) and mirrored
in the in-repo fork at
`components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/hyperlink/Hyperlink.tsx:288`.

Excalidraw shows this hyperlink popup when an element carrying a `link` is
hovered or selected. Moving the pointer onto the popup's anchor is what makes
Chrome paint the black `padlet://…` status label.

**The fork is NOT the running code.** It is excluded from `tsconfig.json`
(lines 30, 54–60) and imported by no application file;
`ExcalidrawWrapper.tsx` imports `@excalidraw/excalidraw`. The fork is
reference source only.

### 2e. Target classification (requested item 5)

`padlet://<id>` is **none of** "internal post navigation", "canvas deep link"
or "copied link". It is **embeddable↔padlet identity binding**, used for:
container membership, duplicate detection, deep-clone re-linking, presentation
slide resolution, and orphan re-binding.

**There is no in-app "Copy link" producing `padlet://`** — the census found no
clipboard writer for the scheme. Requested test 12 is therefore vacuous as
written and is restated in §8.

---

## 3. The load-bearing finding

**The owner's preferred implementation cannot be applied.** "Replace the
anchor with `<button type=\"button\">` and route through the existing internal
navigation handler" presumes the application renders the anchor. **It does
not.** The anchor lives in `node_modules`, which is not editable, not in any
allowlist, and not a legitimate patch target.

Equally, there is **no existing internal navigation handler to route through**
— clicking the link popup is Excalidraw's own behaviour, not an app feature.
Nothing in the product depends on the user clicking that anchor.

This is stated before any authorization because a patch written against the
assumed shape would have produced a plausible-looking change that fixes
nothing.

---

## 4. Prohibited approaches — reaffirmed

CSS hiding, `pointer-events: none`, clearing `href` on hover, `javascript:`
hrefs, empty `href`, blanket status-UI suppression, and breaking external
links are all **prohibited**, exactly as instructed. They are also, in this
case, the only *cheap* options — which is precisely why the prohibition
matters. **Editing `node_modules` is likewise prohibited** and would not
survive a reinstall.

---

## 5. Strategies

**A — Stop writing `link` entirely.** Removes the anchor at source. **Rejected:**
it destroys the identity used by ~20 app sites, 12 e2e specs and three prior
patches. Membership, dedup, cloning and presentation resolution all break.

**B — Move identity to `customData`, leave `link` unset. RECOMMENDED.**
Write `customData.padletId` at the five §2b producers; extend
`extractPadletIdFromEmbeddableLink` to read `customData.padletId` **first** and
fall back to the legacy `link` string. Excalidraw renders no hyperlink popup
for an element with no `link`, so **the anchor never exists** and the label
cannot appear. External `https://` embeddables keep their `link` and behave
normally.
*Cost:* touches the element shape. **No migration is required** — the dual-read
fallback keeps every existing board working, which satisfies test 13 in
substance.

**C — Suppress the hyperlink popup through a supported Excalidraw prop.**
No such prop exists in the installed version. `onLinkOpen` intercepts *clicks*,
not hover or `href`. **Not currently viable**; the implementer must re-verify
against the installed version before B is chosen.

**D — Adopt the in-repo fork as the build source and change its `Hyperlink`.**
Technically possible — the fork already contains the component. **Rejected as
disproportionate:** switching the build to an unbuilt, tsconfig-excluded fork
is a far larger and riskier change than the defect warrants.

---

## 6. HARD STOP — owner decision required before implementation

**Strategy B changes what is stored on canvas elements.** The instruction said
*"Do not remove the stored internal-link format unless necessary"* and *"Prefer
changing only the rendering and interaction layer."*

**§2d and §3 establish that the rendering layer is third-party and
unreachable.** So the preferred path is unavailable, and the only compliant fix
that actually removes the anchor is a stored-shape change.

**Implementation is NOT authorized until the owner rules:**

- **B1 — Authorize Strategy B** (recommended). Accept `customData.padletId` as
  the new identity with legacy `link` dual-read and no migration.
- **B2 — Re-verify C first.** Authorize a time-boxed check of the installed
  Excalidraw for any supported suppression API; fall back to B if none.
- **B3 — Accept the label.** Take no action; record as permanent debt.

Only §7's diagnostic scope is authorized now.

---

## 7. Scope

**Authorized now — diagnosis only:** this document. **No production file is
authorized for edit in this turn.**

**Conditionally authorized, on B1/B2 only:**

```
components/collabboard/canvas/layouts/DrawingLayout.tsx     producers + readers
lib/infra/drawing/importScene.ts                            dual-read parser
lib/infra/drawing/bridge.ts                                 only if the helper's shape changes
components/collabboard/canvas/hooks/useCanvasActions.ts     :141 comparison
components/collabboard/editors/ExcalidrawWrapper.tsx        :110 predicate
components/presentation/slide-renderer/resolveSlidePadlets.ts
components/presentation/slide-renderer/planSlideComposition.ts
app/dashboard/canvas/[id]/CanvasClient.tsx                  :5176 comparison
```

**Maximum 8 production files**, and fewer if the dual-read helper absorbs the
change — **prefer routing every reader through
`extractPadletIdFromEmbeddableLink` over editing eight call sites.** PATCH-064
§266's single-parser rule makes that the intended shape.

**Tests:** `lib/infra/drawing/importScene.test.ts` (extend),
`e2e/characterization/patch-127-internal-link-no-anchor.spec.ts` (new), plus
inversion of any existing spec that asserts `link === 'padlet://…'` **where the
element is app-owned** — inverted, never deleted.

**Prohibited:** reaction picker code, caption code, slide-thumbnail code,
schema, repositories, RLS, `package.json`, `package-lock.json`,
`node_modules`, the `excalidraw_fork` tree, and all canvas ownership/rendering
code not listed above.

**Protected — never staged, never modified:** `.gitignore`, the three
`app/api/ai/*` routes, `scripts/live-access-login.mjs`. `.env.local` untouched.

**PATCH-115's presentation-invalidation boundary still stands**;
`getSlideRenderSignature.ts` remains prohibited.

---

## 8. Required tests — bind

1. Census: every `padlet://` producer and consumer is enumerated and pinned.
2. App-owned internal targets render **no anchor with an `href`**.
3. **No rendered `href` begins with `padlet://`** — asserted over the live DOM.
4. Hovering an app-owned embeddable exposes **no `a[href]`** — see §9 on why
   this, not the status bar, is the load-bearing assertion.
5. Mouse click performs the same selection/action as before.
6. Enter activation behaves as before.
7. Space activation behaves as before **where button semantics apply**.
8. Dragging does not activate the target.
9. Selection and context-menu behaviour intact.
10. External `https://` embeddables **still render as anchors**.
11. External links preserve `target`/`rel`.
12. **Restated (§2e):** no in-app copy-link emits `padlet://`, so the binding
    assertion is that **stored `padlet://` values on existing boards still
    resolve** through the dual-read parser.
13. **No stored-metadata migration is introduced** — legacy `link`-only
    elements resolve unchanged.
14. No schema, repository or RLS change.
15. **No blanket anchor removal elsewhere** — external anchors, comment links
    and UI links are untouched.
16. Presentation slide resolution, membership, dedup and deep-clone re-linking
    still work under the new identity.

**Induced-failure proof:** reverting the dual-read fallback must fail test 12;
restoring `link: padlet://…` on a new embeddable must fail test 3.

---

## 9. Playwright

Open a board containing an app-owned embeddable; hover the exact element;
assert **no `a[href^="padlet://"]` and no
`a.excalidraw-hyperlinkContainer-link`** anywhere in the DOM; click it and
verify the intended selection; activate by keyboard; and verify an external
URL still renders and behaves as a normal anchor.

**The browser status bar is not queryable from Playwright.** The load-bearing
assertion is therefore the **absence of the anchor**, which is the *cause* of
the label — a stronger and more durable assertion than any screenshot.
Screenshots may corroborate only.

**Credentials:** via `E2E_EMAIL`/`E2E_PASSWORD` or
`LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD` only. Never printed, logged, echoed
or committed. Storage state to a scratch path outside the repo, deleted after
use. Identities reported as **user ids only — never an email, never a token,
never cookies.**

---

## 10. Console violation — classified **A EXCLUDED, B/C indeterminate**

`[Violation] Permissions policy violation: unload is not allowed in this
document`.

- **A (caused by the internal link implementation) is EXCLUDED on source
  evidence.** No `unload`, `onunload` or `beforeunload` registration exists
  anywhere in `components/`, `app/` or `lib/`. The only matches are TypeScript
  DOM type declarations inside the fork's own bundled `node_modules`, which are
  type definitions and never execute.
- Between **B (third-party library/framework)** and **C (unrelated and
  pre-existing)** the evidence is **indeterminate** without a runtime stack
  trace, which was not taken.

`unload` is disallowed by default Permissions Policy in current Chrome, and the
warning is emitted by whichever bundled dependency still registers the handler.

**Ruled: out of scope for PATCH-127.** It is recorded as **separate technical
debt** and must not widen this patch. It has no causal relationship to the
`padlet://` label — that label is fully explained by §2d.

---

## 11. Bound commit message (exact, once §6 is decided)

```
fix(canvas): stop rendering internal padlet links as browser anchors (PATCH-127)
```

---

## 12. Next instruction (bind)

> **Do not implement. §6 requires an owner decision first.**
>
> On **B1**: move embeddable identity to `customData.padletId`, extend
> `extractPadletIdFromEmbeddableLink` to prefer it and fall back to the legacy
> `link`, and stop writing `link` for app-owned embeddables. Do not migrate
> stored data. Do not add a second parser. Do not touch `node_modules` or the
> `excalidraw_fork` tree. Keep external `https://` embeddables on `link`.
>
> On **B2**: time-box a re-check of the installed Excalidraw for a supported
> hyperlink-suppression API, report findings, and stop.
>
> Leave any candidate uncommitted and unstaged for independent review.

---

## 13. Status

**PATCH-127: OPEN · DIAGNOSIS AUTHORIZED · IMPLEMENTATION BLOCKED ON §6.**
Conditional production allowlist **8 max**; tests 2 plus inversions.
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED** — reaction-semantics
unification; **not** this patch (§0).
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt:** the `unload` permissions-policy warning (§10); the
tsconfig-excluded `excalidraw_fork` tree carrying a divergent copy of a
third-party component; `padlet://` string handling spread across ~20 call sites
despite PATCH-064's single-parser rule; plus the PATCH-123 §14k, PATCH-124 §14l
and PATCH-125 §13l ledgers and the unresolved production-build failure.

---

## 14. Amendment — Strategy B1 AUTHORIZED (2026-07-30, owner decision)

### 14a. Decision

**The owner selected B1.** `customData.padletId` becomes the canonical identity
for app-owned Excalidraw embeddable elements, with **dual-read** backward
compatibility for legacy `padlet://` links.

§6's hard stop is **resolved and lifted**. Implementation is authorized.

Reaffirmed as prohibited: patching `node_modules`, adopting `excalidraw_fork`,
CSS hiding, `pointer-events`, empty `href`, `javascript:` URLs, and hover-time
link mutation.

### 14b. B1 fits the existing convention — confirmed from source

The primary writer **already builds a `customData` object**
(`DrawingLayout.tsx:1805`) carrying `renderSignature`, and the re-link path
already spreads to preserve unrelated fields
(`:1957-1958`, `...(el.customData ?? {})`). **`customData.padletId` is an
additive field on a structure that already exists** — not a new element shape.

**Binding caution:** `customData.renderSignature` is load-bearing for
presentation invalidation and is owned by **PATCH-115, which remains OPEN**.
Adding `padletId` must **not** perturb how `renderSignature` is computed,
stored or compared. If adding the field changes any slide render signature,
that is a **hard stop** — see §14i.

### 14c. Writer contract — bind

For every app-owned embeddable **creation, clone, orphan re-bind and re-link**
path (§2b: `DrawingLayout.tsx:1803`, `:1814`, `:1267`, `:1625`, and the
`:1841-42` lookup construction):

1. **Write `customData.padletId = <padlet id>`.**
2. **Do not write `element.link = "padlet://<id>"`.**
3. **Preserve unrelated existing `customData` fields** — always spread, never
   replace. `renderSignature` in particular must survive untouched.
4. **Do not clear legitimate external links** on non-padlet elements. An
   embeddable whose `link` is `https://…` keeps it.
5. **Only app-owned padlet embeddables are affected.**

### 14d. Reader contract — bind

**Resolution order, exactly:**

1. `element.customData?.padletId`
2. legacy `element.link` matching `padlet://<id>`
3. `null`

**The `customData` value must be validated before it is returned.** Accept only
a non-empty trimmed `string`. Reject non-strings, empty and whitespace-only
values, and fall through to step 2 — a malformed `customData.padletId` must not
mask a working legacy link, and must never surface as an identity.

**API shape — ruled, to avoid unnecessary churn.** The current authoritative
parser takes a **link string**, not an element:

```ts
extractPadletIdFromEmbeddableLink(link: unknown)   // importScene.ts:63
```

Dual-reading requires the **element**. Ruled:

- **Keep `extractPadletIdFromEmbeddableLink` unchanged** as the legacy
  string-level parser. Its existing tests
  (`importScene.test.ts:181-185`) stay valid.
- **Add one element-level authoritative resolver** in the same module — e.g.
  `resolvePadletIdFromEmbeddable(element)` — implementing §14d's three-step
  order and delegating step 2 to the existing function.
- **This is the ONLY dual-read implementation.** PATCH-064 §266's
  single-parser rule extends to it: no second dual-read anywhere.

`bridge.ts:92`'s `getLinkedPadletId` becomes a call to the new resolver.

### 14e. Backward compatibility — bind

- Boards storing `link: "padlet://<id>"` **must continue to resolve**.
- **No database migration. No scene migration. No destructive rewrite on
  load.** Loading a legacy board must not modify it.
- A legacy embeddable **may be upgraded naturally** to `customData.padletId`
  with no `padlet://` link **only** when an authorized app path already
  rewrites it (clone, re-bind, re-link). Opportunistic upgrade outside those
  paths is **prohibited** — it would be a silent migration.

### 14f. Raw readers — consolidate, do not widen

The §2c census lists ~20 raw `padlet://` sites. **Prefer routing each through
the new resolver over duplicating dual-read logic.**

**If all raw readers cannot be safely consolidated within the §7 eight-file
maximum: STOP and report the exact remaining sites.** Do not widen scope, and
do not leave a partially-consolidated reader set undocumented.

**Do not broaden** to unrelated presentation, clone, import or ownership
behaviour. Membership, dedup, deep-clone and slide resolution must keep their
current semantics — only their *identity source* changes.

### 14g. Expected user-visible result

For newly created or rewritten app-owned padlet embeddables:

- `element.link` is **absent**;
- Excalidraw renders **no Hyperlink anchor**;
- hovering shows **no black `padlet://` status label**;
- identity, selection, rendering, cloning and slide resolution **still work**.

Legacy boards may retain `link: padlet://` in stored scene data — and once
loaded **must remain fully functional**. **The label may therefore persist on
untouched legacy elements until they are rewritten.** That is an accepted,
explicit consequence of "no migration", and it must be stated in the closure
rather than presented as a complete eradication of the label.

### 14h. Playwright — 10 bound proofs

Against a real app-owned embeddable: (1) new embeddable has
`customData.padletId`; (2) it has no `padlet://` link; (3) **no
`a[href^="padlet://"]` exists for it**; (4) the embedded post still renders;
(5) selection and interaction still work; (6) clone preserves identity through
`customData`; (7) slide/presentation resolution still finds the post; (8) a
legacy fixture with only `link: padlet://<id>` still resolves; (9) rewriting
that legacy element upgrades it without breaking identity; (10) external links
on unrelated Excalidraw elements are unchanged.

Credential and storage-state rules from §9 apply unchanged.

### 14i. Tests — extend §8

Extend `importScene.test.ts` and focused characterization to prove:
customData-first resolution; legacy-link fallback; **malformed-customData
fallback**; no `padlet://` writer remains in authorized app-owned write paths;
no rendered `padlet://` anchor for new elements; legacy scene compatibility;
clone/re-bind/deep-clone identity preservation; membership and dedup lookup
correctness; presentation resolver correctness; **no metadata or schema
migration**; external links unaffected.

**Additional, required by §14b:** adding `customData.padletId` must **not**
change any slide `renderSignature`. Assert it directly — PATCH-115 owns that
layer and remains open.

### 14j. Induced-failure proof — bind

1. Temporarily remove the `customData` reader → **new-element identity tests
   must fail**.
2. Temporarily restore one primary `padlet://` writer → **the no-anchor test
   must fail**.
3. **Restore the candidate exactly and re-run: all PASS.**

Report the restored file hashes so the proof is verifiable rather than
asserted.

### 14k. Console warning

The `unload` permissions-policy warning stays **outside PATCH-127** unless
implementation evidence establishes that the same change removes it. Recorded
as **unrelated, unclassified debt** (§10). Do not investigate further under
this patch.

### 14l. Hard stops — added to §5/§6

1. Adding `customData.padletId` changes any slide `renderSignature`.
2. Raw readers cannot be consolidated within the eight-file maximum.
3. A second dual-read implementation appears necessary.
4. Any change to schema, repositories, RLS or stored padlet metadata appears
   necessary.
5. Legacy boards cannot be made to resolve without a migration.
6. Suppressing the anchor requires touching `node_modules` or
   `excalidraw_fork`.

### 14m. Next GPT-5.5 instruction (bind)

> **Implement B1.** Write `customData.padletId` at the five §2b producers and
> stop writing `element.link` for app-owned padlet embeddables. Add exactly one
> element-level resolver next to `extractPadletIdFromEmbeddableLink`, keep that
> function unchanged for legacy string parsing, and route every raw reader
> through the new resolver.
>
> Validate `customData.padletId` as a non-empty trimmed string; fall through to
> the legacy link on anything else. Preserve `renderSignature` and every other
> `customData` field by spreading. Do not upgrade legacy elements except on
> paths that already rewrite them. No migration of any kind.
>
> Do not touch `node_modules`, `excalidraw_fork`, schema, repositories, RLS or
> package files. Keep external `https://` links intact.
>
> If the raw readers exceed the eight-file maximum, stop and report the exact
> remaining sites instead of widening scope.
>
> Deliver both §14j induced-failure proofs. Leave the candidate uncommitted and
> unstaged for independent review.

### 14n. Status

**PATCH-127: OPEN · B1 IMPLEMENTATION AUTHORIZED · NOT STARTED.**
Conditional production allowlist **8 max** (§7); tests: `importScene.test.ts`
extension, `patch-127-internal-link-no-anchor.spec.ts`, plus inversions of
existing `padlet://` assertions on app-owned elements — inverted, never
deleted.

**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED** — reaction-semantics
unification, not this patch.
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED** — it owns
`renderSignature`, which §14b and §14i protect.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 15. Amendment — B1 REJECTED BY RUNTIME EVIDENCE (2026-07-30, CTO)

### 15a. Result

**B1 was attempted and fully restored. No implementation candidate remains.**
The worktree contains only the five protected dirty paths — verified at
amendment time: `git status --porcelain` returns exactly those five, nothing
staged, one worktree, empty stash.

**Do not authorize another B1 attempt.**

### 15b. The runtime blocker — recorded as fact

The attempted candidate proved, at runtime:

- **`customData.padletId`-only app embeddables do not render.**
- **`link: null` also does not render.**
- **Legacy `link: "padlet://<id>"` embeddables continue to render.**
- **The installed Excalidraw validates and filters embeddables through
  `element.link` *before* the app's `renderEmbeddable` callback can resolve
  `customData.padletId`.**

Therefore `element.link` is not merely an identity marker — **it is a
precondition of the embeddable rendering at all.** §2a described it as "an
identity marker binding an embeddable to a padlet row, not a user-facing
navigation target." That description was **correct about intent and incomplete
about mechanism**, and the gap is exactly what B1 fell into.

**B1, as authorized in §14, is not implementable** without changing the
Excalidraw runtime or retaining a qualifying `link` value. §14 is superseded by
this section; its writer contract must not be implemented as written.

**Why the design review did not catch this.** §14b reasoned from the *shape*
of `customData` — that `renderSignature` already lived there, so `padletId`
would be additive and low-risk. That reasoning was sound about the field and
silent about the **render precondition**, which no amount of source-shape
inspection would have surfaced. The lesson is recorded plainly: **a third-party
render pipeline's preconditions must be proven by running it, not inferred from
the data it stores.** The attempt was cheap, reversible and correctly restored;
it bought the fact that four sections of reasoning could not.

### 15c. Secondary scope finding — the cap was already wrong

`lib/infra/drawing/presentationBridge.ts:262-263` contains an **additional raw
`padlet://` reader** outside the §7 eight-file allowlist:

```ts
element.link?.startsWith("padlet://") &&
!padlets.some((padlet) => `padlet://${padlet.id}` === element.link)
```

**A complete raw-reader consolidation would have exceeded the eight-file cap
even if the runtime blocker did not exist.** The §2c census missed this file;
it is recorded as a census defect, not as a scope overrun by the implementer.

### 15d. B2A — INVESTIGATED AND CLOSED: no supported API exists

Time-boxed investigation performed by the CTO against the **installed
`@excalidraw/excalidraw` 0.18.0**, reading the shipped type surface and bundle.

**Complete link-related public API in 0.18.0** (`dist/types/excalidraw/types.d.ts`):

```
:477  generateLinkForSelection?: (id, type) => string
:478  onLinkOpen?: (element, event) => void
:486  validateEmbeddable?: boolean | string[] | RegExp | RegExp[] | ((link) => boolean | undefined)
:487  renderEmbeddable?: (element, appState) => JSX.Element | null
```

Assessed one by one:

- **`onLinkOpen`** intercepts **click** only. The status label is produced by
  **hover** over an `<a href>`. It cannot help.
- **`validateEmbeddable`** decides *whether* an embeddable is valid — it is the
  very gate that made B1 fail. It does not affect hyperlink UI.
- **`renderEmbeddable`** controls the embeddable's **body**, not the hyperlink
  popup, which is rendered separately by the Hyperlink component (§2d).
- **`generateLinkForSelection`** concerns share-links for selections, unrelated.

The hyperlink popup is gated on **`appState.showHyperlinkPopup`**
(`types.d.ts:344`, `false | "info" | "editor"`) — **`AppState`, not a prop.**
It is set internally on hover and selection. Forcing it false through
`updateScene` would be **hover-time mutation**, which §14a and the owner's
constraints prohibit, and would race the component that sets it.

**Ruling: B2A is CLOSED. No supported mechanism exists in 0.18.0 to suppress
the hyperlink anchor while retaining `element.link`.** No further time-box is
authorized — the API surface is small, fully enumerated above, and exhausted.

### 15e. B2C — authorized as a CHARACTERIZATION SPIKE ONLY

**Do not assume a placeholder works. I have source-level reason to doubt it.**

The anchor renders `href={normalizeLink(element.link)}` for **any** non-empty
link. Chrome paints a destination label for **any** resolvable `href`, not only
for exotic schemes. A placeholder therefore tends to **replace** the
`padlet://…` label with a different label rather than remove it — and a
placeholder chosen to defeat that (bare `#`, empty value) lands squarely on the
prohibited list.

**Authorized: a browser characterization spike, no product change.** Its
purpose is to answer one question with evidence: *does any link value exist
that satisfies embeddable validation and produces no browser destination
label?*

It is **accepted only if characterization proves all of**: the embeddable
renders; no anchor with a navigable internal `href` appears; **no status-bar
label appears by cause — i.e. no meaningful `href`**; no `javascript:`, empty
`href`, hover-time mutation or CSS suppression; identity remains available
through `customData.padletId`; external links unaffected.

**If any one fails, B2C is rejected and the spike is discarded.** A spike that
"mostly works" is a rejection.

### 15f. B2B — the only proven-viable path, NOT yet authorized

If B2C fails, B2B is what remains. **It is not authorized by this amendment.**
Authorizing a runtime patch demands the accounting the owner required, and the
implementer must supply it **before** any code is written:

1. **Exact maintenance burden** — the patch targets a specific `Hyperlink`
   component in a specific version. Every Excalidraw upgrade requires
   re-verification, and a silently failed patch reintroduces the defect.
2. **Package/update implications** — `patch-package` requires a `postinstall`
   hook, so **`package.json` must change.** It is currently prohibited; this
   would be an explicit, narrow exception requiring owner sign-off.
3. **Build and deployment implications** — the patch must apply in CI and in
   every deployment environment, and must **fail the build loudly** if it does
   not apply. A patch that silently no-ops is worse than no patch.
4. **External-link compatibility** — proven, not assumed.
5. **Proof that only app-owned `padlet://` links lose the anchor.**
6. **Proof that normal Excalidraw external hyperlinks remain fully
   functional**, including `target`/`rel`.

**Fork adoption is rejected as the B2B variant.** §5 already rejected it as
disproportionate, and nothing since has changed that: the in-repo fork is
tsconfig-excluded, unbuilt and divergent. A targeted patch to one component is
far smaller than adopting an entire fork.

### 15g. B3 — remains available and is not a failure

If B2C fails and the owner judges B2B's maintenance burden disproportionate to
a hover label, **close PATCH-127 as blocked/accepted debt and retain
`padlet://` identity links.**

Stated plainly so the choice is honest: this is a **cosmetic browser-chrome
defect**. It leaks an internal identifier into a status bar. It does not affect
data, correctness, security or function. Weighed against a permanent
`node_modules` patch on every install, in every environment, forever — **B3 is
a legitimate and defensible outcome, not a capitulation.**

### 15h. Raw-reader cap — raised to 10, with the census corrected

The eight-file cap is **replaced by ten**, explicitly accounting for every raw
reader found:

```
1. components/collabboard/canvas/layouts/DrawingLayout.tsx
2. components/collabboard/canvas/hooks/useCanvasActions.ts
3. components/collabboard/editors/ExcalidrawWrapper.tsx
4. app/dashboard/canvas/[id]/CanvasClient.tsx
5. components/presentation/slide-renderer/resolveSlidePadlets.ts
6. components/presentation/slide-renderer/planSlideComposition.ts
7. lib/infra/drawing/presentationBridge.ts          ← MISSED BY §2c
8. lib/infra/drawing/importScene.ts                 (the parser itself)
9. lib/infra/drawing/bridge.ts                      (uses the helper; no raw literal)
10.                                                  headroom, one file
```

**The cap must never force incomplete identity handling.** If a future strategy
needs dual-read consolidation and ten is still insufficient, **stop and report
the exact remaining sites** — do not ship a partially-consolidated reader set,
and do not leave one undocumented.

`resolveSlidePadlets.ts`, `planSlideComposition.ts` and `presentationBridge.ts`
are presentation files. **PATCH-115 owns `getSlideRenderSignature.ts` only**, so
these three are not blocked by it — but they sit adjacent to an open patch and
must not be widened into.

### 15i. Test requirement — browser proof is mandatory

**Any newly authorized strategy must include a real browser test proving
both:**

1. **the app-owned embeddable still renders**, and
2. **no browser hyperlink anchor is created for its internal identity.**

**A unit-only solution is insufficient.** This is the rule B1 would have been
caught by: the blocker was a render-pipeline precondition that no unit test
could have observed. Both assertions are required together — proving the anchor
is gone while the embeddable silently stops rendering is exactly the failure
mode already seen.

### 15j. Console warning

Unchanged: the `unload` permissions-policy warning stays **outside PATCH-127**
as unrelated, unclassified debt (§10, §14k).

### 15k. Next instruction (bind)

> **Do not implement. Do not re-attempt B1.**
>
> Run the **B2C characterization spike** only: determine by real browser
> evidence whether any link value satisfies Excalidraw embeddable validation
> while producing no browser destination label. Report the exact values tried
> and the observed result for each. Change no product code and leave no
> candidate behind.
>
> If B2C fails, **stop and report** — do not proceed to B2B. B2B requires the
> §15f accounting and explicit owner authorization, including a narrow
> `package.json` exception that does not currently exist.

### 15l. Status

**PATCH-127: OPEN · B1 REJECTED BY RUNTIME EVIDENCE · STRATEGY
RECONSIDERATION REQUIRED.**
**B2A: CLOSED — no supported API (§15d).**
**B2C: CHARACTERIZATION SPIKE AUTHORIZED — implementation NOT authorized.**
**B2B: NOT AUTHORIZED — requires §15f accounting and owner sign-off.**
**B3: AVAILABLE.**
§14's B1 writer contract is **superseded** and must not be implemented.
Raw-reader cap **raised from 8 to 10** (§15h).

**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt:** the §2c census defect that missed `presentationBridge.ts`;
`element.link` being a **render precondition** and not merely an identity
marker, now documented so no future patch re-derives it the hard way; the
`unload` warning; the tsconfig-excluded `excalidraw_fork`; and the ledgers
carried from PATCH-123 §14k, PATCH-124 §14l and PATCH-125 §13l, plus the
unresolved production-build failure.

---

## 16. Amendment — RUNTIME CRASH CONFIRMED; B3 WITHDRAWN (2026-07-30, CTO)

### 16a. Severity reclassification

New user-visible evidence: the internal hyperlink path also produces a
**user-triggerable runtime crash**.

```
Runtime TypeError: Cannot read properties of null (reading 'clientX')
  components/App.tsx:6286  handleElementLinkClick
  this.lastPointerDownEvent!.clientX
```

Observed while interacting with / right-clicking an app-owned embeddable
carrying `padlet://<padlet-id>`. **The canvas is replaced by the Next.js
runtime error overlay.**

**PATCH-127 is no longer cosmetic-only.** It now covers two symptoms reached
through the same third-party hyperlink path:

1. the browser hover/status label leaking the internal `padlet://` identifier;
2. hyperlink interaction crashing the canvas via a null dereference.

**§15g's B3 — ACCEPT AND RECORD — is WITHDRAWN.** My §15g reasoning
("cosmetic browser-chrome defect… no data, correctness, security or functional
impact") was **correct on the evidence then available and is now wrong**.
Accepting a status label is defensible; accepting a reproducible canvas crash
that destroys the user's working surface is not.

### 16b. Root-cause trace — source evidence

Read from the reference source mirroring the installed 0.18.0
(`excalidraw_fork/packages/excalidraw/components/App.tsx`; the fork is
**reference only** and is not adopted — §5, §15f):

```
:648   lastPointerDownEvent: React.PointerEvent<HTMLElement> | null = null;

:6281  private handleElementLinkClick = (event) => {
:6284    const draggedDistance = pointDistance(
:6286      pointFrom(this.lastPointerDownEvent!.clientX,
:6287               this.lastPointerDownEvent!.clientY),
:6290      pointFrom(this.lastPointerUpEvent!.clientX,
:6291               this.lastPointerUpEvent!.clientY));
:6293    if (!this.hitLinkElement || draggedDistance > DRAGGING_THRESHOLD) return;
:6298    viewportCoordsToSceneCoords(this.lastPointerDownEvent!, …)
```

**The field is declared nullable and dereferenced with a non-null assertion,
three times, in the handler's very first statement — before any guard.**

The decisive contrast is in the same class:

```
:1249  if (!this.lastPointerDownEvent || !this.lastPointerUpEvent || …) 
:936   this.lastPointerMoveEvent ?? this.lastPointerDownEvent?.nativeEvent;
:1058  this.lastPointerMoveEvent ?? this.lastPointerDownEvent?.nativeEvent;
```

**Excalidraw guards this field everywhere else and only in
`handleElementLinkClick` asserts it non-null.** This is an **upstream
null-dereference bug**, not a consequence of anything the application does.

There is exactly **one** assignment site in the shipped bundle
(`lastPointerDownEvent = event`) and no reset-to-null. The field is therefore
null when the handler runs **without any prior canvas pointerdown having been
recorded**.

**Hypothesis, explicitly NOT a finding:** the hyperlink anchor lives in the
popup **overlay**, a DOM element outside the canvas, so activating it may
invoke the link path without the canvas ever recording a pointerdown.
Right-click, context-menu dismissal and remount are equally plausible
contributors.

**§16c requires this be established by observation. It must not be inferred
from the stack — or from this paragraph.**

### 16c. The crash is NOT `padlet://`-specific — product consequence

`handleElementLinkClick` has **no scheme check** before the dereference. Any
element carrying **any** link reaches the same unguarded code — **including
external `https://` links on ordinary Excalidraw elements.**

**Consequence: suppressing only the `padlet://` anchor would remove the label
and leave the crash reachable elsewhere in the product.** This materially
changes the strategy calculus and is why §16d rules as it does.

### 16d. A/B ruling — both are likely required, and here is why

The owner asked not to choose between A and B without tracing. Trace performed;
the two symptoms have a **common trigger path but different root causes**:

- **the label** is caused by *anchor rendering* → addressed by **A**;
- **the crash** is caused by an *unguarded dereference* → addressed by **B**.

**A alone is insufficient** — §16c shows the crash remains reachable via
external links. **B alone is insufficient** — a guarded handler still leaves the
`padlet://` identifier in the status bar.

**Ruled: the final patch is expected to require BOTH A and B.** This is a
directional ruling, not authorization. It must be confirmed by the §16e runtime
trace before implementation, and if the trace contradicts it, this section is
amended rather than worked around.

**B is the higher-priority half.** It fixes a crash, it is version-agnostic in
spirit (a null guard cannot regress correct behaviour), it matches Excalidraw's
own convention at `:1249`, and it protects external links too. If only one half
can be delivered, **deliver B.**

### 16e. Required runtime trace — before any implementation

Establish **by observation**, in a real browser, which interaction leaves
`lastPointerDownEvent` null: right-click; context-menu close; click after
context-menu close; click on the hyperlink overlay; keyboard activation;
synthetic/programmatic event; or another reproducible sequence.

Report the **exact sequence**, the observed field state, and whether the same
sequence crashes on an **external-link** element. Do not report a sequence that
was not run.

### 16f. B2C spike — gate expanded to 10, all mandatory

The placeholder-link spike must now prove **all** of: (1) the app-owned
embeddable still renders; (2) no `a[href^="padlet://"]` is created; (3) **no
replacement browser destination label** is introduced; (4) normal left-click
does not crash; (5) right-click / context-menu does not crash; (6) clicking
after closing the context menu does not crash; (7) selection and drag still
work; (8) the embedded post still renders and resolves; (9) external Excalidraw
links still work; (10) identity remains resolvable.

**Rejected** if the placeholder renders a different status-bar URL, creates an
anchor with another `href`, breaks rendering or selection, **or merely avoids
one interaction while another still crashes.**

Given §16c, **B2C cannot fix the crash on external links under any placeholder
value** — a placeholder changes app-owned data only. B2C is therefore at best a
partial answer and, on current evidence, **is not expected to pass criterion
5 or 6 in the general case**. It remains authorized as a spike because
disproving it cheaply is worth more than assuming it.

### 16g. B2B — accounting required, mechanism scoped

Prepare the exact narrow patch design. Candidate scope:

- **A —** `Hyperlink` component: do not render the anchor for app-owned
  `padlet://` links, **retaining `element.link` internally** so embeddable
  validation still passes (the §15b precondition that defeated B1).
- **B —** `handleElementLinkClick`: **guard `lastPointerDownEvent` and
  `lastPointerUpEvent` before reading `clientX`/`clientY`**; return safely, or
  use the current event, when absent; preserve normal external-link behaviour.

Required accounting, to be supplied **before** code is written:

1. **Maintenance burden** — the patch targets specific components in a specific
   version; every upgrade needs re-verification.
2. **Package implications** — the repository uses **npm** (`package-lock.json`
   present), so `patch-package` plus a `postinstall` script is the fitting
   mechanism. **This requires editing `package.json`**, currently prohibited.
3. **Build/deployment implications** — the patch must apply in CI and every
   deployment environment.
4. **External-link compatibility** — proven, not assumed.
5. **Proof that only app-owned `padlet://` elements lose the anchor.**
6. **Proof that external hyperlinks remain fully functional**, including
   `target`/`rel` and keyboard behaviour.

**Authorized minimum package changes, if and only if B2B is selected:**
`package.json` (one `postinstall` script and one devDependency), the lockfile
**only** as generated by that addition, and **one deterministic patch file** for
the exact installed version.

**Hard requirements:** installation/build must **fail loudly** if the patch no
longer applies; **no silent fallback** to vulnerable upstream code; the exact
package version must be **pinned and verified**; future upgrades must surface
the conflict. **The full unused fork is not adopted** (§5, §15f).

### 16h. External-link contract — bind

`http://`, `https://`, `mailto:` and other supported links remain **unchanged**:
the hover anchor stays available; clicks open through existing behaviour; the
context menu does not crash; keyboard behaviour is unchanged.

**Only app-owned `padlet://` elements may suppress hyperlink UI.** The crash
guard (B), by contrast, **must apply to all links** — a guard that protects only
`padlet://` would leave §16c's external-link crash live.

### 16i. Crash characterization tests — bind

Focused browser characterization must: create/open an app-owned embedded post;
hover it; right-click it; open **and close** its context menu; left-click it
afterward; **repeat the sequence several times**; and prove **no Next.js runtime
overlay appears**, **no `pageerror` is emitted**, and **no console `TypeError`
mentioning `lastPointerDownEvent`/`clientX` occurs**. The canvas must remain
interactive; the object selectable and draggable; **context-menu Edit Post and
Duplicate must still work**; and an external-link element must still behave
normally.

**Capture `pageerror` events, console error events, runtime-overlay presence,
and the exact interaction sequence.** Listeners must be attached **before**
navigation, or the first error is missed.

### 16j. Unit/source tests — bind

App-owned `padlet://` links are recognized **narrowly**; external links are not
suppressed; **a null `lastPointerDownEvent` cannot be dereferenced**; no broad
hyperlink disablement; the runtime patch applies to the **exact installed
version**; and the patch artifact contains **only** the governed minimal
changes — asserted against the artifact itself, so scope creep inside the patch
file is caught.

### 16k. Console warning

The `unload` permissions-policy warning **remains separate** unless the §16e
trace proves it is part of the same runtime path. **It must not be conflated
with the `clientX` crash** — they share no evidence.

### 16l. Next instruction (bind)

> **Do not implement. Do not re-attempt B1.**
>
> Deliver two things, in order: (1) the **§16e runtime trace** establishing by
> observation which interaction leaves `lastPointerDownEvent` null, and whether
> the same sequence crashes an **external-link** element; (2) the **§16f B2C
> spike** under its expanded 10-criterion gate.
>
> Then **stop and report**. Do not proceed to B2B — it requires the §16g
> accounting and explicit owner sign-off, including a narrow `package.json`
> exception that does not yet exist.
>
> Change no product code. Leave no candidate behind. Report the exact sequences
> run and their observed results, including sequences that did **not** reproduce.

### 16m. Status

**PATCH-127: OPEN · B1 REJECTED · B2A CLOSED · B2C SPIKE EXPANDED · B2B
ACCOUNTING REQUIRED · RUNTIME CRASH CONFIRMED · IMPLEMENTATION BLOCKED PENDING
STRATEGY RULING.**
**B3: WITHDRAWN (§16a).** Severity reclassified from cosmetic to
crash-inducing. Directional ruling: **A and B both expected; B is the priority
half** (§16d). Raw-reader cap remains **10** (§15h).

**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt:** an **upstream Excalidraw 0.18.0 null-dereference in
`handleElementLinkClick`** affecting **all** linked elements, not only
app-owned ones — worth reporting upstream regardless of which strategy this
patch takes; the §2c census defect (`presentationBridge.ts`); `element.link` as
a render precondition (§15b); the `unload` warning; the tsconfig-excluded fork;
and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers plus the
unresolved production-build failure.
