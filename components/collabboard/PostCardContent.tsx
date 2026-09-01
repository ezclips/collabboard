"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Padlet } from "@/types/collabboard";
import LinkMediaEmbed, { getLinkEmbedKind } from "./LinkMediaEmbed";
import EmbeddedCommentList from "./EmbeddedCommentList";
import ReactionDisplay from "./editors/ReactionDisplay";
import { buildYouTubeThumbCandidates, extractYouTubeId } from "@/lib/media/youtubeThumb";
import AIContentRenderer from "@/components/ai/AIContentRenderer";
import { extractAIContentFromPadletMetadata } from "@/lib/ai/normalize-ai-content";
import { createToggleTaskCommand } from "@/lib/domain/canvas/posts";
import { asUserId } from "@/lib/domain/core/ids";
import { createPostsRepository } from "@/lib/infra/canvas/postsRepository";
import { getMeaningfulTitle } from "@/lib/infra/collabboard/postTitle";
import { getEffectiveVisibleChildTitleIds, resolveVisibleChildTitle } from "@/lib/infra/collabboard/containerChildTitleVisibility";
import { isDocumentPost, resolveChildCardChrome } from "@/lib/domain/canvas/documentPost";
import { resolvePadletTitleStyle } from "@/lib/domain/canvas/captionStyle";
import DocumentCardContent from "./DocumentCardContent";
import { guardCommentMutation, type CommentAccessMode } from "@/lib/domain/canvas/comments";
import { IMAGE_CROP_TO_GRID_HEIGHT_PX } from "@/components/collabboard/canvas/engine/utils";
import { useScrollbarLane } from "./useScrollbarLane";
import { BookOpen } from "lucide-react";
import { useKnowledgeSourceReferencesForPadlet } from "./KnowledgeSourceReferenceContext";
import KnowledgePdfCanvasSurface, { readKnowledgePdfPlacement } from "./KnowledgePdfCanvasSurface";
import { knowledgeSourceCardLabel } from "@/lib/domain/knowledge/knowledgeSourceNavigation";
import { knowledgeSourceCardExcerpt } from "@/lib/domain/knowledge/knowledgeSourceCardExcerpt";
import { getKnowledgeSourceCardRegionCrop } from "@/lib/domain/knowledge/knowledgeSourceCardRegionCrop";
import KnowledgeSourceRegionCrop from "./KnowledgeSourceRegionCrop";

type CellStyle = {
    bg?: string;
    align?: "left" | "center" | "right";
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
};

interface PostCardContentProps {
    padlet: Padlet;
    allPadlets?: Padlet[];
    onScan?: () => void;
    onView?: () => void;
    canvasContext?: "default" | "drawing" | "timeline";
    // Comment handling for interactive comments inside containers
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    onUpdateChildComments?: (childId: string, comments: any[], options?: { field?: "comments" | "detachedComments" }) => void;
    // PATCH 8AD: gates every EmbeddedCommentList mutation this component renders
    // (comment-type posts, drawing/image-binding detached comments, and comment-type
    // children of a container preview). Defaults to 'manage' so every pre-existing
    // caller (tests, slide renderer, presentation mode) keeps today's behavior.
    accessMode?: CommentAccessMode;
    onOpenDocument?: () => void; // PATCH-149B1b-iii §27.4: opt-in Read affordance
    // Set by callers that already render this padlet's title themselves
    // (e.g. CardShell's strip, styled via resolvePadletTitleStyle) so the
    // todo/table branches below don't render a second, unstyled title.
    hideOwnTitle?: boolean;
    // The freeform canvas's own mouse-drag state -- the Drawing preview's
    // onClick must not fire (opening the viewer) when the click is really
    // the tail end of a drag the user just performed on this card.
    isDragging?: boolean;
}

// Decode HTML entities that may have been escaped
function decodeHtmlEntities(text: string): string {
    if (typeof document === "undefined") return text;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}

/**
 * KNI-R1A. A stored Note body is TipTap HTML, where an escaped entity is the
 * user's OWN literal text (e.g. `<p>&lt;img ...&gt;</p>`) -- decoding the
 * whole string before sanitizing would turn that text back into a real
 * element. True only when the stored string itself contains a real tag, so
 * fully-escaped legacy content (no literal tag present) still falls through
 * to the decode compatibility path below. Not a security boundary -- DOMPurify
 * remains that either way.
 */
const STRUCTURED_RICH_TEXT_TAG = /<\/?(p|br|div|span|ul|ol|li|strong|em|b|i|u|s|a|h1|h2|blockquote|code|pre|mark)(\s[^>]*)?\/?>/i;
function isStructuredRichTextHtml(raw: string): boolean {
    return STRUCTURED_RICH_TEXT_TAG.test(raw);
}

function normalizeType(t: unknown): string {
    return String(t ?? "").trim().toLowerCase();
}

// Robust comment detection: check type OR metadata.comments array
function isCommentPost(padlet: any): boolean {
    const type = normalizeType(padlet?.type);
    const comments = padlet?.metadata?.comments;
    if (type === "comment") return true;
    // Legacy fallback: treat as comment only when type is missing/unknown.
    if (!type && Array.isArray(comments)) return true;
    return false;
}

function getMeaningfulImageTitle(padlet: Padlet): string {
    const title = String(padlet.title ?? "").trim();
    if (!title) return "";
    const normalized = title.toLowerCase();
    if (normalized === "image" || normalized === "untitled") return "";
    return title;
}

function asStringContent(v: unknown): string {
    if (typeof v === "string") return v;
    if (v == null) return "";
    try {
        return String(v);
    } catch {
        return "";
    }
}

function looksLikeHtml(raw: string): boolean {
    const s = raw.trim();
    if (!s) return false;

    // Real HTML
    if (s.startsWith("<")) return true;

    // Entity-encoded HTML like &lt;p&gt;...&lt;/p&gt;
    if (s.startsWith("&lt;") || s.includes("&lt;") || s.includes("&gt;")) return true;

    return false;
}

// Defers rendering AIContentRenderer until the card scrolls into view.
// A 100 px root margin pre-loads cards just before they become visible.
function VisibleAIContent({ content }: { content: unknown }) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
            { rootMargin: '100px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className="w-full h-full min-h-[150px] overflow-hidden rounded-lg">
            {isVisible && <AIContentRenderer content={content} />}
        </div>
    );
}

function ClipartCardContent({
    svgUrl,
    title,
    iconBgColor,
    textColor,
}: {
    svgUrl: string;
    title?: string | null;
    iconBgColor: string;
    textColor: string;
}) {
    const [isSvgSourceReady, setIsSvgSourceReady] = useState(false);
    const [isRenderedSvgReady, setIsRenderedSvgReady] = useState(false);
    const [isClipartVisible, setIsClipartVisible] = useState(false);
    const renderedImgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsSvgSourceReady(false);
        setIsRenderedSvgReady(false);
        setIsClipartVisible(false);

        const img = new Image();

        const markReady = async () => {
            try {
                if (typeof img.decode === "function") {
                    await img.decode();
                }
            } catch {
                // SVG decode can reject even when the browser can still render it.
            }

            if (!cancelled) {
                setIsSvgSourceReady(true);
            }
        };

        img.onload = () => {
            void markReady();
        };
        img.onerror = () => {
            if (!cancelled) {
                setIsSvgSourceReady(false);
                setIsRenderedSvgReady(false);
            }
        };
        img.src = svgUrl;

        if (img.complete && img.naturalWidth > 0) {
            void markReady();
        }

        return () => {
            cancelled = true;
        };
    }, [svgUrl]);

    useEffect(() => {
        if (!isSvgSourceReady) return;
        const img = renderedImgRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
            setIsRenderedSvgReady(true);
        }
    }, [isSvgSourceReady, svgUrl]);

    useEffect(() => {
        if (!isRenderedSvgReady || isClipartVisible) return;

        let cancelled = false;
        const rafId = window.requestAnimationFrame(() => {
            if (!cancelled) {
                setIsClipartVisible(true);
            }
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(rafId);
        };
    }, [isRenderedSvgReady, isClipartVisible]);

    return (
        <div className="flex w-full flex-col items-center gap-1.5 select-none pointer-events-none">
            <div
                className="flex h-[220px] max-h-[55vh] w-full items-center justify-center overflow-hidden"
                style={{ backgroundColor: isClipartVisible ? iconBgColor : "transparent" }}
            >
                {isSvgSourceReady && (
                    <img
                        ref={renderedImgRef}
                        src={svgUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        style={{ visibility: isClipartVisible ? "visible" : "hidden" }}
                        onLoad={() => setIsRenderedSvgReady(true)}
                        onError={() => {
                            setIsSvgSourceReady(false);
                            setIsRenderedSvgReady(false);
                            setIsClipartVisible(false);
                        }}
                    />
                )}
            </div>
            {title && isClipartVisible && (
                <div className="text-center text-xs font-semibold" style={{ color: textColor }}>
                    {title}
                </div>
            )}
        </div>
    );
}

export default function PostCardContent({
    padlet,
    allPadlets = [],
    onScan,
    onView,
    canvasContext = "default",
    currentUserId,
    currentUserName,
    currentUserAvatar,
    onUpdateChildComments,
    accessMode = 'manage',
    onOpenDocument,
    hideOwnTitle = false,
    isDragging = false,
}: PostCardContentProps) {

    const type = normalizeType(padlet.type);
    const rawContent = asStringContent(padlet.content);

    // --- KNOWLEDGE PDF PLACEMENT (PDF-C1) ---
    // Keyed on the placement metadata, not on `type` alone: an ordinary file
    // post carries no document reference and must keep its existing rendering.
    // This is the COMMON host, so Wall/Grid/Columns/Drawing all get the one
    // surface from here; Freeform renders the same component itself.
    const knowledgePdfPlacement = readKnowledgePdfPlacement(padlet);
    // PATCH 9E.1: called unconditionally (rules of hooks -- several early
    // `return`s for other padlet types follow below) but only ever attached
    // to an element when this padlet actually renders the nested-Container
    // scroll viewport; measures that viewport's own real scrollbar/gutter
    // reservation instead of PATCH 9E's guessed 6px constant.
    const nestedContainerScrollRef = useRef<HTMLDivElement>(null);
    const nestedContainerScrollbarLane = useScrollbarLane(nestedContainerScrollRef, type === "container");

    // Placed after the unconditional hooks above, like every other early return.
    if (knowledgePdfPlacement) {
        return (
            <KnowledgePdfCanvasSurface
                boardId={padlet.board_id}
                documentId={knowledgePdfPlacement.documentId}
                originalFilename={knowledgePdfPlacement.originalFilename}
                processingStatus={knowledgePdfPlacement.processingStatus}
                displayMode={knowledgePdfPlacement.displayMode}
            />
        );
    }

    // --- LINK TYPE ---
    if (type === "link") {
        const isDrawingCanvas = canvasContext === "drawing";
        // Use metadata.linkUrl first, fallback to extracting URL from content
        const metadataUrl = padlet.metadata?.linkUrl || "";
        const fallbackUrlMatch = rawContent.match(/(https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+)/i);
        const fallbackUrl = fallbackUrlMatch ? fallbackUrlMatch[1] : rawContent;

        const linkImageRaw = padlet.metadata?.linkImage || "";
        const youtubeIdFromImage = extractYouTubeId(linkImageRaw);
        const youtubeIdFromUrl = extractYouTubeId(metadataUrl || fallbackUrl);
        const youtubeId = youtubeIdFromUrl || youtubeIdFromImage;
        const derivedYoutubeUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "";
        const youtubeThumbCandidates = youtubeId ? buildYouTubeThumbCandidates(youtubeId) : [];
        const linkImageCandidates = linkImageRaw
            ? [linkImageRaw, ...youtubeThumbCandidates.filter((candidate) => candidate !== linkImageRaw)]
            : youtubeThumbCandidates;
        const linkImage = linkImageCandidates[0] || "";

        let linkUrl = metadataUrl || fallbackUrl || derivedYoutubeUrl;

        if (!linkUrl) {
            return <div className="text-[10px] text-gray-400 italic select-none">Missing link URL</div>;
        }

        const displayMode = padlet.metadata?.displayMode || "both";
        const showMedia = displayMode !== "info-only";
        const showInfo = displayMode !== "image-only";

        // Check if URL is embeddable (YouTube, Vimeo, etc.)
        let embedKind = showMedia && linkUrl ? getLinkEmbedKind(linkUrl) : "none";
        if (embedKind === "none" && derivedYoutubeUrl) {
            linkUrl = derivedYoutubeUrl;
            embedKind = "youtube"; // Force YouTube detection since derived from thumbnail
        }
        if (isDrawingCanvas && youtubeId) {
            linkUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
            embedKind = "youtube";
        }
        const showEmbed = embedKind !== "none";

        return (
            <div className="space-y-2 select-none">
                {showMedia && showEmbed && (
                    <div className="-mx-3 -mt-3 mb-2">
                        <LinkMediaEmbed url={linkUrl} forcedKind={embedKind as any} />
                    </div>
                )}

                {showMedia && !showEmbed && linkImage && (
                    <div className="-mx-3 -mt-3 mb-2">
                        <img
                            src={linkImage}
                            alt=""
                            className="w-full h-44 object-contain bg-gray-900/5"
                            data-fallbacks={JSON.stringify(linkImageCandidates.slice(1))}
                            onError={(e) => {
                                const img = e.currentTarget;
                                try {
                                    const fallbacks = JSON.parse(img.dataset.fallbacks || "[]") as string[];
                                    const next = fallbacks.shift();
                                    if (next) {
                                        img.dataset.fallbacks = JSON.stringify(fallbacks);
                                        img.src = next;
                                        return;
                                    }
                                } catch {
                                    // ignore
                                }
                                img.style.display = "none";
                            }}
                        />
                    </div>
                )}

                {showInfo && (
                    <div className="flex items-center gap-1.5">
                        {padlet.metadata?.linkFavicon && (
                            <img
                                src={padlet.metadata?.linkFavicon}
                                alt=""
                                className="w-3 h-3"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                }}
                            />
                        )}
                        <span className="text-[10px] text-gray-500 truncate">
                            {padlet.metadata?.linkDomain || linkUrl}
                        </span>
                    </div>
                )}

                {showInfo && (
                    <h4 className="text-xs font-semibold text-blue-600 leading-tight line-clamp-2">
                        {padlet.metadata?.linkTitle || "Untitled Link"}
                    </h4>
                )}

                {padlet.metadata?.linkDescription && showInfo && (
                    <p className="text-[10px] text-gray-600 line-clamp-2">{padlet.metadata?.linkDescription}</p>
                )}

                {padlet.metadata?.linkCaption && (
                    <p
                        className="text-[10px] italic border-t border-gray-100 pt-2 mt-1"
                        style={{ color: padlet.metadata?.linkCaptionColor || "#6B7280" }}
                    >
                        {padlet.metadata?.linkCaption}
                    </p>
                )}
            </div>
        );
    }

    // --- TODO TYPE ---
    if (type === "todo" && padlet.metadata?.tasks) {
        return (
            <div className="space-y-1 select-none">
                {!hideOwnTitle && padlet.metadata.todoTitle && (
                    <h4
                        className="text-xs font-semibold text-gray-800 mb-1"
                        style={resolvePadletTitleStyle(padlet)}
                    >
                        {padlet.metadata.todoTitle}
                    </h4>
                )}

                {padlet.metadata.tasks.slice(0, 4).map(
                    (task: { id: string; text: string; completed: boolean; dueDate?: string; assignee?: string }) => (
                        <div key={task.id} className="flex items-start gap-1.5">
                            <input
                                type="checkbox"
                                checked={task.completed}
                                onChange={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const toggleTask = createToggleTaskCommand(createPostsRepository());
                                    const result = await toggleTask(
                                        {
                                            postId: padlet.id,
                                            taskId: task.id,
                                            metadata: padlet.metadata ?? {},
                                        },
                                        { userId: currentUserId ? asUserId(currentUserId) : null }
                                    );

                                    if (result.ok) {
                                        onScan?.();
                                    } else {
                                        console.error("Failed to toggle task:", result.error);
                                    }
                                }}
                                className="w-3 h-3 mt-0.5 accent-green-500 cursor-pointer pointer-events-auto"
                            />
                            <span className={`text-[10px] ${task.completed ? "line-through text-gray-400" : "text-gray-700"}`}>
                                {task.text}
                            </span>
                        </div>
                    )
                )}

                {padlet.metadata.tasks.length > 4 && (
                    <p className="text-[9px] text-gray-400">+{padlet.metadata.tasks.length - 4} more tasks</p>
                )}

                <div className="pt-1 border-t border-gray-100 mt-1">
                    <div className="flex items-center gap-1">
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full"
                                style={{
                                    width: `${padlet.metadata.tasks.length > 0
                                        ? (padlet.metadata.tasks.filter((t: { completed: boolean }) => t.completed).length /
                                            padlet.metadata.tasks.length) *
                                        100
                                        : 0
                                        }%`,
                                }}
                            />
                        </div>
                        <span className="text-[9px] text-gray-500">
                            {padlet.metadata.tasks.filter((t: { completed: boolean }) => t.completed).length}/{padlet.metadata.tasks.length}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // --- TABLE TYPE ---
    if (type === "table") {
        let tableData: {
            rows?: string[][];
            columns?: string[];
            caption?: string;
            cellStyles?: Record<string, CellStyle>;
        } = {};

        try {
            tableData = JSON.parse(rawContent || "{}");
        } catch {
            tableData = {};
        }

        const rows = tableData.rows || [];
        const columns = tableData.columns || ["A", "B", "C"];
        const cellStyles = tableData.cellStyles || {};
        const displayRows = rows.slice(0, 3);
        const displayCols = columns.slice(0, 3);
        const tableTitle = getMeaningfulTitle(padlet.title, "table");

        const getCellStyle = (rowIndex: number, colIndex: number): CellStyle => {
            const key = `${rowIndex}-${colIndex}`;
            return cellStyles[key] || {};
        };

        return (
            <div className="space-y-1 select-none">
                {!hideOwnTitle && tableTitle && (
                    <h4
                        className="text-xs font-semibold text-gray-800 mb-1"
                        style={resolvePadletTitleStyle(padlet)}
                    >
                        {tableTitle}
                    </h4>
                )}

                <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                    <table className="w-full text-[9px]">
                        <thead>
                            <tr className="bg-gray-100">
                                {displayCols.map((col, i) => (
                                    <th key={i} className="px-1 py-0.5 border-r border-gray-200 font-medium text-gray-600">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {displayRows.length > 0 ? (
                                displayRows.map((row, ri) => (
                                    <tr key={ri} className="border-t border-gray-200">
                                        {row.slice(0, 3).map((cell, ci) => {
                                            const style = getCellStyle(ri, ci);
                                            return (
                                                <td
                                                    key={ci}
                                                    className="px-1 py-0.5 border-r border-gray-200 truncate max-w-[50px]"
                                                    style={{
                                                        backgroundColor: style.bg || undefined,
                                                        textAlign: style.align || "left",
                                                        fontWeight: style.bold ? "bold" : undefined,
                                                        fontStyle: style.italic ? "italic" : undefined,
                                                        color: canvasContext === "timeline" ? style.color || undefined : undefined,
                                                        textDecoration: style.underline ? "underline" : undefined,
                                                    }}
                                                >
                                                    {cell || "-"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="px-1 py-2 text-center text-gray-400">
                                        Empty table
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {(rows.length > 3 || columns.length > 3) && (
                    <p className="text-[9px] text-gray-400">
                        {rows.length} rows × {columns.length} columns
                    </p>
                )}

                {tableData.caption && (
                    <p className="text-[9px] text-gray-500 italic border-t border-gray-100 pt-1 mt-1">{tableData.caption}</p>
                )}
            </div>
        );
    }

    // --- COMMENT TYPE (robust detection) ---
    if (isCommentPost(padlet)) {
        // Interactive comment list whenever the layout provides an update callback
        // (wall/columns/grid root-level posts — same wiring as container children below)
        if (onUpdateChildComments) {
            return (
                <div className="w-full max-w-full overflow-hidden pointer-events-auto">
                    <EmbeddedCommentList
                        comments={(padlet.metadata as any)?.comments || []}
                        badgeColor={(padlet.metadata as any)?.badgeColor}
                        currentUserId={currentUserId}
                        currentUserName={currentUserName}
                        currentUserAvatar={currentUserAvatar}
                        onSubmit={guardCommentMutation(accessMode, (text) => {
                            const newComment = {
                                id: `comment-${Date.now()}`,
                                text,
                                userId: currentUserId || 'anonymous',
                                userName: currentUserName || 'Anonymous',
                                userAvatar: currentUserAvatar,
                                timestamp: Date.now(),
                            };
                            const existingComments = (padlet.metadata as any)?.comments || [];
                            onUpdateChildComments(padlet.id, [...existingComments, newComment]);
                        })}
                        onEditComment={guardCommentMutation(accessMode, (commentId, newText) => {
                            const existingComments = (padlet.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                                c.id === commentId ? { ...c, text: newText } : c
                            );
                            onUpdateChildComments(padlet.id, updated);
                        })}
                        onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                            const existingComments = (padlet.metadata as any)?.comments || [];
                            const filtered = existingComments.filter((c: any) => c.id !== commentId);
                            onUpdateChildComments(padlet.id, filtered);
                        })}
                        onToggleStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                            const existingComments = (padlet.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                                c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                            );
                            onUpdateChildComments(padlet.id, updated);
                        })}
                        onColorChange={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                            const existingComments = (padlet.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                                c.id === commentId ? { ...c, textColor, backgroundColor } : c
                            );
                            onUpdateChildComments(padlet.id, updated);
                        })}
                        showComposer={true}
                        accessMode={accessMode}
                    />
                </div>
            );
        }

        // Read-only fallback (previews, slide renderer, contexts without a callback)
        // Always prioritize metadata.comments array
        const comments: Array<{ text?: string; content?: string; html?: string; message?: string }> =
            padlet.metadata?.comments ||
            (() => {
                try {
                    return JSON.parse(rawContent || "[]");
                } catch {
                    return [];
                }
            })();

        if (!comments.length) {
            return <div className="text-gray-400 italic text-xs">No comments</div>;
        }

        // Render ALL comments, not just the last one
        return (
            <div className="space-y-2">
                {comments.map((comment, idx) => {
                    const commentText = comment.text || comment.content || comment.html || comment.message || "";
                    const decoded = decodeHtmlEntities(commentText);
                    const hasHtml = looksLikeHtml(commentText) || looksLikeHtml(decoded);

                    return (
                        <div key={idx} className="text-xs text-gray-800">
                            {hasHtml ? (
                                <div
                                    className="prose prose-sm max-w-none break-words leading-relaxed"
                                    style={{ wordWrap: "break-word", overflowWrap: "break-word" }}
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(decoded) }}
                                />
                            ) : (
                                <span>{decoded || "Comment"}</span>
                            )}
                        </div>
                    );
                })}
                <div className="mt-1 text-[10px] text-gray-400">
                    {comments.length} comment{comments.length > 1 ? "s" : ""}
                </div>
            </div>
        );
    }

    // --- IMAGE TYPE --- (skip card/clipart posts – handled below)
    const isCardClipart = type === "card" && !!padlet.metadata?.svgUrl;
    // metadata.imageUrl must win over file_url in every context: file_url is
    // only ever set once, as a snapshot copy of metadata.imageUrl at post
    // creation (see CanvasClient's 'image' create payload) -- edits like
    // cropping only ever update metadata.imageUrl afterward, never file_url.
    // Reading file_url first (as this used to, outside canvasContext ===
    // "drawing") meant a post rendered here -- e.g. a container child, via
    // RowColumnContainerCard -- silently reverted to the pre-crop original
    // the moment it was dropped into a container, even though the crop was
    // saved correctly and displayed fine on the open canvas (which reads
    // metadata.imageUrl directly, with no file_url fallback at all).
    const imageSrc = isCardClipart ? null :
        (padlet.metadata?.imageUrl || padlet.file_url) ||
        padlet.metadata?.fileUrl ||
        (typeof padlet.content === "string" && padlet.content.startsWith("http") ? padlet.content : null);
    if (imageSrc) {
        const titleText = getMeaningfulImageTitle(padlet);
        const captionText = String(padlet.metadata?.caption ?? "").trim();
        const reactions = Array.isArray(padlet.metadata?.reactions) ? padlet.metadata.reactions : [];
        const detachedComments = Array.isArray((padlet.metadata as any)?.detachedComments)
            ? (padlet.metadata as any).detachedComments
            : [];
        const drawingOverlay = typeof (padlet.metadata as any)?.drawing === "string" ? (padlet.metadata as any).drawing : "";
        const captionStyle = (padlet.metadata?.captionStyle || {}) as Record<string, string | undefined>;
        const importOpenUrl = padlet.metadata?.source === 'import' ? padlet.metadata?.importOpenUrl : undefined;
        const isInContainer = !!(padlet.metadata as any)?.parentId;
        const useDrawingContainerImageBinding = canvasContext === "drawing" && isInContainer;
        const isDocThumbnail = (padlet.metadata as any)?.importKind === 'document';
        const providerLabel = (padlet.metadata as any)?.importProvider === 'google-drive' ? 'Google Drive' : 'OneDrive';
        // Same grid-crop treatment as the root-level Freeform card (see
        // FreeformPadletCards.tsx) -- Container/Map/Drawing-nested Image
        // posts must show the same effect, using the same shared constant.
        const isCropToGrid = (padlet.metadata as any)?.cropToGrid === true;
        return (
            <div
                className={`group/img relative flex flex-col ${isInContainer ? 'gap-0' : 'gap-2'} ${importOpenUrl ? 'cursor-pointer' : 'pointer-events-none'}`}
                onClick={importOpenUrl ? (e) => { e.stopPropagation(); window.open(importOpenUrl, '_blank', 'noopener,noreferrer'); } : undefined}
                title={importOpenUrl ? `Open in ${providerLabel}` : undefined}
            >
                <div className="relative">
                    <img
                        src={imageSrc}
                        className={isCropToGrid
                            ? "w-full object-cover bg-gray-50"
                            : isInContainer && !isDocThumbnail
                                ? "w-full h-auto object-contain bg-gray-50"
                                : "w-full object-contain bg-gray-50"
                        }
                        style={isCropToGrid
                            ? { height: `${IMAGE_CROP_TO_GRID_HEIGHT_PX}px` }
                            : isInContainer ? (isDocThumbnail ? { maxHeight: "200px" } : undefined) : { maxHeight: "200px" }}
                        alt="preview"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                    {useDrawingContainerImageBinding && drawingOverlay && (
                        <img
                            src={drawingOverlay}
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                            alt=""
                        />
                    )}
                </div>
                {importOpenUrl && (
                    <div className="absolute bottom-1 left-1 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium">
                            {providerLabel}
                        </span>
                    </div>
                )}
                {useDrawingContainerImageBinding && reactions.length > 0 && (
                    <div className={`px-1.5 pt-1 ${isInContainer ? '' : 'pb-1'}`}>
                        <ReactionDisplay reactions={reactions} />
                    </div>
                )}
                {useDrawingContainerImageBinding && (titleText || captionText) && (
                    <div className={isInContainer ? "px-1.5 py-1 space-y-1" : "space-y-1"}>
                        {titleText && (
                            <p className="text-xs font-medium text-center text-gray-600">{titleText}</p>
                        )}
                        {captionText && (
                            <p
                                className="text-[11px] text-center break-words"
                                style={{
                                    color: captionStyle.color || "#4B5563",
                                    backgroundColor: captionStyle.backgroundColor || "transparent",
                                    fontSize: captionStyle.fontSize,
                                    fontWeight: captionStyle.fontWeight as any,
                                    fontStyle: captionStyle.fontStyle,
                                    fontFamily: captionStyle.fontFamily,
                                    lineHeight: captionStyle.lineHeight,
                                }}
                            >
                                {captionText}
                            </p>
                        )}
                    </div>
                )}
                {!useDrawingContainerImageBinding && padlet.title && padlet.title !== "Image" && (
                    <p className={`text-xs font-medium text-center text-gray-600 ${isInContainer ? 'px-1.5 py-1' : ''}`}>{padlet.title}</p>
                )}
                {useDrawingContainerImageBinding && onUpdateChildComments && (
                    <div className="px-1.5 pb-1.5">
                        <EmbeddedCommentList
                            comments={detachedComments}
                            badgeColor={(padlet.metadata as any)?.badgeColor}
                            currentUserId={currentUserId}
                            currentUserName={currentUserName}
                            currentUserAvatar={currentUserAvatar}
                            onSubmit={guardCommentMutation(accessMode, (text) => {
                                const newComment = {
                                    id: `comment-${Date.now()}`,
                                    text,
                                    userId: currentUserId || 'anonymous',
                                    userName: currentUserName || 'Anonymous',
                                    userAvatar: currentUserAvatar,
                                    timestamp: Date.now(),
                                };
                                onUpdateChildComments(padlet.id, [...detachedComments, newComment], { field: "detachedComments" });
                            })}
                            onEditComment={guardCommentMutation(accessMode, (commentId, newText) => {
                                const updated = detachedComments.map((comment: any) =>
                                    comment.id === commentId ? { ...comment, text: newText } : comment
                                );
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            })}
                            onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                                const updated = detachedComments.filter((comment: any) => comment.id !== commentId);
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            })}
                            onToggleStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                                const updated = detachedComments.map((comment: any) =>
                                    comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                                );
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            })}
                            onColorChange={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                                const updated = detachedComments.map((comment: any) =>
                                    comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                                );
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            })}
                            showComposer={true}
                            accessMode={accessMode}
                        />
                    </div>
                )}
            </div>
        );
    }

    // --- DRAWING TYPE ---
    if (type === "drawing") {
        const previewUrl = padlet.metadata?.previewUrl;

        return (
            <div
                className="flex flex-col items-center justify-center gap-2 text-red-600 bg-red-50/50 border border-red-100 border-dashed overflow-hidden min-h-[100px] cursor-zoom-in group/drawing-preview"
                onClick={(e) => {
                    e.stopPropagation();
                    // A drag that ends back over this element still fires a
                    // native click afterward -- without this guard, moving
                    // the card would also pop the viewer open right after.
                    if (isDragging) return;
                    onView?.();
                }}
                title="Click to view full size"
            >
                {previewUrl ? (
                    // draggable=false -- <img> is natively drag-and-drop-able
                    // in every browser. Without this, pressing down on the
                    // preview and moving the mouse starts the browser's own
                    // native image drag (a ghost thumbnail follows the
                    // cursor) instead of this canvas's own mousedown/
                    // mousemove drag system, which never sees the
                    // continuation of the gesture -- the card silently fails
                    // to move. Only reachable by clicking the drawing's own
                    // preview area; the surrounding card margin was never
                    // affected since it isn't an <img>.
                    <img src={previewUrl} alt="Drawing preview" className="w-full h-auto object-contain max-h-[300px]" draggable={false} />
                ) : (
                    <>
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mt-4">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                                <path d="M2 2l7.5 1.5"></path>
                                <path d="M7 11l5-5"></path>
                            </svg>
                        </div>
                        <span className="text-[10px] font-medium text-red-700">Drawing</span>
                        <span className="text-[9px] text-red-500 italic mb-4">Click to view or edit</span>
                    </>
                )}
            </div>
        );
    }

    // --- CONTAINER TYPE ---
    if (type === "container") {
        const childIds = padlet.metadata?.childPadletIds || [];
        const children = allPadlets.filter((p) => childIds.includes(p.id));
        // This Container's OWN per-child title settings -- independent of
        // any outer Container this Container might itself be nested inside
        // (see RowColumnContainerCard's renderChildTitle, which controls
        // whether THIS container's own title is shown as a child of that
        // outer one).
        const visibleChildTitleIds = getEffectiveVisibleChildTitleIds(padlet.metadata as any, children);
        const renderChildTitle = (child: Padlet) => {
            const childTitle = resolveVisibleChildTitle(visibleChildTitleIds, child);
            if (!childTitle) return null;
            return (
                <div data-child-title-header="true" className="px-1.5 pt-1.5 pb-1 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-800 truncate block">{childTitle}</span>
                </div>
            );
        };

        return (
            <div className="space-y-3 pointer-events-none select-none">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-xs font-bold text-gray-800">{padlet.title || "Container"}</h4>
                </div>

                {rawContent && <p className="text-[10px] text-gray-500 line-clamp-2">{rawContent}</p>}

                <div className="space-y-2 mt-2">
                    {children.length > 0 ? (
                        // PATCH 9E.1: same scrollbar-lane fix as
                        // RowColumnContainerCard's child list -- this nested
                        // "Container-as-child" preview is always in the
                        // `overflow-y-auto` state (no expand toggle here),
                        // so `scrollbar-gutter: stable` makes the reservation
                        // constant whether or not this instance's content
                        // currently exceeds 260px, and
                        // `nestedContainerScrollbarLane` (measured by
                        // useScrollbarLane -- replaces PATCH 9E's guessed 6px
                        // constant) is this viewport's OWN real reservation in
                        // pixels, pushed into an outside lane via
                        // `calc(100% + Npx)` width / `-Npx` margin instead of
                        // shrinking the child cards. `pr-1` is unchanged.
                        <div
                            ref={nestedContainerScrollRef}
                            className="max-h-[260px] overflow-y-auto overflow-x-hidden pr-1 space-y-2 scrollbar-ultrathin"
                            style={{
                                scrollbarGutter: "stable",
                                width: `calc(100% + ${nestedContainerScrollbarLane}px)`,
                                marginRight: `-${nestedContainerScrollbarLane}px`,
                            }}
                        >
                            {children.map((child) => {
                                // Robust comment detection (type OR metadata.comments)
                                const isCommentType = isCommentPost(child);

                                // Render interactive EmbeddedCommentList for comment-type children (same as column/row canvas)
                                if (isCommentType && onUpdateChildComments) {
                                    return (
                                        <div key={child.id} className="w-full max-w-full overflow-hidden pointer-events-auto">
                                            {renderChildTitle(child)}
                                            <EmbeddedCommentList
                                                comments={(child.metadata as any)?.comments || []}
                                                badgeColor={(child.metadata as any)?.badgeColor}
                                                currentUserId={currentUserId}
                                                currentUserName={currentUserName}
                                                currentUserAvatar={currentUserAvatar}
                                                onSubmit={guardCommentMutation(accessMode, (text) => {
                                                    const newComment = {
                                                        id: `comment-${Date.now()}`,
                                                        text,
                                                        userId: currentUserId || 'anonymous',
                                                        userName: currentUserName || 'Anonymous',
                                                        userAvatar: currentUserAvatar,
                                                        timestamp: Date.now(),
                                                    };
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    onUpdateChildComments(child.id, [...existingComments, newComment]);
                                                })}
                                                onEditComment={guardCommentMutation(accessMode, (commentId, newText) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const updated = existingComments.map((c: any) =>
                                                        c.id === commentId ? { ...c, text: newText } : c
                                                    );
                                                    onUpdateChildComments(child.id, updated);
                                                })}
                                                onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const filtered = existingComments.filter((c: any) => c.id !== commentId);
                                                    onUpdateChildComments(child.id, filtered);
                                                })}
                                                onToggleStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const updated = existingComments.map((c: any) =>
                                                        c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                                                    );
                                                    onUpdateChildComments(child.id, updated);
                                                })}
                                                onColorChange={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const updated = existingComments.map((c: any) =>
                                                        c.id === commentId ? { ...c, textColor, backgroundColor } : c
                                                    );
                                                    onUpdateChildComments(child.id, updated);
                                                })}
                                                showComposer={true}
                                                accessMode={accessMode}
                                            />
                                        </div>
                                    );
                                }

                                // Default: render other children using PostCardContent
                                const childCardChrome = resolveChildCardChrome(child);
                                return (
                                    <div
                                        key={child.id}
                                        className="relative border border-gray-100 shadow-sm overflow-hidden"
                                        style={{ backgroundColor: childCardChrome.backgroundColor }}
                                    >
                                        {childCardChrome.topStripColor && (
                                            <div className="h-1.5 w-full" style={{ backgroundColor: childCardChrome.topStripColor }} />
                                        )}
                                        {renderChildTitle(child)}
                                        <div className="p-3">
                                            <PostCardContent
                                                padlet={child}
                                                allPadlets={allPadlets}
                                                onScan={onScan}
                                                onView={onView}
                                                canvasContext={canvasContext}
                                                currentUserId={currentUserId}
                                                currentUserName={currentUserName}
                                                currentUserAvatar={currentUserAvatar}
                                                onUpdateChildComments={onUpdateChildComments}
                                                accessMode={accessMode}
                                                onOpenDocument={onOpenDocument}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[9px] text-gray-400 italic">Empty container</p>
                    )}
                </div>

                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                    <span className="text-[9px] font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                        {children.length} {children.length === 1 ? "item" : "items"}
                    </span>

                    {children.length > 0 && (
                        <div className="flex -space-x-1">
                            {[...Array(Math.min(children.length, 3))].map((_, i) => (
                                <div key={i} className="w-3 h-3 rounded-full bg-gray-200 border border-white" />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- CARD / CLIPART TYPE ---
    if (type === "card" && padlet.metadata?.svgUrl) {
        const svgUrl = padlet.metadata.svgUrl;
        const iconBgColor = padlet.metadata?.iconBgColor || '#f8f9fa';
        const textColor = padlet.metadata?.textColor || '#1F2937';
        return (
            <ClipartCardContent
                svgUrl={svgUrl}
                title={hideOwnTitle ? undefined : padlet.title}
                iconBgColor={iconBgColor}
                textColor={textColor}
            />
        );
    }

    if (isDocumentPost(padlet) && onOpenDocument) {
        return (
            <div className="relative h-full w-full">
                <DocumentCardContent content={DOMPurify.sanitize(decodeHtmlEntities(rawContent || ""))} textColor={padlet.metadata?.textColor} onRead={onOpenDocument} />
            </div>
        );
    }

    // --- AI COMPONENT TYPE ---
    if (type === "ai-component") {
        const aiContent = extractAIContentFromPadletMetadata(padlet.metadata);
        return <VisibleAIContent content={aiContent} />;
    }

    // --- TEXT / DEFAULT TYPE ---
    return (
        <div className="select-none pointer-events-none">
            <div
                className="text-xs prose prose-sm break-words tiptap"
                style={{
                    wordWrap: "break-word",
                    overflowWrap: "break-word",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 12,
                    WebkitBoxOrient: "vertical",
                    color: padlet.metadata?.textColor || "#1F2937",
                }}
                dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                        isStructuredRichTextHtml(rawContent || "") ? (rawContent || "") : decodeHtmlEntities(rawContent || ""),
                    ),
                }}
            />
            <KnowledgeSourceMarker padletId={padlet.id} noteContent={padlet.content} />
        </div>
    );
}

/**
 * P6J-F8-B2 -- height, not payload: the domain layer caps how much stored quote
 * reaches the DOM at all, and this caps how much of it the card spends space on.
 */
const SOURCE_EXCERPT_CLAMP: React.CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
};

/**
 * P6J-F6-B2 -- the card's provenance marker.
 *
 * Deliberately NON-INTERACTIVE. It lives inside the TEXT/DEFAULT wrapper's
 * `pointer-events-none` region, which is load-bearing for canvas drag: making
 * this clickable would swallow the drag gesture on every source-linked Note.
 * The clickable affordance lives in the Note editor instead.
 *
 * Renders nothing when the Note has no references -- including when the
 * reference read failed, since that yields an empty index.
 *
 * Exported (P6J-F6-B2H) so the freeform renderer, which hand-writes its own
 * generic/Note markup instead of routing through PostCardContent, mounts this
 * SAME marker rather than growing a second formatting implementation.
 *
 * P6J-F8-B2 renders the source excerpt as a SIBLING above it, never a child: the
 * marker's own text stays exactly its label, and the excerpt stays display-only
 * text that no editor, save payload or Note body ever sees.
 *
 * KNI-R1-F/G/I. `noteContent` is the caller's OWN stored Note body, passed
 * through untransformed: this component makes no eligibility decision of its
 * own from it, and delegates entirely to the one shared domain rule so a
 * post-R1 Note's editable body and this excerpt can never both render the
 * same passage.
 */
export function KnowledgeSourceMarker({ padletId, noteContent }: { padletId: string; noteContent: string }) {
    const references = useKnowledgeSourceReferencesForPadlet(padletId);
    const label = knowledgeSourceCardLabel(references);
    const excerpt = knowledgeSourceCardExcerpt(references, noteContent);
    const crop = getKnowledgeSourceCardRegionCrop(references);
    if (label === null) return null;

    return (
        <>
            {crop && <KnowledgeSourceRegionCrop referenceId={crop.referenceId} />}
            {excerpt && (
                <div
                    data-knowledge-source-excerpt="true"
                    className="mt-1.5 overflow-hidden break-words border-l-2 border-gray-200 pl-1.5 text-[10px] italic leading-snug text-gray-500"
                    style={SOURCE_EXCERPT_CLAMP}
                >
                    {excerpt.text}
                </div>
            )}
            <div
                data-knowledge-source-marker="true"
                className="mt-1.5 flex items-center gap-1 text-[10px] leading-none text-gray-400"
                title={label}
            >
                <BookOpen className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
            </div>
        </>
    );
}
