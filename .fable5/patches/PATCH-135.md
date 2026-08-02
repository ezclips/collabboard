# PATCH-135 — Responsive Canvas Toolbar Overflow

**Status: OPEN · RESPONSIVE OVERFLOW ARCHITECTURE BOUNDED · NARROW IMPLEMENTATION AUTHORIZED**

**Governance only. No production or test file was modified in this patch. Nothing pushed.**

Authored 2026-08-02 (CTO). HEAD at authoring: `7dd5aab`.
Prerequisite for: **PATCH-134** (blocked, not closed — see its §18) and the whole document
sequence.

Snapshot `snapshot/pre-document-architecture-2026-08-02` / tag
`pre-document-architecture-2026-08-02` → `c0fa799`. **Not modified.**

Protected paths, untouched: `.gitignore`, the three `app/api/ai/*` routes,
`scripts/live-access-login.mjs`.

---

## 1. Subject

At supported viewport heights the canvas toolbar silently deletes tool groups from the DOM
with no alternative access path, and at the smallest supported height it clips
always-visible groups. **PATCH-135 makes every toolbar capability reachable at every
supported viewport, without clipping and without removing functionality.**

This patch exists because PATCH-134's one-line correction was measured and proven
insufficient (PATCH-134 §18a). It is a **prerequisite**, not a follow-up: PATCH-134 cannot
close until this lands.

---

## 2. Source census

### 2a. The collapse algorithm — `CanvasSidebar.tsx`

| Element | Location | Detail |
|---|---|---|
| `OVERHEAD_H` | `:37` | `105` — "py-6 (48) + back button (18) + divider (1) + surrounding gaps (~38)" |
| `GROUP_H` | `:38` | `(n) => 20 + n * 44` |
| Collapse effect | `:53-92` | `ResizeObserver` on the container, plus one synchronous `check()` |
| Fit test | `:63-71` | `needed = OVERHEAD_H + Σ GROUP_H(g.tools.length)`; if `needed <= avail` clear all collapses |
| Candidate filter | `:74-76` | `!g.alwaysVisible && g.priority > 1`, sorted by **descending** `priority` |
| Greedy loop | `:78-82` | collapse until `canSave <= 0`; **no fallback when candidates run out** |
| Collapsed render | `:120` | **`if (collapsedIds.has(group.id)) return null;`** — removed from the DOM |
| Container | `:97` | `h-full … flex flex-col items-center py-6 gap-3 … overflow-visible` — **cannot scroll** |
| Group markup | `:122-129` | `flex flex-col items-center w-full gap-1`; header `text-[9px] … leading-none`; hidden when `isCollapsed` |
| Tool button | `:133-160` | `w-9 h-9` (36 px) container, `IconComponent size={18}`, tooltip as a CSS-hover `<span>` |
| Collapse toggle | `:167-179` | `mt-auto`, `h-8 w-8`, has `aria-label` |

**The three structural facts that define this patch:**

1. **A collapsed group is removed from the DOM.** Not hidden, not moved — gone. There is no
   More button, no disclosure, no keyboard path, no touch path.
2. **The container cannot scroll.** `overflow-visible` means over-budget content clips or
   overlaps; it never becomes reachable by scrolling.
3. **The greedy loop has no terminal case.** When every candidate is collapsed and `canSave`
   is still positive, it simply stops and returns — the sidebar renders over budget and the
   overflow is silent. **This is the 1024×600 failure.**

### 2b. Group priorities and `alwaysVisible` semantics — `canvasToolbarRegistry.tsx`

| Group | id | Tools | Priority | `alwaysVisible` |
|---|---|---|---|---|
| Canvas / Map | `canvas` | 1–3 (Line, +graph line, +Column / +2 map) | 1 | ✅ |
| Create | `create` | **6** (AI · Note · Document · To-do · Comment · Table) | 2 | ✅ |
| Blocks | `structure` | 1 (Library) | 4 | ❌ |
| Media | `media` | 4 (Link · Image · Upload · Import) | 5 | ❌ |
| Draw | `draw` | 1 | 6 | ❌ |
| Share | `share` | 1 | 7 | ✅ (conditional on `canManageCanvasShare`) |
| Settings | `settings` | 1 | 8 | ✅ (conditional on `canUseFreeformEditButton`) |

`alwaysVisible` currently means only *"never chosen by the collapse loop."* It carries **no
guarantee of being rendered**, which is exactly how a clipped Settings group is possible.
**PATCH-135 must give the flag an honest meaning** or stop using it as a safety claim.

Note the priority numbers are non-contiguous (1, 2, 4, 5, 6, 7, 8) and the group comments say
"Group 3 — Structure (priority 3)" while the code says `priority: 4`. **Cosmetic only** —
ordering is by array position for render and by `priority` for collapse. **Do not renumber**;
it changes collapse order.

### 2c. Accessibility primitives already in the repository

| Primitive | Available | Adoption |
|---|---|---|
| **Radix `DropdownMenu`** via `components/ui/dropdown-menu.tsx` | ✅ `@radix-ui/react-dropdown-menu@^2.1.15` | **23 files** use `DropdownMenuContent` |
| Radix `Popover` via `components/ui/popover.tsx` | ✅ `^1.1.14` | 2 files |
| Radix `ContextMenu`, `Dialog`, `Tabs`, `Select` | ✅ | in use |
| `MoreVertical` / `MoreHorizontal` icons (lucide) | ✅ | 18 / 7 files |
| Hand-rolled `aria-haspopup` | — | **0 files** |
| Hand-rolled roving tabindex | — | **0 files** |

**Radix `DropdownMenu` supplies, without new infrastructure:** `aria-haspopup`,
`aria-expanded`, `role="menu"`/`menuitem`, roving focus with arrow keys, type-ahead,
**Escape-to-close with focus restored to the trigger**, outside-click dismissal, portal
rendering, and pointer/touch activation.

**Hard stop *"no accessible existing menu/popover primitive is available"* — NOT triggered.**
Every accessibility requirement in the contract is a property of a primitive already used in
23 files. Hand-rolling focus management is **not authorized**; the repo has zero precedent
for it and would be taking on exactly the infrastructure the hard stop guards against.

### 2d. ⚠ Portal layering — a real, bounded risk

`DropdownMenuContent` carries **`z-50`** (`dropdown-menu.tsx:43`) and portals to `document.body`.
The canvas uses far higher values:

| Surface | z-index |
|---|---|
| Toolbar container | `z-[3000]` (`CanvasClient.tsx:5778`) |
| Freeform card popups | `z-[9999]` |
| Delete / confirm modals | `z-[9999]` |
| Selected padlet | inline `zIndex: 20000` |
| `CardEditor` | `z-[150]` |

Because the content is portaled to `body` it competes at the root stacking context, so the
outcome depends on the page wrapper's own stacking context and is **not determinable by
reading**.

**Precedent exists and is favorable:** `AIComponentExportMenu.tsx` already renders a
`DropdownMenu` from inside `FreeformPadletCards`. **This is not proof for the sidebar**, whose
trigger sits at `z-[3000]`.

**Governed requirement:** the overflow content must be given an explicit z-index above the
toolbar container (e.g. `className="z-[3001]"`), and **layering must be verified visually
against an open canvas modal** (§6, matrix row "overflow open with a modal open"). The remedy
is a class on one element — a prop, not infrastructure — so the hard stop
*"portal layering conflicts with canvas modals"* is **NOT triggered**, but it is **not
dismissed either**: if a z-index alone cannot resolve it, **stop and report.**

### 2e. Focus, tooltips, touch — current state

- **Focus order:** the tool "buttons" are **`<div>` elements with `onClick`**
  (`CanvasSidebar.tsx:135-147`) — **not focusable, not keyboard-activatable, no `role`**. Only
  the back button and the collapse toggle are real `<button>`s.
- **Tooltips:** CSS-hover `<span>`s (`:155-157`), `opacity-0 group-hover:opacity-100`,
  `pointer-events-none`. **Hover-only — invisible to keyboard and touch users.**
- **Touch:** `onClick` fires on tap, so tools are tappable, but the hover tooltip never
  appears, so a tapped icon is unlabelled on touch.

**This is a pre-existing accessibility gap, and it constrains the patch in both directions.**
The overflow menu's *items* will be Radix `DropdownMenuItem`s and therefore fully accessible —
**better than the rail they came from.** Making the rail's own div-buttons accessible is a
larger, separate change.

**Governed decision: PATCH-135 fixes accessibility for the overflow trigger and its items
only.** Converting the existing rail div-buttons to real buttons is **explicitly out of
scope** and recorded as a follow-up. Rationale: it touches every tool on every layout, has its
own regression surface, and bundling it would make this patch unreviewable. **The contract's
"keyboard can open, navigate and activate" therefore applies to the More affordance and its
contents — the pre-existing rail limitation is recorded, not silently inherited as a pass.**

---

## 3. Measured failure

From PATCH-134 §18a (graph-enabled worst case, with `structure.alwaysVisible` applied):
1920×1080, 1440×900, 1366×768 and **1280×720 all fit with zero clipping**; **1024×600 clips by
41 px** with `scrollHeight 672` against `clientHeight 600`, and **the always-visible Settings
group is the casualty.**

**Derived and requiring confirmation (PATCH-134 §18b.3):** the 1024×600 clipping appears to
**predate PATCH-134** — without the `structure` group the surviving always-visible set is
still ≈ 623 real pixels against 544 available. **§4a makes confirming this PATCH-135's first
measurement.** If confirmed, this patch repairs a defect older than the Document tool.

---

## 4. Design decision

### 4a. Required first measurement — before any code

Reproduce the §3 matrix **at `7dd5aab` with no correction applied**, at 1024×600, graph mode
on, Freeform. Record `clientHeight`, `scrollHeight`, toolbar bottom, and which groups render.
**This establishes whether the clipping is pre-existing** and gives the true baseline. **If it
does not reproduce, stop and re-diagnose** — the model of the failure would be wrong.

### 4b. Options evaluated

| | Option | Verdict |
|---|---|---|
| **A** | Overflow/More menu containing collapsed groups | **Retained as the core mechanism** |
| **B** | Collapsible sections with headers retained | **Rejected as primary.** A collapsed-but-present header still consumes ~13 px × 3 groups and does not solve 1024×600, where the *always-visible* set overflows. It solves discoverability, not budget |
| **C** | Vertically scrollable toolbar body | **Rejected.** Requires changing `overflow-visible` → scroll on a **56 px-wide rail**; a vertical scroll gesture on a narrow rail is poor on touch and easily missed on desktop; it hides tools behind an undiscoverable gesture — the same "no affordance" failure in a new form. It also breaks the existing scroll-free contract that PATCH-134 §17g item 8 recorded. **Retained only as a last-resort fallback if §4a shows even the core set cannot fit** |
| **D** | Compact / icon-only responsive mode | **Rejected as insufficient.** The rail is *already* icon-only; the only compressible text is the 9 px group headers, worth ~13 px per group — **~65 px total**, and 1024×600 is 72 px short in the measured case. It cannot close the gap, and squeezing hit targets is explicitly forbidden. **Retained as an optional secondary saving**, never as the mechanism |
| **E** | Hybrid: core always-visible + More menu | **CHOSEN** |

### 4c. Chosen design — **E**

- **Core groups stay on the rail**: `canvas`, `create`, plus the **More** trigger, and — budget
  permitting — `share` and `settings`.
- **Every group the budget cannot fit moves into one visible More button**, in its original
  order, with its original tools, IDs, callbacks and permission filtering.
- **More is itself part of the budget and is never collapsible.** It is the one affordance
  that must always render.
- **Radix `DropdownMenu`**: trigger = a real `<button>` with `MoreVertical` and an
  `aria-label`; content = `DropdownMenuLabel` per group + `DropdownMenuItem` per tool,
  dispatching the **same `handleToolClick(tool.type)`**.
- **A tool appears in exactly one place** — on the rail or in More, never both.

Why E over A alone: A as stated would move *"groups selected for collapse"* into More, which is
still the current priority-ordered greedy choice. E additionally guarantees a **core set that
never overflows**, which is what 1024×600 requires. The difference is the terminal case the
current loop lacks (§2a.3).

### 4d. Height model — **option 2: real geometry, and do NOT touch `GROUP_H`**

The estimate `GROUP_H(n) = 20 + 44n` overstates the DOM by roughly `4 px` per tool and `7 px`
per group (PATCH-134 §17d): ~35 px on the six-tool Create group alone, against a measured
toolbar bottom of 642 where the model predicted 689.

**Decision: drive the overflow trigger from measured geometry, not from the estimate.**

- **Rejected — option 1 (correct the constants):** the owner forbids changing `GROUP_H` to make
  one viewport pass, and a corrected constant is still an estimate that drifts the next time
  padding changes. It would also shift thresholds on **every** layout and permission variant at
  once.
- **Rejected — option 4 (pure CSS):** a CSS-only solution cannot decide *which* groups move
  into a menu; it can only clip, scroll or wrap.
- **Chosen — option 2, with option 3 as the trigger:** measure each group's real
  `offsetHeight` from refs and compare the running total against the container's real
  `clientHeight`.

**`GROUP_H` and `OVERHEAD_H` must come out of this patch byte-identical** unless the
implementation deletes them entirely as unused. If they are deleted, **all** layouts and
permission variants must be re-measured (§6).

**Mandatory loop guard (contract item 16).** Measuring rendered heights and then unmounting
groups is a feedback loop: measure → collapse → container changes → `ResizeObserver` fires →
measure the *new* smaller content → uncollapse → oscillate. Required mitigation:

1. measure each group's **natural** height once per group-set, keyed by a stable signature of
   `(group id, tool count)` — never re-measured while groups are collapsed;
2. the decision consumes only the container's `clientHeight` plus that cached table;
3. bail out unchanged if the computed set equals the current set;
4. **the test must prove no oscillation** — observe a stable set across ≥ 1 s idle after a
   resize, with no fixed-timeout-only synchronization.

---

## 5. Accessibility contract

Delivered by Radix and asserted by test: More has `aria-haspopup="menu"` and `aria-expanded`
reflecting state; open via click, `Enter`, `Space`; arrow keys move between items; `Escape`
closes **and returns focus to the trigger**; outside click closes; touch/pointer activation
works; every item has an accessible name (the tool `label`, or the `hint` when disabled);
disabled tools are conveyed as disabled, not merely dimmed; opening does not scroll the page;
the content is portaled above the toolbar (§2d).

**Explicitly out of scope and recorded as a follow-up:** the existing rail tool "buttons" are
`<div onClick>` with hover-only tooltips (§2e) — not focusable, unlabelled on touch. **This
patch must not make that worse, and must not be reported as having fixed it.**

---

## 6. Responsive matrix — required evidence

Viewports: **1920×1080 · 1440×900 · 1366×768 · 1280×720 · 1024×600 · one narrower practical
touch/tablet configuration.**

Variants per viewport: **Freeform** and **Drawing**; graph mode **on/off** where applicable;
**editor** and **read-only/permission-hidden**; overflow **open and closed**; plus one row of
**overflow open with a canvas modal open** (§2d layering).

Record per cell: visible groups · overflow groups · button accessibility · clipping · overlap ·
`scrollHeight`/`clientHeight` · focus order · touch reachability.

**Escalation:** if the **core** set (canvas + create + More) cannot fit at a supported
viewport, **stop and report** — that is the point at which option C returns to the table as a
scoped fallback, and it needs its own authorization.

---

## 7. Capability preservation

Document · Library · Settings · Media · Draw · Share and every existing tool remain reachable,
directly or through More. No tool is an independently actionable duplicate. Order is
deterministic. Permission-hidden tools remain hidden **and must not appear in the overflow** —
the registry already filters `share`/`settings` by permission before the sidebar sees them, so
More must consume the **filtered** list, never a fresh unfiltered build.

**No group may be removed from the DOM without an access path.** This is the defect being
repaired; reintroducing it anywhere is an automatic rejection.

---

## 8. PATCH-125 compatibility — **preserve Library directly visible at 1280×720**

`e2e/characterization/patch-125-shared-reaction-picker.spec.ts:124-126` locates the Library
tool and **clicks it** to open the external library, at `devices['Desktop Chrome']` = 1280×720.
**It is a capability assertion and must not be weakened, and must not be edited.**

**Decision: option 1 — Library stays directly on the rail at 1280×720.** The measurement
supports it: at 1280×720 with Library forced visible, the toolbar bottom was **642 against 720
available — 78 px of headroom** (PATCH-134 §18a). The budget is not the problem at that
viewport; the greedy loop's ordering was. With the core set guaranteed and More absorbing the
remainder, Library fits on the rail at 1280×720 with room to spare.

**Consequences:**

- PATCH-125 must pass **unchanged**, and is **not on the test allowlist** (§10). It is run, not
  edited. **If it fails, stop and report** — do not adapt it.
- Option 2 (leave PATCH-125 unchanged via a "compatibility behavior" while Library lives in
  overflow) is **rejected**: its locator resolves a rail element, so "compatibility" would mean
  a hidden duplicate — which §7 forbids and the false-green list rejects outright.
- At **1024×600**, Library may legitimately move into More. PATCH-125 does not run there. The
  new spec proves overflow reachability at that viewport.

---

## 9. Command ownership — unchanged

The overflow is **presentation only**. It must not absorb creation commands, persistence,
placement, Supabase access, modal state, Drawing reconciliation, or `ActionRegistry` logic.
`CanvasSidebar` continues to call the same `handleToolClick(type)` for rail and overflow items
alike. **The registry stays declarative** (PATCH-134 §3b) and gains no callbacks.

**Hard stop *"overflow requires moving command ownership"* — NOT triggered**, and preserving
that is a contract term, not an aspiration.

---

## 10. Allowlists

### Production — at most 2 files

| File | Authorized change |
|---|---|
| `components/collabboard/canvas/ui/CanvasSidebar.tsx` | Replace the `return null` collapse with the More affordance; real-geometry measurement + loop guard; render the overflow via `components/ui/dropdown-menu` |
| `components/collabboard/canvas/ui/canvasToolbarRegistry.tsx` | **Only if** the census proves a declarative field is required (e.g. an explicit `core: true`). **Prefer zero changes** — `alwaysVisible` + `priority` may already be sufficient |

**Must NOT be edited:** `CanvasClient.tsx` · `canvasToolbarRegistry.tsx` beyond the above ·
`components/ui/dropdown-menu.tsx` (shared by 23 consumers — a change there is a repo-wide
change) · `usePadletSave.ts` · `CardActionsToolbar.tsx` · `FreeformPadletCards.tsx` ·
`DrawingLayout.tsx` · any editor or modal file.

**If a new file is genuinely required** (e.g. a `CanvasSidebarOverflow.tsx` to keep
`CanvasSidebar` under the 400-line component ceiling — it is **182 lines** today, so there is
room, but the ceiling is a hard rule) — **stop and request the allowlist amendment first.**

### Tests

| File | Status |
|---|---|
| `e2e/characterization/patch-135-toolbar-overflow.spec.ts` | **NEW — authorized** |
| `e2e/characterization/patch-134-document-toolbar.spec.ts` | **Authorized for additive assertions only** — Library present at 1280×720 alongside Document. Do not weaken existing assertions |
| `e2e/characterization/patch-125-shared-reaction-picker.spec.ts` | **NOT allowlisted. Run unchanged; must pass.** If it fails, stop and report (§8) |

---

## 11. Test contract

Per the review, all twenty: (1) no clipping at every supported viewport; (2) the More
affordance appears when required; (3) every collapsed group reachable; (4) Library opens
through real UI; (5) Document creation opens through real UI; (6) Settings reachable at
1024×600; (7) graph tools reachable in graph mode; (8) permission-hidden tools absent from
overflow; (9) order preserved; (10) no duplicate actions; (11) keyboard opens, navigates,
activates; (12) Escape closes and restores focus; (13) outside click closes; (14) touch/pointer
activation works; (15) opening overflow does not scroll the page; (16) **no infinite
resize/collapse loop** (§4d); (17) width **and** height changes recompute safely; (18) wide
layouts unchanged; (19) PATCH-125 capability intact; (20) PATCH-134 Document behavior intact.

Carried standard: **`--repeat-each=3`**.

**False-green rejection:** tests call `handleToolClick` directly · collapsed tools asserted only
from registry output rather than the DOM · hidden DOM elements counted as accessible ·
viewport enlarged to dodge overflow · only one layout tested · mouse-only access tested · focus
behavior omitted · Settings or Library clipped but technically mounted · tools duplicated under
different IDs · groups silently disappear · a fixed timeout is the only resize synchronization.

**Clipping must be asserted geometrically** — a group's bottom against the container's
`clientHeight`, plus `scrollHeight` vs `clientHeight` — never by `toBeVisible()` alone, which
returns true for a mounted element clipped below the fold.

---

## 12. Hard stops — evaluated

| Hard stop | Verdict |
|---|---|
| No accessible menu/popover primitive; a new one needs broad infrastructure | **NOT triggered** — Radix `DropdownMenu`, 23 consumers (§2c) |
| Overflow requires moving command ownership | **NOT triggered** — presentation only (§9) |
| Focus management cannot be bounded | **NOT triggered** for the overflow (Radix owns it); the **rail's** pre-existing div-buttons are explicitly out of scope and recorded, not claimed fixed (§2e, §5) |
| Responsive behavior differs incompatibly between layouts | **NOT triggered** — one algorithm over a registry-supplied group list; layout variance is only the group list (§2b). **Must be confirmed by the §6 matrix** |
| Portal layering conflicts with canvas modals | **NOT triggered, NOT dismissed** — remedy is an explicit z-index above `z-[3000]`; must be verified, and if a z-index cannot resolve it, **stop** (§2d) |
| Unreachable tools on touch | **NOT triggered** — Radix menu items are tappable; the pre-existing hover-only tooltip gap is recorded (§2e) |
| One patch cannot cover overflow and capability preservation safely | **NOT triggered** — they are the same change: the capability loss *is* the missing overflow |

**Zero of seven triggered. Architecture bounded; narrow implementation authorized.**

---

## 13. Commit contract

- Governance (this document): `docs(patch-135): authorize responsive toolbar overflow`
- Implementation: `fix(canvas): add toolbar overflow menu`
- Tests: `test(canvas): characterize toolbar overflow reachability`

**Do not push. Do not close PATCH-135 or PATCH-134.** Do not modify the snapshot branch or tag.

---

## 14. Status

**PATCH-135: OPEN · RESPONSIVE OVERFLOW ARCHITECTURE BOUNDED · NARROW IMPLEMENTATION
AUTHORIZED · DESIGN E (CORE + MORE MENU) SELECTED · RADIX DROPDOWNMENU AS THE PRIMITIVE ·
REAL-GEOMETRY HEIGHT MODEL · `GROUP_H` UNCHANGED · LIBRARY STAYS DIRECTLY VISIBLE AT 1280×720 ·
PATCH-125 RUN UNCHANGED AND NOT ALLOWLISTED · RAIL BUTTON ACCESSIBILITY EXPLICITLY OUT OF
SCOPE · NOT PUSHED.**

**PATCH-134: OPEN · BLOCKED on this patch. PATCH-133: OPEN. PATCH-132 / 130 / 129 / 128:
CLOSED — not modified. PATCH-131: OPEN · BLOCKED — not modified.**

Sequence: **135** (this) → **136** document card + the deferred "Card view" removal → **137**
modal split → **138** persistence → **139** links/backlinks/archive.

---

## 15. Recorded diagnostic notes

- **The bug is a missing terminal case, not a bad threshold.** The greedy loop collapses
  candidates until it runs out, then returns over budget and renders into a container that
  cannot scroll. Every proposed fix so far — another `alwaysVisible`, a corrected `GROUP_H`, a
  compact mode — adjusts the *inputs* to a loop whose failure is that **it has no defined
  behavior when it cannot succeed.** More is that terminal case. **When a greedy algorithm can
  fail, the fix is usually the missing else-branch, not better numbers.**
- **The most accessible thing in this patch is the part being added.** The overflow menu will
  have roving focus, Escape-to-restore and real `menuitem` roles, while the rail it draws from
  is `<div onClick>` with hover-only tooltips. **Recorded explicitly so the improvement is not
  mistaken for the rail having been fixed** — a patch that makes one surface excellent can
  disguise the surface next to it.
- **`alwaysVisible` promised something it never delivered.** It means "not chosen by the
  collapse loop", which readers hear as "guaranteed visible" — and a clipped Settings group at
  1024×600 is what that gap looks like. **A flag whose name overstates its guarantee will
  eventually be relied on for the guarantee.**
- **Two viewports told opposite stories about the same fix.** At 1280×720 the correction had 78
  px of headroom and the problem was purely the collapse *ordering*; at 1024×600 the budget
  genuinely does not fit. **A single-viewport diagnosis would have produced a confident,
  correct, and wholly insufficient fix** — which is precisely what §17d authorized before the
  matrix ran.
