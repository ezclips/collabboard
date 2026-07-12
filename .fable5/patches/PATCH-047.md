# PATCH-047 — hooks slice 10: FreeformGraphLayer onto the cookie-client factory (the OWNER-AUTHORIZED client-identity migration — the program's FIFTH behavior micro-change)

**Status:** SPEC READY — implement exactly as bound below.
**Implementer:** GPT-5.4 acceptable (Pattern K, twenty-second application — two
whole-file fences, both extractor-written; the behavior change is fully specified,
not discretionary).
**Authored:** 2026-07-11 at `9c56ca8` by the CTO (Fable 5). All censuses, hashes, and
simulation results below were measured fresh on that tree; the canonical files were
COMPILED AND RUN through the real repo gates before delegation (§0.5).

**Read first:** `.fable5/docs/SKILL.md`, `.fable5/docs/PATCH_REFERENCE.md` (§5.11
Pattern K), then this spec end to end. The LESSONS_LEARNED autocrlf rules apply:
never `git checkout/restore` a byte-fenced file; verify hashes ONLY with
`git hash-object`.

**Bound commit message (use EXACTLY, one commit):**

```
refactor(graph): migrate FreeformGraphLayer onto the cookie-client factory -- owner-authorized client-identity ruling (fifth behavior micro-change), anon-RLS split-brain closed, layer goes legacy-client-free at never-grow equality, graph client identity unified, hooks slice 10, Pattern K (PATCH-047)
```

---

## 0. CTO rulings and contract analysis

### 0.1 THE CLIENT-IDENTITY RULING (owner-delegated, made first): MIGRATION AUTHORIZED

The owner asked for the FreeformGraphLayer identity ruling before anything
else: preserve the legacy `lib/supabase` singleton, or explicitly authorize
migration to the cookie-client factory. **Ruling: MIGRATE — the program's
FIFTH authorized behavior micro-change** (after 024, 032/033, 034, 041).
Evidence chain, all re-derived fresh at authoring:

1. `lib/supabase.ts` is a plain `createClient(url, anonKey)` — supabase-js's
   default localStorage session store. The app's live sessions live in
   COOKIES (auth-helpers, the 025/037 architecture). The singleton is
   therefore SESSION-LESS in the current auth flow: `auth.uid()` = null.
2. Both graph tables are RLS-ENABLED and auth.uid()-GATED
   (migrations `20260224_add_freeform_graph_tables.sql` +
   `20260309_scope_boards_and_folders_to_workspaces.sql`:
   `can_access_board`/`can_edit_board`, both resolving through auth.uid()).
3. Consequence today — the SPLIT-BRAIN: CanvasClient's connect flow writes
   edges through the cookie client (works), while the RENDERING layer reads
   them through the anon singleton: RLS filters its SELECT to `[]` with no
   error, so created edges NEVER RENDER; and the layer's own writes
   (`updateEdge`, `handleMouseUp` label-drag persist, `deleteEdge` — all
   DB-first bare awaits with NO catch) reject with 42501 as unhandled
   rejections, and their post-await `setEdges` local updates never run.

### 0.2 Every consumer-visible consequence (bound; nothing else changes)

| # | Path | Before (anon singleton) | After (cookie factory) |
|---|------|-------------------------|------------------------|
| 1 | `getEdges` (L45 effect) | RLS-filtered to `[]`, no error — edges never render | the user's real edges render; genuinely-empty boards still `[]`; UNAUTHORIZED viewers still get an RLS-filtered `[]` (no new exposure — RLS enforces, the client only authenticates) |
| 2 | `updateEdge` (style/label/direction edits) | 42501 → unhandled rejection; the post-await `setEdges` never runs — edits silently die | authorized write persists; the byte-kept post-await `setEdges` now runs |
| 3 | `handleMouseUp` (label-drag persist) | 42501 → unhandled rejection; `setDraggingLabel(null)` after the await never runs | write persists; the byte-kept cleanup runs |
| 4 | `deleteEdge` | 42501 → unhandled rejection; edge never disappears | delete persists; the byte-kept filter runs |
| 5 | `isTableUnavailable` degradation | 42P01/does-not-exist → synthetic/empty fallbacks | UNTOUCHED — the class is byte-kept (hash-bound) |
| 6 | Stale-localStorage-session users | read/wrote as a possibly-stale localStorage identity | the live cookie session — identity correction, aligned with every other extracted surface |
| 7 | Component API / props / render shape / error-handling code | — | ZERO changes — no catch added or removed; only the client identity behind the byte-kept awaits changes |

P3 note: this REPAIRS silent user-work loss (label/style edits and deletes
that died as unhandled rejections). The e2e suite does not exercise the graph
layer (unchanged status); the 27 characterization tests guard the rest.

### 0.3 Scope

TWO files, one seam:
- `components/graph/FreeformGraphLayer.tsx` — the two legacy imports collapse
  to the factory import (−1 line); the `useMemo` construction swaps to
  `createFreeformGraphRepo(boardId)` with a ONE-line authorized-migration
  pointer comment (+1). **493 → 493 — the layer is over the 400-line
  component ceiling, so never-grow holds at EQUALITY** (the full ruling text
  lives in the factory doc, not the call site, precisely to keep this
  neutral). The deps array was already `[boardId]` — byte-kept. The layer
  goes LEGACY-CLIENT-FREE (`supabase` 2→0).
- `lib/graph/graphRepo.ts` — the factory's fencing doc comment is updated to
  record the ruling (it previously said "do NOT swap without an owner
  ruling" — leaving it would contradict the code, a P0 doc bug). COMMENT-ONLY
  edit: the class body and factory body are byte-kept (`.from(` 5→5,
  `isTableUnavailable` 11→11 pinned).

NOT this seam (owner instructions honored): the postsRaw shrink-down
(padlets tables, CanvasClient consumers) — untouched; FreeformPadletCards —
byte-untouched (hash-bound below; it renders the layer but its own bytes do
not change); realtime CTO-only; the legacy `lib/supabase.ts` singleton file
itself stays (its remaining consumers are the deferred duplicated-canvas /
kanban / excalidraw verticals — deferred dualities, not this patch).

### 0.4 Disclosures

- NO tests: nothing new is testable in lib (the factory landed at 046; the
  layer swap is a client-identity change, pinned by hashes + censuses).
  Suite stays **245/28**.
- Substring instrument (the 042 class): `createFreeformGraphRepo` contains
  `FreeformGraphRepo` — the extinction instrument in the layer is
  `new FreeformGraphRepo` (1→0); the bare count goes 2→3 (import + comment
  pointer + call).
- Behavior micro-change ledger: FIVE total after this patch.

### 0.5 Simulation results (CTO, in-tree, this exact canonical content)

tsc `--noEmit` CLEAN; `npm run check:boundaries` SILENT; vitest
**245 passed (245), 28 files** — unchanged, zero pins broken. Tree restored
byte-exact via `git cat-file blob` + no-op `git add`.

### 0.6 One slice, no split

PATCH-048 is NOT drafted.

---

## 1. Pre-edit bindings (verify FIRST; any mismatch = STOP, report, do not improvise)

```bash
git status --short   # nothing
git hash-object components/graph/FreeformGraphLayer.tsx   # 63fc5334c6cc6633592735435f6992d5607c9481   (493 lines)
git hash-object lib/graph/graphRepo.ts                    # cab52c166254ebfc85a1c414739f556c95bdeef9   (183 lines)
```

MUST-NOT-CHANGE set (verify now AND after — all eight):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                 # 7acfa197623e39a8462adca29a321a9e64a12689
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx     # a405177da01176a260f7ce829f30f04549cf27c8
git hash-object types/graphTypes.ts                                          # b11bce9b29c4eff5579afd9d1eb8d0cd0fb7c046
git hash-object lib/graph/graphSelectors.ts                                  # 2f2dfc64469900266f2db4919efcb5dc6dfb9bf0
git hash-object lib/graph/edgeRouting.ts                                     # 960e9e96a07f237f091083e88828a65f3094cb63
git hash-object lib/infra/supabase/browserClient.ts                          # f91afd33c8395fab3c83a0ffd0cc33d3b8b1c665
git hash-object lib/supabase.ts                                              # 067dfb401e6eb1774500157d88a7bc55f0eec29c
git hash-object lib/supabase/browser.ts                                      # b42aa22e7921b6aeea02515bc8897a7906bb8caa
```

Pre-edit censuses (plain `grep -c`, case-sensitive, LINE counts):

```bash
L=components/graph/FreeformGraphLayer.tsx
grep -c "supabase" "$L"                   # 2   (the legacy import + the construction)
grep -c "new FreeformGraphRepo" "$L"      # 1
grep -c "createFreeformGraphRepo" "$L"    # 0
grep -c "FreeformGraphRepo" "$L"          # 2
grep -c "repo\." "$L"                     # 4   (getEdges + upsertEdge x2 + deleteEdge — the consumer surface, byte-kept)
G=lib/graph/graphRepo.ts
grep -c "\.from(" "$G"                    # 5
grep -c "isTableUnavailable" "$G"         # 11
grep -c "PATCH-047" "$G"                  # 0
```

---

## 2. BOUND FILE — `components/graph/FreeformGraphLayer.tsx` (whole file, exact, 493 lines; post-edit hash `b439038ef21b471af8b1dc4fecbc5d12a5cfc9c0`)

```ts
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
import { selectValidEdges } from '@/lib/graph/graphSelectors';
import { routeEdge, type Rect, type GraphSide, type RouteEdgeResult } from '@/lib/graph/edgeRouting';
import type { FreeformGraphEdge } from '@/types/graphTypes';
import type { Padlet } from '@/types/collabboard';
import { toast } from 'sonner';

interface FreeformGraphLayerProps {
    boardId: string;
    posts: Padlet[];
    refreshToken?: number;
    containerRef?: React.RefObject<HTMLDivElement | null>;
    zoom?: number;
}

const LINE_COLORS = ['#9ca3af', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const EDGE_GAP = 32;
const FREEFORM_COMMENT_FALLBACK_WIDTH = 300;
const FREEFORM_COMMENT_FALLBACK_HEIGHT = 280;

interface EdgeMenuState {
    edgeId: string;
    x: number;
    y: number;
}

/** Size of the SVG arrowhead polygon (in px). */
const ARROW_SIZE = 8;

export default function FreeformGraphLayer({ boardId, posts, refreshToken = 0, containerRef, zoom = 1 }: FreeformGraphLayerProps) {
    const [edges, setEdges] = useState<FreeformGraphEdge[]>([]);
    const [measuredRects, setMeasuredRects] = useState<Record<string, Rect>>({});
    const [edgeMenu, setEdgeMenu] = useState<EdgeMenuState | null>(null);
    const [labelDraft, setLabelDraft] = useState('');
    const [draggingLabel, setDraggingLabel] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // PATCH-047 owner-authorized client-identity migration - see createFreeformGraphRepo's doc.
    const repo = useMemo(() => createFreeformGraphRepo(boardId), [boardId]);

    useEffect(() => {
        if (!boardId) return;
        let isMounted = true;
        repo.getEdges()
            .then((data) => {
                if (isMounted) setEdges(data);
            })
            .catch((error: unknown) => {
                if ((error as { code?: string } | null)?.code === '42P01') return;
                console.error('FreeformGraphLayer.getEdges failed:', error);
            });
        return () => { isMounted = false; };
    }, [repo, boardId, refreshToken]);

    useEffect(() => {
        const container = containerRef?.current;
        if (!container || posts.length === 0) return;

        let mounted = true;
        let rafId: number | null = null;

        const updateRects = () => {
            if (!mounted) return;
            const containerRect = container.getBoundingClientRect();
            // Account for container padding — cards are positioned relative to
            // the content area, not the padded outer edge.
            const cs = window.getComputedStyle(container);
            const padLeft = parseFloat(cs.paddingLeft) || 0;
            const padTop = parseFloat(cs.paddingTop) || 0;
            const next: Record<string, Rect> = {};

            for (const post of posts) {
                const el = container.querySelector(`[data-padlet-id="${post.id}"]`) as HTMLElement | null;
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                const commentRoot = el.querySelector('[data-comment-post-root="true"]') as HTMLElement | null;
                const commentRect = commentRoot?.getBoundingClientRect();
                // Fallback: if the data-padlet-id wrapper collapsed (e.g. card
                // posts with absolute-positioned children), measure the first
                // child element instead so the arrow targets the visible card.
                const childRect = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
                const useRect =
                    (post.type === 'comment' || (post.type as string) === 'Comment') && commentRect
                        ? commentRect
                        : (childRect && childRect.width > rect.width + 8 && childRect.height > rect.height + 8)
                            ? childRect
                            : (rect.width < 1 || rect.height < 1)
                                ? childRect ?? rect
                                : rect;
                next[post.id] = {
                    x: (useRect.left - containerRect.left - padLeft + container.scrollLeft) / zoom,
                    y: (useRect.top - containerRect.top - padTop + container.scrollTop) / zoom,
                    width: useRect.width / zoom,
                    height: useRect.height / zoom,
                };
            }
            setMeasuredRects(next);
        };

        const scheduleUpdate = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(updateRects);
        };

        const resizeObserver = new ResizeObserver(() => scheduleUpdate());
        resizeObserver.observe(container);
        for (const post of posts) {
            const el = container.querySelector(`[data-padlet-id="${post.id}"]`) as HTMLElement | null;
            if (el) resizeObserver.observe(el);
        }

        // MutationObserver: detect position changes (style.left/top) during card drags
        const mutationObserver = new MutationObserver(() => scheduleUpdate());
        mutationObserver.observe(container, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: true,
        });

        container.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);
        scheduleUpdate();

        return () => {
            mounted = false;
            if (rafId !== null) cancelAnimationFrame(rafId);
            container.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
        };
    }, [containerRef, posts, refreshToken, zoom]);

    useEffect(() => {
        if (!edgeMenu) return;
        const onDown = () => setEdgeMenu(null);
        window.addEventListener('mousedown', onDown);
        return () => window.removeEventListener('mousedown', onDown);
    }, [edgeMenu]);

    const validEdges = selectValidEdges(posts, edges);

    const renderEdges = useMemo(() => {
        const postById = new Map(posts.map((p) => [p.id, p]));

        const getRect = (post: Padlet): Rect => {
            if (measuredRects[post.id]) return measuredRects[post.id];
            if (post.type === 'comment' || (post.type as string) === 'Comment') {
                return {
                    x: post.position_x,
                    y: post.position_y,
                    width: Math.max(post.width || FREEFORM_COMMENT_FALLBACK_WIDTH, FREEFORM_COMMENT_FALLBACK_WIDTH),
                    height: Math.max(post.height || FREEFORM_COMMENT_FALLBACK_HEIGHT, FREEFORM_COMMENT_FALLBACK_HEIGHT),
                };
            }

            return {
                x: post.position_x,
                y: post.position_y,
                width: Math.max(post.width || 280, 120),
                height: Math.max(post.height || 100, 120),
            };
        };

        return validEdges.map((edge) => {
            const source = postById.get(edge.source_post_id);
            const target = postById.get(edge.target_post_id);
            if (!source || !target) return null;
            const route = routeEdge(getRect(source), getRect(target), { gap: EDGE_GAP });
            if (route.hidden) return null;

            const styleObj = (edge.style && typeof edge.style === 'object') ? (edge.style as Record<string, unknown>) : {};
            const strokeColor = typeof styleObj.color === 'string' ? styleObj.color : '#9ca3af';
            const strokeDasharray =
                edge.relation_type === 'dashed' ? '6,5' :
                    edge.relation_type === 'dotted' ? '2,4' : 'none';

            return { edge, route, strokeColor, strokeDasharray };
        }).filter(Boolean) as Array<{
            edge: FreeformGraphEdge;
            route: RouteEdgeResult;
            strokeColor: string;
            strokeDasharray: string;
        }>;
    }, [validEdges, measuredRects, posts]);

    // Keep a ref so the drag handler always reads the latest renderEdges
    const renderEdgesRef = useRef(renderEdges);
    renderEdgesRef.current = renderEdges;

    // ── Label drag: project cursor onto the edge line and update label_position ─
    useEffect(() => {
        if (!draggingLabel) return;

        const handleMouseMove = (e: MouseEvent) => {
            const edgeData = renderEdgesRef.current.find((r) => r.edge.id === draggingLabel);
            if (!edgeData) return;
            const { sx, sy, ex, ey } = edgeData.route;

            // Get mouse position in SVG coordinates
            const svg = svgRef.current;
            if (!svg) return;
            const svgRect = svg.getBoundingClientRect();
            const mx = e.clientX - svgRect.left;
            const my = e.clientY - svgRect.top;

            // Project mouse onto the line segment (sx,sy)→(ex,ey)
            const dx = ex - sx;
            const dy = ey - sy;
            const len2 = dx * dx + dy * dy;
            const t = len2 < 1 ? 0.5 : Math.max(0.05, Math.min(0.95, ((mx - sx) * dx + (my - sy) * dy) / len2));

            // Optimistic local update
            setEdges((prev) =>
                prev.map((ed) => {
                    if (ed.id !== draggingLabel) return ed;
                    const curStyle = (ed.style && typeof ed.style === 'object') ? (ed.style as Record<string, unknown>) : {};
                    return { ...ed, style: { ...curStyle, label_position: t } };
                })
            );
        };

        const handleMouseUp = async () => {
            // Persist the final position
            const edge = edges.find((e) => e.id === draggingLabel);
            if (edge) {
                const curStyle = (edge.style && typeof edge.style === 'object') ? (edge.style as Record<string, unknown>) : {};
                await repo.upsertEdge({ ...edge, style: curStyle });
            }
            setDraggingLabel(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingLabel, edges, repo]);

    const updateEdge = async (edgeId: string, updates: Partial<FreeformGraphEdge>, stylePatch?: Record<string, unknown>) => {
        const current = edges.find((e) => e.id === edgeId);
        if (!current) return;
        const currentStyle = (current.style && typeof current.style === 'object') ? (current.style as Record<string, unknown>) : {};
        const nextStyle = stylePatch ? { ...currentStyle, ...stylePatch } : current.style;
        const payload: Partial<FreeformGraphEdge> = {
            ...current,
            ...updates,
            style: nextStyle,
        };
        await repo.upsertEdge(payload);
        setEdges((prev) => prev.map((e) => e.id === edgeId ? ({ ...e, ...updates, style: nextStyle }) : e));
    };

    const deleteEdge = async (edgeId: string) => {
        await repo.deleteEdge(edgeId);
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    };

    const menuEdge = edgeMenu ? edges.find((e) => e.id === edgeMenu.edgeId) || null : null;

    return (
        <>
            <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                {renderEdges.map(({ edge, route, strokeColor, strokeDasharray }) => {
                    const { sx, sy, cx, cy, ex, ey, endAngle, startAngle, pathD } = route;
                    const endDeg = endAngle * (180 / Math.PI);
                    const startDeg = startAngle * (180 / Math.PI);

                    const showEnd = edge.direction === 'forward' || edge.direction === 'bidirectional';
                    const showStart = edge.direction === 'backward' || edge.direction === 'bidirectional';



                    return (
                        <g
                            key={edge.id}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setEdgeMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY });
                                setLabelDraft(edge.label ?? '');
                            }}
                            style={{ pointerEvents: 'auto' }}
                        >
                            {/* Invisible wider hit area for easier right-clicking */}
                            <path
                                d={pathD}
                                fill="none"
                                stroke="transparent"
                                strokeWidth="12"
                                style={{ cursor: 'context-menu' }}
                            />
                            {/* The visible line */}
                            <path
                                d={pathD}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="2"
                                strokeDasharray={strokeDasharray}
                                pointerEvents="none"
                            />
                            {/* End arrowhead (at target) — tip at origin, body extends backward */}
                            {showEnd && (
                                <polygon
                                    points={`${-ARROW_SIZE * 2},${-ARROW_SIZE} 0,0 ${-ARROW_SIZE * 2},${ARROW_SIZE}`}
                                    transform={`translate(${ex},${ey}) rotate(${endDeg})`}
                                    fill={strokeColor}
                                    pointerEvents="none"
                                />
                            )}
                            {/* Start arrowhead (at source, for backward / bidirectional) — tip at origin */}
                            {showStart && (
                                <polygon
                                    points={`${-ARROW_SIZE * 2},${-ARROW_SIZE} 0,0 ${-ARROW_SIZE * 2},${ARROW_SIZE}`}
                                    transform={`translate(${sx},${sy}) rotate(${startDeg + 180})`}
                                    fill={strokeColor}
                                    pointerEvents="none"
                                />
                            )}
                            {edge.label && (() => {
                                const styleObj2 = (edge.style && typeof edge.style === 'object') ? (edge.style as Record<string, unknown>) : {};
                                const t = typeof styleObj2.label_position === 'number' ? (styleObj2.label_position as number) : 0.5;
                                const lx = sx + (ex - sx) * t;
                                const ly = sy + (ey - sy) * t;
                                return (
                                    <foreignObject
                                        x={lx - 90}
                                        y={ly - 40}
                                        width="180"
                                        height="80"
                                        style={{ overflow: 'visible', pointerEvents: 'none' }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                width: '100%',
                                                height: '100%',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    backgroundColor: 'white',
                                                    color: '#374151',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    lineHeight: '1.4',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                                    border: '1px solid #e5e7eb',
                                                    cursor: 'grab',
                                                    pointerEvents: 'auto',
                                                    userSelect: 'none',
                                                    whiteSpace: 'pre-wrap',
                                                    textAlign: 'center',
                                                    minWidth: '20px',
                                                    maxWidth: '160px',
                                                }}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setDraggingLabel(edge.id);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {edge.label}
                                            </div>
                                        </div>
                                    </foreignObject>
                                );
                            })()}
                        </g>
                    );
                })}
            </svg>

            {edgeMenu && menuEdge && (
                <div
                    className="fixed z-[7000] w-[260px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
                    style={{ left: edgeMenu.x, top: edgeMenu.y, pointerEvents: 'auto' }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className="text-xs font-semibold text-gray-600 mb-2">Edge Settings</div>
                    <div className="mb-2">
                        <div className="text-[11px] text-gray-500 mb-1">Color</div>
                        <div className="flex items-center gap-2">
                            {LINE_COLORS.map((color) => (
                                <button
                                    key={color}
                                    className="h-5 w-5 rounded-full border border-gray-300"
                                    style={{ backgroundColor: color }}
                                    onClick={async () => {
                                        try {
                                            await updateEdge(menuEdge.id, {}, { color });
                                        } catch {
                                            toast.error('Failed to update edge color.');
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="mb-2">
                        <div className="text-[11px] text-gray-500 mb-1">Style</div>
                        <div className="flex items-center gap-1">
                            {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                                <button
                                    key={style}
                                    className={`px-2 py-1 text-xs rounded border ${menuEdge.relation_type === style ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700'}`}
                                    onClick={async () => {
                                        try {
                                            await updateEdge(menuEdge.id, { relation_type: style });
                                        } catch {
                                            toast.error('Failed to update edge style.');
                                        }
                                    }}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mb-3">
                        <div className="text-[11px] text-gray-500 mb-1">Arrow</div>
                        <div className="flex items-center gap-1">
                            {([
                                { value: 'none', label: '—' },
                                { value: 'forward', label: '→' },
                                { value: 'backward', label: '←' },
                                { value: 'bidirectional', label: '↔' },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.value}
                                    className={`px-2 py-1 text-xs rounded border ${(menuEdge.direction || 'forward') === opt.value ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700'}`}
                                    onClick={async () => {
                                        try {
                                            await updateEdge(menuEdge.id, { direction: opt.value });
                                        } catch {
                                            toast.error('Failed to update arrow direction.');
                                        }
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mb-3">
                        <div className="text-[11px] text-gray-500 mb-1">Label</div>
                        <div className="flex items-center gap-2">
                            <input
                                value={labelDraft}
                                onChange={(event) => setLabelDraft(event.target.value)}
                                className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
                                placeholder="Add label"
                            />
                            <button
                                className="h-8 rounded bg-blue-600 px-2 text-xs text-white"
                                onClick={async () => {
                                    try {
                                        await updateEdge(menuEdge.id, { label: labelDraft.trim() || null });
                                    } catch {
                                        toast.error('Failed to update edge label.');
                                    }
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                    <button
                        className="h-8 w-full rounded bg-red-50 text-red-700 border border-red-200 text-xs"
                        onClick={async () => {
                            try {
                                await deleteEdge(menuEdge.id);
                                setEdgeMenu(null);
                            } catch {
                                toast.error('Failed to delete edge.');
                            }
                        }}
                    >
                        Delete Line
                    </button>
                </div>
            )}
        </>
    );
}
```

## 3. BOUND FILE — `lib/graph/graphRepo.ts` (whole file, exact, 185 lines; post-edit hash `bc82bd41e4e3c64d1752e8170ebdfdbb0559c9ac`)

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { FreeformGraphEdge, FreeformGraphSettings } from '../../types/graphTypes';
import { createBrowserSupabaseClient } from '../infra/supabase/browserClient';

/**
 * Isolated repository for Freeform Graph data operations.
 * Operates strictly on the new tables: freeform_graph_edges, freeform_graph_settings.
 */
export class FreeformGraphRepo {
    private isTableUnavailable = false;

    constructor(private supabase: SupabaseClient, private boardId: string) { }

    private isMissingRelationError(error: unknown): boolean {
        const err = error as { code?: string; message?: string } | null;
        return err?.code === '42P01' || String(err?.message || '').includes('does not exist');
    }

    private normalizeRelationType(value: unknown): FreeformGraphEdge['relation_type'] {
        return value === 'solid' || value === 'dashed' || value === 'dotted' ? value : 'solid';
    }

    private normalizeDirection(value: unknown): FreeformGraphEdge['direction'] {
        return value === 'none' || value === 'forward' || value === 'backward' || value === 'bidirectional'
            ? value
            : 'forward';
    }

    private normalizeLayoutMode(value: unknown): FreeformGraphSettings['layout_mode'] {
        return value === 'auto' || value === 'manual' ? value : 'manual';
    }

    async getEdges(): Promise<FreeformGraphEdge[]> {
        if (this.isTableUnavailable) return [];

        const { data, error } = await this.supabase
            .from('freeform_graph_edges')
            .select('*')
            .eq('board_id', this.boardId);

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            console.warn('[FreeformGraphRepo] freeform_graph_edges table unavailable (missing or RLS error):', error);
            return [];
        }
        if (error) throw error;
        console.debug('[FreeformGraphRepo] getEdges returned', (data || []).length, 'edges for board', this.boardId);
        return data || [];
    }

    async getSettings(): Promise<FreeformGraphSettings | null> {
        if (this.isTableUnavailable) return null;

        const { data, error } = await this.supabase
            .from('freeform_graph_settings')
            .select('*')
            .eq('board_id', this.boardId)
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return null;
        }
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
        return data;
    }

    async upsertEdge(edgeData: Partial<FreeformGraphEdge>): Promise<FreeformGraphEdge> {
        if (!edgeData.id) throw new Error("FreeformGraphRepo: upsertEdge requires an id");
        if (!edgeData.board_id) throw new Error("FreeformGraphRepo: upsertEdge requires board_id");

        // Explicit bounds checking
        if (edgeData.relation_type && !['solid', 'dashed', 'dotted'].includes(edgeData.relation_type)) {
            throw new Error(`FreeformGraphRepo: Invalid relation_type ${edgeData.relation_type}`);
        }

        if (this.isTableUnavailable) {
            return {
                id: edgeData.id,
                board_id: edgeData.board_id,
                source_post_id: edgeData.source_post_id || '',
                target_post_id: edgeData.target_post_id || '',
                relation_type: this.normalizeRelationType(edgeData.relation_type),
                direction: this.normalizeDirection(edgeData.direction),
                label: edgeData.label ?? null,
                style: edgeData.style ?? null,
                created_at: edgeData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }

        const { data, error } = await this.supabase
            .from('freeform_graph_edges')
            .upsert({ ...edgeData, updated_at: new Date().toISOString() })
            .select()
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            console.warn('[FreeformGraphRepo] upsertEdge failed - table unavailable. Edge was NOT saved to DB:', error);
            return {
                id: edgeData.id,
                board_id: edgeData.board_id,
                source_post_id: edgeData.source_post_id || '',
                target_post_id: edgeData.target_post_id || '',
                relation_type: this.normalizeRelationType(edgeData.relation_type),
                direction: this.normalizeDirection(edgeData.direction),
                label: edgeData.label ?? null,
                style: edgeData.style ?? null,
                created_at: edgeData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }
        if (error) throw error;
        return data;
    }

    async deleteEdge(edgeId: string): Promise<void> {
        if (this.isTableUnavailable) return;

        const { error } = await this.supabase
            .from('freeform_graph_edges')
            .delete()
            .eq('id', edgeId)
            .eq('board_id', this.boardId);

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return;
        }
        if (error) throw error;
    }

    async updateSettings(settings: Partial<FreeformGraphSettings>): Promise<FreeformGraphSettings> {
        if (this.isTableUnavailable) {
            return {
                board_id: this.boardId,
                layout_mode: this.normalizeLayoutMode(settings.layout_mode),
                focus_node_id: settings.focus_node_id ?? null,
                show_minimap: settings.show_minimap ?? false,
                snap_strength: settings.snap_strength ?? 0.5,
                updated_at: new Date().toISOString(),
            };
        }

        const { data, error } = await this.supabase
            .from('freeform_graph_settings')
            .upsert({
                board_id: this.boardId,
                ...settings,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return {
                board_id: this.boardId,
                layout_mode: this.normalizeLayoutMode(settings.layout_mode),
                focus_node_id: settings.focus_node_id ?? null,
                show_minimap: settings.show_minimap ?? false,
                snap_strength: settings.snap_strength ?? 0.5,
                updated_at: new Date().toISOString(),
            };
        }
        if (error) throw error;
        return data;
    }
}

/**
 * PATCH-046: the client hand-off retirement. Consumers stop constructing
 * the repo with their own client - this factory supplies the SAME
 * cookie/browser client CanvasClient's memo passed (the PATCH-025 client
 * identity). PATCH-047 (owner-authorized client-identity ruling): the
 * second consumer, FreeformGraphLayer, migrated onto this factory too -
 * its legacy session-less lib/supabase singleton could not satisfy the
 * auth.uid()-gated RLS on either graph table (reads RLS-filtered to
 * empty, writes rejected 42501). Both consumers now share ONE client
 * identity; the anon singleton has no remaining graph consumers.
 */
export function createFreeformGraphRepo(boardId: string): FreeformGraphRepo {
    return new FreeformGraphRepo(createBrowserSupabaseClient(), boardId);
}
```

---

## 4. Phase plan

### Phase A — read + verify

Read SKILL.md, PATCH_REFERENCE §5.11, this spec. Run EVERY §1 gate. Any
mismatch: STOP and report; do not improvise.

### Phase B — the bound mechanical extractor (the ONLY write step)

Save the block below as `_p047_extract.py` (repo root) and run
`python3 _p047_extract.py`; then DELETE the script file. Do not hand-edit any
scoped file; if the extractor stops, report its output verbatim.

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-047.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-047.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("components/graph/FreeformGraphLayer.tsx", "b439038ef21b471af8b1dc4fecbc5d12a5cfc9c0"),
    ("lib/graph/graphRepo.ts", "bc82bd41e4e3c64d1752e8170ebdfdbb0559c9ac"),
]
for i, (path, want) in enumerate(targets):
    content = fences[i]
    got = blob(content.encode("utf-8"))
    assert got == want, f"fence {i} hashes to {got}, expected {want} - STOP, report"
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    check = subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()
    assert check == want, f"{path}: git hash-object {check} != {want} - STOP, report"
    print(path, check, "OK")
print("BOTH BOUND FILES WRITTEN AND HASH-VERIFIED")
```

### Phase C — gates (§6), commit (bound message), STOP

Do not start PATCH-048.

---

## 5. Explanatory recipes (REFERENCE ONLY; Phase B already wrote the exact bytes)

### 5a — the layer's imports (two legacy lines collapse to the factory import)

OLD:

```ts
import { FreeformGraphRepo } from '@/lib/graph/graphRepo';
import { supabase } from '@/lib/supabase';
```

NEW:

```ts
import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
```

### 5b — the construction (deps were already [boardId]; the ceiling-neutral one-line pointer)

OLD:

```ts
    const repo = useMemo(() => new FreeformGraphRepo(supabase, boardId), [boardId]);
```

NEW:

```ts
    // PATCH-047 owner-authorized client-identity migration - see createFreeformGraphRepo's doc.
    const repo = useMemo(() => createFreeformGraphRepo(boardId), [boardId]);
```

### 5c — the factory's fencing doc records the ruling (comment-only; class + factory bodies byte-kept)

OLD:

```ts
/**
 * PATCH-046: the client hand-off retirement. Consumers stop constructing
 * the repo with their own client - this factory supplies the SAME
 * cookie/browser client CanvasClient's memo passed (the PATCH-025 client
 * identity). FreeformGraphLayer (rendered by FreeformPadletCards) still
 * constructs with the LEGACY lib/supabase singleton and is deferred BY
 * NAME to that phase - do NOT swap it onto this factory without an owner
 * client-identity ruling.
 */
```

NEW:

```ts
/**
 * PATCH-046: the client hand-off retirement. Consumers stop constructing
 * the repo with their own client - this factory supplies the SAME
 * cookie/browser client CanvasClient's memo passed (the PATCH-025 client
 * identity). PATCH-047 (owner-authorized client-identity ruling): the
 * second consumer, FreeformGraphLayer, migrated onto this factory too -
 * its legacy session-less lib/supabase singleton could not satisfy the
 * auth.uid()-gated RLS on either graph table (reads RLS-filtered to
 * empty, writes rejected 42501). Both consumers now share ONE client
 * identity; the anon singleton has no remaining graph consumers.
 */
```

Nothing else changes in either file.

---

## 6. Post-edit gates (ALL must pass before commit)

### 6.1 Hashes

```bash
git hash-object components/graph/FreeformGraphLayer.tsx   # b439038ef21b471af8b1dc4fecbc5d12a5cfc9c0
git hash-object lib/graph/graphRepo.ts                    # bc82bd41e4e3c64d1752e8170ebdfdbb0559c9ac
```

Plus ALL EIGHT MUST-NOT-CHANGE hashes from §1, unchanged.

### 6.2 Censuses (simulation-measured; plain `grep -c`)

```bash
L=components/graph/FreeformGraphLayer.tsx
grep -c "supabase" "$L"                   # 0   (the layer is LEGACY-CLIENT-FREE)
grep -c "new FreeformGraphRepo" "$L"      # 0   (raw construction EXTINCT)
grep -c "createFreeformGraphRepo" "$L"    # 3   (import + pointer comment + call)
grep -c "FreeformGraphRepo" "$L"          # 3   (substrings of the factory name — the 042 disclosure class)
grep -c "repo\." "$L"                     # 4   (the consumer surface, byte-kept)
wc -l "$L"                                # 493   (over-ceiling component — never-grow at EQUALITY)
G=lib/graph/graphRepo.ts
grep -c "\.from(" "$G"                    # 5   (all five table sites byte-kept)
grep -c "isTableUnavailable" "$G"         # 11  (the state machine byte-kept)
grep -c "createFreeformGraphRepo" "$G"    # 1
grep -c "new FreeformGraphRepo" "$G"      # 1
grep -c "PATCH-047" "$G"                  # 1   (the updated fencing doc)
wc -l "$G"                                # 185
```

### 6.3 Scope + untouched gates

```bash
git status --short   # exactly TWO modified paths; ANY other path = STOP
git diff --stat -- "app/dashboard/canvas/[id]/CanvasClient.tsx" components/collabboard types/graphTypes.ts lib/graph/graphSelectors.ts lib/graph/edgeRouting.ts lib/infra lib/domain lib/supabase.ts lib/supabase eslint.boundaries.config.mjs   # nothing
```

### 6.4 Execution gates

```bash
npx tsc --noEmit                          # clean
npm run check:boundaries                  # silent
npx vitest run                            # 245 passed (245), 28 files
# port gate: nothing listens on 3000 before you start; own dev server; warm /, /auth, /dashboard;
PW_BASE_URL=http://localhost:3000 npx playwright test   # 27 passed
# stop the server by PID; port 3000 back to 0 listeners; then:
rm -rf .next && npm run verify            # exit 0
```

Commit with the bound message. Do NOT start PATCH-048.

---

## 7. Do NOT

- Do NOT touch the layer's error handling — no catches added or removed; the
  authorized change is the CLIENT IDENTITY only, everything else byte-kept.
- Do NOT touch the class body, the synthetic fallbacks, the state machine, or
  the factory body in graphRepo.ts — only its doc comment changes.
- Do NOT touch `lib/supabase.ts` (its remaining consumers are deferred
  dualities), FreeformPadletCards, CanvasClient, or anything postsRaw.
- Do NOT add tests, toasts, retries, or any new behavior beyond the bound
  identity change.
- Do NOT run `git checkout` / `git restore` on any scoped file (autocrlf).
- Do NOT print or read `.env.local` values.
- Do NOT start PATCH-048.
