# PATCH-151 — CLIPART CARD MODAL CAPABILITY ROUTING

**Status:** **OPEN · DEFECT CONFIRMED · CAPABILITY ROUTING AUTHORIZED · OPTION A (BOUNDED) ·
PRODUCTION ALLOWLIST NARROW · NOT IMPLEMENTED · NOT PUSHED**
**Authored:** 2026-08-04 (governance architect). **Base:** `5194d59`. **First authoring of this
number** — `git log --all --diff-filter=A -- .fable5/patches/PATCH-151.md` is empty.
**Origin:** PATCH-139 §14l **O1** (closure finding). **PATCH-151 gates PATCH-140.**
**PATCH-139 is not reopened.**

---

## 1. Origin

PATCH-139 closed the normal-card capability route. Its independent closure review (§14l **O1**)
found that the **immediately preceding** clipart branch was never enumerated in the §13c census
and therefore never gated:

```
CanvasClient.tsx:5700  else if (post.type === 'card' && post.metadata?.svgUrl) setIsClipartDraftModalOpen(true);   // UNGATED
CanvasClient.tsx:5701  else if (post.type === 'card') { …selectCardModalRoute… }                                    // gated by PATCH-139
```

**This was a governance census gap, not an implementation defect.** PATCH-139 §13k explicitly
confined `CanvasClient` edits to *the card branch* and forbade touching others; the implementer
complied exactly. PATCH-151 completes the work the census missed.

### 1a. Path correction — fifth occurrence in this sequence

| Named in brief | Actual |
|---|---|
| `components/collabboard/ClipartCardDraftModal.tsx` | **`components/collabboard/editors/ClipartCardDraftModal.tsx`** |

The **test** does live at `components/collabboard/ClipartCardDraftModal.test.tsx` (a different
directory from its component, matching `vitest.config.ts`'s `components/collabboard/*.test.tsx`
include). Prompt-path correction, not a scope change. Cf. PATCH-138 §16a, PATCH-139 §1a/§13b,
PATCH-148 §1a.

---

## 2. Confirmed defect

`ClipartCardDraftModal` is an **editing and persistence surface**:

| Evidence | Location |
|---|---|
| Renders `CardEditor` with `readOnly={false}` | `ClipartCardDraftModal.tsx:442` |
| Editable title (`InlineCaption` → `onChange`) | `:245` |
| Replace-icon, colour panel, reactions, comments, badge palette | `:191`, `:309`, `:230`, `:349`, `:381` |
| **Parent `onClose` calls `void saveCard(...)`** | `CanvasClient.tsx:7399-7403` |
| **`onDiscard` opens the DELETE confirm for existing cards** | `CanvasClient.tsx:7406-7413` |
| Render site has **no** capability guard | `CanvasClient.tsx:7390-7391` |

A read-only workspace member opening `?openPadlet=<clipartCardId>` therefore reaches a modal that
can **edit, persist on close, and initiate deletion**.

---

## 3. Route census — measured at `5194d59`

### 3a. Every `setIsClipartDraftModalOpen(true)` site

| # | Path | Trigger | Guard today | Card state | Destination | `readOnly` | Save behaviour | Disposition |
|---|---|---|---|---|---|---|---|---|
| **C1** | `CanvasClient.tsx:5700` | `openPadletInTypeEditor` clipart branch — reached by `?openPadlet=` (`:346-351`), context menus (`:6474`, `:6563`, `:6569`, `:6660` via `openPadletTargetFromContextMenu`), `CanvasModals.tsx:270` | **NONE** | `setPadletToEdit(post)` `:5692` | `ClipartCardDraftModal` | `false` | `saveCard` on close | **GATE — this patch** |
| **C2** | `CanvasClient.tsx:7510` | clipart **library** → new draft (`setPadletToEdit({id:'new',…})`, `:7495-7508`) | **creation flow**; toolbar `case 'library'` (`:5650`) is reached only through the canvas toolbar, gated by `canUseCanvasToolbar = canUseFreeformEditButton` (`:258`) | synthetic `id:'new'` | `ClipartCardDraftModal` | `false` | intended | **DO NOT TOUCH** — gating it would break creation (§9 false-green) |

**C1 is the only ungated opener of an existing clipart card.** Gating the *branch* — not its
callers — closes the deep link, all context-menu routes and `CanvasModals` in one place, exactly
as PATCH-139 did for the normal-card branch.

### 3b. Answers to the primary questions

1. **Is the direct link the only ungated caller?** No — the deep link, four context-menu paths and
   `CanvasModals.tsx:270` all funnel through `openPadletInTypeEditor`. All are closed by gating C1.
2. **Other routes to the same modal?** Only C2 (creation), which is correctly gated upstream.
3. **Can read-only clipart use the standard viewer?** **Only with a bounded fix — see §4.**
4. **Does clipart render correctly in the standard viewer today?** **No — measured, it does not.**
5. **Narrowest read-only rendering path?** §4/§5.
6. **Can `selectCardModalRoute` be reused directly?** **Yes** — same signature, same authority, no
   new helper.
7. **Is the read-only close non-writing?** **Yes** — the viewer's `onSave` is a no-op
   (`CanvasClient.tsx:7372`), `CardEditor.handleSave` short-circuits to `onClose()` when
   `readOnly` (`CardEditor.tsx:58-62`), and `onClose` clears state (`:7366-7369`).

---

## 4. Measured finding — plain Option A fails acceptance

The brief states *"Prefer Option A if source evidence supports it."* **The evidence does not.**

Read-only `CardEditor` rendered against clipart metadata (`svgUrl`, `iconBgColor`, empty content),
measured by temporary probe (`renderToStaticMarkup`, run, deleted, never committed):

| Property | read-only | editable |
|---|---|---|
| `svgUrl` rendered | **false** | true |
| `<img>` present | **false** | true |
| Title rendered | **false** | true (as input) |
| `iconBgColor` applied | **false** | true |
| Body placeholder | **"No content."** | "Start writing…" |

**Cause:** the icon block and title live inside `CardEditor`'s `!readOnly` branch
(`CardEditor.tsx:86-114`); the `readOnly` branch (`:116-121`) renders only a `FileText` glyph and
the literal string **"View Document"**.

So routing a read-only user's clipart card to the standard viewer *as it stands today* produces a
modal with **no clipart, no title and an empty body** — violating read-only acceptance item 1
("clipart content visible"). **Plain Option A is rejected.**

---

## 5. Selected option — **OPTION A, BOUNDED**

**Read-only clipart cards route to the existing standard read-only `CardEditor` viewer, and the
viewer's read-only header is extended to display the clipart icon and title.**

**Why not Option B (clipart modal gains `readOnly`):**

- `ClipartCardDraftModal` is a **draft/creation** surface — its `onDiscard` opens a *delete*
  prompt and its parent `onClose` *persists*. "Read-only draft" is semantically wrong.
- A genuine read-only mode would have to neutralise ~8 interactive surfaces (§2) **and** the
  parent's `onClose` save — comfortably beyond the brief's 20-line budget, and it would leave two
  divergent read-only presentations to maintain.

**Why not Option C:** only one live decision point needs changing (C1); `selectCardModalRoute`
already *is* the centralized helper.

**Why not Option D:** no broader product work is required — §4's gap is a ~10-line presentation
fix in a surface PATCH-139 already proved non-writing.

**Why A is right:** it reuses a read-only surface whose immutability is already established
(PATCH-139 §13f) and matches the precedent that read-only cards open the viewer. Clipart cards
are cards.

### 5a. PATCH-139 compatibility — binding

The `CardEditor` change **must not** disturb PATCH-139's closed contract. Its read-only assertions
are: content rendered · **no `<input>`** · no toolbar · no footer · `readonly` textarea ·
**exactly one `<button>`** · `aria-label="Close"`. A static `<span>` and an `<img>` satisfy all of
them — **no new input and no new button may be introduced.** The implementer must show
`CardEditor.test.tsx`'s existing PATCH-139 tests passing **unchanged**.

### 5b. Known limitation — must be mitigated, cannot be unit-tested

`CardEditor`'s `useEffect` (`:31-54`) **clears the title** when it matches the icon filename
("auto-generated name" rule). `renderToStaticMarkup` does **not** run effects, so a test asserting
the title will pass while the browser may render an empty title for auto-named clipart.

**Required mitigation:** the read-only header must fall back to a stable label when the title is
empty (e.g. `title || 'View Document'`). **The reviewer must confirm this fallback by source
inspection** — the test environment cannot prove it.

---

## 6. Capability contract

- **Sole input:** `selectCardModalRoute(canUseFreeformEditButton)` — the PATCH-139 helper, reused
  verbatim. `canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole)`
  (`CanvasClient.tsx:254`), already in scope at C1.
- `'editor'` ⇒ existing `ClipartCardDraftModal`. `'viewer'` ⇒ standard read-only `CardEditor`.
- **Forbidden:** a second route helper · another permission service · role inference · schema
  changes · backend/RLS changes · duplicating the editor.
- Client-side routing is **not** the persistence boundary; server authorization is unchanged and
  out of scope.

**Read-only acceptance** (all nine binding): clipart visible · no editable title · no formatting
controls · no save footer · content unchangeable · visible accessible close · **close must not
invoke `saveCard`** · no persistence call · selected-card state cleared. Items 5–9 already hold on
the viewer route (§3b.7); item 1 is delivered by §5.

**Editable acceptance:** `ClipartCardDraftModal` unchanged · editing controls unchanged ·
save-on-close unchanged · **creation flow (C2) unchanged**. Save/close semantics are **not**
redesigned — that remains PATCH-149's (PATCH-139 **D3**).

---

## 7. Allowlists and limits

### Production allowlist — exact

| # | Path | Purpose | Max changed lines |
|---|---|---|---|
| 1 | `app/dashboard/canvas/[id]/CanvasClient.tsx` | gate **C1 only** via the shared helper | **12** |
| 2 | `components/collabboard/CardEditor.tsx` | read-only header renders clipart icon + title, with §5b fallback | **12** |

**Production total ≤ 24 changed lines.**

Allowlist item 2 is an addition to the brief's "likely" list. It is required by §4 and authorized
under the brief's own PRIMARY QUESTION 5 ("what is the narrowest read-only rendering path?"). It
is **read-only presentation**, explicitly **not** "CardEditor formatting logic" — the toolbar,
`handleSave`, the textarea and the footer must not change.

**Must not be modified:** `ClipartCardDraftModal.tsx` (Option B rejected) · **C2 / the creation
flow** · the PATCH-139 normal-card branch at `:5701-5704` · any non-card branch of
`openPadletInTypeEditor` · `CardPreview.tsx` terminology · `CardActionsToolbar.tsx` ·
persistence/schema · presentation code · Excalidraw fork · `package.json` · `GROUP_H`/`OVERHEAD_H`.

### Test allowlist — exact

| # | Path | Coverage | Max changed lines |
|---|---|---|---|
| 1 | `components/collabboard/CardEditor.test.tsx` | read-only clipart presentation (icon, title, fallback); PATCH-139 invariants still hold — no new `<input>`, still exactly one `<button>` | **45** |
| 2 | `lib/domain/canvas/cardModalRoute.test.ts` | **source guard** — both card branches in `CanvasClient` route through `selectCardModalRoute`; `CardEditor.handleSave` retains its `readOnly` short-circuit | **25** |

Both are already inside `vitest.config.ts`'s include patterns. **No new dependency. No
`package.json` change. No Playwright.**

**The source guard closes PATCH-139's accepted risk.** `CanvasClient.tsx` is not renderable in
this node-only environment, so PATCH-139 §13k had to accept reviewer eyeballs as the wiring proof.
This repository already establishes a source-assertion pattern —
`sourceFor(relativePath)` via `fs.readFileSync` in `ClipartCardDraftModal.test.tsx:139-141`, used
for guards at `:904`, `:914`, `:975`. PATCH-151 **must** reuse it so the wiring becomes
machine-enforced rather than review-dependent.

---

## 8. Induced-failure and negative-control plan

**Parent-state induced failures at `5194d59` — both load-bearing, both on existing production
code (neither is a new-file artefact):**

| # | Test | Why it fails at parent |
|---|---|---|
| 1 | source guard (allowlist test 2) | C1 reads `…svgUrl) setIsClipartDraftModalOpen(true);` with **no** `selectCardModalRoute` — the guard's "both card branches route through the helper" assertion fails |
| 2 | read-only clipart presentation (allowlist test 1) | probe-measured: read-only markup contains **no** `svgUrl`, **no** `<img>`, **no** title (§4) |

**Negative controls — temporary, reverted, never committed. Each must be shown failing with its
exact message, then the file verified byte-identical via `git hash-object` against the committed
blob:**

| # | Perturbation | Must fail on |
|---|---|---|
| 1 | force the clipart false-capability route to `'editor'` (e.g. `selectCardModalRoute(true)` hard-coded at C1) | source guard — the branch no longer honours the capability |
| 2 | remove the `if (readOnly) { onClose(); return; }` short-circuit from `CardEditor.handleSave` | source guard's save-suppression assertion (this is the machine-checkable proxy for "read-only close must not write") |
| 3 | bypass the shared helper at C1 (inline `setIsClipartDraftModalOpen(true)`) | source guard — proven mechanism, cf. PATCH-139 §14i NC3 |

---

## 9. False-green protection

Reject any implementation that: only visually disables the clipart editor · leaves `saveCard`
reachable in the read-only route · fixes the deep link while another live clipart opening route
stays ungated · creates a second permission helper · regresses normal-card routing (PATCH-139) ·
mixes PATCH-149 concerns (save/close redesign, formatting controls, terminology) · **gates C2 and
breaks clipart creation** · adds an `<input>` or a second `<button>` to the read-only viewer ·
proves wiring by comment rather than by the source guard · touches `package.json`.

---

## 10. Validation matrix

| # | Gate | Requirement |
|---|---|---|
| 1 | Parent induced failure | both §8 tests fail at `5194d59` |
| 2 | Focused route/source-guard tests | green |
| 3 | Focused `CardEditor` tests | green, **including PATCH-139's originals unchanged** |
| 4 | `ClipartCardDraftModal.test.tsx` | **45/45 unchanged** — Option B not taken, so this suite must not move |
| 5 | `CardPreview.test.tsx` | 29/29 unchanged |
| 6 | Full Vitest | all pass, unfiltered (baseline `66` files / `755` tests, plus this patch's additions) |
| 7 | Clean one-run `npm run typecheck` | remove `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types` + `.next`; one run → exit 0, declarations regenerated (PATCH-144 contract) |
| 8 | `npx tsc --noEmit` | exit 0 |
| 9 | `npx next build` | exit 0 |
| 10 | `node scripts/e2e/assertBridgeExclusion.mjs` | exit 0, no marker |
| 11 | Clean E2E build | exit 0, marker `1` |
| 12 | `git diff --check` | exit 0 |
| 13 | Final artefact | ordinary `.next` restored, **no** `E2E_BRIDGE_BUILD` marker |
| 14 | Worktree | only the five pre-existing protected paths outside committed history |
| 15 | Production frozen | `git diff --exit-code` clean on every §7 exclusion, **especially `ClipartCardDraftModal.tsx`** |

---

## 11. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Clipart cannot be rendered read-only without broader product work | **NOT TRIGGERED** — §5's bounded ≤12-line header fix suffices; measured, not assumed |
| A second permission helper would be required | **NOT TRIGGERED** — `selectCardModalRoute` reused verbatim |
| Requires reopening PATCH-139 | **NOT TRIGGERED** — its branch, tests and contract are untouched; §5a makes compatibility binding |
| Read-only safety requires rewriting the clipart modal | **NOT TRIGGERED** — Option B rejected; the modal is not entered at all by read-only users |
| Server-side authorization demonstrably missing | **NOT TRIGGERED** — not audited, explicitly out of scope; client routing is not the boundary |
| More than a narrow file set needed | **NOT TRIGGERED** — 2 production files, ≤24 lines |
| Product behaviour for read-only clipart presentation undefined | **NOT TRIGGERED, but narrowly** — §5b's title-clearing effect is a real edge; mitigated by a required fallback and a source-inspection check, since the test environment cannot reach it |

**No hard stop blocks PATCH-151.**

---

## 12. Status and dependencies

**PATCH-151: OPEN · AUTHORIZED · OPTION A (BOUNDED) · NOT IMPLEMENTED · NOT PUSHED.**

| Patch | Status |
|---|---|
| **PATCH-151** | **OPEN · AUTHORIZED** (this document) |
| **PATCH-140** | **NOT RELEASED — gated by PATCH-151.** PATCH-139 closed the normal-card route, but the product contract ("direct `?openPadlet=` links obey the same decision") is satisfied only for non-clipart cards until this patch lands |
| PATCH-139 | **CLOSED — not reopened** |
| PATCH-148 | CLOSED |
| PATCH-141 | DEFERRED unless governance says otherwise |
| PATCH-149 | RESERVED — D3 (implicit save / missing Save button), D5 (dead R7), D6 (handler-less format buttons), stale test titles |
| PATCH-150 | RESERVED — presentation index-domain divergence; independent |
| PATCH-135 | Independently OPEN |
| PATCH-146 / 147 | RESERVED, non-blocking |

---

## 13. Recorded diagnostic notes

- **The branch order was the whole defect.** `card && svgUrl` is tested *before* `card`, so
  PATCH-139's gate sat one line too late to matter for clipart. A census that enumerates *modals*
  rather than *branches* will miss this class every time — the lesson is to enumerate the
  conditional chain, not the destinations.
- **"Prefer Option A" had to be tested, not assumed.** The brief's preferred option was the right
  destination but would have shipped a blank modal, because the icon and title live in the
  `!readOnly` branch. One probe turned a plausible one-line gate into a gate *plus* a bounded
  presentation fix.
- **A creation flow looks identical to an edit flow at the call site.** Both call
  `setIsClipartDraftModalOpen(true)`; only `id:'new'` and the upstream toolbar gate distinguish
  them. Gating by grep would have broken clipart creation.
- **The environment already had the proof mechanism.** PATCH-139 accepted "wiring cannot be
  unit-proven" as a governance risk, yet `ClipartCardDraftModal.test.tsx` had been reading source
  text with `fs.readFileSync` for guards all along. The constraint was real; the conclusion was
  not.
