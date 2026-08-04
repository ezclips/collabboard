# PATCH-140 — DOCUMENT PERSISTENCE, LIFECYCLE, RECONCILIATION

**Status:** **SUPERSEDED · NOT AUTHORIZED FOR IMPLEMENTATION · NO OWNED DEFECT REMAINS AT HEAD ·
NOT PUSHED**
**Authored:** 2026-08-04 (governance architect). **Base:** `d6e16dc`. **First authoring of this
number** — `git log --all --diff-filter=A -- .fable5/patches/PATCH-140.md` is empty.
**Released for governance by:** PATCH-151 §14o. **Option D.**
**Both allowlists are EMPTY. PATCH-139 and PATCH-151 are not reopened.**

---

## 1. The document never existed — reconstruction was required

`PATCH-140.md` had never been authored. This is the **fourth** occurrence in this sequence
(cf. PATCH-138, PATCH-139, PATCH-151), so the scope was reconstructed from governance history
rather than assumed.

### 1a. Number resolution

Two conflicting enumerations existed:

| Source | PATCH-140 subject |
|---|---|
| `PATCH-136 §12` (`:305`) | Links, backlinks, archive, reusable appearances |
| `PATCH-136 §18f` (`:1079`) | Document persistence / lifecycle |

**Resolved by `PATCH-138 §13`**, which states it fixes the sequence *"authoritatively here,
adopting `PATCH-136 §18f` and superseding the `PATCH-133`, `PATCH-134 §18f` and `PATCH-136 §12`
tables, so the §2 collision cannot recur."* Confirmed independently by `PATCH-139 §5` Option F:
*"140 = document persistence, 141 = links/backlinks."*

**PATCH-140 = document persistence, lifecycle, reconciliation.** PATCH-141 = links/backlinks.

### 1b. Substantive origin

The spec content lives in **`PATCH-133 §13`**, under its then-number **PATCH-137**
("Persistence, lifecycle, reconciliation, import/export compatibility"). It shifted
137 → 138 (`PATCH-134 §:894`) → **140** (`PATCH-136 §18f` / `PATCH-138 §13`).

**Reconstructed purpose (verbatim outcome):** *"documents survive reload, realtime,
Drawing↔Freeform, and workspace export/import."*

**Its three required first measurements — "none may be assumed":**
1. the `PATCH-133 §5a` HTML-vs-plain-text body-format question;
2. the `PATCH-133 §9a` Drawing-embeddable export/import round-trip loss;
3. behaviour of legacy `type: 'card'` rows **under the new `'document'` type**.

**Its hard stops:** any migration of existing `card` rows must be reversible and must not touch
clipart cards; no silent content loss (P3, repo rule 10). **Excludes:** links/backlinks/archive.

---

## 2. Source census at `d6e16dc` — every component measured, none assumed

| # | Component | Measured state at HEAD | Verdict |
|---|---|---|---|
| **1** | Documents survive **reload** | Body persists to `padlets.content` via `saveCard` (`hooks/canvas/usePadletSave.ts:973`), reached from `CanvasClient.tsx:1218`. `PATCH-133 §15` had already classified *"content stored only in transient component state"* as **NOT triggered** | **NOT DEFECTIVE** |
| **2** | Documents survive **realtime** | `components/collabboard/canvas/hooks/useCanvasData.ts:289-300` subscribes `postgres_changes`, `event: '*'`, `table: 'padlets'`, `filter: board_id=eq.<canvasId>` — content changes propagate, type-agnostically | **NOT DEFECTIVE** |
| **3** | Documents survive **Drawing↔Freeform** | Drawing keys off `link: padlet://<post-id>`, **not** post type — **40 live `padlet://` call sites** outside the fork. `PATCH-133 §9`: a document *"gets Drawing placement for free"* | **NOT DEFECTIVE** |
| **4** | Documents survive **workspace export/import** | See §3 — the §9a premise does not hold at HEAD | **PREMISE FAILS** |
| **5** | Legacy `card` rows under the new `'document'` type | **No `'document'` post type exists.** `types/collabboard.ts:97` union is `text\|image\|file\|table\|link\|todo\|container\|comment\|drawing\|card\|note\|ai-component`. `PATCH-134 §13` decided explicitly: *"No new document type or schema row — the created post is `type: 'card'`; no `'document'` value is written"*, and *"the persisted post type remains `card`"*. The `case 'document':` at `CanvasClient.tsx:5400` is a **toolbar tool id**, not a post type; `importKind: 'image' \| 'document'` is unrelated file-import taxonomy | **MOOT — the migration it guards can never occur** |
| **6** | `PATCH-133 §5a` HTML-vs-plain-text body format | Genuinely unresolved. `CardEditor` stores a plain `<textarea>` while `wordCount` strips `/<[^>]*>/` and render paths sanitise via `DOMPurify` — the format is ambiguous. **This is the document content-format foundation** | **REAL — but PATCH-149's (TipTap document foundation)** |

### 2a. Corrected paths

Governance history referenced these loosely; the current, verified paths are:

| Concern | Verified path at HEAD |
|---|---|
| Card save / persistence | **`hooks/canvas/usePadletSave.ts:973`** (`saveCard`) — *not* `lib/kanban/supabaseAdapter.ts:605`, which is the unrelated Kanban `saveCard` |
| Realtime subscription | **`components/collabboard/canvas/hooks/useCanvasData.ts:289`** |
| Export serialiser | **`lib/export/serialize.ts`** |
| Import restore | **`lib/import/restore.ts:47`** → RPC `import_workspace_bundle` |
| Post type union | **`types/collabboard.ts:97`** |

---

## 3. Measurement 2 resolved — the §9a export/import premise does not hold

`PATCH-133 §9a` asserted: *"PATCH-132 §19e measured that Excalidraw `embeddable` scene elements
did NOT survive an export/import round trip on a real board. A Drawing-placed document would
therefore keep its row and lose its canvas appearance."* It required this be **measured before
authorization**. Measured:

**a) There is no canvas-level scene to lose.** The `boards` table
(`supabase/baseline/schema_snapshot_2026-07-05.sql:1263-1288`) has **no scene, elements or
drawing column** — the columns are `user_id, title, description, layout, background, created_at,
sort_order, background_type, background_value, comments_enabled, reactions_enabled, thumbnail,
bookmarked, updated_at, thumbnail_url, last_visited_at, is_favorite, folder_id, deleted_at,
container_size, id, workspace_id`. The Drawing scene is **derived** from `padlets` rows.

**b) Everything the scene is derived from is exported.** `lib/export/serialize.ts:240-244`
selects `id, board_id, title, content, color, type, position_x, position_y, width, height,
file_url, file_name, file_type, file_size, location_*, metadata, created_at, updated_at` — i.e.
the body, **the placement columns**, and `metadata` (which carries `drawingData`,
`drawingAppState`, `drawingFiles`, `types/collabboard.ts:193-195`).

**c) The cited source is weaker than the citation.** `PATCH-132 §19e` is titled
**"YouTube / embedded — UNCLASSIFIABLE ON THIS BOARD"** and concludes *"Classification: YOUTUBE
FAILURE LAYER UNCLASSIFIABLE ON THIS IMPORTED BOARD… §5b remains open and cannot be closed from
this board."* It concerns a **YouTube/embedded-media element**, and it explicitly **declined to
classify**. `PATCH-133 §9a` restated it as a settled measurement. **It was not one.**

**Conclusion:** the document-placement loss §9a predicted is **not supported by the current
schema**. The residual embedded-media question is real but is neither document persistence nor
PATCH-140's; it remains where PATCH-132 left it — **`PATCH-132 §5b`, open, requiring a board that
retains a live embeddable element.** It is deliberately **not** given a new number here, because
it is an unconfirmed observation, not a measured defect.

**Honest limit of this measurement:** no live export→import round trip was executed (that needs a
real workspace and the RPC). The finding is **structural** — there is no scene column, and every
input the scene is rebuilt from is exported. That is sufficient to refute §9a's premise; it is not
a substitute for an end-to-end round-trip test, which belongs to whoever reopens `PATCH-132 §5b`.

---

## 4. Overlap analysis

| Against | Result |
|---|---|
| **PATCH-139** (closed) | Resolved the **modal experience** layer — capability-based normal-card routing. Does not touch persistence. **No overlap; must not be reopened.** |
| **PATCH-151** (closed) | Resolved clipart-card capability routing. **No overlap; must not be reopened.** |
| **PATCH-149** (reserved) | **Owns component 6.** The HTML-vs-plain-text question *is* the "TipTap document foundation" and "PDF-ready document architecture" already reserved to PATCH-149. Also owns save/close redesign, formatting handlers, terminology, header cleanup, and PATCH-151's brittle `handleSave` source guard |
| **PATCH-150** (reserved) | Presentation index domains. **No overlap whatsoever.** |
| **PATCH-141** (deferred) | Links/backlinks/archive — `PATCH-133 §13` records it as *"NOT AUTHORIZED and not authorizable"*, needing an entity/placement schema split and a search index. Unchanged |

**PATCH-151's brittle-guard observation is NOT absorbed here.** PATCH-140 never owned
`CardEditor.handleSave`; per the brief it stays with PATCH-149.

---

## 5. Selected option — **OPTION D · SUPERSEDED**

Of PATCH-140's six specified components: **three are not defective** (1, 2, 3), **one is moot**
(5 — the type it guards was never created), **one's premise fails** (4, §3), and **one is real but
owned by PATCH-149** (6).

**Nothing implementable remains under this number.**

**Attribution note — Option D's wording is imprecise for this case and is recorded as such.** The
option text reads *"PATCH-139 or PATCH-151 already fully resolved its product contract."* They did
**not** resolve persistence; they resolved the *modal experience* layer above it. The persistence
contract was satisfied by **pre-existing infrastructure** (durable `padlets.content`, realtime on
`padlets`, `padlet://`-keyed reconciliation, generic column export) plus **PATCH-134's decision not
to introduce a `'document'` type**. The *status* — nothing left to implement — is Option D's; the
*cause* is not. Recorded rather than smoothed over, so a future reader is not told 139/151 did work
they did not do.

**Why not the others:**

- **Not A** — its census is substantially obsolete; authorizing it unchanged would commission work
  against a type that does not exist.
- **Not B** — narrowing presupposes a residue this number still owns. After §2 there is none:
  component 6 is PATCH-149's by the brief's own boundary list, and §3's residue is PATCH-132 §5b's.
- **Not C** — amending a census only matters if authorization follows. It does not.
- **Not E** — no unresolved product decision blocks *this* patch. The open decision (document body
  format) is PATCH-149's to take, and PATCH-149 is already reserved for it.
- **Not F** — nothing here demands broad architecture, schema or permission change, because nothing
  here demands implementation.

---

## 6. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Product purpose cannot be reconstructed | **NOT TRIGGERED** — reconstructed from `PATCH-133 §13` via the `PATCH-138 §13` sequence fix (§1) |
| **Current source no longer contains the governed defect** | **TRIGGERED** — components 1–3 sound, 5 moot, 4's premise fails (§2, §3) |
| Patch duplicates a closed patch | **NOT TRIGGERED** — 139/151 own routing, not persistence |
| Requires reopening PATCH-139 or PATCH-151 | **NOT TRIGGERED** — neither is touched |
| **Depends on unresolved PATCH-149 product architecture** | **TRIGGERED** — the only live component (6) is the TipTap/body-format foundation, explicitly PATCH-149's |
| Crosses into PATCH-150 ownership | **NOT TRIGGERED** |
| Server-side authorization changes required | **NOT TRIGGERED** — none contemplated |
| File set cannot be bounded narrowly | **NOT APPLICABLE** — no implementation authorized |

**Two hard stops are triggered. Authorization stops here, as the brief requires.**

---

## 7. Allowlists — both EMPTY

**Production allowlist: EMPTY.** **Test allowlist: EMPTY.** No induced-failure plan, no negative
controls and no validation matrix are defined, because **no implementation is authorized**. The
repository baseline at `d6e16dc` — **66/66 Vitest files · 763/763 tests · 410 regenerated
declarations · 891 bridge-exclusion files** — is recorded as the reference state for whichever
patch runs next; PATCH-140 does not move it.

### 7a. Regression boundaries — binding on whoever comes next

Any successor patch must preserve, and must not weaken or bypass
**`selectCardModalRoute(canUseFreeformEditButton)`** where it is now authoritative
(`CanvasClient.tsx:5701` clipart branch, `:5705` normal-card branch,
`FreeformPadletCards.tsx:1761`):

PATCH-139 normal-card routing · PATCH-151 clipart-card routing · genuine read-only `CardEditor`
behaviour · the accessible `Close` control · the existing editable save path · the clipart
creation flow (`CanvasClient.tsx:7513`, gated upstream by `canUseCanvasToolbar`) · direct
`?openPadlet=` protection · the five protected worktree paths.

---

## 8. Status and dependencies

**PATCH-140: SUPERSEDED · NOT IMPLEMENTATION-AUTHORIZED · NOT NARROWED · NOT BLOCKED ON A PRODUCT
DECISION — there is simply no owned, live defect at `d6e16dc`.**

| Patch | Status |
|---|---|
| **PATCH-140** | **SUPERSEDED** (this document). Component 6 formally transferred to PATCH-149; §3's residue returned to `PATCH-132 §5b` |
| PATCH-139 | CLOSED — not reopened |
| PATCH-151 | CLOSED — not reopened |
| **PATCH-149** | **RESERVED · NOW THE NEXT IMPLEMENTATION PATCH** — document-post editor usability, save/close behaviour, header cleanup, PDF-ready preparation, **plus** PATCH-140 component 6 (body content format / TipTap foundation), plus PATCH-139 D3/D5/D6, plus PATCH-151 O1/O2/O4. **Requires its own authorization; not authorized here** |
| PATCH-150 | **RESERVED, separately** — presentation index-domain divergence; untouched and unabsorbed |
| PATCH-141 | DEFERRED — still *not authorizable* (`PATCH-133 §13`): needs the entity/placement schema split and a search index |
| PATCH-135 | Independently OPEN |
| PATCH-146 / 147 | RESERVED, non-blocking |
| PATCH-132 §5b | **OPEN** — embedded-media round-trip; needs a board retaining a live embeddable element |

**Next implementation patch: PATCH-149**, once authorized. Nothing in this document authorizes it.

---

## 9. Recorded diagnostic notes

- **A citation hardened as it travelled.** `PATCH-132 §19e` said *unclassifiable*;
  `PATCH-133 §9a` cited it as *measured*; every later table inherited the firmer version. The
  patch that finally had to act on it was the first to re-read the source. Cite the
  classification, not the anecdote.
- **A patch can be obsoleted by a decision taken inside a different patch.** `PATCH-134`'s choice
  not to create a `'document'` post type silently voided one of PATCH-140's three mandatory
  measurements. Nothing flagged it, because the sequence table only ever carried a title.
- **"Persistence" was the layer that already worked.** The document feature's visible problems were
  all in the *experience* layer — routing, capability, labels, blank viewers — which is where
  PATCH-138/139/151 actually landed. The entity layer was durable from the start; the roadmap
  assumed otherwise for four patch numbers.
- **An empty allowlist is a result.** Reconstructing a patch and concluding it has nothing to do is
  a legitimate output, and cheaper than discovering it mid-implementation.
