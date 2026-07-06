# Performance

Speed is pillar #1 (VISION.md). This doc sets budgets (release gates per P4), names the current risks found in audit, and defines the levers.

## 1. Budgets (p75, mid-range laptop + Fast 3G for loads; measured by RUM once telemetry lands)

| Metric | Budget |
|---|---|
| Board open → content visible (200-post board) | < 1.5 s |
| Board open → interactive | < 2.5 s |
| Local mutation → visual update | < 16 ms (one frame, optimistic) |
| Op round-trip to peers | < 500 ms p75 |
| Drag at 60 fps | zero dropped-frame budget violations > 5% of drags |
| Layout switch (200 posts) | < 400 ms |
| Initial JS for board route | < 450 kB gzip (see §3 — currently far above) |
| Dashboard open | < 1 s |

A PR that regresses a budget metric > 5% is blocked until paid down (P4).

## 2. Audit — Current Risks

| # | Risk | Evidence |
|---|---|---|
| R1 | **Whole-board re-renders**: board state as dozens of `useState` in one 8,526-line component means any change re-renders everything | `CanvasClient.tsx` |
| R2 | **No virtualization**: every post renders regardless of viewport | wall/row/columns components |
| R3 | **Bundle**: dhtmlx-gantt + dhtmlx-scheduler + mapbox-gl + mermaid + Excalidraw fork + react-big-calendar + moment + dayjs + html2canvas + jspdf + pptxgenjs + docx in one app | package.json |
| R4 | **N+1 board loads**: client issues many independent Supabase queries per board open | 105 call sites |
| R5 | **postgres_changes fan-out** cost at classroom concurrency | REALTIME_ARCHITECTURE.md §1 |
| R6 | Whole-row realtime payloads re-rendering unrelated UI | useCanvasData handlers |

## 3. Levers (in impact order)

1. **Store + selectors (fixes R1):** per-entity subscriptions (STATE_MANAGEMENT.md §3) — an edit re-renders one card. This is the single biggest win and comes free with the Phase 1 refactor.
2. **Viewport virtualization (R2):** engine-level `VirtualSurface` used by all list/grid layouts; spatial layouts cull by viewport rect + quadtree hit-testing at high counts. Target: 5,000-post board scrolls at 60 fps.
3. **Route- and layout-level code splitting (R3):** each `LayoutPlugin` is a `dynamic()` chunk — a wall board must never download mapbox-gl, mermaid, gantt, or the Excalidraw fork. Exporters (`jspdf`, `pptxgenjs`, `docx`, `html2canvas`) load on demand at export click. Killing dhtmlx (ARCHITECTURE.md §3) and moment removes ~2.5 MB pre-gzip on its own.
4. **Single snapshot RPC (R4):** `get_board_snapshot` — one round trip (DATABASE.md §3), plus RSC streaming: server renders shell + first posts, hydrates store client-side.
5. **Broadcast ops (R5, R6):** small intent payloads instead of WAL rows (REALTIME_ARCHITECTURE.md).
6. **Media discipline:** thumbnails served at display size (Storage transform or pre-generated), `loading="lazy"`, fixed aspect boxes (zero CLS), CDN immutable caching.
7. **Interaction hot paths off React:** drag ghosting / marquee / connector drawing via direct transforms (COMPONENT_GUIDELINES.md §4); text editing isolated per block so keystrokes never touch board state.

## 4. Measurement (prerequisite — currently zero)

- **RUM:** web-vitals + custom marks (`board_open_ms`, `op_apply_ms`, `drag_fps`) tagged by layout, post count, device class → the SYSTEM_DESIGN.md §7 dashboard.
- **Lab:** Playwright perf suite with seeded 50/500/2,000-post boards asserting budget compliance; bundle-size check in CI (`next build` stats diffed per PR, budget file committed).
- **Profiling ritual:** any perf PR includes before/after React Profiler or DevTools trace on the 500-post fixture.

## 5. Perceived Speed (costs nothing, wins everything)

Optimistic ops everywhere (no spinners on mutations); skeletons matched to layout; instant navigation with stale-while-revalidate dashboard cache; preconnect/prefetch board snapshot on dashboard card hover. Padlet feels slow before it *is* slow — we win the feel first.
