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
