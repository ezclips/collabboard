# PATCH-125 — Standardize post reactions on the in-repo EmojiReactionPicker

**Status:** OPEN · AUTHORIZED · NOT STARTED
**Base commit:** `7918dcd` (PATCH-124 closure)
**Authored:** 2026-07-30, CTO
**Model assignment:** GPT-5.5 implements. Independent reviewer reviews. The
authoring CTO neither implements nor reviews.

---

## 1. Goal

Reaction currently opens the large generic `emoji-picker-react` panel. The
owner wants the earlier **compact in-repo picker** restored and used
**consistently for every post type**.

Governing decision, bound:

```
components/collabboard/editors/EmojiReactionPicker.tsx
```

is the **single reaction picker** for all post types. **No post Reaction panel
may use `EmojiPicker` from `emoji-picker-react` after this patch.**

---

## 2. Census — complete, derived from source at `7918dcd`

**13 `EmojiPicker` render sites across 9 files.** Not two. The instruction not
to infer "all posts" from two known call sites was correct — the true reaction
surface is **five times** what PATCH-123 assumed.

### 2a. Reaction call sites — 10 sites, 6 files (ALL migrate)

| # | Site | Post type | Persistence route | Selection semantics |
|---|---|---|---|---|
| 1 | `FreeformPadletCards.tsx:962` | Image (inline card) | `updatePostFieldsPreservingFailureChannels` | append |
| 2 | `FreeformPadletCards.tsx:1909` | Image (selected, no toolbar) | `updatePadletMetadata` | append |
| 3 | `FreeformPadletCards.tsx:4986` | Image (right-positioned) | `updatePadletMetadata` | append |
| 4 | `FreeformPadletCards.tsx:5639` | Image toolbar | `updatePostFieldsPreservingFailureChannels` | append |
| 5 | `FreeformPadletCards.tsx:6093` | **Card Post Modal** | `updatePadletMetadata` | append |
| 6 | `ClipartCardDraftModal.tsx:339` | **Clipart draft** | `updateMetadata`/`onChange` (draft) | append |
| 7 | `CanvasClient.tsx:8158` | Image toolbar (canvas page) | `updatePadletMetadata` | append |
| 8 | `NoteEditor.tsx:765` | **Note** | local `setReactions` | **dedup-append** |
| 9 | `TodoEditor.tsx:545` | **Todo** | local `setReactions` | **toggle** |
| 10 | `LinkEditor.tsx:520` | **Link** | local `setReactions` | **toggle** |

All five `FreeformPadletCards` sites share **one** `isImageEmojiOpen` state.

### 2b. NON-reaction emoji consumers — 3 sites, 3 files (UNCHANGED)

| Site | Purpose |
|---|---|
| `IconSelector.tsx:160` | **"Select Icon"** dialog — icon selection |
| `app/dashboard/page.tsx:650` | **folder icon** picker (`setNewFolderIcon`) |
| `CommentEditor.tsx:637` | **emoji insertion into comment text** (`handleEmojiClick`) |

These are **not reactions** and are **prohibited from modification**.

### 2c. `EmojiReactionPicker` — current consumers: **ZERO**

Its only other mention in the repository is a test asserting its **absence**
(`ClipartCardDraftModal.test.tsx:987`). It is a live, complete, unused
component — not dead code by accident but by the PATCH-123 ruling this patch
retires.

**PATCH-123 §13b read that zero as proof it "isn't the product's picker." That
inference was wrong, and this patch corrects it. The zero meant the earlier
picker had been orphaned, not rejected.**

### 2d. Existing tests that PIN the wrong picker — must be inverted

```
components/collabboard/ClipartCardDraftModal.test.tsx:215   asserts emoji-picker-react renders
components/collabboard/ClipartCardDraftModal.test.tsx:986   asserts the emoji-picker-react import
components/collabboard/ClipartCardDraftModal.test.tsx:987   asserts NOT EmojiReactionPicker
e2e/characterization/clipart-draft-reactions-comments.spec.ts:267  asserts .EmojiPickerReact visible
```

These currently **enforce the defect**. They must be **inverted, not deleted** —
a green suite that no longer checks anything is worse than a red one.

---

## 3. Findings the owner must weigh — stated plainly

### 3a. `EmojiReactionPicker`'s search is BROKEN

`EmojiReactionPicker.tsx:56-60`:

```ts
const filteredEmojis = searchQuery
  ? Object.values(emojiData).flat().filter(emoji => emoji.includes(searchQuery))
  : emojiData[selectedCategory] || [];
```

It compares the **emoji glyph** against the typed text. Typing `smile` returns
**nothing**. There is no name index, so search cannot work as written.

**Consequence:** all 10 reaction sites currently have working name-search via
`emoji-picker-react`. Standardizing as-is **introduces a non-functional search
box to every post type in the product.** That is a real regression, and it is
being introduced deliberately, so it must be a decision rather than a surprise.

**Ruled:** a **narrow search fix inside `EmojiReactionPicker` is AUTHORIZED**
(§5, file 7) — either wire a name index or remove the search input entirely. A
visible control that does nothing is not acceptable in shipped UI. *A search
box that silently returns nothing is worse than no search box.* Implementer
chooses; removal is acceptable and is the smaller change.

This is a deliberate, reasoned exception to the owner's "prefer adapting call
sites" instruction. **It is the only authorized edit to the shared component,
and it is not required for API consumption** — §3c confirms the API is already
consumable unchanged. If the owner prefers to accept the regression instead,
say so and file 7 is withdrawn.

### 3b. The emoji set shrinks from full to ~163

`EmojiReactionPicker` hardcodes **~163 emoji** across 10 categories
(`:29-44`). `emoji-picker-react` offers the full Unicode set. Users who
currently react with an emoji outside the 163 **will no longer be able to**.

Recorded, not blocked — the owner asked for this picker specifically, and
compactness is the point. But it is a user-visible capability reduction and
must not be discovered after the fact.

### 3c. The API **is** consumable unchanged

```ts
{ isOpen, onOpenChange, onSelectEmoji, inline?, className? }
```

`inline` mode (`:137-156`) renders a self-contained panel with its own header
and close button — exactly the shape all 10 sites need. **No API change is
required**, so §5 file 7 is authorized *solely* for §3a and nothing else.

Note: inline mode is fixed at **`w-[360px]`**, versus the current 300–320px.
The panel is *wider* but far shorter (350px content) — acceptable, but §7's
placement tests must confirm viewport-safety at the new width.

### 3d. Three divergent reaction semantics — DO NOT unify in this patch

Census row 8 uses **dedup-append**, rows 9–10 use **toggle**, rows 1–7 use
**append**. `NoteEditor.tsx:766` is the retired PATCH-120 dedup rule **still
alive in production**.

The owner's data contract ("same emoji twice appends twice") is correct for
**append-semantics editors** and would be a **behavioural change** to Note,
Todo and Link — three post types whose reaction behaviour the owner did not
ask to change.

**Ruled: this patch swaps the PICKER ONLY. Each editor's existing selection
handler and semantics are preserved verbatim.** Tests 8–10 of §7 apply to
**append-semantics editors only** (Image, Card Post Modal, Clipart, canvas
Image). Unifying semantics is a separate, larger, user-visible change and is
**DESIGNATED PATCH-126, UNAUTHORED, UNAUTHORIZED**.

Mixing a picker refactor with a semantics change across six editors is exactly
how a "simple" patch becomes unreviewable.

### 3e. `emoji-picker-react` MUST NOT be removed — proven

Three legitimate non-reaction consumers survive (§2b). **`package.json` and
`package-lock.json` remain PROHIBITED.** Dependency removal is not authorized
and the census disproves its premise.

---

## 4. Contract — bind

1. **One picker.** Every reaction-capable post renders
   `EmojiReactionPicker` with `inline` — same component, same dimensions, same
   categories, same close behaviour, same placement, same selection behaviour.
2. **No post Reaction path imports or renders `emoji-picker-react`.**
3. **Non-reaction emoji consumers (§2b) are untouched.**
4. **Persisted format is unchanged:** `metadata.reactions: string[]`.
5. **PATCH-123 repetition semantics are preserved** for append-semantics
   editors: same emoji twice appends twice; `ReactionDisplay` derives count by
   repetition; clicking a displayed reaction removes **exactly one** matching
   instance; different reactions stay independent. **The retired PATCH-120
   dedup rule must not return.**
6. **Each editor keeps its own persistence route** (§2a column 3). Draft
   editors stay on `updateMetadata`/`onChange`; saved cards stay on their
   existing saved-card route. **No crossover** — the §2a table is the
   authority, and the two distinct Freeform routes must each be preserved.
7. **`ReactionDisplay` is unchanged.** This patch concerns the picker, not the
   display.
8. **Panel behaviour, every editor:** one Reaction click opens the picker in
   the existing right-side slot; it closes Caption, Comments, Colour and other
   siblings; switching from another panel is **one click**; selecting appends
   and **closes** the picker; closing without selecting **writes no metadata**;
   the panel stays viewport-safe and top-aligned; **compact Clipart centring
   and short-viewport reachability remain intact** (PATCH-122 §14c `m-auto`,
   not `items-center`).

---

## 5. Authorized scope

**Production — 7 files, all census-proven:**

```
1. components/collabboard/canvas/ui/FreeformPadletCards.tsx    5 reaction sites
2. components/collabboard/editors/ClipartCardDraftModal.tsx    1 reaction site
3. app/dashboard/canvas/[id]/CanvasClient.tsx                  1 reaction site
4. components/collabboard/editors/NoteEditor.tsx               1 reaction site
5. components/collabboard/editors/TodoEditor.tsx               1 reaction site
6. components/collabboard/editors/LinkEditor.tsx               1 reaction site
7. components/collabboard/editors/EmojiReactionPicker.tsx      CONDITIONAL — §3a search fix ONLY
```

Files 1–6 change **only** the picker import, the rendered picker, and the
wrapper markup needed to host it. **Selection handlers, persistence calls and
panel state are preserved verbatim.**

**Tests — 4:**

```
components/collabboard/ClipartCardDraftModal.test.tsx                (invert §2d pins)
e2e/characterization/clipart-draft-reactions-comments.spec.ts        (invert §2d pin)
components/collabboard/EmojiReactionPicker.test.tsx                  (new — census guard)
e2e/characterization/patch-125-shared-reaction-picker.spec.ts        (new — §8)
```

**Prohibited unless source proves necessary:** `ReactionDisplay.tsx`,
`CardPreview.tsx`, `CardActionsToolbar.tsx`, `TextStylePopup.tsx`,
`InlineCaption.tsx`, `IconSelector.tsx`, `app/dashboard/page.tsx`,
`CommentEditor.tsx`, schema, repositories, RLS, `package.json`,
`package-lock.json`, canvas ownership/rendering code.

**Protected — never staged, never modified:** `.gitignore`, the three
`app/api/ai/*` routes, `scripts/live-access-login.mjs`. `.env.local` untouched.

---

## 6. Supersession of PATCH-123 — picker parity ONLY

**PATCH-123 §13b's ruling to adopt `emoji-picker-react` in Clipart is
SUPERSEDED.** Recorded without reopening: **PATCH-123 remains CLOSED.**

Everything else in PATCH-123 **stands**: the caption reader, the caption style
panel, `metadata.captionStyle`, the `{...base, ...preset}` merge, the
`ReactionDisplay` reuse, the draft persistence route, and — emphatically —
**§13c's retirement of the PATCH-120 dedup rule**.

Only the *choice of picker component* is reversed. §13a's finding that
`CardPreview` already renders `ReactionDisplay` remains correct and load-bearing.

---

## 7. Required tests — bind

1. Complete census of **both** picker implementations, asserted from source.
2. Every reaction-capable post uses `EmojiReactionPicker` — all **10** sites.
3. **No** post reaction path imports or renders `emoji-picker-react`.
4. The **three** non-reaction consumers (§2b) remain unchanged.
5. Image Reaction opens the shared picker.
6. Clipart Reaction opens the **same** shared picker.
7. Picker structure and dimensions **identical** across post types.
8. Same emoji twice stores two entries — **append-semantics editors only**
   (§3d).
9. `ReactionDisplay` shows count **2**.
10. Clicking the displayed reaction removes **one** instance.
11. Closing without selecting writes **no metadata**.
12. Reaction opens from Caption in **one click**.
13. Caption/Comments open from Reaction in **one click**.
14. Saved Image-post persistence still works, on its **existing** route.
15. Clipart draft persistence still works, on `updateMetadata`/`onChange`.
16. Saving and reopening preserves reactions.
17. **No de-duplication returns** for append-semantics editors.
18. **No update-route crossover** — assert per §2a that each site still calls
    its own function, including both distinct Freeform routes.
19. Comments, captions and badge behaviour unchanged.
20. Real Playwright covers Image and Clipart **side by side**.

Plus, mandated by this census:

21. **Note, Todo and Link render the shared picker while retaining their
    existing semantics** (§3d) — dedup-append for Note, toggle for Todo and
    Link. This is the guard that prevents the picker swap silently changing
    three post types.
22. If §5 file 7 is exercised: the search either **works** or the input is
    **absent**. No non-functional control ships.

**Induced-failure proof, required.** Reverting any one call site to
`emoji-picker-react` must fail test 2 or 3.

---

## 8. Playwright — real clicks

Open an Image post Reaction panel; record picker structure; select an emoji
twice and verify count **2**; reopen and remove one instance through
`ReactionDisplay`; open a Clipart post Reaction panel; prove **identical**
picker structure; repeat the duplicate-count check; switch **Caption →
Reaction in one click**; and confirm **no large `emoji-picker-react` panel
appears in either path** — assert `.EmojiPickerReact` has count **0**.

Screenshots may corroborate; they must not be the only assertions.

**Credentials:** reference only via `E2E_EMAIL`/`E2E_PASSWORD` or
`LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD`. Never print, log, echo or commit a
credential. Storage state to a scratch path outside the repo, deleted after
use. Report identities as **user ids only — never an email, never a token,
never cookies.**

---

## 9. Hard stops — stop and report

1. `EmojiReactionPicker` cannot be consumed by some call site without an API
   change beyond §3a.
2. Any editor's persistence route would have to change.
3. `ReactionDisplay` would have to change.
4. Unifying the §3d semantics appears necessary to satisfy any test.
5. A non-reaction consumer (§2b) would have to change.
6. More than 7 production files prove necessary.
7. Dependency removal appears necessary — it is not (§3e).

---

## 10. Bound commit message (exact)

```
refactor(canvas): standardize post reactions on the in-repo emoji picker (PATCH-125)
```

---

## 11. Next GPT-5.5 instruction (bind)

> **Swap the picker at all 10 reaction sites in §2a. Change nothing else.**
>
> Preserve every selection handler, every persistence call and every panel
> state exactly as they are — including Note's dedup, Todo's and Link's
> toggle, and both distinct Freeform routes. Do not unify semantics.
>
> Invert the four §2d tests that currently pin the wrong picker; do not delete
> them. Do not touch the three non-reaction consumers. Do not touch
> `package.json`.
>
> If you exercise §5 file 7, fix the search or remove the input — nothing else
> in that component.
>
> Leave the candidate uncommitted and unstaged for independent review.

---

## 12. Status

**PATCH-125: OPEN · AUTHORIZED · NOT STARTED.** Production allowlist **7**
(one conditional), tests **4**.
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED** — owns §3d reaction-semantics
unification.
**PATCH-124 / 123 / 122 / 121 / 120 / 117: CLOSED** — PATCH-123's picker choice
is superseded by §6 without reopening it.
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt:** the ~163-emoji ceiling (§3b); three-way reaction-semantics
divergence (§3d → PATCH-126); five duplicated reaction blocks inside
`FreeformPadletCards` sharing one state; the unresolved production-build
failure; and the PATCH-123 §14k / PATCH-124 §14l ledgers.

---

## 13. CLOSURE (2026-07-30, CTO)

### 13a. Independent review

**PASS.** The authoring CTO neither implemented nor reviewed this candidate.
Every claim below was **re-verified from source at closure**, not accepted on
report.

### 13b. Two-picker census — final

- **13 `EmojiPicker` render sites** were found before implementation.
- **10 were post-reaction consumers.** All 10 now use `EmojiReactionPicker`.
- **3 were legitimate non-reaction consumers.** All 3 remain on
  `emoji-picker-react`, **unchanged vs HEAD**:

```
components/collabboard/canvas/IconSelector.tsx     "Select Icon" dialog
app/dashboard/page.tsx                             folder icon picker
components/collabboard/editors/CommentEditor.tsx   emoji insertion into comment text
```

- **`emoji-picker-react` remains installed.** `package.json` and
  `package-lock.json` are **unchanged** — §3e's census disproved the premise for
  removal, and removal was never authorized.

Verified at closure: exactly **three** `emoji-picker-react` import statements
remain in `components/` and `app/`, and they are precisely those three files.

### 13c. Migrated reaction sites — all 10

```
1.  FreeformPadletCards.tsx:955    Image (inline card)
2.  FreeformPadletCards.tsx:1902   Image (selected, no toolbar)
3.  FreeformPadletCards.tsx:4982   Image (right-positioned)
4.  FreeformPadletCards.tsx:5631   Image toolbar
5.  FreeformPadletCards.tsx:6078   Card Post Modal
6.  ClipartCardDraftModal.tsx:331  Clipart draft
7.  CanvasClient.tsx:8151          CanvasClient image toolbar
8.  NoteEditor.tsx:758             Note
9.  TodoEditor.tsx:538             Todo
10. LinkEditor.tsx:520             Link
```

Verified at closure: **10 `<EmojiReactionPicker` production render sites**
(12 repository-wide, of which 2 are inside `EmojiReactionPicker.test.tsx`),
and **6 files import it**.

### 13d. Shared picker

- **Every post Reaction path uses the in-repo `EmojiReactionPicker`.**
- **No post Reaction path renders `.EmojiPickerReact`.**
- **No private second compact picker was added** — one component, one source of
  truth. This was a live risk: re-implementing a "similar" compact picker per
  editor would have satisfied the screenshots and defeated the patch.
- Same compact structure and dimensions across post types.
- Panel placement and **one-click sibling-panel transitions preserved**,
  including the PATCH-124-era caption/reaction switching.
- **Closing without selecting does not mutate reactions.**

### 13e. Search fix (§3a) — delivered

- Glyph-only matching is **replaced with keyword-indexed search**. The prior
  `emoji.includes(searchQuery)` compared a glyph against typed text and could
  never match a word.
- Search text is composed from **emoji + category label + curated keywords**,
  lowercased.
- **Case-insensitive**; **whitespace trimmed**; **empty query returns the full
  compact set**; **emoji glyph queries still work**; **nonsense queries are
  safe** (empty result, no crash).
- Textual terms including `smile`, `happy`, `laugh`, `heart`, `fire` and
  `thumbs up` now work.
- **No new dependency and no external API** was introduced.
- The compact set remains **intentionally limited**.

**Recorded non-blocking debt:** the keyword catalog is **hand-curated and not
exhaustive** — 42 curated entries against ~163 emoji. Terms outside the catalog
fall back to category-label and glyph matching. This is an improvement over a
search that could never match anything, not a complete emoji index.

### 13f. Reaction semantics — PICKER UI ONLY

**PATCH-125 changed the picker, not the semantics. Semantics remain divergent
by editor, deliberately.** Verified at closure:

```
Image / Card Post Modal / Clipart / CanvasClient   append   (duplicates allowed, count 2+)
Note        (NoteEditor.tsx:762)                   dedup-append
Todo        (TodoEditor.tsx:246-252)               toggle
Link        (LinkEditor.tsx:287-290)               toggle
```

**Nothing here implies semantics were standardized.** They were not. A reader
must not infer from "standardize post reactions" that reaction *behaviour* was
unified — only the *picker component* was.

**PATCH-126 owns any future semantics unification and remains DESIGNATED,
UNAUTHORED and UNAUTHORIZED.**

The retired PATCH-120 dedup rule did **not** return to append-semantics
editors. Note's dedup is **pre-existing, independent, and untouched** — it is
not the PATCH-120 rule reinstated.

### 13g. Persistence routes — all unchanged

```
updatePostFieldsPreservingFailureChannels   FreeformPadletCards :955, :5631
updatePadletMetadata                        FreeformPadletCards :1902, :4982, :6078; CanvasClient :8151
updateMetadata / onChange                   Clipart draft (:335)
local setReactions                          Note, Todo, Link
```

Verified at closure: **20** `updatePostFieldsPreservingFailureChannels` and
**75** `updatePadletMetadata` occurrences remain in `FreeformPadletCards`, and
the Clipart draft still writes through `updateMetadata({ reactions: … })`.

**No update-route crossover.** **No persistence logic moved into
`EmojiReactionPicker`** — the shared component still only reports a selection
through `onSelectEmoji`, and each call site owns its own write. That separation
is what made a 10-site migration safe.

### 13h. Boundaries — verified unchanged at closure

```
ReactionDisplay.tsx        CardPreview.tsx         CardActionsToolbar.tsx
TextStylePopup.tsx         InlineCaption.tsx       IconSelector.tsx
app/dashboard/page.tsx     CommentEditor.tsx       package.json
package-lock.json
```

Repositories, schema and RLS untouched. Protected paths untouched (§13k).

- **PATCH-123's picker-choice ruling is SUPERSEDED — that ruling only.**
  **PATCH-123 remains CLOSED.** Its caption reader, `metadata.captionStyle`,
  the `{...base, ...preset}` merge, the `ReactionDisplay` reuse, the draft
  persistence route, and §13c's retirement of the PATCH-120 dedup rule all
  stand.
- **PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
- **PATCH-118 and PATCH-119: UNTOUCHED.**

### 13i. Tests

- **All 10 reaction call sites are census-bound** — a static guard counts them,
  so a future call site that reaches for `emoji-picker-react` fails the suite.
- **All 3 non-reaction consumers are census-bound**, so they cannot be migrated
  by accident.
- **The existing Clipart assertions were INVERTED, not deleted**
  (`ClipartCardDraftModal.test.tsx:981`, and the Playwright
  `.EmojiPickerReact` assertion). They previously *enforced the defect*; they
  now enforce the fix. Deleting them would have left a green suite that checked
  nothing.
- Image and Clipart use the **same** picker in real browser tests.
- **`.EmojiPickerReact` is absent from Reaction paths.**
- Text search works.
- Append duplicate count reaches **2**.
- Clipart persistence survives **save and reopen**.
- **Note, Todo and Link retain their distinct semantics** — the guard that
  proves the picker swap did not silently change three post types.
- **All three induced-failure proofs succeeded:** call-site, search, and
  append-semantics.

### 13j. Final validation

```
git diff --check            PASS  (CRLF warnings only)
npx tsc --noEmit            PASS
focused Vitest              55 PASS
full Vitest                 59 files / 703 tests PASS
PATCH-125 Playwright        3 PASS
existing Clipart Playwright 2 PASS
scoped ESLint               PASS  (exit 0, no findings)
call-site induced-failure   PASS
search induced-failure      PASS
append-semantics induced-failure PASS
independent review          PASS
```

**No production-build claim is made.** The `npm run build` failure recorded in
PATCH-123 §14h remains unresolved and unclassified; PATCH-125 does not inherit
it and does not assert the production build passes.

### 13k. Committed file list

**Production — 7 of 7 authorized:**

```
app/dashboard/canvas/[id]/CanvasClient.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/collabboard/editors/ClipartCardDraftModal.tsx
components/collabboard/editors/EmojiReactionPicker.tsx      (§3a search fix only)
components/collabboard/editors/NoteEditor.tsx
components/collabboard/editors/TodoEditor.tsx
components/collabboard/editors/LinkEditor.tsx
```

**Tests — 4:**

```
components/collabboard/EmojiReactionPicker.test.tsx                (new)
components/collabboard/ClipartCardDraftModal.test.tsx              (inverted)
e2e/characterization/clipart-draft-reactions-comments.spec.ts      (inverted)
e2e/characterization/patch-125-shared-reaction-picker.spec.ts      (new)
```

**Governance — 1:** `.fable5/patches/PATCH-125.md`

**Protected paths — not staged, not committed, still dirty, unmodified:**

```
.gitignore
app/api/ai/classify-intent/route.ts
app/api/ai/convert-component/route.ts
app/api/ai/generate-component/route.ts
scripts/live-access-login.mjs
```

Neither cleaned, reset, restored nor modified. `.env.local` untouched. No
worktree. No stash.

### 13l. Non-blocking notes

**These do not block closure.**

1. The compact picker remains limited to **~163 emoji** (§3b). Users who react
   with an emoji outside that set can no longer do so — an accepted,
   deliberate consequence of the owner's choice of the compact picker.
2. The **keyword catalog is hand-curated and not exhaustive** (§13e).
3. The five protected dirty paths are **unrelated and excluded**.
4. **Legacy lint debt in large files remains unrelated** to this patch; scoped
   ESLint on the changed files reports nothing.

### 13m. PATCH-125 — **CLOSED**

All §4 contract items hold. All 10 reaction sites migrated; all 3 non-reaction
consumers preserved; every persistence route intact; every editor's semantics
preserved; `ReactionDisplay` untouched. The §3a search defect — which would
have shipped a dead control to every post type — was fixed rather than
inherited. All three induced-failure proofs pass. Independent review PASS.
Scope verified at **7 production and 4 test files**, within the authorized
maxima. No prohibited file touched. No protected path staged.

**PATCH-125 is CLOSED.**

**PATCH-124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED and retired.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED** — owns §3d semantics
unification.

**Recorded debt carried forward:** the ~163-emoji ceiling; the hand-curated
keyword catalog; three-way reaction-semantics divergence (→ PATCH-126); five
duplicated reaction blocks inside `FreeformPadletCards` sharing one
`isImageEmojiOpen` state; the unresolved production-build failure; and the
PATCH-123 §14k / PATCH-124 §14l ledgers.
