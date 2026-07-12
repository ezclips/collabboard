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
