# PATCH-149 — DOCUMENT POST USABILITY, MODAL CLEANUP, PDF-READY FOUNDATION

**Status:** **STAGED · PATCH-149A CLOSED (`c23be50`) · PATCH-149B0 AUTHORIZED — jsdom
characterization harness for `NoteEditor`, 0 production files (§15) · PATCH-149B1/B2 BLOCKED behind
B0 · PATCH-149C RESERVED for the two unlocated defects · NOT PUSHED**
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
