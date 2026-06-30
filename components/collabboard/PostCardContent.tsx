"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

import React, { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Padlet } from "@/types/collabboard";
import LinkMediaEmbed, { getLinkEmbedKind } from "./LinkMediaEmbed";
import EmbeddedCommentList from "./EmbeddedCommentList";
import ReactionDisplay from "./editors/ReactionDisplay";
import { buildYouTubeThumbCandidates, extractYouTubeId } from "@/lib/media/youtubeThumb";
import AIContentRenderer from "@/components/ai/AIContentRenderer";
import { extractAIContentFromPadletMetadata } from "@/lib/ai/normalize-ai-content";

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
}

// Decode HTML entities that may have been escaped
function decodeHtmlEntities(text: string): string {
    if (typeof document === "undefined") return text;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
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
}: PostCardContentProps) {
    const supabase = createClientComponentClient();

    const type = normalizeType(padlet.type);
    const rawContent = asStringContent(padlet.content);

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
                {padlet.metadata.todoTitle && (
                    <h4 className="text-xs font-semibold text-gray-800 mb-1">{padlet.metadata.todoTitle}</h4>
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

                                    const updatedTasks =
                                        padlet.metadata?.tasks?.map((t: { id: string; completed: boolean }) =>
                                            t.id === task.id ? { ...t, completed: !t.completed } : t
                                        ) || [];

                                    const updatedMetadata = { ...padlet.metadata, tasks: updatedTasks };

                                    try {
                                        const { error } = await supabase
                                            .from("padlets")
                                            .update({
                                                content: JSON.stringify(updatedTasks),
                                                metadata: updatedMetadata,
                                                updated_at: new Date().toISOString(),
                                            })
                                            .eq("id", padlet.id);

                                        if (error) throw error;
                                        onScan?.();
                                    } catch (err) {
                                        console.error("Failed to toggle task:", err);
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

        const getCellStyle = (rowIndex: number, colIndex: number): CellStyle => {
            const key = `${rowIndex}-${colIndex}`;
            return cellStyles[key] || {};
        };

        return (
            <div className="space-y-1 select-none">
                <h4 className="text-xs font-semibold text-gray-800 mb-1">{padlet.title || "Table"}</h4>

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
                                    dangerouslySetInnerHTML={{ __html: decoded }}
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
    const imageSrc = isCardClipart ? null :
        (canvasContext === "drawing"
            ? padlet.metadata?.imageUrl || padlet.file_url
            : padlet.file_url || padlet.metadata?.imageUrl
        ) ||
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
        return (
            <div
                className={`group/img relative flex flex-col ${isInContainer ? 'gap-0' : 'gap-2'} ${importOpenUrl ? 'cursor-pointer' : 'pointer-events-none'}`}
                onClick={importOpenUrl ? (e) => { e.stopPropagation(); window.open(importOpenUrl, '_blank', 'noopener,noreferrer'); } : undefined}
                title={importOpenUrl ? `Open in ${providerLabel}` : undefined}
            >
                <div className="relative">
                    <img
                        src={imageSrc}
                        className={isInContainer && !isDocThumbnail
                            ? "w-full h-auto object-contain bg-gray-50"
                            : "w-full object-contain bg-gray-50"
                        }
                        style={isInContainer ? (isDocThumbnail ? { maxHeight: "200px" } : undefined) : { maxHeight: "200px" }}
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
                            onSubmit={(text) => {
                                const newComment = {
                                    id: `comment-${Date.now()}`,
                                    text,
                                    userId: currentUserId || 'anonymous',
                                    userName: currentUserName || 'Anonymous',
                                    userAvatar: currentUserAvatar,
                                    timestamp: Date.now(),
                                };
                                onUpdateChildComments(padlet.id, [...detachedComments, newComment], { field: "detachedComments" });
                            }}
                            onEditComment={(commentId, newText) => {
                                const updated = detachedComments.map((comment: any) =>
                                    comment.id === commentId ? { ...comment, text: newText } : comment
                                );
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            }}
                            onRemoveComment={(commentId) => {
                                const updated = detachedComments.filter((comment: any) => comment.id !== commentId);
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            }}
                            onToggleStrikethrough={(commentId) => {
                                const updated = detachedComments.map((comment: any) =>
                                    comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                                );
                                onUpdateChildComments(padlet.id, updated, { field: "detachedComments" });
                            }}
                            showComposer={true}
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
                    onView?.();
                }}
                title="Click to view full size"
            >
                {previewUrl ? (
                    <img src={previewUrl} alt="Drawing preview" className="w-full h-auto object-contain max-h-[300px]" />
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

        return (
            <div className="space-y-3 pointer-events-none select-none">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-xs font-bold text-gray-800">{padlet.title || "Container"}</h4>
                </div>

                {rawContent && <p className="text-[10px] text-gray-500 line-clamp-2">{rawContent}</p>}

                <div className="space-y-2 mt-2">
                    {children.length > 0 ? (
                        <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2 scrollbar-ultrathin">
                            {children.map((child) => {
                                // Robust comment detection (type OR metadata.comments)
                                const isCommentType = isCommentPost(child);

                                // Render interactive EmbeddedCommentList for comment-type children (same as column/row canvas)
                                if (isCommentType && onUpdateChildComments) {
                                    return (
                                        <div key={child.id} className="w-full max-w-full overflow-hidden pointer-events-auto">
                                            <EmbeddedCommentList
                                                comments={(child.metadata as any)?.comments || []}
                                                badgeColor={(child.metadata as any)?.badgeColor}
                                                currentUserId={currentUserId}
                                                currentUserName={currentUserName}
                                                currentUserAvatar={currentUserAvatar}
                                                onSubmit={(text) => {
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
                                                }}
                                                onEditComment={(commentId, newText) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const updated = existingComments.map((c: any) =>
                                                        c.id === commentId ? { ...c, text: newText } : c
                                                    );
                                                    onUpdateChildComments(child.id, updated);
                                                }}
                                                onRemoveComment={(commentId) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const filtered = existingComments.filter((c: any) => c.id !== commentId);
                                                    onUpdateChildComments(child.id, filtered);
                                                }}
                                                showComposer={true}
                                            />
                                        </div>
                                    );
                                }

                                // Default: render other children using PostCardContent
                                const childTopStrip = (child.metadata as any)?.topStrip;
                                return (
                                    <div
                                        key={child.id}
                                        className="relative border border-gray-100 shadow-sm overflow-hidden"
                                        style={{ backgroundColor: (child.metadata as any)?.cardColor || "#ffffff" }}
                                    >
                                        {childTopStrip && childTopStrip !== "transparent" && (
                                            <div className="h-1.5 w-full" style={{ backgroundColor: childTopStrip }} />
                                        )}
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
                title={padlet.title}
                iconBgColor={iconBgColor}
                textColor={textColor}
            />
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
                dangerouslySetInnerHTML={{ __html: decodeHtmlEntities(rawContent || "") }}
            />
        </div>
    );
}
