import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
import { selectValidEdges } from '@/lib/graph/graphSelectors';
import { routeEdge, type Rect, type GraphSide, type RouteEdgeResult } from '@/lib/graph/edgeRouting';
import type { FreeformGraphEdge } from '@/types/graphTypes';
import type { Padlet } from '@/types/collabboard';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowDown, ArrowUp, ArrowUpToLine } from 'lucide-react';

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
// Render-only fallback for edges with no explicit style.zIndex -- keeps today's
// "line always on top" look for anyone who's never touched the new layer
// controls, while still comfortably outranking anything a post's own
// bringToFront can reach (posts self-normalize once their zIndex passes 9000).
const EDGE_DEFAULT_Z = 999999;

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

    // PATCH 9S: the edge context menu caches its position as fixed screen
    // pixels at open-time and never recomputes it -- once camera-anchored
    // zoom can move the world underneath a fixed screen point, a stale menu
    // would visually detach from the edge it targets. Closes on ANY zoom
    // prop change; a no-op on mount since edgeMenu starts null.
    useEffect(() => {
        setEdgeMenu(null);
    }, [zoom]);

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

    // PATCH 9O: same ref pattern as renderEdgesRef -- read the latest zoom
    // inside the drag handler without re-subscribing the effect below on
    // every zoom change (e.g. Ctrl+wheel mid-drag).
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    // ── Label drag: project cursor onto the edge line and update label_position ─
    useEffect(() => {
        if (!draggingLabel) return;

        const handleMouseMove = (e: MouseEvent) => {
            const edgeData = renderEdgesRef.current.find((r) => r.edge.id === draggingLabel);
            if (!edgeData) return;
            const { sx, sy, ex, ey } = edgeData.route;

            // Get mouse position in SVG coordinates. svgRef's <svg> lives
            // inside FreeformPadletCards' `transform: scale(canvasZoom)`
            // world stage, so getBoundingClientRect() returns its ON-SCREEN
            // (post-transform, zoom-scaled) box -- but it already bakes in
            // the scrollable container's current scroll offset natively
            // (unlike measuredRects above, which uses a DIFFERENT, never-
            // scrolled containerRect + manual scrollLeft/scrollTop, because
            // that reference element doesn't move with scroll). Do not add
            // scroll math here -- it would double-count an offset this rect
            // already includes. sx/sy/ex/ey (the route) are WORLD units
            // (measuredRects already divides by zoom to normalize out the
            // screen scale), so the raw screen-pixel delta below must be
            // divided by zoom exactly once to land in that same WORLD space
            // before being compared/projected against them.
            const svg = svgRef.current;
            if (!svg) return;
            const svgRect = svg.getBoundingClientRect();
            const currentZoom = zoomRef.current;
            const mx = (e.clientX - svgRect.left) / currentZoom;
            const my = (e.clientY - svgRect.top) / currentZoom;

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

    const getEdgeZ = (edge: FreeformGraphEdge): number => {
        const style = (edge.style && typeof edge.style === 'object') ? edge.style as Record<string, unknown> : {};
        return typeof style.zIndex === 'number' ? style.zIndex : EDGE_DEFAULT_Z;
    };

    // Reorders a line against BOTH other lines and the posts themselves (using
    // the same zIndex scale posts already use), so a line can be tucked behind
    // a post it currently always painted over, or pulled back in front of it.
    const moveEdgeLayer = async (edgeId: string, action: 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack') => {
        const edge = edges.find((e) => e.id === edgeId);
        if (!edge) return;

        const postZValues = posts.map((p) => (p.metadata as any)?.zIndex ?? 1);
        const edgeZValues = edges.map(getEdgeZ);
        const allZ = [...postZValues, ...edgeZValues];
        const maxZ = Math.max(...allZ, 1);
        const minZ = Math.min(...allZ, 1);
        const currentZ = getEdgeZ(edge);

        let newZ: number;
        switch (action) {
            case 'bringToFront': newZ = maxZ + 1; break;
            case 'sendToBack': newZ = minZ - 1; break;
            case 'bringForward': newZ = currentZ + 1; break;
            case 'sendBackward': newZ = currentZ - 1; break;
            default: return;
        }

        try {
            await updateEdge(edgeId, {}, { zIndex: newZ });
        } catch {
            toast.error('Failed to reorder line.');
        }
    };

    const menuEdge = edgeMenu ? edges.find((e) => e.id === edgeMenu.edgeId) || null : null;
    // The edge's actual on-screen angle, so the Arrow buttons' icons rotate to
    // show the real direction they'll produce instead of a fixed →/← glyph
    // that only reads correctly when the line happens to run left-to-right.
    const menuAngleDeg = menuEdge
        ? (renderEdges.find((r) => r.edge.id === menuEdge.id)?.route.startAngle ?? 0) * (180 / Math.PI)
        : 0;

    return (
        <>
            {/* Present regardless of edge count purely so label-dragging always has
                a stable rect to project cursor coordinates against -- the per-edge
                svgs below are all inset-0 anyway, so any one of them would give the
                same rect, but this keeps that independent of render order/z-index. */}
            <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} aria-hidden="true" />
            {renderEdges.map(({ edge, route, strokeColor, strokeDasharray }) => {
                    const { sx, sy, cx, cy, ex, ey, endAngle, startAngle, pathD } = route;
                    const endDeg = endAngle * (180 / Math.PI);
                    const startDeg = startAngle * (180 / Math.PI);

                    const showEnd = edge.direction === 'forward' || edge.direction === 'bidirectional';
                    const showStart = edge.direction === 'backward' || edge.direction === 'bidirectional';



                    return (
                        // Each line gets its own absolutely-positioned svg (instead of
                        // sharing one fixed-z layer above every post) so its zIndex can
                        // be moved independently -- interleaving it with individual
                        // posts via moveEdgeLayer, not just toggling above/below all of them.
                        <svg
                            key={edge.id}
                            className="absolute inset-0 w-full h-full"
                            style={{ pointerEvents: 'none', zIndex: getEdgeZ(edge) }}
                        >
                        <g
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
                        </svg>
                    );
                })}

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
                                { value: 'none', heads: 0, rotate: menuAngleDeg },
                                { value: 'forward', heads: 1, rotate: menuAngleDeg },
                                { value: 'backward', heads: 1, rotate: menuAngleDeg + 180 },
                                { value: 'bidirectional', heads: 2, rotate: menuAngleDeg },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.value}
                                    title={opt.value}
                                    className={`flex h-7 w-9 items-center justify-center rounded border ${(menuEdge.direction || 'forward') === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'}`}
                                    onClick={async () => {
                                        try {
                                            await updateEdge(menuEdge.id, { direction: opt.value });
                                        } catch {
                                            toast.error('Failed to update arrow direction.');
                                        }
                                    }}
                                >
                                    {/* Rotated to the edge's real on-screen angle, so the icon
                                        always shows the arrowhead where it will actually land —
                                        a fixed →/← glyph reads backwards whenever the connected
                                        posts aren't laid out left-to-right. */}
                                    <svg width="18" height="10" viewBox="-9 -5 18 10" style={{ transform: `rotate(${opt.rotate}deg)` }}>
                                        <line x1="-7" y1="0" x2="7" y2="0" stroke="currentColor" strokeWidth="1.5" />
                                        {opt.heads >= 1 && <polygon points="7,0 2,-3 2,3" fill="currentColor" />}
                                        {opt.heads === 2 && <polygon points="-7,0 -2,-3 -2,3" fill="currentColor" />}
                                    </svg>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mb-3">
                        <div className="text-[11px] text-gray-500 mb-1">Layer</div>
                        <div className="flex items-center gap-1">
                            {([
                                { action: 'sendToBack' as const, Icon: ArrowDownToLine, title: 'Send to back' },
                                { action: 'sendBackward' as const, Icon: ArrowDown, title: 'Send backward' },
                                { action: 'bringForward' as const, Icon: ArrowUp, title: 'Bring forward' },
                                { action: 'bringToFront' as const, Icon: ArrowUpToLine, title: 'Bring to front' },
                            ]).map(({ action, Icon, title }) => (
                                <button
                                    key={action}
                                    title={title}
                                    className="flex h-7 w-9 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                                    onClick={() => moveEdgeLayer(menuEdge.id, action)}
                                >
                                    <Icon className="h-4 w-4" />
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
