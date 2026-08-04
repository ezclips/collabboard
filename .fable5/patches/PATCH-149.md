# PATCH-149 — DOCUMENT POST USABILITY, MODAL CLEANUP, PDF-READY FOUNDATION

**Status:** **STAGED · PATCH-149A CLOSED (`c23be50`) · PATCH-149B0 CLOSED (`c9ea345`, review §17) ·
PATCH-149B1 **SPLIT after measurement** (§19) — corpus measured (2 Document rows, zero HTML,
predicate **P1 safe**), routing census corrected (`DrawingLayout` not reachable; the two reachable
routes are capability-gated but drop the title) · **PATCH-149B1a AUTHORIZED** · PATCH-149B1b BLOCKED
behind B1a · PATCH-149B2 BLOCKED behind B1b · PATCH-149C RESERVED · NOT PUSHED**
**Authored:** 2026-08-04 (governance architect). **Base:** `177645b`. **First authoring of this
number** — `git log --all --diff-filter=A -- .fable5/patches/PATCH-149.md` is empty.
**Inherits:** PATCH-138 label finding · PATCH-139 D3/D5/D6 · PATCH-140 component 6 ·
PATCH-151 O1/O2/O4. **PATCH-139 and PATCH-151 are not reopened.**

---

## 0. Input availability — recorded

The brief cited `/mnt/data/PFD_Plan(1).zip`. **That path does not exist in this environment.**
The plan was located and read in full at
**`C:\Users\rmeic\.gemini\antigravity\brain\PFD_Plan\`** (extracted directory; `.zip`/`.rar`
copies also present, plus `C:\Users\rmeic\Projects\dev\PFD_Plan.zip`).

Read: `implementation_plan_PDF_Document_Integration.md` (v2.0, 2026-07-19, authoritative),
plus the directory listing of `patch_090.md`–`patch_105.md`, `implementation_plan_LLM.md`,
`review_and_improvements.md`. **No governance below rests on an unread file.** ("PFD" is the
archive's own spelling of "PDF"; cf. `PATCH-133:1191`, where the same typo silently voided a
reconciliation table.)

---

## 1. The finding that governs everything else

**The Document Post is built on the wrong editor, and the right one already exists.**

| | Document Post (today) | Note Post (today) |
|---|---|---|
| Created by | toolbar `case 'document'` → `CanvasClient.tsx:5400-5418` | toolbar `case 'note'` → `:5398` |
| Persisted type | **`type: 'card'`** (PATCH-134: no new type) | `type: 'text'`/`'note'` |
| Modal opened | `setIsCardEditorOpen(true)` → **`CardEditor.tsx`** | `setIsNoteEditorOpen(true)` → **`NoteEditor.tsx`** |
| Size | **175 lines** | **1,165 lines** |
| Editor | plain **`<textarea>`** | **TipTap** — `useEditor`, `StarterKit`, `Underline`, `FontSize`, `Comment`, `CalloutExtension` |
| Formatting toolbar | 5 buttons, **zero `onClick`** | `NoteEditorToolbar.tsx` (240 lines) — bold, italic, underline, bullet/ordered list, align, link, font size, **all wired** |
| Persistence format | plain text | **HTML** via `editor.getHTML()` (`:658`, `:286`) |
| Extension registry | none | **`NOTE_EXTENSIONS`** (`:24-29`) |

**TipTap is already a dependency** — `@tiptap/react` ^3.0.7, `starter-kit` ^3.0.7, plus
`extension-underline`, `-link`, `-highlight`, `-color`, `-text-style`, `-placeholder` (^3.13.0),
`package.json:62-69`.

**The authoritative PDF plan targets the editor the Document Post does not use.** Its §1 Design
Decision: *"The `note` post (TipTap editor) is the home for assembling text highlights into
structured Markdown/HTML documents… Document assembly is restricted to the `note` post."* Its
Phase 2 integration point is **`[MODIFY] components/collabboard/editors/NoteEditor.tsx`**.

This is a **P6 "one implementation per concern" duality**, and it is the root cause of user
defect 1, of PATCH-140's transferred body-format question, and of the PDF-foundation choice.
**All three are one decision**, which is why they are split out below rather than guessed at.

---

## 2. Source census at `177645b`

| Concern | Exact path | Current behaviour | State owner | Persistence | Read-only | 149? |
|---|---|---|---|---|---|---|
| Document creation | `app/dashboard/canvas/[id]/CanvasClient.tsx:5400-5418` | builds `type:'card'`, `id:'new'`, opens CardEditor | `setPadletToEdit` | — | n/a | **149B** |
| Document tool id | `components/collabboard/canvas/ui/canvasToolbarRegistry.tsx` | tool id `'document'`, `FileText` (PATCH-134) | registry | — | n/a | no |
| Post type union | `types/collabboard.ts:97` | **no `'document'` member**; documents are `'card'` | schema | — | n/a | **binding** |
| Document modal | `components/collabboard/CardEditor.tsx` | textarea + decorative toolbar | local `useState` | plain text | genuine (PATCH-139/151) | **149A + 149B** |
| Header icon block | `CardEditor.tsx:86-97` | **`w-16 h-16` block, `backgroundColor: metadata?.iconBgColor \|\| '#ec4899'` (pink); `<img>` only when `metadata?.svgUrl`** | — | — | separate branch | **149A** |
| Formatting toolbar | `CardEditor.tsx:133-142` | 5 `<Button>`s, **no handlers** | — | nothing | absent when read-only | **149B** |
| Title input | `CardEditor.tsx:100-106` | editable input (`!readOnly` only) | `title` state | `padlets.title` | absent | 149A (layout only) |
| Content state | `CardEditor.tsx:145-151` | `<textarea>`, native `readOnly` | `content` state | `padlets.content` | correct | **149B** |
| Save handler | `CardEditor.tsx:58-72` `handleSave` | read-only → `onClose()`; else `onSave(...)` then `onClose()` | — | via `usePadletSave.ts:973` | short-circuit | **149A (guard) + 149B (semantics)** |
| Close handlers | `CardEditor.tsx:78` backdrop, `:124` X button | **both call `handleSave`** — close *is* the commit | — | — | non-writing | **149B** |
| Explicit Save button | — | **none exists anywhere in CardEditor** | — | — | — | **149B** |
| Escape handling | — | **no key handler** (PATCH-139 §13g) | — | — | — | 149B |
| Real document editor | `components/collabboard/editors/NoteEditor.tsx` | TipTap, working toolbar, HTML | `useEditor` | **HTML** | — | **149B** |
| Note toolbar | `components/collabboard/editors/NoteEditorToolbar.tsx` | wired controls | props | — | — | **149B** |
| Clipart read-only viewer | `CardEditor.tsx:117-124` | `<img svgUrl>` + `{title \|\| 'View Document'}` | — | — | PATCH-151 | **regression guard only** |
| Capability routing | `CanvasClient.tsx:5701`, `:5705`; `FreeformPadletCards.tsx:1761` | `selectCardModalRoute(canUseFreeformEditButton)` | — | — | closed | **frozen** |
| Labels | `CardPreview.tsx:71,149` `Open card` · `CardActionsToolbar.tsx:79` `Card view` | see §5 | — | — | — | **149A (partial)** |
| Tests | `components/collabboard/CardEditor.test.tsx` (16) · `CardPreview.test.tsx` (29) · `ClipartCardDraftModal.test.tsx` (45) · `lib/domain/canvas/cardModalRoute.test.ts` (6) | green | — | — | — | — |

### 2a. Identity answer — required by the brief

The current "Document" is: **a `card` post** (`types/collabboard.ts:97`), created by a
**toolbar-only `document` tool id**, rendered in **`CardEditor`**, whose content is
**plain textarea text** — *not* TipTap, *not* deliberate HTML. It is a **mixed legacy
implementation**: `CardEditor`'s own `wordCount` strips `/<[^>]*>/` (`:56`) and card bodies are
sanitised with `DOMPurify` on render, so HTML *may* already be present in some rows from other
paths, while the editor itself writes plain text. **The stored shape is not uniform and must be
measured per-row before any conversion** (§7).

**PATCH-134's no-new-type decision stands.** Nothing in this census is a hard blocker requiring a
`'document'` padlet type, and none is authorized.

---

## 3. Defect-by-defect result

| # | User-reported defect | Root cause at HEAD | Disposition |
|---|---|---|---|
| **1** | Formatting/style buttons don't work | `CardEditor.tsx:135-140` — five `<Button>`s with **no `onClick` whatsoever**. A `<textarea>` cannot support rich formatting; a working TipTap editor exists elsewhere (§1) | **149B** — see §4 |
| **2** | No clear way to leave/finish the active text/container | **NOT LOCATED.** `CardEditor` is a textarea inside a modal with no focus trap, no key handler and no container concept — the defect is not reproducible there. Candidates: `NoteEditor` TipTap node/container editing, or Excalidraw canvas text/container editing | **NOT AUTHORIZED** — §8 |
| **3** | Underline/line-post element present where it shouldn't be | **NOT ATTRIBUTABLE.** `CardEditor` has **no** underline control and no line control. `Underline` exists only in `NoteEditorToolbar`/`NoteEditor` (legitimately). A canvas "line mode" exists in `FreeformPadletCards`. The brief forbids conflating text-underline with horizontal-rule | **NOT AUTHORIZED** — §8 |
| **4** | Pink clipart icon + empty reserved placeholder in the document modal header | **CONFIRMED, exactly.** `CardEditor.tsx:86-97`: a `w-16 h-16` (64px) rounded block painted `metadata?.iconBgColor \|\| '#ec4899'` — **pink** — whose `<img>` renders only `{metadata?.svgUrl && …}`. A Document post has **no `svgUrl`**, so the block renders **empty and pink**, consuming 64px + `gap-6` | **149A** |
| **5** | Title/content should reclaim the removed space | Direct consequence of 4; the title `<div className="flex-1">` sits beside the block | **149A** |
| **6** | Coherent terminology and flow | §5 | **149A (partial) + 149B** |
| **7** | Editable close is the only persistence path | **CONFIRMED.** Backdrop (`:78`) and X (`:124`) both call `handleSave`; **no Save button exists**. PATCH-139 D3 | **149B — product decision** |
| **8** | Read-only must remain genuinely non-editable | Already true and independently proven (PATCH-139 §13f, PATCH-151 §14d) | **regression guard only** |
| **9** | Brittle whole-file `handleSave` source guard | `CardEditor.test.tsx` asserts `toContain('if (readOnly) {')` over the whole file. PATCH-151 §14i **demonstrated** it passes while the short-circuit is deleted, if the literal exists elsewhere | **149A** |

### 3a. Formatting-control census (brief-mandated classification)

`CardEditor.tsx:135-140`, all five:

| Control | Handler | Classification |
|---|---|---|
| Bold | none | **C — unsupported by the current editor** |
| Italic | none | **C** |
| Link | none | **C** |
| List | none | **C** |
| AlignLeft | none | **C** |

**All five are class C, not A or B.** None is "merely unwired": a plain `<textarea>` has no rich
representation to toggle. Wiring them would mean adding an editor — and `NoteEditor` already is
that editor. This is precisely why the brief's instruction *"wire a supported control correctly, or
remove the unsupported control"* cannot be executed without first settling §4: under
`CardEditor`, the supported set is **empty**, so "remove" would mean shipping a Document Post with
**no formatting at all** — which the brief's own false-green rule flags. **The contradiction is
resolved by the editor decision, not by choosing a side of it here.**

---

## 4. PATCH-149B — the product decision that must be taken first

**Question:** *what is the Document Post's editor?*

| | **Option B1 — Route Documents to `NoteEditor` (TipTap)** | **Option B2 — Keep `CardEditor`, strip its fake toolbar** |
|---|---|---|
| Defect 1 | Fixed — handlers already exist and work | Not fixed; Document Post ships with no formatting |
| Body format (PATCH-140 §6) | Resolved — HTML via `getHTML()` | Unresolved; stays plain text |
| PDF foundation | **Option P1 available immediately** — `NOTE_EXTENSIONS` is the extension registry the plan needs; a future `PdfHighlight` node attaches without replacing the editor | P2/P3 needed later, and the plan's named integration point would still not be the Document |
| PDF plan alignment | Matches §1 exactly ("document assembly is restricted to the `note` post") | Diverges from the authoritative plan |
| P6 duality | Resolved — one document editor | Preserved — two |
| Cost/risk | Existing `type:'card'` document rows hold **plain text**; TipTap must load them safely. Modal ownership, PATCH-139/151 routing targets and the read-only viewer all point at `CardEditor` today | Small and contained |

**This is not a decision governance may take unilaterally.** It changes which modal a Document
opens, and it implies a **content-format compatibility strategy for existing rows** (§7). The
brief forbids inventing a new architecture and requires preferring the narrowest correction —
but the narrowest correction (B2) *knowingly leaves the headline defect unfixed* and diverges from
the authoritative plan. **Recorded as a decision request, per the brief's own instruction to
record rather than invent.**

**Also inside 149B:** save-versus-close. Census: X and backdrop both commit; **no Save button; no
Escape handler; `padletToEdit.id === 'new'` distinguishes create from update**
(`usePadletSave.ts:973-1000`), and the empty-draft guard silently discards blank new documents.

| Save/close option | Assessment |
|---|---|
| **A — explicit Save + non-saving close** | Cleanest, but **destructive without a discard flow**: today every close commits, so users have never been asked to save. Requires new UI + dirty tracking + discard confirmation |
| **B — save-on-close, clearly communicated** | Narrowest; preserves persistence exactly; needs only honest labelling ("Done"/"Save & close") |
| **C — auto-save** | Largest change; no dirty/undo model exists |
| **D — blocked on product decision** | **SELECTED** |

**Selected: OPTION D — BLOCKED.** A and B are both defensible and the choice is user-facing and
irreversible in effect. The brief explicitly anticipated this: *"If source evidence cannot resolve
this safely, record a product decision request rather than inventing destructive behaviour."*
Source evidence resolves *what happens today*; it cannot resolve *what should*.

---

## 5. Terminology contract

Settled now (149A), because it is independent of §4:

| Concept | Contract |
|---|---|
| Opening an existing card/document | **`Open card`** — already shipped by PATCH-139 §13n at `CardPreview.tsx:71,149`; **retained, not renamed again** |
| Obsolete "Card view" action | `CardActionsToolbar.tsx:79` `label: 'Card view'` opens the **editable** editor and is governed by a `showCardView` flag with **four readers, one declaration and zero writers** (PATCH-139 §12). **Authorized for removal in 149A** — it is a mode toggle that can never be on, and PATCH-134 Scope C already reserved its removal |
| Editable document modal title | Deferred to 149B — the title depends on which editor owns it |
| Read-only document modal title | `View Document` — **retained** (PATCH-151 §14e proved the fallback); **must not regress** |
| Inverted labels | The PATCH-138 inversion (`Edit card` → read-only viewer) was **already dissolved** by PATCH-139's capability routing plus the neutral `Open card`. **Nothing inverted remains.** No half-rename is authorized |

---

## 6. PDF-ready foundation — **OPTION P4 (defer), with the seam documented**

**Selected: P4 — DEFER STRUCTURAL CHANGE.** Not because no seam is possible, but because
**the seam is determined by §4**:

- If **B1** is chosen, the correct option becomes **P1 — existing TipTap document model**, at
  near-zero cost: `NOTE_EXTENSIONS` (`NoteEditor.tsx:24-29`) is already an extension registry, and
  the repo already ships custom nodes (`extensions/FontSize`, `extensions/Comment`,
  `CalloutExtension`) — the exact pattern a future `PdfHighlight` node would follow.
- If **B2** is chosen, a **P2/P3** envelope or adapter must be introduced later, against plain
  text.

**Authorizing a foundation now would mean building an adapter for an editor that may be replaced
in the next patch.** That is the rebuild the brief exists to avoid.

**The seam future PDF patches will use — recorded, as P4 requires:**

1. **Node registry:** `NOTE_EXTENSIONS`, `NoteEditor.tsx:24-29` — where a `PdfHighlight` node
   registers (plan Phase 2 / PATCH-100).
2. **Serialization boundary:** `editor.getHTML()` (`:658`) on write, `content: initialContent`
   (`:235`) + the `:286` reconciliation on read.
3. **Reference metadata carrier:** node attributes — `pdfDocumentId`, `pdfHighlightId`,
   `pageNumber`, `bbox`, `colour`, `excerpt`, `sourceFilename`, `sourceNavigationTarget`. These
   are **node attrs, never improvised text strings**, and never loose `padlets.metadata` keys.
4. **Live-reference rule:** the plan's §3.1 *"Paste-as-embed creates a live reference (not a
   copy)"* — the node stores identifiers, the excerpt is display cache only.
5. **Sources/backlinks:** the plan's `note_post_links` table + Phase 2 badge UI. **Nothing is
   reserved in the UI now** — no empty panel, no placeholder.

**Explicitly not added by any part of PATCH-149:** `pdfjs-dist`, `react-pdf`, PDF schema or
migrations, `pdf_documents`, `pdf_pages`, `pdf_highlights`, `note_post_links`, upload, viewer,
highlight creation, a `'pdf'` post type, source badges, backlinks UI, drag-and-drop PDF logic, or
a `PdfHighlight` node implementation. **Plan Phase 0 is not started here.**

---

## 7. Legacy compatibility

**Measured shape:** `padlets.content` is `TEXT`. `CardEditor` writes **plain text**;
`NoteEditor` writes **HTML**; `CardEditor:56` strips tags for `wordCount` and render paths
sanitise via `DOMPurify`, so **some `type:'card'` rows may already contain HTML** from non-editor
paths. The corpus is therefore **mixed and unmeasured per row**.

**Binding rules for whichever option §4 selects:**

- **Read compatibility is mandatory** — every existing document must open. TipTap accepts an HTML
  string, so plain text loads as a single paragraph; this must be **proven on a real stored row**,
  not assumed.
- **No bulk conversion.** The brief forbids silently converting all documents; PATCH-133's hard
  stop requires any `card`-row migration to be **reversible** and to **never touch clipart cards**
  (`metadata.svgUrl` is the discriminator).
- **Lazy conversion only**, on explicit user edit, if conversion happens at all.
- **Schema-free.** No migration is authorized by PATCH-149. If 149B's implementation is found to
  require one, that is a **hard stop** and must return to governance.

---

## 8. Unlocated defects — NOT AUTHORIZED, reproduction required

Defects **2** (cannot exit the active text/container) and **3** (underline/line-post artefact)
**could not be located in the Document modal**, and the brief forbids guessing
(*"Do not guess. Base the selected solution on current source."*).

`CardEditor` has no container concept, no focus trap, no key handler, no underline control and no
line control. The plausible homes are **`NoteEditor`** (TipTap node/container editing) or
**Excalidraw canvas text/container editing** — and the brief's own hard stop says that if the exit
defect belongs to Excalidraw and cannot be bounded, authorization must stop.

**Required before authorization:** which surface, reproduced — the Document modal, the Note modal,
or the canvas. A one-line answer converts both into bounded work; without it, any allowlist would
be speculative.

---

## 9. PATCH-149A — AUTHORIZED SCOPE

Everything here is independent of §4, demonstrable at parent, and cannot be invalidated by the
editor decision.

### Production allowlist — exact

| # | Path | Permitted change | Max lines | Forbidden neighbours |
|---|---|---|---|---|
| 1 | `components/collabboard/CardEditor.tsx` | In the **`!readOnly`** header branch only (`:86-97`): stop rendering the icon block when `metadata?.svgUrl` is absent, so the title reclaims the width | **12** | Must not touch `handleSave`, the textarea, the footer, the `readOnly` branch (`:117-124`, PATCH-151), the close button, or the decorative toolbar (`:133-142`, that is 149B) |
| 2 | `components/collabboard/editors/CardActionsToolbar.tsx` | Remove the obsolete **`Card view`** entry (`:79`) and its now-unused `onToggleCardView` wiring | **20** | Must not alter colour/icon/caption/reaction/comment entries, or any other label |
| 3 | `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | Remove only the `onToggleCardView` prop passed to the **live** toolbar (`:6008-6012`) | **8** | **Must not touch `onEditContent` (`:1758-1766`) or `selectCardModalRoute`**; must not touch the dead `{false && …}` block (`:1789`) |

**Production total ≤ 40 changed lines.** `CanvasClient.tsx` is **not** allowlisted — no route
ownership requires it. `ClipartCardDraftModal.tsx`, `CardPreview.tsx`, `NoteEditor*`,
`usePadletSave.ts`, `package.json`, schema, presentation code and the Excalidraw fork are frozen.

### Test allowlist — exact

| # | Path | Coverage | Max lines |
|---|---|---|---|
| 1 | `components/collabboard/CardEditor.test.tsx` | document header renders **no** icon block and **no** pink `#ec4899`; clipart read-only viewer still renders image + title (PATCH-151 regression); **scoped** `handleSave` guard replacing the whole-file substring | **45** |
| 2 | `components/collabboard/ClipartCardDraftModal.test.tsx` | only if removing `onToggleCardView` touches its asserted toolbar prop set | **20** |

**The scoped guard replaces PATCH-151 O1's brittle assertion** and must slice to the handler:

```ts
const src = fs.readFileSync('components/collabboard/CardEditor.tsx', 'utf8');
const body = src.slice(src.indexOf('const handleSave'), src.indexOf('};', src.indexOf('const handleSave')));
expect(body).toMatch(/if \(readOnly\)\s*\{\s*onClose\(\);\s*return;/);
```

No jsdom, no Testing Library, no Playwright, no `package.json` change.

### Induced failures — each demonstrable at `177645b`

1. Rendering `CardEditor` editable with document metadata (**no `svgUrl`**) yields
   `backgroundColor:#ec4899` and a `w-16 h-16` block → header test fails.
2. `CardActionsToolbar` source/render contains `label: 'Card view'` → terminology test fails.
3. The current guard passes while `handleSave`'s short-circuit is deleted (PATCH-151 §14i
   reproduced this) → the scoped guard fails at parent, the whole-file one does not.

### Negative controls — reverted, never committed

1. Restore the icon block for a no-`svgUrl` document → header test fails.
2. Reintroduce `Card view` → terminology test fails.
3. Delete `handleSave`'s short-circuit **while adding `if (readOnly) {` elsewhere** → the scoped
   guard must fail (the whole-file guard did not — that is the point).
4. Remove the clipart `<img>` from the read-only branch → PATCH-151 regression test fails.
5. Replace `selectCardModalRoute` at either call site → PATCH-151's route guard fails.

### Validation matrix

Focused `CardEditor` · `CardPreview` (29/29 unchanged) · `ClipartCardDraftModal` (45/45 unless
allowlisted) · `cardModalRoute` route guards (6/6) · **full Vitest** (baseline **66 files /
763 tests**) · clean one-run `npm run typecheck` (**410** declarations, exit 0) ·
`npx tsc --noEmit` · `npx next build` · bridge exclusion (**891** files, no marker) · clean E2E
build (marker `1`) · ordinary `.next` restored · `git diff --check` · only the five protected
paths outside committed history.

### False-green protection

Reject: styling-only changes · removing the icon block from the **read-only clipart** branch ·
leaving a layout gap where the block was · renaming `Open card` again · half-renaming the
terminology pair · touching `selectCardModalRoute` · whole-file substring guards where slicing is
possible · absorbing any 149B item · adding PDF anything.

---

## 10. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Current editor identity cannot be established | **NOT TRIGGERED** — established precisely (§1, §2a) |
| **Save-versus-close requires an unresolved destructive product decision** | **TRIGGERED → 149B** (§4) |
| Structured-content preparation requires a schema migration | **NOT TRIGGERED** — P4 defers; no migration authorized |
| **Formatting fixes require replacing the editor** | **TRIGGERED → 149B** — all five controls are class C; the fix *is* an editor decision (§3a) |
| **Text/container exit defect belongs to Excalidraw and cannot be bounded** | **TRIGGERED (unresolved)** — not located; §8 |
| PDF preparation would require Phase 0 | **NOT TRIGGERED** — Phase 0 explicitly not started |
| File set cannot be narrowed | **NOT TRIGGERED for 149A** — 3 files, ≤40 lines |
| Existing document compatibility cannot be preserved | **NOT TRIGGERED** — untouched by 149A; binding rules set for 149B (§7) |

**Three hard stops trigger, all inside 149B. None blocks 149A.** Hence the split.

---

## 11. Status and dependencies

**PATCH-149A: OPEN · AUTHORIZED · ≤40 production lines across 3 files.**
**PATCH-149B: OPEN · BLOCKED — two product decisions required:**

> **B-i — Document editor identity.** Should the Document Post open **`NoteEditor` (TipTap)** —
> fixing formatting, resolving the body format, unlocking PDF Option P1 and matching the
> authoritative plan, at the cost of a compatibility strategy for existing plain-text `card` rows —
> or remain on **`CardEditor`** with its five non-functional controls removed?
>
> **B-ii — Save versus close.** Keep **save-on-close** (today's behaviour, relabelled honestly), or
> introduce an **explicit Save with a non-saving close**, which requires dirty tracking and a
> discard flow?

**Also required, not a decision but a reproduction:** which surface exhibits defects 2 and 3 (§8).

| Patch | Status |
|---|---|
| **PATCH-149A** | **OPEN · AUTHORIZED** |
| **PATCH-149B** | **OPEN · BLOCKED** on B-i and B-ii |
| PATCH-139 / 151 | CLOSED — routing frozen, not reopened |
| PATCH-140 | SUPERSEDED — its component 6 is B-i |
| PATCH-150 | **RESERVED, separate** — presentation index-domain divergence; untouched |
| PATCH-141 | DEFERRED — not authorizable |
| PATCH-135 · 146 · 147 | OPEN / RESERVED, non-blocking |
| PDF plan PATCH-090…105 | **Future work, architectural dependency only.** Phase 0 not started |

---

## 12. Recorded diagnostic notes

- **The feature was built on the wrong side of a duality nobody re-checked.** A 1,165-line TipTap
  editor with a fully wired toolbar sat one directory away while the Document Post shipped a
  175-line textarea with five painted buttons. Four patches refined the *routing to* that textarea
  without asking whether it was the right destination.
- **"Buttons don't work" was an architecture report.** The five controls are not broken wiring;
  they are a rich-text toolbar drawn over a plain textarea. Classifying them A/B/C/D — as the
  brief demanded — is what converted a bug list into a design decision.
- **The authoritative plan already named the answer.** Its §1 says document assembly lives in the
  `note` post and its Phase 2 modifies `NoteEditor.tsx`. The PDF work was never going to attach to
  `CardEditor`; PATCH-149 is where that becomes visible instead of expensive.
- **An empty pink square is a precise bug.** `iconBgColor || '#ec4899'` with a conditional `<img>`
  renders nothing but its own background whenever the card has no clipart — the defect the user
  described in colour, reproduced exactly from source.

---

## 13. PATCH-149A — INDEPENDENT CLOSURE REVIEW

**Reviewed:** 2026-08-04 (independent closure reviewer). **Implementation commit:** `c23be50`
`fix(document): clean modal header and remove dead card view`. **Parent:** `a53a5f0`. All evidence
below was re-executed independently in this review, not taken from the implementation's own
report.

### Source-scope result

Confirmed via `git diff a53a5f0 c23be50 --numstat`: **exactly five files**, all within budget.

| File | Lines changed | Budget | Result |
|---|---|---|---|
| `CardEditor.tsx` | 6 (2 ins / 4 del) | ≤12 | ✓ |
| `editors/CardActionsToolbar.tsx` | 9 (1 ins / 8 del) | ≤20 | ✓ |
| `canvas/ui/FreeformPadletCards.tsx` | 5 (0 ins / 5 del) | ≤8 | ✓ |
| `CardEditor.test.tsx` | 36 (34 ins / 2 del) | ≤45 | ✓ |
| `ClipartCardDraftModal.test.tsx` | 2 (1 ins / 1 del) | ≤20 | ✓ |

**Production total: 20 lines** (budget ≤40). `git diff a53a5f0 c23be50 -- <frozen paths>` returned
empty for `CanvasClient.tsx`, `lib/domain/canvas/cardModalRoute.ts`, `NoteEditor.tsx`,
`NoteEditorToolbar.tsx`, `ClipartCardDraftModal.tsx`, `CardPreview.tsx`, `package.json`, `.fable5`.
**Confirmed unchanged.**

### Ordinary Document header result

Confirmed by direct source read: `CardEditor.tsx:86-95` now reads
`{metadata?.svgUrl && <div className="w-16 h-16 …">…</div>}`. For a document with no `svgUrl`,
**the entire block — including its `gap-6` contribution — is absent**, not merely visually hidden;
this was verified with a fresh `renderToStaticMarkup` render showing no `w-16 h-16`, no `#ec4899`,
no `<img>` in the output. The title `<div className="flex-1">` is the header's only remaining
child, so it reclaims the full width. **Not a hidden-but-space-consuming false green.**

### Clipart regression result

Verified against both branches: editable branch (`:86-95`, `!readOnly`) still renders the `<img>`
when `svgUrl` is present (confirmed via render); read-only branch (`:114-123`, PATCH-151's viewer,
**untouched by this diff**) still renders `<img src={metadata.svgUrl}>` with `View Document`
fallback. `ClipartCardDraftModal.tsx` has **zero diff** — confirmed directly, not inferred. Creation
flow (`ClipartCardDraftModal`'s own `CardEditor` mount at `:427-443`) is unchanged.

### Reclaimed-layout result

Confirmed: the conditional wraps the *entire* 64px block plus its `shadow-inner`/background, not
just the `<img>` — there is no leftover empty pink square and no reserved column. **Not rejected.**

### Dead Card view result — Classification A

`CardActionsToolbar.tsx`'s `tools` array no longer contains a `'Card view'` entry (confirmed by
direct read of the current tool list: Color, Icon, optional Caption, Reaction, Comment). The live
prop wiring at `FreeformPadletCards.tsx:6010-6015`(new) no longer passes `onToggleCardView`
(confirmed by diff — 5 lines removed, `onEditContent` at `:1758-1766` untouched). The **dead**
`{false && cardToolbarPadletId === padlet.id && (…)}` block (`:1791`) still contains its own
`onToggleCardView` at `:1808` — read directly and confirmed unreachable (`false &&` short-circuits
before evaluation; `cardToolbarPadletId` cannot make it reachable).

Grep for `showCardView` repo-wide (9 hits) confirms it has **zero writers** outside governance
prose and the type declaration — only readers remain (`FreeformPadletCards.tsx:1768,1795,5992`,
`ClipartCardDraftModal.tsx:180`). No live or user-visible route to the removed action exists
anywhere in the codebase.

**One thing worth recording that the implementation report did not claim, and that this review
verified independently:** removing the `'Card view'` entry from `CardActionsToolbar`'s shared
`tools` array — rather than only removing the prop at each call site — also **inertly dead-ends**
`ClipartCardDraftModal.tsx`'s own `isCardViewOpen`/`setIsCardViewOpen` state (`:59, :194-196,
:428-440`). That state's only setter is inside the `onToggleCardView` callback passed to
`CardActionsToolbar`, and since the toolbar no longer renders a button that invokes it, the
callback — and the `CardEditor` it would open at `:427-443` — is now unreachable through the UI,
**without a single line changing in the frozen file**. The test `'keeps Color, Icon, and Card view
actions functional'` (`ClipartCardDraftModal.test.tsx:871-884`) still passes because it invokes
`props.onToggleCardView()` directly off the React element `ClipartCardDraftModal` authored, bypassing
`CardActionsToolbar`'s button layer entirely — it tests that the wiring *would* still work if
reconnected, not that a live button exists. This is a deeper and more complete removal than the
allowlist strictly required, and it required no scope expansion to achieve.

**`onToggleCardView?: () => void` classification: A — acceptable compatibility residue.** No
visible action, no live invocation anywhere in the codebase (verified above, not assumed), retained
solely so the frozen `ClipartCardDraftModal.tsx` and the dead `{false && …}` block remain
typecheck-valid. `isCardView` was correspondingly left untouched at every call site, exactly as
governed. `Open card` (`CardPreview.tsx:71,149`) confirmed unchanged — present verbatim, and its
removal was independently proven to break 3 PATCH-139 tests (see Negative controls).

### Scoped `handleSave` guard result — Classification A

Read `CardEditor.test.tsx:92-98` directly. The test slices `src.indexOf('const handleSave')` to
`src.indexOf('};', start)` — a narrow, function-body-only slice, not a whole-file scan — then
asserts the short-circuit pattern is present in that slice **and** that `if (readOnly)` precedes
`onSave(` within it. Independently reproduced PATCH-151 §14i's exact failure mode: with the literal
relocated outside `handleSave` (short-circuit deleted from the function, `if (readOnly) { /* decoy
*/ }` added below it, same literal text preserved elsewhere in the file), **the scoped guard fails**
— confirmed by direct test run, not assumed. The anchors (`const handleSave` / next `};`) are stable
for this file's structure and narrow enough to exclude the rest of the 174-line file. **Classification
A — adequate for the current node-only test environment.** No jsdom or package change required or
requested.

### Runtime-semantics result

Confirmed unchanged by direct source read and diff: `handleSave`'s save-on-close and read-only
short-circuit logic (`:58-72`) is untouched — the diff touches only the header JSX, never the
handler body. Viewer no-op `onSave`, modal close behaviour, `selectCardModalRoute` and both its call
sites, the `?openPadlet=` route, normal-card and clipart-card routing, `NoteEditor`/`NoteEditorToolbar`
(zero diff, confirmed), and persistence format are all untouched. **No PATCH-149B work is present**
— no Save button, no dirty tracking, no editor-identity change, nothing routed to `NoteEditor`.

### Parent induced-failure result

Independently reproduced at `a53a5f0` by checking out the three parent production files against
the current (HEAD) test files:

1. Ordinary-document header test — **failed** (`w-16 h-16`/`#ec4899` block present in parent's
   output, reproduced verbatim in the assertion diff).
2. `Card view` label test — **failed** (`'Card view'` present in parent's toolbar label array).
   Combined run: **2 failed / 61 passed** (matches the two independently-reproduced defects; the
   implementation's own report of "1 failed/62" and "1 failed/44" reflects running the files
   separately — the totals reconcile).
3. Scoped-guard defeat of the old whole-file assertion was independently reproduced separately
   (below, under negative controls) rather than assumed from the implementation's report.

All three parent defects are corrected at `c23be50`.

### Negative controls — 5/5, independently executed and reverted

All five were performed by this reviewer directly (not re-trusted from the implementation), each
reverted via `git checkout HEAD --` and confirmed byte-identical via `git hash-object` against the
committed blob before and after:

1. Restored the ordinary icon wrapper (reverted the conditional) → header test **failed** as
   expected.
2. Removed the clipart `<img>` from the read-only branch (`:114-123`) → PATCH-151 regression test
   **failed** as expected (`renders the clipart image and content…`).
3. Restored the `Card view` tool-array entry (via parent-file swap, combined with #1 above) →
   label test **failed** as expected.
4. Moved `handleSave`'s short-circuit out of the function body while leaving `if (readOnly) {`
   elsewhere in the file → scoped guard test **failed** as expected (the defect the scoped guard
   exists to catch).
5. Altered `Open card` → `Open card ALTERED` in `CardPreview.tsx` → **3** PATCH-139 tests failed
   as expected.

All files hash-matched their committed blobs after revert:
`CardEditor.tsx=a282407…`, `CardEditor.test.tsx=aaba4ec…`, `CardActionsToolbar.tsx=2b48357…`,
`ClipartCardDraftModal.test.tsx=ef1c075…`, `FreeformPadletCards.tsx=f453f8f…`,
`CardPreview.tsx=85f6db6…`.

### Tests and builds — independently rerun

- Focused (`CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute`): **98/98**.
- Full Vitest: **66/66 files, 765/765 tests**.
- Clean `npm run typecheck` (preflight + `tsc --noEmit`): **exit 0**.
- `npx next build`: **first attempt failed** on a stale `.next` cache left over from an earlier
  session build (`uncaughtException [TypeError: Cannot read properties of undefined (reading
  'length')]`, no stack trace pointing at application code) — **not attributable to this
  implementation**. After `rm -rf .next` and rebuilding clean: **exit 0**.
- `npm run verify:bridge-exclusion`: **891 files, no marker, exit 0.**
- `npm run build:e2e`: **exit 0**, `.next/E2E_BRIDGE_BUILD` contains `1`.
- Ordinary `.next` restored (`rm -rf .next && next build`): **exit 0**, marker absent, exclusion
  re-verified clean at 891 files.
- `git diff --check`: **exit 0**.

### Observations (non-blocking)

- The stale-`.next`-cache build failure on first attempt is worth a standing note: a leftover
  `.next` from a prior E2E or interrupted build in the same working tree can produce an opaque
  `uncaughtException` with no actionable stack trace. `rm -rf .next` before any governed build
  verification removes the ambiguity. Not a defect in this patch; recorded so the next
  implementer or reviewer doesn't misattribute it.
- The `onToggleCardView?` optional-prop residue (Classification A) is exactly the shape PATCH-149's
  own §9 anticipated ("Do not require modifying ClipartCardDraftModal merely to delete an unused
  prop unless the remaining prop causes actual behavior or false product semantics") — it causes
  neither.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx.image-canvas-editor-temp.bak` is a
  tracked backup file containing a stale pre-149A copy of the dead block (`onToggleCardView` at its
  own line 1624). It was untouched by `c23be50` and is out of scope for PATCH-149A, but its
  presence in version control is itself an anomaly worth flagging for a future housekeeping patch —
  not raised as a finding against this closure.

### Final classification

**1 — PASS · READY FOR CLOSURE.**

No CRITICAL or HIGH issues. No false greens. All acceptance criteria independently re-verified
rather than trusted. The one build hiccup was traced to environment cache state, reproduced as
non-reproducible after a clean rebuild, and is not attributable to the changed files.

### PATCH-149A status

**CLOSED.**

### PATCH-149B status

**Unchanged — OPEN · BLOCKED** on B-i (document editor identity) and B-ii (save-versus-close),
per §4. Not evaluated or reopened by this review.

---

## 14. PATCH-149B — MIGRATION ARCHITECTURE · **BLOCKED**

**Authored:** 2026-08-04 (governance architect). **Base:** `e6e9122`. **Product decisions B-i and
B-ii are supplied and binding** (§14.1). **Result: the migration is architecturally correct and is
NOT authorized for implementation, because it cannot be verified in the current test environment
(§14.5), and because `NoteEditor` cannot be reused without restructuring 1,165 untested lines
(§14.4).** No production or test file was modified in this authoring turn.

### 14.1 Supplied product decisions — recorded as binding

**B-i — Editor identity.** Document Posts must use the existing TipTap `NoteEditor` path. No second
rich-text editor. No new `document` padlet type. Continue persisting as the existing card type if
that is narrowest. **Accepted, and confirmed correct by §14.4 evidence** — the direction is right;
only its *verifiability* blocks it.

**B-ii — Save/close.** Explicit Save · non-saving Close · unsaved-change confirmation · backdrop and
Escape follow the same dirty rules · read-only Close immediate and non-writing · never silently
auto-save on Close. **Accepted. Not implementable inside `NoteEditor` without changing Note Post
behaviour** (§14.7) — which B-ii does not authorize, since it governs Document Posts only.

### 14.2 Route and type census (measured at `e6e9122`)

| Concern | Exact path | State owner | Persisted type | Modal component | Capability guard | Content format | Title | Close/Save behaviour | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| Document tool | `canvasToolbarRegistry.tsx:97` — `{ icon: FileText, label: "Document", type: "document" }` | registry | — | — | workspace toolbar gate | — | — | — | frozen |
| Document creation | `CanvasClient.tsx:5400-5418` | `setPadletToEdit` | **`'card'`**, `title:''`, `content:''`, 180×220, `metadata:{...createMetadata}` — **no discriminator** | `CardEditor` via `setIsCardEditorOpen(true)` | — | plain text | `padlets.title` | — | **B2** |
| Note creation | `CanvasClient.tsx:5380-5399` | `setPadletToEdit` | `'text'`, `title:'New Note'`, 280×250 | `NoteEditor` via `setIsNoteEditorOpen(true)` | — | HTML | hardcoded | — | frozen |
| Open (all routes) | `CanvasClient.tsx:5692-5708` `openPadletInTypeEditor` | — | — | branch chain | `selectCardModalRoute(canUseFreeformEditButton)` | — | — | — | **frozen (PATCH-139/151)** |
| ↳ clipart branch | `:5700-5703` — `type==='card' && metadata?.svgUrl` | — | `'card'` | `ClipartCardDraftModal` / `CardEditor` viewer | capability | — | — | — | **frozen** |
| ↳ document branch | `:5704-5707` — `type==='card'` (no `svgUrl`) | — | `'card'` | `CardEditor` editor / viewer | capability | plain text | `title` | save-on-close | **B2** |
| ↳ fallback | `:5708` `else setIsNoteEditorOpen(true)` | — | `'text'`/other | `NoteEditor` | none | HTML | — | save-on-close | frozen |
| Context-menu route | `CanvasClient.tsx:5713-5721` `openPadletTargetFromContextMenu` → same `openPadletInTypeEditor` | — | — | — | inherited | — | — | — | frozen |
| Section "open post" | `CanvasClient.tsx:6480`, `:6570`, `:6729` — `setPadletToEdit(post); setIsNoteEditorOpen(true)` | — | — | `NoteEditor` | **none — bypasses `openPadletInTypeEditor` entirely** | — | — | — | **observation, §14.11** |
| Preview affordance | `CardPreview.tsx:71,149` `aria-label="Open card"` → `onEditContent` | — | — | — | `FreeformPadletCards.tsx:1761` capability | — | — | — | **frozen (PATCH-139)** |
| Direct `?openPadlet=` | `openPadletInTypeEditorRef` (`CanvasClient.tsx:5711`) | — | — | same chain | same capability | — | — | — | **frozen** |
| Editable document modal | `CanvasClient.tsx:~7379` `<CardEditor isOpen={isCardEditorOpen} …>` | `CanvasClient` | `'card'` | `CardEditor` | — | plain text | prop | `handleSave` on X + backdrop | **B2/B3** |
| Read-only document viewer | `CanvasClient.tsx:7366-7377` `<CardEditor isOpen={isCardViewerOpen} … readOnly onSave={() => setIsCardViewerOpen(false)}>` | `CanvasClient` | `'card'` | `CardEditor` | capability-routed | plain text | prop | no-op save, immediate close | **B2** |
| Note modal mount | **`components/collabboard/canvas/ui/CanvasModals.tsx:136-149`** (474 lines) — *not* `CanvasClient` | `CanvasModals` | `'text'` | `NoteEditor` | none | HTML | **not passed** | save-on-close | **B2** |
| Document save | `usePadletSave.ts:973` `saveCard(data: {title, content, metadata})` | hook | `'card'` | — | — | plain text | **has title** | insert on `id==='new'` | **B3** |
| Note save | `usePadletSave.ts:359` `saveNote(data: SaveNoteData)` | hook | `'text'` | — | — | HTML | **no title field; hardcodes `'New Note'`** | insert on `id==='new'` | **B2 blocker** |
| Empty-draft guard | `usePadletSave.ts:981-999` | hook | — | — | — | — | — | **silently discards blank new cards** | **answers C-lifecycle, §14.8** |

### 14.3 Document predicate — **STABLE, verified; hard stop NOT triggered**

Every `type: 'card'` creation site in the repository was enumerated and traced:

| # | Site | Produces `svgUrl`? | Is a Document? |
|---|---|---|---|
| 1 | `CanvasClient.tsx:5408` — Document tool | **no** | **yes** |
| 2 | `CanvasClient.tsx:4868` — `handleFreeformCardDrop` | yes | no (clipart) |
| 3 | `CanvasClient.tsx:7503` — clipart library pick | yes | no (clipart) |
| 4 | `RowColumnContainerCard.tsx:284` — SVG drop into container | yes | no (clipart) |
| 5 | `usePadletSave.ts:1024` — `saveCard` insert | inherits draft metadata | either |
| 6 | `CanvasClient.tsx:1695-1704` — draft `kind:'card'` | inherits draft metadata | either |

`kind: 'card'` is produced at **exactly one** site — `usePadletSave.ts:1006`, the `saveCard`
placement-prompt draft — so #5 and #6 are not independent creators; they re-persist an existing
draft's own metadata. **Therefore no path creates a non-clipart `type:'card'` post except the
Document tool.**

**THE DOCUMENT PREDICATE (single, exact, reused everywhere):**

```
isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl
```

This is not new: it is already the de-facto discriminator at `CanvasClient.tsx:5700` vs `:5704`, and
PATCH-134 §239 states it verbatim (*"`type: 'card'` and no `svgUrl` is what makes it document-like
rather than clipart"*). It correctly **excludes** clipart cards (`svgUrl`), text/sticky notes
(`'text'`), comments (`'comment'`), embedded media (`'image'`/`'link'`), and every other type.
**No new metadata discriminator is required or authorized** — introducing one would create a second
source of truth for the same concern (P6) and would not classify legacy rows anyway.

### 14.4 Editor migration option — **M4 · HARD STOP** (target M2 once unblocked)

`NoteEditor` was read in full. It **cannot** host a Document Post as it stands:

| Requirement | `NoteEditor` at `e6e9122` | Verdict |
|---|---|---|
| Mountable inside a document modal | **No** — it *is* a modal: `:697-700` renders `fixed inset-0 z-[1000] … bg-black/50` with its own overlay click handler, and `:692` returns `null` unless `isOpen` | **M1 impossible** — nesting yields modal-in-modal |
| Document-sized surface | **No** — `:749` hardcodes `width: '280px'` (sticky-note geometry) | blocker |
| `title` prop | **Absent** from `NoteEditorProps` (`:88-122`) | blocker — Documents own a title (`saveCard.title`) |
| `readOnly` prop | **Absent entirely** | blocker — read-only Document view is a required deliverable |
| Save contract | `:102-119` `onSave` emits `content, cardColor, topStrip, textColor, reactions, badgeColor, detachedComments` — **no `title`, no metadata passthrough** | blocker — incompatible with `SaveCardData {title, content, metadata}` |
| Explicit Save | **None** — `:657` `handleSaveAndClose`, `:672` `handleClose → handleSaveAndClose`, `:677` `handleOverlayClick → handleSaveAndClose` | **the identical B-ii defect** |
| Dirty state | **None** — no dirty flag, no change callback, no imperative getter, no baseline | blocker |
| Escape handling | **None** at modal level (`:997` is a comment-input-local key handler only) | blocker |

**M1 (mount directly): impossible** — nested modals, no title, no readOnly, wrong save shape.
**M2 (narrow wrapper): collapses into M3** — a wrapper cannot suppress `NoteEditor`'s own overlay,
280px card, or save-on-close without editing `NoteEditor` itself.
**M3 (extract shared TipTap core): the only technically viable route** — and it means restructuring
a **1,165-line component with zero test coverage** that owns the shipped Note Post, in an
environment that **cannot execute it** (§14.5). The extraction would move `useEditor`,
`NOTE_EXTENSIONS`, 11 formatting handlers, the comment-thread system, colour state and popup
wiring — i.e. most of the file.

**SELECTED: M4 — HARD STOP.** The brief's own hard stop *"NoteEditor cannot be reused without
duplicating most of it"* is triggered on measured evidence. **M2 remains the correct target** once
§14.5 is resolved; this is a sequencing block, not a rejection of B-i.

### 14.5 **Decisive blocker — the migration cannot be verified in this environment**

Measured, not assumed:

1. `vitest.config.ts` sets **`environment: 'node'`**.
2. **`jsdom` and `happy-dom` are absent from `node_modules`.** (`@testing-library/{dom,jest-dom,react}` are present but cannot render without a DOM environment.)
3. The include glob is `components/collabboard/*.test.tsx` — it does **not** cover
   `components/collabboard/editors/`, where `NoteEditor` lives. A test placed beside it would not
   even be collected.
4. **`NoteEditor` has no test file. Zero.**
5. **Proven by direct probe** (temporary throwaway config + probe file, both deleted; tree verified
   clean): `renderToStaticMarkup(<NoteEditor isOpen initialContent="<p>Legacy HTML body</p>" … />)`
   **does not throw — it returns a string of length 0.** Because `useEditor({immediatelyRender:
   false})` leaves `editor` null on first render, `:692` returns `null`.

**Consequence.** Every SSR string assertion — the only technique this repository's card/document
tests possess — evaluates against **empty markup**. Required test items **5, 6, 7, 8, 10, 11, 12,
13, 14, 15, 16, 17, 21** (legacy plain-text load, HTML load, formatting persistence, dirty
tracking, Save writes, baseline reset, clean/dirty close, Keep editing, Discard, backdrop, Escape,
read-only has no Save/toolbar, TipTap seam) are **unachievable**.

**Worse than unachievable — actively dangerous.** The read-only assertions (`expect(markup).not.
toContain('Save')`, `not.toContain('toolbar')`) would **pass vacuously against an empty string**.
That is precisely the false green this patch's own rules demand rejection of, and it would
manufacture a green validation matrix for a migration nobody had tested.

**The brief forbids the remedy:** *"Do not add jsdom or dependencies unless current NoteEditor tests
already require and support them."* There are no NoteEditor tests. **Adding jsdom is therefore not
authorized here, and without it the migration cannot be honestly validated.** This is the blocker.

### 14.6 TipTap serialization contract (recorded; sufficient for P1, no envelope needed)

- **Input:** `content: initialContent` (`:235`) — TipTap accepts an HTML string; plain text loads as a single paragraph.
- **Reset:** `:285-289` — `setContent(initialContent)` when `initialContent !== editor.getHTML()`.
- **Output:** `editor.getHTML()` (`:658`) — **HTML string**, written to `padlets.content` (`TEXT`).
- **Empty:** TipTap emits `<p></p>` for an empty document, **not** `''` — load-bearing for dirty comparison (§14.7) and for the empty-draft guard (`usePadletSave.ts:981-999`, which strips tags via `/<[^>]*>/g` before testing emptiness — so `<p></p>` correctly reads as empty).
- **Sanitization:** at render, via `DOMPurify` on card/note bodies — not at write.
- **Custom-node preservation:** `NOTE_EXTENSIONS` (`:23-37`) already registers custom nodes/marks (`FontSize`, `Comment`) whose attributes round-trip through `getHTML()` as `data-*` attributes — `Comment` is read back at `:243-272` from `data-comment-id`, `data-comment-thread`, `data-user-id`, `data-timestamp`, `data-color`. **This proves the mechanism a future `PdfHighlight` node needs already works end-to-end in HTML.**
- **Title:** stored **separately** (`padlets.title`), never inside content.
- **Metadata:** `saveNote` spreads `...padletToEdit?.metadata` (`:362`) — passthrough preserved.

**Conclusion: PDF foundation Option P1 is confirmed sufficient. No schema change, no persistence
envelope, no versioning is required** — and none is authorized. The seam is exactly: register a node
in `NOTE_EXTENSIONS`; carry reference data as **node attributes** serialized to `data-*` in HTML;
no modal-level PDF special-casing.

### 14.7 Save/dirty-state architecture (specified, not authorized)

`NoteEditor` currently exposes **none** of: current HTML to the parent, change callback, dirty
callback, imperative getter, Save button, keyboard shortcut, or baseline reset. The governed
contract, for whichever patch implements it:

- **One source of truth:** a `dirty` boolean derived from `normalize(currentTitle, currentHTML) !== normalize(baselineTitle, baselineHTML)`.
- **Normalization boundary (required, because raw HTML comparison is unstable):** compare
  `editor.getHTML()` against a baseline that was itself produced by loading the stored content into
  the editor and reading `getHTML()` back — never against the raw stored string. A stored plain-text
  `"hello"` becomes `<p>hello</p>` on load; comparing raw-vs-serialized would mark every legacy
  document dirty on open. Treat `<p></p>` as equal to `''`.
- Successful Save resets the baseline. Switching documents resets the baseline. **Read-only never becomes dirty.**
- **Save UI:** semantic `<button>` labelled `Save`; disabled when not dirty; `saveCard` is `async`, so a pending state and an error path are required — **errors must surface, never be swallowed** (P3/P10).
- **Save does not close** (B-ii §2). No `Ctrl/Cmd+S` — no existing shortcut infrastructure was found, and adding one is out of scope.

### 14.8 New-document lifecycle — **C1, already the architecture**

`usePadletSave.ts:981-999`: when `padletToEdit.id === 'new'`, `saveCard` inserts **only** on save,
and **silently discards** a draft whose title, tag-stripped content, description and metadata are
all empty. So today: **the row is created on first Save; nothing is orphaned; discard-before-save
is already a no-op.**

**SELECTED: C1 — create the row only on first Save.** It is the least destructive option, it is
what the code already does, and it makes Discard trivially safe (close without persisting; no row
exists to delete). **C2 is explicitly rejected** — creating a placeholder row up front would require
Discard to *delete* it, introducing a destructive path where none exists today.

### 14.9 Read-only rendering — decision recorded, blocked with the rest

**Preferred: a `NoteEditor`-derived read-only renderer** (TipTap in `editable: false`), so viewer and
editor content semantics cannot diverge and future PDF-reference nodes render in both. It must
preserve: capability routing, accessible Close, **no toolbar, no Save, no mutation, no dirty
dialog**, meaningful title, formatted content — and must not regress clipart-card viewing
(PATCH-151 §14). **Blocked by §14.5**: "no toolbar / no Save" is exactly the assertion pair that
passes vacuously on empty SSR output, so this decision cannot be safely validated yet. Until then
the current `CardEditor` read-only viewer (PATCH-151, closed and green) **remains in place
untouched**.

### 14.10 Formatting contract — `NoteEditorToolbar` census

All controls are **wired and functional** (`NoteEditorToolbar.tsx:94-127` ↔ handlers at
`NoteEditor.tsx:308-314`) — in stark contrast to `CardEditor`'s five class-C no-ops (§3a):

| Control | Handler | Persists via `getHTML()` | Document classification |
|---|---|---|---|
| Text style / Bold / Italic / Strikethrough / Underline | `onTextStyle`, `toggleBold`, `toggleItalic`, `toggleStrike`, `toggleUnderline` | yes | **working — include** |
| Bullet list / Numbered list / Code | `toggleBulletList`, `toggleOrderedList`, `toggleCodeBlock` | yes | **working — include** |
| Link | `handleLink` (`:316`), disabled without selection | yes | **working — include** |
| Comment (text) | `onTextComment`, `Comment` extension | yes (`data-*`) | working — **defer**, overlaps three existing comment systems |
| **Align** | `onAlign` — **passed `undefined` at the call site** (`:711-739` never supplies `onAlign`); `@tiptap/extension-text-align` is **not** in `NOTE_EXTENSIONS` | no | **class C — dead; must not be shown on the Document toolbar** |
| Box mode: Card color / Reaction / Post comment | wired | metadata | **note-only — exclude from Documents** |

**Contract:** the Document toolbar exposes only the proven-working text controls; it **must not**
render `Align` (unsupported, would repeat the exact defect PATCH-149 was raised for), and must not
render box-mode note chrome. **No formatting capability beyond existing TipTap extensions is added.**

### 14.11 Unlocated defects — still unlocated; **PATCH-149C**

- **Text/container exit (defect 2).** Re-inspected `NoteEditor`: there is **no modal-level key
  handler and no Escape handling** (the only `Escape` at `:997` is local to a comment input), and
  **no focus trap**. Dismissal is exclusively backdrop-click → `handleSaveAndClose`. So a user who
  clicks *inside* the 280px card has no keyboard exit — consistent with the complaint, but the same
  is true of several surfaces, and **the reporting surface was never identified**. Candidate homes
  remain `NoteEditor`, the Excalidraw text container, and canvas text-edit mode. **Not authorized —
  reproduction still required.**
- **Underline / line-post (defect 3).** `Underline` in `NoteEditorToolbar.tsx:106` is a **legitimate,
  working formatting control and must not be removed on suspicion.** No horizontal-rule control
  exists (`StarterKit`'s `horizontalRule` is bundled but unexposed by the toolbar). A canvas line
  tool exists separately in `FreeformPadletCards`. **Not authorized — the complaint cannot be tied
  to a specific reproducible element.**

**Required to unblock either:** which surface, and what the user clicked immediately before. One
sentence converts both into bounded work.

**Also recorded (new, incidental):** `CanvasClient.tsx:6480`, `:6570`, `:6729` open posts via
`setPadletToEdit(post); setIsNoteEditorOpen(true)` **without** passing through
`openPadletInTypeEditor`, therefore **without the `selectCardModalRoute` capability check**. This is
outside PATCH-149's scope and is **not** a Document-Post route (Documents are `type:'card'` and are
not reachable through these section handlers), so it is **not** a PATCH-139/151 regression — but it
is a capability-routing inconsistency worth its own investigation. **Recorded, not authorized.**

### 14.12 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| No stable Document predicate exists | **NOT TRIGGERED** — `type==='card' && !svgUrl`, verified complete against all six creation sites (§14.3) |
| **`NoteEditor` cannot be reused without duplicating most of it** | **TRIGGERED** (§14.4) — it is a self-contained modal with no title, no readOnly, wrong save shape; M1/M2 both fail |
| Legacy content cannot be read safely without schema migration | **NOT TRIGGERED** — TipTap accepts plain text and HTML; no migration needed (§14.6). *But the corpus remains unmeasured per row* (§7), so the adapter spec is not yet writable |
| New-document discard behaviour unresolvable | **NOT TRIGGERED** — C1 is already the architecture (§14.8) |
| TipTap output cannot preserve future custom nodes | **NOT TRIGGERED** — `Comment` proves attribute round-trip through HTML (§14.6) |
| Save errors cannot be surfaced safely | **NOT TRIGGERED** — `saveCard` is async and throwable; a pending/error path is specifiable (§14.7) |
| Requires touching broad generic card persistence | **NOT TRIGGERED** — no schema/type change; `saveCard` already carries `{title, content, metadata}` |
| Exit/underline defects unlocatable and would require guessing | **TRIGGERED → split to PATCH-149C** (§14.11) — does not block the migration |
| **(New) The migration cannot be validated in the current test environment** | **TRIGGERED — DECISIVE** (§14.5), proven by probe |

### 14.13 Split decision and authorization status

**PATCH-149B is SPLIT and NOT AUTHORIZED for implementation.**

| Unit | Scope | Status |
|---|---|---|
| **PATCH-149B0** | *Prerequisite.* Governed decision on the test environment (§14.14) + per-row measurement of the `type:'card'` content corpus (plain vs HTML vs empty vs malformed), which §7 left unmeasured and which the legacy adapter spec depends on | **REQUIRED FIRST — owner decision** |
| **PATCH-149B1** | Document predicate helper + legacy-content adapter, as **pure functions with node tests**, plus read-only TipTap renderer | **BLOCKED** on B0 |
| **PATCH-149B2** | Explicit Save · dirty baseline · discard confirmation · backdrop/Escape unification | **BLOCKED** on B1 |
| **PATCH-149C** | Reproducible text-exit and/or underline-line defect | **BLOCKED** on reproduction (§14.11) |

**No production allowlist, test allowlist, line budget, induced-failure plan or negative-control set
is issued in this document.** Issuing one would authorize work whose acceptance criteria cannot be
evaluated (§14.5) — the validation matrix would be structurally incapable of distinguishing a
correct migration from an empty render. The allowlists are written **after** B0, when it is known
whether behavioural tests are possible.

**Explicitly NOT authorized and NOT added by anything above:** PDF upload · PDF schema ·
`pdfjs-dist` · viewer · highlights · PDF nodes · source badges · backlinks UI · drag-and-drop PDF ·
a `'document'` padlet type · a second rich-text editor · any `jsdom`/dependency change · any edit to
`selectCardModalRoute`, the normal-card route, the clipart route, `ClipartCardDraftModal`, clipart
creation, the read-only clipart header, or the no-op read-only save route (**all frozen per
PATCH-139/151**).

### 14.14 The single question that unblocks everything

> **May the test environment gain a DOM (`jsdom` or `happy-dom`) plus a `vitest.config.ts` include
> glob covering `components/collabboard/editors/`, so that `NoteEditor` — currently 1,165 lines with
> zero tests — can be characterized *before* Document Posts are migrated onto it?**

- **If yes:** the sequence becomes B0 (add environment + characterize current `NoteEditor` behaviour)
  → B1 → B2, and M2 becomes implementable behind a real safety net. This is the recommended path;
  it also retires the standing risk that the Note Post has no regression coverage at all.
- **If no:** the migration cannot proceed honestly. The only alternative consistent with B-i would be
  source-guard-only validation, which §14.5 shows produces vacuous passes — and PATCH-151 §14i
  already demonstrated in this very file family how a source-text guard passes while the behaviour it
  claims to protect is gone. **Governance will not authorize a migration validated that way.**

**PATCH-149A:** CLOSED (`c23be50`, review `e6e9122`).
**PATCH-149B:** **OPEN · BLOCKED** — architecture defined, implementation not authorized.
**PATCH-149C:** RESERVED — blocked on reproduction.
**PATCH-150:** RESERVED, separate (presentation index-domain divergence); untouched.

---

## 15. PATCH-149B0 — NOTEEDITOR DOM CHARACTERIZATION HARNESS · **AUTHORIZED**

**Authored:** 2026-08-04 (governance architect). **Base:** `e25fe32`. The owner has authorized a
DOM-capable test environment and an expanded include glob for NoteEditor characterization. **This
is test infrastructure, not product functionality. Production scope is empty.**

**Every compatibility claim below was measured by executing it**, using a `npm install --no-save`
probe (which leaves `package.json` and `package-lock.json` untouched — hashes verified identical
before and after: `b769e4c…` / `605a84f…`) plus a temporary probe test, both fully removed and the
suite re-verified at 66/66 · 765/765 before this document was written. **Nothing here is inferred.**

### 15.1 Environment choice — **OPTION T2 · ADD `jsdom` AS A DEV DEPENDENCY**

| Option | Result |
|---|---|
| **T1 — already available** | **REJECTED.** `node_modules/jsdom` and `node_modules/happy-dom` are both absent; `npm ls jsdom happy-dom` returns empty. Neither is declared nor transitively installed. |
| **T2 — add `jsdom`** | **SELECTED.** See compatibility below. |
| **T3 — add `happy-dom`** | Not needed. `jsdom` proved compatible on first attempt with zero polyfills; T3 is reserved as a fallback only if `jsdom` later proves heavy. |
| **T4 — blocked** | **NOT TRIGGERED.** |

**Compatibility — verified, not assumed:**

- **`jsdom` and `happy-dom` are declared *optional peerDependencies* of `vitest@3.2.7`**
  (`peerDependenciesMeta` marks both `optional: true`). Adding `jsdom` is therefore the officially
  supported path, **not** a workaround.
- Node **v24.11.1** satisfies vitest's `engines: ^18 || ^20 || >=22`.
- **`jsdom@29.1.1`** installed and ran cleanly against the current React 19.2.7 / Next 15.5.20 /
  TipTap 3.x / TypeScript 5 stack.
- **No upgrade of React, Next.js, Vitest, TipTap, TypeScript or Node tooling is required or authorized.**

### 15.2 TipTap actually mounts — the load-bearing measurement

Mounting `NoteEditor` under `jsdom` via `react-dom/client` + React 19 `act`:

| Measurement | Result |
|---|---|
| Mount error | **none** |
| Rendered DOM | **9,024 characters** (vs **0** under `environment: 'node'` — §14.5) |
| ProseMirror mounted | **yes** (`ProseMirror` class present) |
| Legacy HTML content rendered | **yes** — `<p>Legacy HTML body</p>` visible as text |
| Empty content | **safe** — 9,114 chars, ProseMirror present, no throw |
| Buttons rendered | **12** |
| `Bold` control | present |
| **`Align` control** | **present and rendered** — so §14.10's dead control is *measurable*, not merely inferred |
| Closed state (`isOpen=false`) | **0 characters** |

**Browser-API census under `jsdom@29.1.1`:**

| API | Present | Needed by this scope |
|---|---|---|
| `window`, `document`, `getSelection`, `Range`, `DOMParser`, `MutationObserver`, `requestAnimationFrame`, `getBoundingClientRect` | **yes** | yes — all satisfied |
| `ResizeObserver` | **no** | **not required** — mount succeeded without it |
| `matchMedia` | **no** | **not required** — mount succeeded without it |

**Therefore NO setup file and NO polyfills are authorized.** The brief permits polyfills only when
*actually required*; measurement proves none is. Should a future characterization open a Radix-backed
popup (`TextStylePopup`, `LinkPopup`, `CommentPopup`, `EmojiReactionPicker`), `ResizeObserver` and
`matchMedia` may become necessary — **that is a B0 follow-up, not authorized now**, and popup
interaction is explicitly out of scope (§15.5).

### 15.3 **Mandatory teardown discipline — a real hazard, and its proven fix**

The first probe produced a genuine stability failure:

```
ReferenceError: document is not defined
  ❯ EditorView.get root  prosemirror-view/dist/index.js:5586
  ❯ DOMObserver.flush    prosemirror-view/dist/index.js:4685
  ❯ Timeout._onTimeout   prosemirror-view/dist/index.js:4615
Vitest caught 1 unhandled error during the test run.
This might cause false positive tests.
```

ProseMirror's `DOMObserver` schedules a `setTimeout` flush that fires **after** the jsdom
environment is torn down. Vitest itself flags this as a false-positive risk — which would have
undermined the very honesty this harness exists to provide.

**Proven fix, and it is binding:** unmounting every mounted root in `afterEach`
(`act(() => root.unmount())` plus removing the container) **eliminated the error completely** —
second probe ran 4/4 clean with zero unhandled errors. **No polyfill, no `NoteEditor` change, no
production change.**

> **BINDING RULE:** every `NoteEditor` characterization test **must** unmount in `afterEach`.
> A test file that mounts without unmounting is a **rejectable defect**, not a style preference.

### 15.4 Include-glob defect — and the trap that must not be sprung

Current: `include: ['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts', 'scripts/harness/**/*.test.ts', 'components/collabboard/*.test.tsx']`.

The final entry is **non-recursive**, so `components/collabboard/editors/` — where `NoteEditor`
lives — is **not discovered**. That is the defect.

**MEASURED TRAP:** `components/collabboard` contains **148** `*.test.ts*` files, of which
**143 belong to the vendored Excalidraw fork**. A recursive
`components/collabboard/**/*.test.tsx` would therefore silently pull in **143 vendored fork tests** —
precisely the "no vendored/fork files become included accidentally" hard stop, and it would also
corrupt the 66/765 baseline beyond recognition.

**AUTHORIZED CHANGE — exactly one array entry added, non-recursive:**

```
'components/collabboard/editors/*.test.tsx'
```

Verified: `components/collabboard/editors/` currently contains **0** test files and exactly one
subdirectory (`extensions/`, no tests). A single-level glob there captures **0 fork files, 0 E2E
files, 0 generated files** and creates **no duplicate discovery** (it is disjoint from the existing
non-recursive `components/collabboard/*.test.tsx`). **Recursive globs are forbidden.**

### 15.5 Environment strategy — **per-file, not global**

**AUTHORIZED: the `// @vitest-environment jsdom` docblock on the characterization file only.**
`test.environment` in `vitest.config.ts` **stays `'node'`.**

**Verified by execution:** the probe ran with the config declaring `environment: 'node'` while the
file's docblock declared `jsdom` — and it got a full DOM. The per-file override works on
`vitest@3.2.7`.

**Consequence: all 765 existing tests keep running in `node`.** Nothing is migrated to jsdom.
The brief's *"Do not make all 765 existing tests run in jsdom unless source evidence proves that is
the only safe option"* is satisfied by the narrowest possible means — no environment-match globs, no
second Vitest project, no config `environment` change.

### 15.6 Characterization contract — behaviour to *record*, never to correct

Already measured by probe; the implementation must assert these as the frozen baseline:

| # | Contract | Measured value at `e25fe32` |
|---|---|---|
| 1 | Closed state | `isOpen=false` ⇒ container innerHTML length **0** |
| 2 | Open state | real DOM > 1,000 chars; overlay `fixed inset-0 z-[1000]`; ProseMirror present; toolbar present |
| 3 | **Save-on-close order** | backdrop click ⇒ callbacks fire **`["save", "close"]`** — save strictly before close |
| 4 | Backdrop | dismissal **does persist** (current defect — characterize, do not fix) |
| 5 | **Escape** | **no handler exists** — `keydown{Escape}` ⇒ `onSave` calls **0**, `onClose` calls **0**. Assert the absence; **do not invent support** |
| 6 | Content init | `<p>Legacy HTML body</p>` renders as text; `initialContent=""` initializes safely |
| 7 | Formatting toolbar | working controls locatable; **`Align` renders** despite being unwired (§14.10) — measure, do not change |
| 8 | Editor constraints | 280px card; **no `title` prop**; **no `readOnly` prop** |
| 9 | **Save callback shape** | keys exactly `['content','cardColor','topStrip','textColor','reactions','badgeColor','detachedComments']` — **no `title`, no `metadata`** (empirically confirms §14.4) |
| 10 | **Non-vacuity** | at least one assertion must **fail** if the modal renders empty while `isOpen` — e.g. `expect(container.innerHTML.length).toBeGreaterThan(1000)` **plus** a positive content assertion. A test that only checks "did not throw" or accepts an empty container is **rejected** |

**Out of scope:** opening popups, formatting-command execution, dirty state, read-only, adapters,
Save/Close correction. Those are B1/B2.

### 15.7 Allowlists and line budgets

**PRODUCTION ALLOWLIST: EMPTY.** No production file may change. `NoteEditor.tsx` and
`NoteEditorToolbar.tsx` are **explicitly forbidden**, as is every file frozen by PATCH-139/151.

| # | Path | Permitted change | Max lines |
|---|---|---|---|
| 1 | `package.json` | add **`"jsdom": "^29.1.1"`** to `devDependencies` **only** | **1** |
| 2 | `package-lock.json` | resolution for `jsdom` + its required transitives **only** | not line-budgeted; **bounded by rule** — no unrelated refresh, no churn beyond the added package |
| 3 | `vitest.config.ts` | add exactly one `include` entry (§15.4). **`environment` must remain `'node'`** | **1** |
| 4 | `components/collabboard/editors/NoteEditor.characterization.test.tsx` | **new file** — the entire characterization suite, with the `// @vitest-environment jsdom` docblock and mandatory `afterEach` unmount | **220** |

**No test setup file is authorized** (§15.2 — no polyfill is required).

**Test authoring constraints:** mount with `react-dom/client` `createRoot` + React 19 `act` — both
from **declared** dependencies. **`@testing-library/react` must NOT be used:** it is present at
16.2.0 but is **extraneous**, leaking from the vendored Excalidraw fork's own devDependencies
(`npm ls` shows `@excalidraw/excalidraw@0.18.0 -> @testing-library/react@16.2.0 … extraneous`).
Depending on it would couple the suite to the fork's dependency tree and could vanish on any
install. **Do not mock `NoteEditor`; mount the real component.**

### 15.8 Dependency safety

devDependency only · pinned via the normal `package-lock.json` · `jsdom@29.1.1` verified against
Node 24.11.1 / vitest 3.2.7 · **no unrelated dependency refresh** · transitive impact to be recorded
from the actual lockfile diff · `npm audit` **informational only** unless the addition directly
introduces a new high-severity finding (the probe install surfaced pre-existing advisories unrelated
to `jsdom`; these are **not** this patch's to resolve).

### 15.9 Induced failures — all reproducible at parent `e25fe32`

1. A test placed at `components/collabboard/editors/*.test.tsx` is **not discovered** by
   `npx vitest run` — the glob is non-recursive (§15.4).
2. Forced to run under `environment: 'node'`, DOM APIs are unavailable and **`NoteEditor` renders a
   0-length string** (§14.5, reproduced again here).
3. `renderToStaticMarkup` open-state assertions **pass vacuously** on that empty output — the
   original false green.
4. The governed DOM test **fails** if `NoteEditor` returns `null` while `isOpen=true` (negative
   control 3).

After implementation: discovered by the standard command · jsdom initializes · open-state observes
real UI · save-on-close order characterized as `["save","close"]`.

### 15.10 Negative controls — each must be reproduced, reverted, and hash-verified

1. Remove the `// @vitest-environment jsdom` docblock → characterization **fails**.
2. Remove the `editors/*.test.tsx` include entry → the file is **not discovered** (assert the file
   count / discovery, not merely a pass).
3. Force `NoteEditor` to return `null` while open → **non-vacuity test fails**. *Production
   modification must be reverted and verified byte-identical via `git hash-object`; never committed.*
4. Polyfill control — **N/A by measurement** (§15.2). If the implementer finds a polyfill genuinely
   required, that is a **scope change requiring governance**, not a silent addition.
5. Reverse the expected save/close order to `["close","save"]` → lifecycle test **fails**.
6. **Remove the `afterEach` unmount → the ProseMirror teardown `ReferenceError` returns** (§15.3).
   This control is **mandatory**: it proves the discipline is load-bearing rather than decorative.

### 15.11 False-green protection

Reject if: the test only asserts "did not throw" · an empty container is accepted · source-string
checks substitute for DOM behaviour · all tests are moved to jsdom · **production is modified to make
tests easier** · any characterized defect is *corrected* here · the glob captures E2E/vendor/fork
tests · dependency changes extend beyond `jsdom` · `NoteEditor` is mocked instead of mounted · a
mounted root is left unmounted.

### 15.12 Validation matrix

Focused characterization suite · **proof of discovery through the ordinary `npx vitest run`** (not a
custom config) · `CardEditor` / `CardPreview` / `ClipartCardDraftModal` / `cardModalRoute`
regressions · **full Vitest — expect 67 files (66 + 1) and 765 + N tests; report both totals** ·
clean one-run `npm run typecheck` (410 declarations, exit 0) · `npx next build` · bridge exclusion
(**891** files, no marker) · clean E2E build (marker `1`) · ordinary `.next` restored and exclusion
re-verified · `git diff --check` · **explicit `package.json` + `package-lock.json` diff inspection** ·
only the five protected worktree paths outside committed history.

**Known environment note (from the PATCH-149A closure, §13):** a stale `.next` can produce an opaque
`uncaughtException [TypeError: Cannot read properties of undefined (reading 'length')]`. Run
`rm -rf .next` before build verification; it is not a defect of this patch.

### 15.13 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| DOM package incompatible with current Node/Vitest | **NOT TRIGGERED** — `jsdom` is an optional peer of vitest 3.2.7; `jsdom@29.1.1` ran on Node 24.11.1 |
| Requires upgrading Vitest or React | **NOT TRIGGERED** — no upgrade of any kind |
| **TipTap cannot mount without extensive browser emulation** | **NOT TRIGGERED** — mounted with **zero polyfills**; `ResizeObserver`/`matchMedia` absent and unneeded |
| **Suite becomes materially unstable** | **NOT TRIGGERED — but only because of §15.3.** The unmount discipline is the mitigation and is therefore binding |
| **Include change causes duplicate/unintended discovery** | **NOT TRIGGERED — narrowly avoided.** A recursive glob would have captured **143 vendored fork tests**; the authorized single-level glob captures **0** |
| Lockfile churn cannot be bounded | **NOT TRIGGERED** — one devDependency plus its transitives; no refresh authorized |
| Production changes required for basic mounting | **NOT TRIGGERED** — mounted unmodified at `e25fe32` |

### 15.14 Authorization status

**PATCH-149B0: OPEN · AUTHORIZED.** 4 infrastructure/test files, **0 production files**, ≤222
budgeted lines plus a bounded lockfile resolution.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`; review `e6e9122`) |
| **PATCH-149B0** | **OPEN · AUTHORIZED — next implementation unit** |
| **PATCH-149B1** | **BLOCKED until B0 closes** (predicate helper · legacy adapter · read-only renderer) |
| **PATCH-149B2** | **BLOCKED until B1 closes** (explicit Save · dirty baseline · discard confirmation) |
| **PATCH-149C** | **BLOCKED on user reproduction** of the exit / underline defects (§14.11) |
| **PATCH-150** | **RESERVED and separate** — presentation index-domain divergence; untouched |

**Recorded for B1's benefit:** this harness already proves, executably, three claims §14 could only
argue from source — save fires **before** close, the save payload carries **no title or metadata**,
and **Escape does nothing**. B1 inherits them as measured baselines rather than assertions.

---

## 16. PATCH-149B0 AMENDMENT — STALE PATCH-125 PACKAGE-FILE FREEZE · **RESOLVED, CLASS A**

**Authored:** 2026-08-04 (governance architect). **Base:** `76b95a3`, against the B0 implementation
left uncommitted in the working tree. **Scope: one additional test file. Zero production. Zero
change to the already-authorized B0 allowlist.**

### 16.1 Blocker diagnosis

Implementation reported the full suite at **1 failed / 774 passed** (67 files, 775 tests), the sole
failure being `components/collabboard/EmojiReactionPicker.test.tsx:105`:

```ts
expect(execFileSync('git', ['diff', '--', 'package.json', 'package-lock.json'])).toBe('');
```

This fires on **any** working-tree diff to either file — including the governed, owner-authorized
`jsdom` addition — because the assertion checks the *files*, not the *dependency*.

### 16.2 The PATCH-125 invariant — read from source, not inferred

`.fable5/patches/PATCH-125.md` was read in full. Its actual requirement:

- **§3e:** *"`package.json` and `package-lock.json` remain PROHIBITED. Dependency removal is not
  authorized…"* — this is PATCH-125's own **scope boundary** (§5's "Prohibited unless source proves
  necessary" list, alongside `ReactionDisplay.tsx`, `CardActionsToolbar.tsx`, etc.), telling
  **PATCH-125's implementer** not to touch those files while migrating reaction pickers. It is not
  phrased as, and nothing else in the document treats it as, a permanent prohibition binding every
  future patch.
- **§7, the 22 required tests:** none specifies a `git diff` check. Item set §4/§7 governs behaviour
  — *"No post Reaction path imports or renders `emoji-picker-react`"* (contract item 2, test item 3)
  — never file immutability.
- **§4 contract + §3e together** reduce to exactly one durable invariant: **`emoji-picker-react`
  must remain declared and must not be removed.** The `toBe('')` diff check was the **implementer's
  own proxy** for that invariant, and a strictly stronger one than governance asked for — it was
  never itself authorized by PATCH-125's text.

**Conclusion: the assertion has been over-scoped since PATCH-125 shipped (`3ea20ec`) and would have
blocked *any* future dependency change to these two files, not only PATCH-149B0's.** This is a
latent defect in a regression guard, exposed — not caused — by B0.

### 16.3 Scope classification: **A — ACCEPTABLE GOVERNANCE AMENDMENT**

B is not applicable: PATCH-125 itself never mandated immutable package files (§16.2). C is not
applicable: a narrow semantic correction exists, was drafted, executed, and proven correct
end-to-end (§16.4–16.6) without touching PATCH-125's actual production contract or any of its other
21 required tests.

### 16.4 Authorized correction — exact

**File:** `components/collabboard/EmojiReactionPicker.test.tsx`, the single `it` block at
(pre-amendment) lines 102–106. **Change type:** replace the file-level zero-diff assertion with a
line-level "was this dependency's line removed" assertion; retain both existing presence checks
unchanged.

```ts
  it('does not remove emoji-picker-react from package files', () => {
    expect(source('package.json')).toContain('"emoji-picker-react"');
    expect(source('package-lock.json')).toContain('"emoji-picker-react"');
    const diff = execFileSync('git', ['diff', '--', 'package.json', 'package-lock.json'], { encoding: 'utf8' });
    const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    expect(removedLines.find((l) => l.includes('emoji-picker-react'))).toBeUndefined();
  });
```

**Verified — this was drafted and executed by this governance turn as a probe, then reverted; it is
authorized for the implementation engineer to reapply, not left applied here** (this document
records source of truth; the working tree was returned to its pre-amendment state, hash
`bca4f77…`, matching the already-uncommitted B0 implementation exactly).

**Line budget: 6 changed lines** (`git diff --numstat`: 4 insertions, 2 deletions) — within the
authorized ≤8.

No other line in the file changes. `execFileSync` remains imported (already present, line 1) —
no new import required.

### 16.5 Amended allowlist

| Category | Path | Authorization |
|---|---|---|
| Infrastructure | `package.json` | unchanged from §15.7 |
| Infrastructure | `package-lock.json` | unchanged from §15.7 |
| Infrastructure | `vitest.config.ts` | unchanged from §15.7 |
| Test | `components/collabboard/editors/NoteEditor.characterization.test.tsx` | unchanged from §15.7 |
| **Test (new)** | **`components/collabboard/EmojiReactionPicker.test.tsx`** | **one `it` block only, ≤8 changed lines, exact shape §16.4** |

**Production remains frozen — zero files, unchanged from §15.7.** No PATCH-125 production source
(`EmojiReactionPicker.tsx` or any of the 6 reaction call-site files) may change. No other `it` block
in `EmojiReactionPicker.test.tsx` may change — the other 21 PATCH-125 assertions (migration census,
non-reaction consumers, structure/search, persistence-route source guards) are untouched and remain
binding exactly as PATCH-125 left them.

### 16.6 Induced failure and validation — executed by this governance turn as probe evidence

**Before correction** (stale assertion + governed jsdom diff, reproduced): **67 files, 775 tests,
774 passed, 1 failed** — matches the implementer's report exactly.

**After correction:** **67/67 files, 775/775 tests — full suite green.**

**Negative controls — all 4 executed, all reverted, all hash-verified byte-identical to the
pre-control state:**

1. Removed `"emoji-picker-react"` from `package.json` → corrected test **fails** on the first
   `toContain` (`package.json` restored via targeted single-line insert, not `npm`/`JSON.stringify`,
   to avoid the same comma-style reformatting hazard noted in §15; hash confirmed `2657dea…`,
   matching the implementer's own file exactly).
2. Deleted the full `node_modules/emoji-picker-react` resolved block plus the root dependency line
   from `package-lock.json` (3 occurrences → 0) → corrected test **fails** on the second `toContain`
   (hash restored to `8189984…`).
3. Restored the original whole-file `toBe('')` assertion → **fails** against the governed jsdom diff
   — this is the original blocker, re-derived to confirm the amendment is what resolves it, not
   something else (file restored to the corrected version, hash `b6f3ebe…`).
4. Removed `node_modules/jsdom` (directory moved aside, `package.json`/lockfile text untouched) →
   `NoteEditor.characterization.test.tsx` **fails outright at environment-init** (`Cannot find
   package 'jsdom'`, 0 tests collected) — proving the B0 dependency is genuinely load-bearing for a
   real test file, not merely declared. Directory restored; suite reconfirmed 10/10 immediately
   after.

**Full validation matrix, this turn:** full Vitest 67/67 · 775/775 (post-correction) and 67/67 ·
775/775 again after every negative control's revert (no residual state). `git diff --numstat` on
the amendment: `4 2`. The build/typecheck/exclusion/E2E matrix was already proven clean by the prior
implementation turn against the same 4 unchanged B0 files (§15.12) and is unaffected by a
test-only, non-production correction; the implementation engineer's own commit turn re-runs it
per the standing contract.

### 16.7 False-green check

The correction does not merely delete protection: both presence checks (`toContain`) are retained
verbatim, and the diff-based check is *narrower but still binding* — it fails on the exact defect it
exists to catch (accidental removal) while no longer failing on unrelated, authorized additions. It
does not touch PATCH-125's other 21 assertions, its production contract, or its census. **Rejected
alternative:** deleting the whole `it` block — this would satisfy "stop failing" but strictly weaken
PATCH-125's regression coverage, which is explicitly forbidden by this amendment's own brief
("do not merely delete all dependency-protection assertions").

### 16.8 Authorization status

**PATCH-149B0: OPEN · AUTHORIZED, amended.** The implementation engineer may now apply exactly the
§16.4 correction to `EmojiReactionPicker.test.tsx`, re-run the validation matrix, and commit all
five authorized files together:

```
test(editor): characterize NoteEditor in jsdom
```

**The commit must not include `.fable5`.**

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`; review `e6e9122`) |
| **PATCH-149B0** | **OPEN · AUTHORIZED, amended** — 4 infrastructure/test files (§15) + 1 test
  correction (§16), 0 production, full suite proven 67/67 · 775/775 |
| **PATCH-149B1** | **BLOCKED until B0 closes** |
| **PATCH-149B2** | **BLOCKED until B1 closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Existing B0 implementation files were not altered by this turn** — `package.json`,
`package-lock.json`, `vitest.config.ts`, and `NoteEditor.characterization.test.tsx` remain at
exactly the hashes the implementation turn left them (`2657dea…`, `8189984…`, `44fa672…`,
`fb0a121…`). `EmojiReactionPicker.test.tsx` was probed to prove §16.4 correct, then **reverted to
its committed HEAD state** (`bca4f77…`) — this document, not the working tree, is where the
correction is authorized from.

---

## 17. PATCH-149B0 — INDEPENDENT CLOSURE REVIEW

**Reviewed:** 2026-08-04 (independent closure reviewer). **Implementation commit:** `c9ea345`
`test(editor): characterize NoteEditor in jsdom`. **Parent:** `e73b7de`. All evidence below was
re-executed independently; nothing was taken on the implementer's word.

### 17.1 Source-scope result

`git show --numstat c9ea345` — **exactly the five authorized files, 707 insertions / 3 deletions:**

| File | +/− | Budget |
|---|---|---|
| `package.json` | 1 / 0 | ≤1 ✓ |
| `package-lock.json` | 551 / 0 | bounded ✓ |
| `vitest.config.ts` | 1 / 1 | ≤1 ✓ |
| `NoteEditor.characterization.test.tsx` | 150 / 0 | ≤220 ✓ |
| `EmojiReactionPicker.test.tsx` | 4 / 2 | ≤8 ✓ |

Filtering the commit's file list against the allowlist returns **empty** — no sixth file. **Zero
production files.** `git diff e73b7de c9ea345` over `NoteEditor.tsx`, `NoteEditorToolbar.tsx`,
`app/**`, `hooks/**`, `lib/**`, `types/**`, `supabase/**`, `components/collabboard/canvas/**`
(CanvasClient, CardEditor, modal routing, presentation, Excalidraw fork) returns **empty**.
**No `.fable5` file appears in the commit.**

### 17.2 `package.json` result

Adds exactly `"jsdom": "29.1.1"` to `devDependencies`, alphabetically placed. **No script changes**
— critically, none of the leading-comma `harness:*` script lines were reformatted, which the
implementer's own report flagged as an `npm install` hazard they had to work around by hand. No
dependency upgrades. React 19.2.7, Next 15.5.20, Vitest ^3.2.7, TipTap 3.x, TypeScript ^5 all
untouched.

### 17.3 `package-lock.json` result

- **Removed lines: 0.** The diff is *purely additive*.
- **39 new package entries, and 39 `"dev": true` markers** — a 1:1 match, so every added package is
  dev-only. Nothing leaks into the production dependency graph.
- Root `packages[""].devDependencies.jsdom = "29.1.1"`; `packages["node_modules/jsdom"].version =
  "29.1.1"`, `dev: true`.
- Enumerated all 39 added packages: `jsdom` plus recognized transitives only — `@asamuzakjp/*`,
  `@csstools/*`, `@bramus/specificity`, `@exodus/bytes`, `bidi-js`, `css-tree`, `data-urls`,
  `decimal.js`, `entities`, `html-encoding-sniffer`, `is-potential-custom-element-name`, `lru-cache`,
  `mdn-data`, `parse5`, `saxes`, `symbol-tree`, `tldts`, `tldts-core`, `tough-cookie`, `tr46`,
  `undici`, `w3c-xmlserializer`, `webidl-conversions`, `whatwg-mimetype`, `whatwg-url`,
  `xml-name-validator`, `xmlchars`. **No unrelated package, no version change to any pre-existing
  entry, no removal.**
- Lockfile parses as valid JSON.

### 17.4 Vitest include / discovery result

Sole config change: one appended non-recursive entry `'components/collabboard/editors/*.test.tsx'`.
`environment: 'node'` **unchanged**. No `**` recursion, no `setupFiles`, no `environmentMatchGlobs`,
no second project.

`npx vitest list --filesOnly` — **67 files total**, of which under `components/collabboard`:
the five pre-existing top-level tests plus **exactly one** new `editors/` file. Grep of the
discovered list for `excalidraw_fork`, `/e2e/`, `node_modules` returns **0**. No duplicate
discovery (the two globs are disjoint; the new file appears once).

**Independently confirmed the trap governance identified was real and avoided:** removing the new
entry (NC2) returns discovery to exactly **66 files / 765 tests**, proving the entry contributes
precisely **1 file / 10 tests** and nothing else — no fork tests, no hidden inflation.

### 17.5 jsdom environment result

`// @vitest-environment jsdom` is **line 1** of the characterization file, and applies to that file
only. No shared setup file. Global environment still `node`. **No polyfills** — grep for
`ResizeObserver`, `matchMedia`, `polyfill` returns empty, matching §15.2's measurement that none is
required. **`@testing-library/react` is not imported** (grep empty), avoiding the extraneous
fork-transitive trap; the suite uses `createRoot` from `react-dom/client` and `act` from `react`,
both declared dependencies.

### 17.6 Characterization result — all 10 contract items present

| §15.6 item | Verified in source and by execution |
|---|---|
| 1 Closed state | `isOpen={false}` ⇒ `innerHTML.length` **toBe(0)** |
| 2 Open non-vacuity | `length > 1000` **plus** overlay class, `.ProseMirror` node, text content, button count — see §17.7 |
| 3 Legacy HTML | `<p>Legacy HTML body</p>` / `<p>Stored note</p>` asserted via `textContent` (so raw tags cannot pass as literal text); `initialContent=""` asserts `.ProseMirror` present |
| 4 Toolbar | `button[title*="Bold"]`, `[title*="Italic"]`, and **`[title*="Text alignment"]`** — dead `Align` characterized as *present*, not removed |
| 5/6 Close & backdrop | backdrop is `container.firstElementChild`, i.e. the real overlay carrying `onClick={handleOverlayClick}` — **not** a child element; asserts `['save','close']` |
| 7 Escape | `onSave`/`onClose` both `not.toHaveBeenCalled()` — absence pinned, support not invented |
| 8 Modal constraints | overlay `fixed inset-0 z-[1000]`; card `style.width === '280px'`; `NoteEditorProps` sliced to assert **no `title:`, no `readOnly:`** |
| 9 Payload | exact 7-key sort-comparison, plus explicit `not.toContain('title')` / `not.toContain('metadata')` |
| 10 Cleanup | `afterEach` unmounts every root through `act` and removes containers |

**Nothing is corrected.** Save-on-close, backdrop persistence, the missing Escape handler, the dead
`Align` control, the absent `title`/`readOnly` props are all recorded as-is. No PDF work, no
`readOnly`/`title` addition, no toolbar change.

**On item 8 — one honest scoping note:** the "no `title`/`readOnly` prop" assertion is a **source
slice**, not DOM behaviour, and the test names itself accordingly (*"source-level; not observable
from rendered DOM"*). That is the correct treatment — a prop's *absence* has no DOM manifestation to
assert — and it is paired with real DOM assertions in the same block (the 280px width). This is not
the "source strings substituting for DOM behaviour" false-green: 9 of 10 tests are behavioural.

### 17.7 Non-vacuity proof — independently executed

Forced `NoteEditor` to `return null` while open (`if (true)` at `:692`, a genuine production
perturbation): **7 of 10 tests failed**, and the designated non-vacuity assertion failed with
exactly the intended message — **`AssertionError: expected 0 to be greater than 1000`**. An empty
container **cannot** pass. Production reverted and verified byte-identical (`3fd235f…`), never
committed.

For contrast, re-ran the *old* technique under `environment: 'node'`: `renderToStaticMarkup` on an
open `NoteEditor` still returns **length 0** — confirming §14.5's original finding and that this
suite is the first thing in the repository capable of catching an empty render.

### 17.8 Lifecycle, backdrop, Escape, payload results

- **Visible close / backdrop:** callbacks fire **`['save','close']`** — save strictly precedes close;
  `onSave` called exactly once. The event is dispatched on the overlay itself (the element that owns
  `handleOverlayClick`), so the `e.target === e.currentTarget` guard is genuinely exercised rather
  than bypassed by a child click. NC4 (reversing the expected order) **fails**, proving the ordering
  is pinned rather than incidentally satisfied.
- **Escape:** 0 saves, 0 closes — matching `NoteEditor`'s complete absence of a modal-level key
  handler (§14.11).
- **Payload:** exactly `['badgeColor','cardColor','content','detachedComments','reactions','textColor','topStrip']`
  — **no `title`, no `metadata`**, executably confirming §14.4's source-derived claim.

### 17.9 Teardown result — hazard reproduced, discipline proven load-bearing

Focused suite run **8 consecutive times with cleanup: 8/8 clean** — no `ReferenceError`, no Vitest
unhandled-error warning, no ProseMirror `DOMObserver` warning.

With the `afterEach` unmount removed (NC5), the same 8-run loop reproduced the warning on **2 of 8
runs** (runs 4 and 7). This **independently confirms both halves of §15.3**: the hazard is real, and
it is nondeterministic — exactly why governance made the discipline binding rather than relying on a
single green run. **The unmount is load-bearing, not decorative.** Restored; 8/8 clean again.

### 17.10 PATCH-125 amendment — **Classification A: semantic correction preserving the invariant**

Retains both presence assertions verbatim (`package.json` and `package-lock.json` each
`toContain('"emoji-picker-react"')`). Replaces the file-level `toBe('')` with a scan of **removed
diff lines only** for `emoji-picker-react`. Only that one `it` block changed; the other 21 PATCH-125
assertions (10-site migration census, reaction-path exclusion, three non-reaction consumers,
structure/search, persistence-route source guards, Note/Todo/Link semantics) are **untouched**, and
the file's test count is unchanged at **10**. No dependency-protection assertion was deleted.

**The decisive differential, executed on one identical diff:** with `package.json` reverted to its
pre-jsdom state (a working-tree diff whose only removal is the `jsdom` line) —

- the **old** assertion **fails** (`expected 'diff --git a/package.json…' to be ''`);
- the **corrected** assertion **passes** (10/10).

Yet the corrected assertion still **fails** when the dependency is actually removed — NC6
(`package.json` line deleted) and NC7 (all 3 lockfile occurrences invalidated) both fail on the
presence checks. **It tolerates governed additions while still catching real removal.** That is
class A, not a weakened invariant.

Cross-checked against `.fable5/patches/PATCH-125.md` directly: §3e's *"`package.json` and
`package-lock.json` remain PROHIBITED"* sits in that patch's **§5 prohibited-files list** (beside
`ReactionDisplay.tsx`, `CardActionsToolbar.tsx`, `IconSelector.tsx` …) — an implementer scope
boundary, not a permanent freeze; and none of its **22 required tests (§7)** specifies a diff
assertion. §16.2's diagnosis is confirmed correct.

### 17.11 Induced failures — all four reproduced at parent

1. Parent `vitest.config.ts` include array **lacks** the `editors/` entry — the new test is not
   discovered.
2. Under `environment: 'node'`, DOM APIs are unavailable — NC1 (docblock removed) fails **9/10**,
   with only the pure source-slice test surviving.
3. `renderToStaticMarkup` on an open `NoteEditor` in `node` returns **length 0** — vacuous by
   construction.
4. The old `EmojiReactionPicker` assertion **fails** against a governed package diff (§17.10).

All four are resolved at `c9ea345`.

### 17.12 Negative controls — 9/9 executed, reverted, hash-verified

| # | Control | Result |
|---|---|---|
| 1 | Remove jsdom docblock | 9/10 fail ✓ |
| 2 | Remove `editors/` include entry | discovery drops to 66 files / 765 tests ✓ |
| 3 | Force `NoteEditor` null while open | 7/10 fail, non-vacuity assertion `expected 0 to be greater than 1000` ✓ |
| 4 | Reverse save/close order | lifecycle test fails ✓ |
| 5 | Omit root unmount | teardown warning reproduced **2/8 runs** ✓ (nondeterministic, as documented) |
| 6 | Remove `emoji-picker-react` from `package.json` | corrected test fails ✓ |
| 7 | Invalidate lockfile entry | corrected test fails ✓ |
| 8 | Restore whole-file zero-diff assertion | fails against governed package diff ✓ |
| 9 | Remove `node_modules/jsdom` | env init fails, `Cannot find package 'jsdom'`, 0 tests collected ✓ |

Post-control hashes all match the committed blobs: `package.json` `2657dea…`, `package-lock.json`
`8189984…`, `vitest.config.ts` `44fa672…`, characterization test `fb0a121…`,
`EmojiReactionPicker.test.tsx` `b6f3ebe…`, **`NoteEditor.tsx` `3fd235f…` (production, untouched)**.

*Process note: two `sed` invocations during this review failed on delimiter/escaping and left their
target files unmodified. Both were caught by immediate `git hash-object` verification before any
conclusion was drawn — the apparent "10/10 pass" in each case was the unmodified baseline, not a
control result, and each control was then re-run correctly. Recorded because a hash check is the
only thing that distinguishes "control passed" from "control never ran."*

### 17.13 Full validation

Focused (characterization · EmojiReactionPicker · CardEditor · CardPreview · ClipartCardDraftModal ·
cardModalRoute): **6/6 files, 118/118 tests.**
**Full Vitest: 67/67 files, 775/775 tests** (66+1 files, 765+10 tests), no `Errors` line.
`npm run typecheck`: **exit 0**, **410 declarations** confirmed by direct count.
`npx next build`: **exit 0**. Bridge exclusion: **891 files**, marker absent.
`npm run build:e2e`: **exit 0**, `.next/E2E_BRIDGE_BUILD` = **`1`**.
Ordinary `.next` restored: build exit 0, exclusion **891 files**, **marker absent**.
`git diff --check`: **exit 0**.
Worktree outside committed history: only the five protected paths.

### 17.14 False-green review

None of the rejection conditions holds: no production file changed · behaviour characterized, not
corrected · an empty container provably cannot pass (§17.7) · 9 of 10 tests are DOM-behavioural ·
global environment still `node` · `@testing-library/react` unused · discovery captures zero fork
tests · no teardown warnings with the shipped cleanup · lockfile churn is jsdom-only and additive ·
the PATCH-125 invariant still catches real removal · Save/Close unchanged · `Align` still rendered ·
no `readOnly`/`title` added · no PDF work.

### 17.15 Observations (non-blocking)

- **The `Align` control is now pinned as present.** This is correct for B0 (characterize, don't
  correct), but §14.10 rules `Align` must **not** appear on the Document toolbar. Whichever patch
  acts on that will need to update this assertion in the same commit — it is a deliberate tripwire,
  not an obstacle, and worth naming so it is not mistaken for a regression later.
- **`NoteEditor` remains characterized, not covered.** Ten tests over a 1,165-line component pin the
  seams B1/B2 depend on (mount, content load, save payload, lifecycle order, Escape absence); they
  are not a regression suite for the Note Post's colour, comment-thread, reaction or popup systems,
  none of which has any test. That gap predates B0 and is not B0's to close — but B1 should not
  mistake a green characterization suite for freedom to restructure `NoteEditor` safely.
- **The nondeterministic teardown warning (2/8) deserves its binding rule.** Had the implementer
  validated with a single run and no cleanup, it would likely have passed and shipped a latent
  cross-file flake. This is the clearest evidence in the patch that §15.3 earned its "binding" status.

### 17.16 Final classification

**2 — PASS WITH NON-BLOCKING OBSERVATIONS.**

No CRITICAL or HIGH issues. Every governed acceptance criterion was independently re-executed rather
than trusted. The three observations in §17.15 are forward-looking notes for B1, not defects in B0.

### 17.17 Status

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`; review `e6e9122`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`; this review) |
| **PATCH-149B1** | **RELEASED — eligible for governance authorship.** Not authorized here; scope (Document predicate helper · legacy-content adapter · read-only TipTap renderer) must be governed in its own turn, and §14.13's B0 prerequisite of a **per-row `type:'card'` content-corpus measurement** remains outstanding input to the adapter spec |
| **PATCH-149B2** | **BLOCKED until B1 closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** of the exit / underline defects (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**No implementation was modified by this review; `c9ea345` was not amended; nothing was pushed.**

---

## 18. PATCH-149B1 — DOCUMENT FOUNDATION · **BLOCKED (S3)**

**Authored:** 2026-08-04 (governance architect). **Base:** `9e254e4`. No production or test file was
modified in this turn. **Authorization is withheld on two independent grounds**: the mandatory
corpus measurement could not be executed (§18.1), and the routing census uncovered a previously
unrecorded defect that changes the shape of the patch (§18.3).

### 18.1 Corpus measurement — **NOT OBTAINED. This is the blocking gate.**

The brief makes real-corpus measurement the mandatory first step and forbids authorizing the adapter
without it. It could **not** be completed:

- A live corpus **does exist and is reachable** — `.env.local` declares `NEXT_PUBLIC_SUPABASE_URL`
  and `SUPABASE_SERVICE_ROLE_KEY`, and the repo ships `scripts/live-access-login.mjs`.
- A measurement script was written to `scratchpad/corpus149b1.mjs`. It queries
  `padlets where type='card'`, partitions on `metadata.svgUrl`, and emits **aggregates only** —
  per-class counts, metadata-key frequency, title presence, `data-*` occurrence, tag-name shape,
  newline counts and 8-char SHA1s. **It never prints stored content.**
- **Execution was denied by the environment's permission classifier** (live-database read via a
  service-role key). No workaround was attempted, and none should be.

**This is materially different from "no corpus exists."** It is one approval away. Governance must
not substitute assumption for the measurement it declared mandatory — especially in a patch whose
entire adapter contract (plain-text vs HTML vs escaped-HTML vs malformed) is specified *from* that
distribution. **No adapter is authorized.**

**Unblock requirement:** permission to run
`node scratchpad/corpus149b1.mjs` (read-only `select` on `padlets`, aggregates only), or an
equivalent export the owner produces. Everything in §18.6 becomes writable immediately afterward.

*Secondary evidence only, not a substitute:* `CardEditor` writes plain text via a `<textarea>`;
`CardEditor.tsx:56` strips tags for its word count; card bodies are `DOMPurify`-sanitised at render —
so HTML *may* already exist in some rows from non-editor paths. That is exactly the ambiguity the
measurement exists to resolve, and it cannot be resolved by reading source.

### 18.2 Document predicate — verified, unchanged, and sound

Re-confirmed against §14.3's census: all six `type:'card'` producers, with `kind:'card'` traced to a
single producer (`usePadletSave.ts:1006`, the `saveCard` placement draft). The predicate stands:

```
isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl
```

Document included · clipart excluded (`svgUrl`) · text/note (`'text'`), comments, embedded media all
excluded by type. **No source path creates a non-clipart `type:'card'` post except the Document
tool.** The predicate is *source-complete*; what remains unproven is whether **legacy/imported rows**
satisfy it without being user-facing Documents — which only §18.1 can answer. **The brief's own hard
stop applies: "If ordinary non-document cards also satisfy the predicate, stop."** Source says no;
data has not yet been asked.

### 18.3 Route census — **new defect found; it changes B1's shape**

§14.2's census covered the Freeform routes. Extending it to the remaining layouts revealed that the
three "incidental ungated openers" recorded in §14.11 are **not** the unrelated capability nit that
entry assumed:

| Site | Enclosing component | Handler | Behaviour |
|---|---|---|---|
| `CanvasClient.tsx:6480` | **`ColumnsLayout`** | `onOpenPost` | `setPadletToEdit(post); setIsNoteEditorOpen(true)` |
| `CanvasClient.tsx:6570` | **`RowCanvasDnD`** | `onOpenPost` | same |
| `CanvasClient.tsx:6729` | **`DrawingLayout`** | `onEditPadletAsPost` | same |

All three open **any post type — including a `type:'card'` Document — directly in `NoteEditor`**,
bypassing `openPadletInTypeEditor` and therefore bypassing `selectCardModalRoute`.

**Three consequences, all load-bearing for B1:**

1. **§14.11's classification was wrong and is corrected here.** It reasoned Documents "are not
   reachable through these section handlers." They are: a Document is a post, and these handlers
   accept any post. This is a **Document-related route**, squarely inside B1's ownership ("Trace all
   Document opening routes … Branch only on the exact Document predicate").
2. **Documents already reach TipTap in three layouts today** — via the wrong entry point, with no
   title handling, no capability check, and `saveNote`'s note-shaped payload (`SaveNoteData` has no
   `title`; §14.2). B1's premise that Documents are exclusively a `CardEditor` concern is incomplete.
3. **These routes are ungated.** The brief forbids leaving a Document route ungated and forbids
   weakening PATCH-139/151. B1 must gate them — which means touching `CanvasClient` in three more
   places than the allowlist sketch anticipated, and re-verifying that gating Columns/Rows/Drawing
   post-opening does not regress **Note/Todo/Link/Image** posts that legitimately use those same
   handlers.

**This is not a reason to abandon B1 — it is a reason not to authorize it on an incomplete census.**
The correct scope cannot be budgeted until the non-Document impact of gating those three handlers is
measured.

### 18.4 Architecture — **R1 selected (conditionally), extraction is feasible**

Measured on `NoteEditor.tsx`: **one** `useEditor` call (`:232-282`), `NOTE_EXTENSIONS` a
module-level `const` (`:23-37`, unexported, zero state coupling), 19 `useState` hooks, 39 `editor.`
references, 11 `editor?.` guards.

The single extraction friction is `editorProps.handleClick` (`:241-279`), which closes over
Note-specific comment UI (`noteCardRef`, `setLinkedTextPosition`, `setCommentPopupPosition`,
`setActiveThread`, `setCommentPopupOpen`). A hook that accepts optional `editorProps`/`handleClick`
overrides resolves this cleanly.

**Selected: R1 — extract a narrow `useDocumentEditor`-style hook** owning `useEditor`, the shared
extension registry, content init, HTML serialization and `editable` state; consumed by both the
existing `NoteEditor` modal and a new Document wrapper (M2). R2 is the fallback if the shell/body
split proves cleaner in implementation; **R3 is rejected** — duplication of the extension registry
would immediately re-create the P6 duality this patch exists to end. **No wholesale rewrite.**

**Conditional**, because the B0 closure's own observation (§17.15) applies: 10 characterization tests
pin mount/content/lifecycle seams but leave `NoteEditor`'s colour, comment-thread, reaction and popup
systems **entirely untested**. R1 touches the `useEditor` call those systems depend on. Extraction
should be preceded by characterizing at least the `handleClick` comment-anchor path, or the net
safety of B0 is spent rather than banked.

### 18.5 Contracts settled by measurement (carry forward unchanged)

- **Serialization** (§14.6): in `content: initialContent`; out `editor.getHTML()`; empty is
  `<p></p>` not `''`; sanitisation at render via `DOMPurify`; **custom node attributes round-trip as
  `data-*`, proven by the shipped `Comment` extension** (`:243-272` reads back
  `data-comment-id`/`-thread`/`-user-id`/`-timestamp`/`-color`). No envelope, no schema change.
- **PDF seam** (§14.6, §6): future nodes register in the shared extension registry; attributes
  survive `getHTML()`; no modal-level PDF branch. **Nothing PDF is added.**
- **Toolbar / Align** (§14.10): Document mode must expose only proven-working text controls
  (text-style, bold, italic, strike, underline, bullet/ordered list, code, link) and **must not
  render `Align`** — `onAlign` is never supplied and `extension-text-align` is absent from
  `NOTE_EXTENSIONS`; B0 measured it as *visibly rendered*, so a mode/capabilities-filtered surface is
  required. `Align` is **not** removed globally from the Note Post without separate evidence.
- **Title** (§14.2): stays in `padlets.title`, never embedded in body HTML; `saveCard` carries
  `{title, content, metadata}` while `saveNote` carries **no title** — any Document route through
  note-shaped save is a title-loss hazard and must be treated as such.
- **Read-only:** `editable:false` on the same core; no toolbar, no Save, no title input, no dirty
  state, no write on close; clipart viewer (PATCH-151) untouched.
- **Lifecycle:** B1 preserves current save-on-close **as characterized**, adds no new silent-write
  route, and leaves Save/dirty/discard entirely to **B2**.

### 18.6 Split decision — **S3 · BLOCKED**, with S2 as the shape on unblock

Neither S1 nor S2 can be responsibly authorized now: S1 is out on size alone once §18.3's gating work
is counted, and S2's **B1a is precisely the unit that depends on the missing corpus** (predicate +
adapter + core extraction). Authorizing B1a minus the adapter would ship a predicate and a hook with
no consumer — speculative code of exactly the kind §14.13 declined to authorize.

**On unblock, the expected shape is S2:**

| Unit | Scope | Gate |
|---|---|---|
| **B1a** | corpus measurement · predicate helper · legacy-content adapter · R1 core extraction | §18.1 |
| **B1b** | Document wrapper · routing (incl. the three §18.3 handlers) · read-only integration · toolbar filtering | B1a closed |

Allowlists, per-file line budgets, induced-failure plan and negative controls are **deliberately not
issued** — the same discipline applied in §14.13. Issuing budgets before the corpus distribution and
the §18.3 blast radius are known would produce numbers with no evidentiary basis, and the brief's own
rule applies: *"Do not force unsafe compression merely to fit numbers."*

### 18.7 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| **Real corpus contains non-Document rows satisfying the predicate** | **UNKNOWN — measurement denied (§18.1). BLOCKING.** Source evidence says no; data unasked |
| **Corpus shapes cannot be safely distinguished** | **UNKNOWN — same cause. BLOCKING** |
| Extraction requires broad NoteEditor rewrite | **NOT TRIGGERED** — R1 feasible; one `useEditor`, module-level registry, single `handleClick` friction (§18.4) |
| Existing NoteEditor behavior cannot be preserved | **NOT TRIGGERED**, but under-covered — B0 pins 10 seams, not the comment/colour/reaction systems (§18.4) |
| Plain text cannot be adapted without schema changes | **NOT TRIGGERED** — TipTap accepts an HTML string; no migration needed |
| Custom attributes do not survive serialization | **NOT TRIGGERED** — proven by the `Comment` extension |
| Read-only TipTap still permits mutation | **UNVERIFIED** — `editable:false` not yet exercised in the B0 harness; must be proven, not assumed |
| **Routing requires weakening PATCH-139/151** | **NOT TRIGGERED — but the inverse defect exists**: three routes are already ungated and must be *strengthened* (§18.3) |
| Cannot be tested with the B0 harness | **NOT TRIGGERED** — B0 harness (jsdom, `editors/*.test.tsx`) is closed and green |
| **Production scope cannot be bounded** | **TRIGGERED** — §18.3 adds unbudgeted `CanvasClient` gating whose non-Document blast radius is unmeasured |

**Three hard stops trigger: two from the denied measurement, one from the newly-found routing
defect.**

### 18.8 Status

**PATCH-149B1: OPEN · BLOCKED (S3).** Predicate, architecture (R1/M2), serialization, PDF seam,
toolbar, title and read-only contracts are all settled and recorded above; only the corpus-dependent
adapter and the §18.3-dependent routing budget remain.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`; review §17) |
| **PATCH-149B1** | **OPEN · BLOCKED** — corpus measurement denied (§18.1) + routing scope unbounded (§18.3) |
| **PATCH-149B2** | **BLOCKED until B1 closes** — owns Save/dirty/discard/Close/Escape; B1 leaves the seams, implements none |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

### 18.9 Correction to §14.11 — recorded

§14.11 classified the three layout openers as "not a Document-Post route … not a PATCH-139/151
regression." **That classification is superseded by §18.3.** They *are* Document-reachable and they
*are* ungated. The reasoning error is worth naming: it inferred reachability from where Documents are
*created* (Freeform) rather than from what the handlers *accept* (any post). PATCH-139/151 remain
correctly closed — their Freeform routes are sound — but the capability surface was never complete.

> **§18.3 and §18.9 are themselves partly superseded by §19.3.** The measured census shows
> `DrawingLayout` is **not** Document-reachable, and the two routes that are reachable are **capability-
> gated after all**. The defect is real but is a *title-loss* hazard, not a permission bypass. §19.3
> supersedes; this section is retained to show the correction chain.

---

## 19. PATCH-149B1 — MEASURED AMENDMENT · **AUTHORIZED, SPLIT (S2)**

**Authored:** 2026-08-04 (governance architect). **Base:** `204c755`. The owner approved a one-time
SELECT-only corpus inspection; it was executed, recorded, and the script deleted. Both §18 blockers
are resolved. No production or test file was modified in this turn.

### 19.1 Corpus measurement — method, safeguards, deletion

**Method.** `scratchpad/corpus149b1.mjs` (Node + `@supabase/supabase-js`, service-role key read from
`.env.local`) issued **one** query:
`supabase.from('padlets').select('type,title,content,metadata,width,height').eq('type','card')`.

**SELECT-only, verified.** A grep for `.insert(|.update(|.delete(|.upsert(|.rpc(` over the script
returned only `crypto.createHash().update()` — no Supabase mutation, no RPC, no write-back. Exactly
one `.from()/.select()` pair.

**Privacy safeguards.** The script printed **aggregates only**: per-class counts, metadata *key*
frequency (never values), title present/empty **counts**, `data-*` presence counts, tag-*name* sets,
character length, newline counts, geometry buckets, and 8-char SHA1s used solely for duplicate-shape
counting. **No stored content, no title text, no ids, no board/workspace/user identifiers** were
emitted. Nothing below is an excerpt of user data.

**Deletion.** The script was removed from both the repo root (where it was copied only so Node could
resolve `@supabase/supabase-js`) and the scratchpad; no report file was written; `git status` shows
only the five pre-existing protected paths. **No credentials or query results remain in the worktree.**

### 19.2 Aggregate corpus result — and it reframes the patch

| Measure | Value |
|---|---|
| Total `type:'card'` rows | **142** |
| Clipart rows (`metadata.svgUrl`) | **140** |
| **Rows satisfying the predicate (non-clipart)** | **2** |
| Content classification | `plain-text` **1** · `malformed-html-like-text` **1** |
| HTML fragments / full HTML documents / JSON / escaped-HTML / empty | **0 each** |
| Rows with `data-*` attributes | **0** |
| Rows with TipTap-style markup (`<strong>`, `<ul>`, `<h1>`…) | **0** |
| Titles | present **2**, empty **0** |
| `metadata.kind === 'card'` | **0** |
| Metadata key frequency | `description` **2** · `parentId` **1** · `zIndex` **1** |
| Geometry | `180x220` **1** · `300x200` **1** |
| Distinct structural shapes | **2** (no duplicates) |
| Newlines | LF-only **1** · none **1** |

**Three findings that change the risk model:**

1. **The "mixed corpus" premise is refuted by measurement.** §7 and §14.6 warned that some
   `type:'card'` rows might already hold HTML from non-editor paths. **Zero rows contain HTML** — no
   tags, no `data-*`, no TipTap markup. The adapter's HTML-input branch has **no real instance**, so
   the migration's actual risk is far lower than governance had assumed. It must still be implemented
   (defensively, and because `NoteEditor` emits HTML on save), but it is not load-bearing for
   existing data.

2. **The escaping requirement is real, not hypothetical.** The `malformed-html-like-text` row is
   **9,250 characters, 332 LF newlines, and zero matched tags** — i.e. plain prose containing bare
   `<`/`>` characters. Naively passing it to TipTap as HTML would silently swallow everything from the
   first `<` onward. **This single row is the strongest fixture shape in the corpus** and the reason
   the adapter must escape rather than trust. It also proves paragraph/newline preservation matters:
   332 newlines must survive as structure.

3. **Both rows are provably genuine Documents.** `metadata.description` appears in **2 of 2** rows,
   and `description` is written *only* by `CardEditor`'s footer input (`CardEditor.tsx:29`, persisted
   through `handleSave`). Both rows therefore passed through the Document editor. Combined with the
   source-complete producer census (§14.3), no evidence of an "ordinary non-Document card" exists.

**Geometry is explicitly rejected as a discriminator.** One row is `300x200`, which **no** creation
site produces (all card creators use 180×220, or 200×200 for a container clipart drop). The
explanation is user resizing, which is ordinary. Recorded so a future patch does not mistake geometry
for provenance.

### 19.3 Predicate classification — **P1 · SAFE FOR ALL MEASURED ROWS**

`isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl` holds for **2 of 2** measured
rows, both independently corroborated as Documents by `metadata.description`. Clipart (140 rows) is
excluded by `svgUrl` with no ambiguity. **No stable-discriminator work is required; no hard stop.**

**Stated honestly:** n = 2 is a small Document corpus. P1 is a statement about *the entire accessible
corpus*, not about a large sample — the strength of the predicate rests primarily on the
source-complete producer census (§14.3), with the corpus confirming rather than establishing it. The
implementation must still treat unclassifiable content defensively (§19.6), because the next
Document written is not covered by a measurement of the previous two.

### 19.4 Cross-layout route census — §18.3 **corrected on two counts**

| Route | Component | Invoked for | Capability gate | Destination | Bypasses `openPadletInTypeEditor`? | Document-reachable? |
|---|---|---|---|---|---|---|
| `CanvasClient:6480` `onOpenPost` | **`ColumnsLayout`** → `ColumnsCanvasRow:344,409` → `ColumnPostContextMenu.onOpen` | any post | **`disabled={!isEditable}`**, and `isEditable={canUseFreeformEditButton}` (`:6466`) | `setIsNoteEditorOpen(true)` | yes | **YES** |
| `CanvasClient:6570` `onOpenPost` | **`RowCanvasDnD`** → `RowLane:418,478` → `ColumnPostContextMenu.onOpen` | any post | **`disabled={!isEditable}`**, `isEditable={canUseFreeformEditButton}` (`:6551`) | `setIsNoteEditorOpen(true)` | yes | **YES** |
| `CanvasClient:6729` `onEditPadletAsPost` | **`DrawingLayout`** → `CanvasContextMenu:172` | **only when `isContainerType`** — `padlet.type === 'container' \|\| metadata.isContainer === true` (`:105`) | n/a | `setIsNoteEditorOpen(true)` | yes | **NO** |

**Correction 1 — `DrawingLayout` is not Document-reachable.** `CanvasContextMenu:172` calls
`onEditPadletAsPost` only under `isContainerType && onEditPadletAsPost`, otherwise `onEdit(padlet)`.
A Document is `type:'card'` without `metadata.isContainer`, so it never takes that branch. **§18.3
over-reported the blast radius by one route.**

**Correction 2 — the two reachable routes are capability-gated, and by the *right* boolean.** Both
sites disable the context menu with `disabled={!isEditable}`, and `isEditable` is wired from
**`canUseFreeformEditButton`** (`:6466`, `:6551`) — **the same boolean
`selectCardModalRoute(canUseFreeformEditButton)` consumes**. A read-only user cannot open the menu at
all, so they reach *no* modal rather than the wrong one. **This is not a permission bypass, and
PATCH-139/151 are not weakened.** §18.3's "ungated" framing was wrong.

**The real defect, correctly stated — a P3 data-integrity hazard, not a security one.** An *editable*
user opening a Document from Columns or Rows lands in **`NoteEditor`**, whose save contract
`SaveNoteData` has **no `title` field** (`usePadletSave.ts:34-47`; `saveNote` hardcodes
`title: 'New Note'` only on insert and never updates title thereafter). Saving therefore **cannot
persist the Document's title**, and writes note-shaped metadata (`cardColor`, `topStrip`,
`reactions`, `badgeColor`, `detachedComments`) onto a Document row. Both measured Documents have
titles, so this is a live path to losing user work (**P3**, P10).

**Non-Document blast radius.** `onOpenPost` is a generic handler: Note, Todo, Link, Image and
embedded-media posts also flow through it and **must keep their current destinations**. The fix must
therefore branch *only* on the Document predicate and fall through untouched for everything else —
which is precisely why RTE-C is selected below over centralisation.

### 19.5 Routing architecture — **RTE-C · shared Document open helper**

- **RTE-A rejected:** a central dispatcher would put Note/Todo/Link/Image/comment routing on the
  table across three layouts — exactly the "generic modal-permission redesign without evidence" the
  brief forbids.
- **RTE-B rejected:** duplicating the predicate + capability branch at each of three owners
  re-creates the P6 duality this patch exists to end.
- **RTE-C selected:** one narrow helper returning the Document modal destination, consumed by the two
  layout owners **and** the existing Freeform path, composing with — never replacing —
  `selectCardModalRoute`. Non-Document posts fall through to today's behaviour, untouched.
- RTE-D not needed: with `DrawingLayout` excluded, the routing work is two call sites.

**Capability authority unchanged:** reuse `canUseFreeformEditButton` and `selectCardModalRoute`;
introduce no second role model; never infer permission from callback presence; client gating remains
UI-only and is not the persistence authorization boundary.

### 19.6 Adapter contract (now specified against measured shapes)

One boundary, `lib/domain/canvas/documentContentAdapter.ts`, pure and node-testable:

- `classifyDocumentContent(raw)` → `empty | plain-text | html | escaped-html | malformed | json | unknown`.
- `toEditorHtml(raw)` — **plain text (the measured majority case): HTML-escape `&`, `<`, `>` first**,
  then map newlines to paragraph/`<br>` structure so the 332-newline row survives. **Never** hand raw
  text to TipTap as HTML.
- `html` — pass through the existing `DOMPurify` boundary; preserve supported marks **and `data-*`
  attributes** (the PDF seam; §14.6).
- `empty` → empty TipTap document. `malformed`/`unknown` → **fail safe by treating as plain text**;
  never silently drop visible source.
- `fromEditorHtml(html)` — normalize for persistence; treat `<p></p>` as empty; **metadata passes
  through untouched**.
- **No bulk migration, no schema change.** Lazy normalization only on a later user save, and **B1
  does not change save semantics** (B2 owns that).

### 19.7 Split decision — **S2**, and the budgets that force it

Counting the work: 3 new domain/editor files + `NoteEditor` hook adoption + a Document wrapper +
toolbar mode-filtering + 2 routing call sites + `CanvasClient` wiring exceeds the brief's own
one-patch ceiling (≈6 production files / 250 production lines). **S2 is selected; nothing is
compressed to fit.**

**PATCH-149B1a — predicate, adapter, shared core.** Production allowlist:

| # | Path | Change | Max lines |
|---|---|---|---|
| 1 | `lib/domain/canvas/documentPost.ts` | **new** — `isDocumentPost` predicate, pure | **25** |
| 2 | `lib/domain/canvas/documentContentAdapter.ts` | **new** — §19.6 adapter, pure | **110** |
| 3 | `components/collabboard/editors/useSharedTipTapEditor.ts` | **new** — R1 hook: `useEditor`, exported extension registry, content init, `getHTML`, `editable` flag; accepts optional `editorProps`/`handleClick` override (the one measured coupling, §18.4) | **90** |
| 4 | `components/collabboard/editors/NoteEditor.tsx` | consume the hook; **behaviour-preserving only** — no lifecycle, toolbar, comment, colour or reaction change | **45** |

**Production total ≤ 270 lines / 4 files.** Tests: `documentPost.test.ts` (≤80, node),
`documentContentAdapter.test.ts` (≤160, node), `useSharedTipTapEditor.test.tsx` (≤120, **jsdom**, in
`components/collabboard/editors/`), plus ≤20 lines of additions to
`NoteEditor.characterization.test.tsx`. **Test total ≤ 380 / 4 files.**

**PATCH-149B1b — wrapper, routing, read-only, toolbar. BLOCKED until B1a closes.** Indicative scope
(budgets issued at its own authoring): `DocumentEditor.tsx` (new wrapper, editable + read-only via
`editable:false`), `NoteEditorToolbar.tsx` (mode/capabilities filtering, **Align excluded from
Document mode only**), the RTE-C helper's two layout call sites plus the Freeform path, and
`CanvasClient`/`CanvasModals` wiring.

### 19.8 Induced failures — each demonstrable at parent `204c755`

**B1a:** (1) no `isDocumentPost` helper exists — the predicate is inlined at `CanvasClient:5700/5704`;
(2) no content adapter exists — plain text with `<` reaches no escaping boundary anywhere;
(3) no shared TipTap core exists — `NOTE_EXTENSIONS` is module-private and unexported
(`NoteEditor.tsx:23`), consumed by exactly one `useEditor`;
(4) feeding the measured 9,250-char angle-bracket shape to TipTap as HTML **loses content** — the
proof that §19.6's escaping rule is required.

**B1b (recorded, proven at its own authoring):** the Document predicate routes to `CardEditor`;
read-only Documents render textarea semantics; `Align` renders in the only rich-text toolbar;
Columns/Rows open Documents in `NoteEditor` where a save drops the title (§19.4).

### 19.9 Negative controls

**B1a:** classify clipart as Document → predicate test fails · classify a `'text'` note as Document →
fails · treat plain `<example>` text as HTML → round-trip test fails on lost content · strip `data-*`
in the adapter → attribute round-trip fails · drop the newline mapping → the 332-newline fixture
fails · change `NoteEditor`'s save payload or lifecycle during hook adoption → B0 characterization
fails (10 tests) · unexport/duplicate the extension registry → shared-core test fails.

**B1b:** render read-only with an editable editor · expose a toolbar in read-only · restore `Align` in
Document mode · route a Document back to `CardEditor` · bypass capability on the layout routes ·
embed title into body HTML · add a PDF-specific branch. Each must be detected.

### 19.10 Validation matrix

Corpus evidence (§19.1–19.2, recorded — not re-runnable without fresh approval) · adapter tests ·
predicate tests · shared-core jsdom tests · **B0 `NoteEditor` characterization regression, 10/10
unchanged** · `CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute` · routing
source-slices where full render is impractical · **full Vitest (baseline 67 files / 775 tests)** ·
clean one-run `npm run typecheck` (**410** declarations) · `npx next build` · bridge exclusion
(**891** files) · clean E2E build (marker `1`) · ordinary `.next` restored and exclusion re-verified ·
`git diff --check` · only the five protected worktree paths. **No new test environment; no package or
schema change.**

### 19.11 Hard stops — re-evaluated

| Hard stop | Result |
|---|---|
| Real corpus contains non-Document rows satisfying the predicate | **NOT TRIGGERED** — 2/2 rows are Documents, corroborated by `metadata.description` (§19.2) |
| Corpus shapes cannot be safely distinguished | **NOT TRIGGERED** — two shapes, both plain text; zero HTML |
| Extraction requires broad NoteEditor rewrite | **NOT TRIGGERED** — R1, one `useEditor`, single `handleClick` coupling |
| Existing NoteEditor behavior cannot be preserved | **NOT TRIGGERED** — B0's 10 characterization tests are the guard; still under-covered for comment/colour/reaction (§18.4), so B1a is behaviour-preserving only |
| Plain text cannot be adapted without schema changes | **NOT TRIGGERED** — escaping + newline mapping; no migration |
| Custom attributes do not survive serialization | **NOT TRIGGERED** — proven by the shipped `Comment` extension |
| Read-only TipTap still permits mutation | **UNVERIFIED — deferred to B1b**, must be proven in the B0 harness, not assumed |
| **Routing requires weakening PATCH-139/151** | **NOT TRIGGERED** — §19.4 shows both reachable routes already gate on `canUseFreeformEditButton`; RTE-C composes with `selectCardModalRoute` |
| Cannot be tested with the B0 harness | **NOT TRIGGERED** |
| **Production scope cannot be bounded** | **RESOLVED** — `DrawingLayout` excluded; B1a is 4 files / ≤270 lines |

### 19.12 Status

**PATCH-149B1a: OPEN · AUTHORIZED** — 4 production files, ≤270 production lines, ≤380 test lines.
**PATCH-149B1b: OPEN · BLOCKED until B1a closes.**

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **OPEN · AUTHORIZED — next implementation unit** |
| **PATCH-149B1b** | **BLOCKED until B1a closes** — wrapper · RTE-C routing · read-only · toolbar |
| **PATCH-149B2** | **BLOCKED until B1b closes** — Save/dirty/discard/Close/Escape; B1 leaves seams, implements none |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Carried to B1b as a first-class item:** the Columns/Rows title-loss path (§19.4). It is a live P3
hazard today, independent of the TipTap migration, and must not be lost behind the foundation work.
