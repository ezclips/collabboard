# State Management

Where every kind of state lives. Written against the current reality: ~38 `useState` hooks in one component, a hand-rolled 1,788-line kanban store, and server state managed by ad-hoc `useEffect` + Supabase calls.

## 1. The State Taxonomy (decide by table, not by taste)

| Kind | Examples | Home |
|---|---|---|
| **Board document state** | posts, blocks, placements, sections, comments | `BoardStore` (zustand) — the single in-memory replica |
| **Sync state** | op queue, pending/acked, connection, version | `SyncEngine` (owns its slice of BoardStore) |
| **Session/UI state (board-scoped)** | selection, active tool, open editor, zoom/viewport, drag state | `BoardUiStore` (zustand, separate store — never mixed with document state) |
| **Presence** | peer cursors, avatars, "editing…" hints | `PresenceStore`, fed by realtime channel |
| **Server cache (non-board)** | dashboard lists, workspace members, billing/entitlements | Query layer with caching/invalidation |
| **Ephemeral component state** | input drafts, hover, popover open | local `useState` — the only thing it's for |
| **URL state** | board id, active layout view, focused post (deep links) | route/search params |

**Rule:** before adding `useState`, find the row. If the value survives the component unmounting, or two components need it, it is not `useState`.

## 2. BoardStore — the core decision

**Choice: zustand** (single dependency, ~1 kB, subscription-per-selector) with entity-map shape:

```ts
interface BoardState {
  board: Board;
  posts: Record<PostId, Post>;
  blocks: Record<BlockId, Block>;
  placements: Record<LayoutId, Record<PostId, Placement>>;
  comments: Record<PostId, CommentThread>;
  version: number;
  apply(op: Op): void;      // ONLY mutation entry point (reducer per op type)
  revert(opId: OpId): void; // rollback on server rejection
}
```

Why not the alternatives:
- **Redux Toolkit** — acceptable, but heavier ceremony for the same entity-map + reducer idea; zustand keeps per-post selector subscriptions trivial.
- **Jotai/Recoil atoms** — atom-per-post fights the op-log model; ops want one reducer.
- **Keep hand-rolling context stores** (current kanban `store.tsx`) — rejected: it re-implements zustand badly (P5) and each instance re-renders too broadly.
- **Full CRDT store (Yjs everywhere / Liveblocks)** — rejected for now; see REALTIME_ARCHITECTURE.md §4. The `apply(op)` seam means adopting more CRDT later changes reducers, not consumers.

All mutations flow `command → op → store.apply → SyncEngine` (optimistic) and `channel → store.apply` (remote). Undo/redo is a stack of inverse ops on top of the same seam. Immutability per repo standard — reducers return new objects (structural sharing; add immer only if reducers get genuinely painful).

## 3. Selector Discipline (the perf contract)

- Components subscribe via narrow selectors: `usePost(id)`, `usePlacement(layout, id)`, `useSelectionIds()`.
- Selectors return stable references (shallow-equal guards) — a title edit re-renders one card, not the surface.
- Derived data (visible placements for viewport, comment counts) is memoized in selector modules, not recomputed in JSX.

## 4. Server Cache Layer (non-board data)

Dashboard, members, collections, billing: use **TanStack Query** over repository functions (`useQuery(['boards', wsId], reposit.boards.list)`). It replaces the scattered `useEffect`-fetch-setState pattern, and gives caching, retries, and invalidation-on-command for free. Board *document* data explicitly does **not** go through TanStack Query — the BoardStore/SyncEngine owns it (different consistency model).

## 5. Migration Path (matches ARCHITECTURE.md §4)

1. **Phase 1:** introduce `BoardStore` with the *current* data shape (items, not yet blocks/placements). Port `CanvasClient.tsx` state clusters into it mechanically: data states → store; selection/drag → `BoardUiStore`; leave true ephemera local. Exit criterion: `CanvasClient.tsx` under 1,000 lines, zero Supabase imports.
2. **Phase 2:** SyncEngine replaces the three `postgres_changes` handlers; kanban's store becomes a thin adapter over BoardStore or is frozen until Phase 3.
3. **Phase 3:** store shape moves to posts/blocks/placements with the DB migration.

## 6. Rules

- One `BoardStore` instance per open board, created in the route shell, provided via context — no module-level singletons (breaks multi-board views and tests).
- No state duplication: a value has one home; everything else derives via selectors.
- Cross-store writes are forbidden; only commands orchestrate multiple stores.
- Persisted UI prefs (last layout, sidebar collapsed) go to `localStorage` via a versioned, zod-validated codec — never raw `JSON.parse`.
