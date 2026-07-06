# Realtime Architecture

How collaboration works today, why it won't hold, and the target protocol. Multiplayer quality is a top-3 differentiator (VISION.md); this subsystem deserves disproportionate investment.

## 1. Today

- Each canvas subscribes to `supabase.channel('canvas-<id>')` with `postgres_changes` (`components/collabboard/canvas/hooks/useCanvasData.ts`, plus a variant inside `CanvasClient.tsx` and another in the kanban store).
- Writes are direct row updates from the client; peers receive whole changed rows and re-render.
- Conflict policy: implicit **last-write-wins at row granularity** — two users editing different fields of the same post clobber each other.
- No presence, cursors, or attribution outside the Excalidraw fork, which runs its **own, disconnected** collab stack (Portal/Collab).
- Offline/dropped-connection writes are lost or error silently.

Verdict: correct prototype choice; three independent implementations of it already exist (canvas, collabboard, kanban), which is the signal to centralize now.

## 2. Target — Op-Based Sync (one implementation)

```
UI intent → Op → BoardStore.apply (optimistic) → OpQueue (IndexedDB)
        → POST /api/boards/:id/ops (validate, persist, version++)
        → Broadcast "op" on board:{id} → peers apply op
```

**Op** = `{ id, boardId, actorId, baseVersion, type, payload }` with a zod schema per type (`post.create`, `post.move`, `block.update`, `comment.add`, `reaction.toggle`, …). Ops are the *single* write path (ARCHITECTURE.md rule 3).

Why ops instead of row-sync:
- **Field-level merge**: `post.move` and `block.update` on the same post don't conflict.
- **Undo/redo** = inverse ops — currently impossible to build coherently.
- **Offline queue** and **audit log** fall out for free.
- Broadcast payloads are small intents, not whole rows.

### Conflict resolution matrix

| Data | Strategy |
|---|---|
| Scalar properties (title, color, position) | Per-property LWW (op timestamp, actor tiebreak) |
| Collection order (posts, blocks, sections) | Fractional index keys — concurrent inserts both survive |
| Rich text while an editor is open | Yjs document per post body, TipTap y-bindings (see §4) |
| Presence/cursors | Ephemeral channel state, never persisted |

### Versioning & recovery

Server stamps each op with a per-board monotonically increasing `version`. Clients track `lastVersion`; a gap in broadcast versions triggers a snapshot refetch (`get_board_snapshot` + ops since). This makes delivery *effectively* reliable over an at-most-once transport, cheaply.

## 3. Transport Phases

1. **Phase 2 (now → 100k MAU):** Supabase **Broadcast** channels (not postgres_changes) + Supabase **Presence** for cursors/avatars. Drop the `canvas_presence` table.
2. **Phase 4+ (proven load):** dedicated sync service holding hot board sessions in memory (SYSTEM_DESIGN.md §Cliff 3). The SyncEngine interface (`send(op)`, `onOp`, `onPresence`, `snapshot()`) is written so this is a transport swap.

## 4. Rich Text: Yjs, scoped deliberately

Full-board CRDT (à la Liveblocks/tldraw sync) is rejected for now: our data is mostly discrete objects where LWW-per-property + fractional indexes are simpler, debuggable, and sufficient (P5). CRDT earns its complexity only inside collaborative *text*.

- One Yjs doc per post body, activated when ≥1 editor has the post open; persisted as serialized update in `blocks.content`, garbage-collected when idle.
- TipTap has first-class Yjs bindings — our editor stack (`@tiptap/*`) already fits this.

## 5. Excalidraw Fork Integration

The fork's Portal/Collab stack currently makes drawings a collaboration island with different semantics from the rest of the board. Plan:
1. Phase 2: keep it, but pass our auth/session and route its websocket through our channel naming so permissions hold.
2. Phase 3: adapter that maps Excalidraw scene deltas onto our op stream (`drawing.patch` op type), retiring the Portal. Excalidraw elements already reconcile by `(id, version, versionNonce)` — compatible with op broadcast.

## 6. Presence & Social Layer (cheap, high-payoff — FigJam lesson)

Deliver in Phase 2 with Presence channels: live avatars per board, per-post "X is editing…" locks-as-hints (advisory, never blocking), live cursors on spatial layouts, cursor chat later. Attribution on every op powers "recently changed" highlights.

## 7. Testing Realtime (see TESTING.md)

- Two-browser Playwright scenarios: concurrent move, concurrent edit same field, offline queue replay, gap-recovery.
- A headless "op fuzzer" that replays randomized concurrent op streams against two clients and asserts convergence — this is the regression net for the conflict matrix.
