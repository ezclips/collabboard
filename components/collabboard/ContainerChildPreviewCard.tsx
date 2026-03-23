"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

import React, { useMemo } from "react";
import {
    X,
    Play,
    CornerRightUp,
} from "lucide-react";
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
import type { Padlet } from "@/types/collabboard";
import { buildYouTubeThumbCandidates, extractYouTubeId } from "@/lib/media/youtubeThumb";

type Props = {
    padlet: Padlet;
    onRemove?: () => void;
    onDetach?: () => void;
    containerType?: 'freeform' | 'layout';
    className?: string;
};

function normalizeType(t: unknown): string {
    return String(t ?? "").trim().toLowerCase();
}

function asString(v: unknown): string {
    if (typeof v === "string") return v;
    if (v == null) return "";
    try {
        return String(v);
    } catch {
        return "";
    }
}

function isCommentPost(padlet: any): boolean {
    const type = normalizeType(padlet?.type);
    const comments = padlet?.metadata?.comments;
    return type === "comment" || Array.isArray(comments);
}

function getHost(url: string): string {
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        return u.hostname.replace(/^www\./, "");
    } catch {
        return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || url;
    }
}

function isLikelyVideoUrl(url: string): boolean {
    const u = url.toLowerCase();
    return (
        u.includes("youtube.com/") ||
        u.includes("youtu.be/") ||
        u.includes("vimeo.com/") ||
        u.includes("tiktok.com/") ||
        u.includes("x.com/") ||
        u.includes("twitter.com/") ||
        u.includes("instagram.com/") ||
        u.includes("facebook.com/") ||
        u.includes("fb.watch/") ||
        u.includes("twitch.tv/") ||
        u.includes("kick.com/") ||
        u.includes("rumble.com/") ||
        u.includes("dailymotion.com/") ||
        u.includes("loom.com/")
    );
}

function pickAllCommentsPreview(p: Padlet): { preview: string; count: number } {
    const comments = Array.isArray((p as any)?.metadata?.comments) ? (p as any).metadata.comments : [];
    const count = comments.length;
    if (!count) return { preview: "", count: 0 };

    // Concatenate all comments with line breaks for full preview
    const allComments = comments
        .map((comment: any) => {
            const text =
                asString(comment?.text).trim() ||
                asString(comment?.content).trim() ||
                asString(comment?.html).trim() ||
                asString(comment?.message).trim() ||
                "";
            return text;
        })
        .filter(Boolean)
        .join("\n\n");

    return { preview: allComments, count };
}

function getImageSrc(p: Padlet): string {
    const anyP = p as any;
    return (
        asString(anyP.file_url).trim() ||
        asString(anyP.metadata?.imageUrl).trim() ||
        asString(anyP.metadata?.fileUrl).trim() ||
        (typeof anyP.content === "string" && anyP.content.startsWith("http") ? anyP.content : "") ||
        ""
    );
}

export default function ContainerChildPreviewCard({
    padlet,
    onRemove,
    onDetach,
    containerType,
    className,
}: Props) {
    const type = normalizeType(padlet.type);

    // ✅ Robust comment detection (fixes "Comment renders as Note")
    const isComment = isCommentPost(padlet);

    const meta = (padlet as any)?.metadata ?? {};
    const svgUrl = asString(meta?.svgUrl).trim();

    // Link metadata (works for ANY social media if your link-scraper populates it)
    const linkUrl = asString(meta?.linkUrl).trim() || asString(padlet.content).trim();
    const linkTitle = asString(meta?.linkTitle).trim();
    const linkDomain = asString(meta?.linkDomain).trim() || (linkUrl ? getHost(linkUrl) : "");
    const linkDesc = asString(meta?.linkDescription).trim();
    const linkImageRaw = asString(meta?.linkImage).trim();
    const linkFavicon = asString(meta?.linkFavicon).trim();

    const youtubeId = extractYouTubeId(linkUrl) || extractYouTubeId(linkImageRaw);
    const youtubeThumbCandidates = youtubeId ? buildYouTubeThumbCandidates(youtubeId) : [];
    const linkImageCandidates = linkImageRaw
        ? [linkImageRaw, ...youtubeThumbCandidates.filter((candidate) => candidate !== linkImageRaw)]
        : youtubeThumbCandidates;
    const linkImage = linkImageCandidates[0] || "";

    const showVideoBadge = type === "link" && linkUrl && isLikelyVideoUrl(linkUrl);

    // Todo
    const tasks = Array.isArray(meta?.tasks) ? meta.tasks : [];

    // Image
    const imageSrc = getImageSrc(padlet);

    // Drawing preview
    const drawingPreview = asString(meta?.previewUrl).trim();

    const { preview: commentPreview, count: commentCount } = useMemo(
        () => (isComment ? pickAllCommentsPreview(padlet) : { preview: "", count: 0 }),
        [isComment, padlet]
    );

    return (
        <div className={`relative rounded-lg border bg-white shadow-sm ${className ?? ""}`}>
            <div className={`absolute left-0 top-0 h-full w-1 rounded-l-lg ${isComment ? "bg-yellow-400" : "bg-orange-400"}`} />

            <div className="flex items-start gap-3 p-3 pl-4">
                <div className="min-w-0 flex-1">
                    {/* ========= LINK PREVIEW (all social/video/etc.) ========= */}
                    {type === "link" && !isComment && (
                        <div className="mt-2 space-y-2">
                            {linkImage && (
                                <div className="relative overflow-hidden rounded-md border bg-gray-50">
                                    <img
                                        src={linkImage}
                                        alt=""
                                        className="h-28 w-full object-cover"
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
                                    {showVideoBadge && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
                                                <Play className="h-5 w-5 text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex min-w-0 items-start gap-2">
                                {linkFavicon ? (
                                    <img
                                        src={linkFavicon}
                                        alt=""
                                        className="mt-0.5 h-4 w-4 rounded"
                                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                    />
                                ) : (
                                    <div className="mt-0.5 h-4 w-4 rounded bg-gray-100" />
                                )}

                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium text-blue-700">
                                        {linkTitle || linkUrl || "Untitled link"}
                                    </div>
                                    <div className="truncate text-[11px] text-gray-500">{linkDomain || linkUrl}</div>
                                    {linkDesc && <div className="mt-1 line-clamp-2 text-[11px] text-gray-600">{linkDesc}</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========= IMAGE PREVIEW ========= */}
                    {type === "image" && !isComment && (
                        <div className="mt-2 space-y-2">
                            {imageSrc ? (
                                <div className="overflow-hidden rounded-md border bg-gray-50">
                                    <img
                                        src={imageSrc}
                                        alt=""
                                        className="h-24 w-full object-cover"
                                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                    />
                                </div>
                            ) : (
                                <div className="text-[12px] text-gray-500">No image source</div>
                            )}
                        </div>
                    )}

                    {/* ========= DRAWING PREVIEW ========= */}
                    {type === "drawing" && !isComment && (
                        <div className="mt-2 space-y-2">
                            {drawingPreview ? (
                                <div className="overflow-hidden rounded-md border bg-gray-50">
                                    <img
                                        src={drawingPreview}
                                        alt=""
                                        className="h-24 w-full object-contain"
                                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                    />
                                </div>
                            ) : (
                                <div className="text-[12px] text-gray-500">Click to view drawing</div>
                            )}
                        </div>
                    )}

                    {/* ========= CARD (ICON) PREVIEW ========= */}
                    {type === "card" && !isComment && (
                        <div className="mt-2 space-y-2">
                            {svgUrl ? (
                                <div className="flex h-20 w-full items-center justify-center rounded-md border bg-gray-50">
                                    <img
                                        src={svgUrl}
                                        alt=""
                                        className="h-10 w-10 object-contain"
                                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                    />
                                </div>
                            ) : (
                                <div className="text-[12px] text-gray-500">No icon</div>
                            )}
                        </div>
                    )}

                    {/* ========= TABLE PREVIEW (placeholder) ========= */}
                    {type === "table" && !isComment && (
                        <div className="mt-2">
                            <SafeHtmlContent
                                content={padlet.title || "Table"}
                                className="block text-xs text-gray-700 line-clamp-1"
                                mode="text"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">Table content</div>
                        </div>
                    )}

                    {/* ========= TODO PREVIEW ========= */}
                    {type === "todo" && !isComment && (
                        <div className="mt-2 space-y-1">
                            {tasks.length ? (
                                <>
                                    {tasks.slice(0, 3).map((t: any) => (
                                        <div key={asString(t.id)} className="flex items-start gap-2 text-[12px] text-gray-700">
                                            <span className="mt-0.5 inline-block h-3 w-3 rounded border border-gray-300 bg-white" />
                                            <span className={`min-w-0 flex-1 truncate ${t.completed ? "line-through text-gray-400" : ""}`}>
                                                {asString(t.text)}
                                            </span>
                                        </div>
                                    ))}
                                    {tasks.length > 3 && <div className="text-[11px] text-gray-500">+{tasks.length - 3} more</div>}
                                </>
                            ) : (
                                <div className="text-[12px] text-gray-500">No tasks</div>
                            )}
                        </div>
                    )}

                    {/* ========= COMMENT PREVIEW ========= */}
                    {isComment && (
                        <div className="mt-2">
                            <SafeHtmlContent
                                content={commentPreview || ""}
                                className="block text-xs text-gray-700 line-clamp-3"
                                mode="auto"
                            />
                            {commentCount > 0 && (
                                <div className="mt-2 text-[11px] text-gray-500">
                                    {commentCount} comment{commentCount === 1 ? "" : "s"}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========= DEFAULT TEXT PREVIEW ========= */}
                    {!isComment && !["link", "todo", "image", "table", "drawing", "card"].includes(type) && (
                        <div className="mt-2">
                            <SafeHtmlContent
                                content={padlet.content}
                                className="block text-xs text-gray-700 line-clamp-3"
                                mode="auto"
                            />
                        </div>
                    )}
                </div>

                {/* Detach button for Freeform */}
                {containerType === 'freeform' && onDetach && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDetach();
                        }}
                        className="rounded-md p-1 text-blue-400 hover:bg-blue-50 hover:text-blue-600"
                        aria-label="Detach from container"
                        title="Detach from container"
                    >
                        <CornerRightUp className="h-4 w-4" />
                    </button>
                )}

                {/* Remove button for Layout */}
                {containerType !== 'freeform' && onRemove && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                        aria-label="Remove"
                        title="Remove"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
