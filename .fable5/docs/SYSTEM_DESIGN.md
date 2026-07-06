# System Design

Runtime topology today, and the scaling path to millions of users. Companion to ARCHITECTURE.md (code structure); this document covers deployment, capacity, and failure behavior.

## 1. Today's Topology

```
Browser (Next.js client, React 19)
   │  HTTPS                        │ WebSocket
   ▼                               ▼
Vercel/Node (Next.js App Router)   Supabase Realtime
   • RSC + API routes                 • postgres_changes per canvas
   • Stripe webhooks                  • Excalidraw fork: own collab portal
   ▼
Supabase (managed Postgres + Auth + Storage)
   • RLS enforces permissions
   • Storage: uploads, thumbnails
External: Stripe, Mapbox, Pexels/Giphy/Iconify/OpenClipart, AI provider, web-push
```

This is the right shape for 0–50k MAU. The known cliffs and their exit ramps are below — **we do not build for the cliffs before we approach them (P5), but we do keep the interfaces that make the exits cheap.**

## 2. Scaling Cliffs and Exit Ramps

### Cliff 1 — `postgres_changes` fan-out (~first cliff, classroom scale)

Supabase's `postgres_changes` streams WAL to every subscriber; cost grows with (writes × subscribers × RLS checks). A 40-student classroom on one board is exactly our target load and exactly this mechanism's weak spot.

**Exit ramp (Phase 2):** switch board channels to **Supabase Broadcast** (pub/sub, no WAL, no per-event RLS): client applies op → POST to command endpoint → persist → broadcast op to channel. Presence via Supabase Presence. This is a change inside `SyncEngine` only.

### Cliff 2 — single Postgres write throughput (~100k+ MAU)

Boards are naturally partitionable. Exit ramps in order of preference:
1. Read replicas for dashboard/browse queries.
2. Move op log + presence off Postgres (Redis / dedicated sync service).
3. Board-sharded Postgres only if 1–2 exhaust — revisit then, not now.

### Cliff 3 — realtime server at high concurrency (~500k MAU)

Managed Supabase Realtime has connection/channel ceilings. Exit ramp: a dedicated stateful sync service (the industry-converged design: Figma's LiveGraph, Linear's sync engine):

```
Client ⇄ WS ⇄ Sync service (board sessions in memory,
                ops fanned out, snapshots to Postgres async)
```

Because UI ⇄ SyncEngine ⇄ transport is layered (ARCHITECTURE.md §2), this swap does not touch product code. **Decision deferred until >200 concurrent editors/board or >50k concurrent connections is real.**

## 3. Capacity Model (plan against these, revisit quarterly)

| Scale | Boards opened/day | Concurrent WS | Design response |
|---|---|---|---|
| 10k MAU | ~15k | ~500 | Today's stack as-is |
| 100k MAU | ~150k | ~5k | Broadcast ops, read replicas, CDN for media |
| 1M MAU | ~1.5M | ~50k | Dedicated sync service, op log in Redis, queue for webhooks/AI |

Assumption: 60-sec median session cadence like Padlet's education traffic — spiky (class starts on the hour). Autoscale for 10× burst, not average.

## 4. Data Flow for the Core Write (target design)

`student drags a post` →
1. `BoardStore` applies op optimistically (0 ms perceived).
2. `SyncEngine` enqueues op (IndexedDB-backed queue → survives refresh/offline; P3).
3. POST `/api/boards/:id/ops` — validates permission + schema (zod), persists row + appends `board_ops` log entry, returns authoritative version.
4. Server broadcasts op on `board:{id}` channel; peers apply; version counter detects gaps → peer refetches snapshot.

Conflict policy: property-level last-writer-wins keyed by op timestamp + actor, **except** ordered collections (post order, block order), which use fractional indexing (already adopted in kanban's `order_index numeric` migration — endorse and generalize). Text co-editing inside an open editor: Yjs per-document, only where a rich editor is open (REALTIME_ARCHITECTURE.md §4).

## 5. Media Pipeline

Uploads go directly browser → Supabase Storage (signed URL), never through Next.js. Server generates thumbnails async (`lib/collabboard/thumbnailGenerator.ts` exists — move invocation off the interactive path). Serve via CDN with immutable cache keys. Link previews (`app/api/link-preview`) are cached in Postgres keyed by URL hash with TTL — they're currently a per-render fetch risk; verify and fix in Phase 1.

## 6. Failure Behavior (design targets)

- **Realtime down:** board stays fully editable; ops queue locally; banner "reconnecting"; replay on reconnect. Realtime is an enhancement, not a dependency (P3).
- **Postgres down:** read-only from client cache; writes queue with explicit "not saved yet" indicator. Never silently drop.
- **AI provider down:** AI features degrade to hidden; zero impact on core flows.
- **Stripe webhook failures:** idempotent handlers + event replay; entitlements cached with grace period so billing hiccups never lock a user out of their content.

## 7. Observability (currently absent — Phase 1 requirement)

Minimum viable telemetry before any scale work: Sentry (client + server), web-vitals RUM tagged by board size and layout, structured logs on API routes, and a `board_open_ms` / `op_roundtrip_ms` dashboard. We cannot honor P4/P10 without this.
