# Kanban Implementation Todolist

Based on the gap analysis of `implementation_plan.md` - 12 items needed to bring the plan to 100%.

---

## Must-Have (skip these and you'll hit real problems)

- [x] **#1 Data Migration for Comments** (Size: M)
  - Legacy audit result: no persisted kanban comment data found in `kanban_cards` schema/write path
  - Migration is a no-op documentation checkpoint (`20260217_kanban_comments_data_migration_noop.sql`)
  - Decision: big-bang cutover (`kanban_comments` is sole source of truth; no dual-read period)
  - *Closed in Phase 2.1*

- [x] **#2 DB Constraint for Duplicate Links** (Size: XS)
  - ~~Add `UNIQUE(from_card_id, to_card_id, relation)` on `kanban_links`~~ Done
  - ~~Handle DB error gracefully in the adapter layer~~ Done (23505 -> `isDuplicate`, toast)
  - ~~Client-side validation alone is a race condition~~ Resolved
  - *Shipped with Phase 1*

- [x] **#8 Conflict Resolution Strategy** (Size: M)
  - ~~`updated_at` columns + auto-update triggers on `kanban_cards`, `kanban_columns`, `kanban_swimlanes`~~ Done (migration)
  - ~~Optimistic locking via `updated_at` in WHERE clause~~ Done (adapter)
  - ~~User-facing conflict handling: toast + auto-refetch~~ Done (store)
  - *Shipped with Phase 1/2 migrations*

- [x] **#10 RLS / Authorization Rules** (Size: M)
  - ~~Row Level Security policies for `kanban_comments` and `kanban_votes`~~ Done
  - Decision: comment delete = author or board manager/admin/owner
  - Decision: voting = board members only; vote mutation owned by voter (delete also allowed for manager/admin/owner)
  - ~~Without RLS, any authenticated Supabase user can read/write/delete any data~~ Resolved for new tables
  - Shipped with table creation migration: `supabase/migrations/20260217_add_kanban_comments_votes_with_rls.sql`

---

## Should-Have (will cause pain if skipped, but won't break anything)

- [x] **#5 Virtualization + dnd-kit Spike** (Size: L)
  - Proof-of-concept before committing to Phase 3.2
  - `react-window` and `dnd-kit` are notoriously difficult to combine
  - Virtualized lists unmount DOM nodes, breaking drag ghost elements and drop targets
  - Fallback: column-level pagination instead of virtualization
  - Outcome (2026-02-17): **Fail** for current architecture; proceed with column-level pagination
  - Report: `docs/KANBAN_VIRTUALIZATION_SPIKE.md`

- [x] **#6 Lazy Column + Drag-Drop Rules** (Size: L)
  - Concrete rules already added to plan (Phase 3.3)
  - Complexity bumped from Medium to High
  - Key rules: optimistic drop at position 0, fetch-on-hover, revert on failure
  - Implemented in `Board.tsx` + `store.tsx` (scaffold-first load, per-column lazy fetch, optimistic/revert)
  - *Shipped with Phase 3.3*

- [x] **#9 Error Handling Patterns** (Size: S)
  - ~~Define once, apply across all new write paths~~ Done
  - ~~Pattern for: network failure, Supabase outage, auth expiry~~ Defined
  - ~~Decide: retry? toast + rollback local state? queue for later?~~ Decided: no auto-retry on writes, toast + rollback, no queue in Phase 2
  - Reference: `docs/KANBAN_PHASE2_PATTERNS.md`
  - *Defined before Phase 2 implementation*

- [x] **#12 Loading/Empty/Error UI States** (Size: S)
  - ~~Loading states~~ Defined (section-level async loading for comments/votes)
  - ~~Empty states for zero comments/votes~~ Defined
  - ~~Error toasts for failed writes~~ Defined with inline validation rule
  - Touches every new feature - pattern now centralized
  - Reference: `docs/KANBAN_PHASE2_PATTERNS.md`
  - *Defined before Phase 2 implementation*

---

## Nice-to-Have (skip freely)

- [x] **#3 Vote Semantics Definition** (Size: XS)
  - ~~Resolved - `SMALLINT CHECK (value IN (-1, 1))` already in plan~~
  - Done

- [x] **#4 Sort Preference Scope** (Size: S)
  - Per-user (new `user_board_preferences` table) vs per-board (current plan)
  - Decided and implemented as per-user-per-board on `kanban_board_members` (`sort_by`, `sort_order`)

- [x] **#7 Confirm i18n Library** (Size: XS)
  - Implemented lightweight built-in kanban dictionary/hook (`useKanbanI18n.ts`) for EN/ES/FR
  - Language selector added to toolbar; core kanban UI strings are localized

- [x] **#11 Index Definitions** (Size: XS)
  - ~~Merged into each schema section in the plan~~
  - Done

- [x] **#13 Date Format in Editor** (Size: S)
  - Date format preference selector added to editor
  - Supported formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
  - Preference persisted per-board-member (`kanban_board_members.date_format`)

- [x] **#14 Custom Card Template Renderer** (Size: M)
  - `cardRenderer` prop added to `KanbanCanvas`/`Board`/`Card` pipeline
  - Renderer receives full card data and interaction handlers
  - Default card UI remains fallback when renderer is not provided

- [x] **#15 Selecting Projects Filter** (Size: M)
  - Added `project_id` on `kanban_cards` and indexed it
  - Added project field in editor and toolbar "All Projects / Project" filter
  - Board filtering applies in real time

---

## Recommended Attack Order

### Step 1: Decisions (zero code, unblocks everything)
- [x] #3 Vote semantics
- [x] #4 Sort preference scope
- [x] #7 i18n library

### Step 2: Ship with Phase 1
- [x] #2 DB constraint for duplicate links

### Step 3: Ship with Phase 2
- [x] #1 Data migration for comments
- [x] #8 Conflict resolution triggers (`updated_at`) + toast + auto-refetch
- [x] #10 RLS on new tables

### Step 4: Define patterns before Phase 2 code
- [x] #9 Error handling patterns
- [x] #12 Loading/empty/error UI states

### Step 5: Spike before Phase 3
- [x] #5 Virtualization + dnd-kit proof-of-concept (failed; pagination fallback selected)

### Step 6: Implement in Phase 3 (if spike passes)
- [x] #6 Lazy column drag-drop rules

---

## Calibration Tip

Pick item **#2** (the one-liner DB constraint), implement it, measure how long it actually takes including testing and deploy. Use that as your baseline to estimate the S/M/L items.
