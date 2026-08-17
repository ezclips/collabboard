"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

import PostCardContent from "./PostCardContent";
import CardPreview from "./CardPreview";
import EmbeddedCommentList from "./EmbeddedCommentList";
import type { Padlet } from "@/types/collabboard";
import { guardCommentMutation, type CommentAccessMode } from "@/lib/domain/canvas/comments";
import { getEffectiveVisibleChildTitleIds, resolveVisibleChildTitle } from "@/lib/infra/collabboard/containerChildTitleVisibility";
import { resolveChildCardChrome } from "@/lib/domain/canvas/documentPost";
import { useScrollbarLane } from "./useScrollbarLane";
import { resolveContainerChildren, type ContainerOrientation } from "@/lib/domain/canvas/containerModel";

const DEFAULT_IGNORE_KINDS = new Set(["columns-container-move"]);

// Helper functions for robust comment detection
function normalizeType(t: unknown): string {
  return String(t ?? "").trim().toLowerCase();
}

function isCommentPost(padlet: any): boolean {
  const type = normalizeType(padlet?.type);
  const comments = padlet?.metadata?.comments;
  if (type === "comment") return true;
  // Legacy fallback: treat as comment only when type is missing/unknown.
  if (!type && Array.isArray(comments)) return true;
  return false;
}

function sanitizeLibraryMetadata(meta?: Record<string, any>) {
  if (!meta) return {};
  const next = { ...meta };
  delete next.parentId;
  delete next.childPadletIds;
  delete next.sectionId;
  delete next.sectionPosition;
  delete next.position_in_timeline;
  delete next.wallPosition;
  return next;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim();
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function getContrastTextColor(bgColor: string): '#0f172a' | '#f8fafc' {
  const rgb = hexToRgb(bgColor);
  if (!rgb) return '#0f172a';
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  return luminance > 0.45 ? '#0f172a' : '#f8fafc';
}

type RowColumnContainerCardProps = {
  padlet: Padlet;
  allPadlets: Padlet[];
  onDropExistingPadlet?: (containerId: string, droppedId: string) => void;
  onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void;
  ignoreDragKinds?: string[];
  onViewDrawing?: (padlet: Padlet) => void;
  className?: string;
  canvasContext?: "default" | "drawing" | "timeline";
  // Comment handling
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
  onEditContainer?: (padlet: Padlet) => void;
  onScanChild?: () => void;
  emptyStateText?: string;
  showHeader?: boolean;
  disableInternalScroll?: boolean;
  forceExpandToggle?: boolean;
  onExpandAvailabilityChange?: (available: boolean) => void;
  // Controlled expand mode: parent (CardShell strip button) manages expand state
  isExpanded?: boolean;
  // Content-only mode: parent CardShell provides the outer shell styling
  isContentOnly?: boolean;
  onOpenDocument?: (post: Padlet) => void;
  // PATCH 8AD: gates every embedded child CommentPopup/EmbeddedCommentList
  // mutation reachable from this card. Defaults to 'manage' so every
  // pre-existing caller (tests, previews) keeps today's behavior unchanged.
  accessMode?: CommentAccessMode;
  orientation?: ContainerOrientation;
  onRequiredWidthChange?: (requiredWidth: number) => void;
  // PATCH POST-RESIZE-B3.1.2: a SEPARATE, non-ratcheted signal for the
  // manual-resize handle's minimum -- see the effect below for why
  // `onRequiredWidthChange` (frozen for auto-grow) cannot be reused here.
  onIntrinsicRequiredWidthChange?: (width: number) => void;
};

export default function RowColumnContainerCard({
  padlet,
  allPadlets,
  onDropExistingPadlet,
  onDropDraftIntoContainer,
  ignoreDragKinds = [],
  onViewDrawing,
  className,
  canvasContext = "default",
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
  onEditContainer,
  onScanChild,
  emptyStateText = "Drop posts here",
  showHeader = true,
  disableInternalScroll = false,
  forceExpandToggle = false,
  onExpandAvailabilityChange,
  isExpanded: controlledIsExpanded,
  isContentOnly = false,
  onOpenDocument,
  accessMode = 'manage',
  orientation = 'vertical',
  onRequiredWidthChange,
  onIntrinsicRequiredWidthChange,
}: RowColumnContainerCardProps) {
  const COLLAPSED_SCROLL_MAX_HEIGHT = 300;
  const [localIsExpanded, setLocalIsExpanded] = useState(false);
  const [openCommentsChildId, setOpenCommentsChildId] = useState<string | null>(null);
  const [hasExpandableOverflow, setHasExpandableOverflow] = useState(false);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const containerMeasureRef = useRef<HTMLDivElement>(null);
  const lastReportedWidthRef = useRef(0);
  const lastReportedIntrinsicWidthRef = useRef<number | null>(null);
  const isControlled = controlledIsExpanded !== undefined;
  const isExpanded = isControlled ? controlledIsExpanded : localIsExpanded;
  const shouldEnableInternalScroll = !disableInternalScroll && !isExpanded;
  const isHorizontal = orientation === 'horizontal';
  // PATCH 9E.1: replaces PATCH 9E's guessed 6px constant -- measures this
  // viewport's OWN real scrollbar/gutter reservation (0 on platforms whose
  // scrollbar takes no layout space) instead of approximating it.
  const scrollbarLane = useScrollbarLane(contentMeasureRef, shouldEnableInternalScroll);
  const backgroundColor = typeof (padlet.metadata as any)?.cardColor === 'string' && (padlet.metadata as any)?.cardColor
    ? (padlet.metadata as any).cardColor
    : '#ffffff';
  const textColor = getContrastTextColor(backgroundColor);
  const mutedTextColor = textColor === '#f8fafc' ? 'rgba(248,250,252,0.82)' : 'rgba(15,23,42,0.68)';
  const badgeBg = textColor === '#f8fafc' ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)';
  const containerMetadata = (padlet.metadata ?? {}) as Record<string, unknown>;
  const childPadlets = resolveContainerChildren(padlet, allPadlets);
  const childIds = Array.isArray(containerMetadata.childPadletIds)
    ? containerMetadata.childPadletIds.filter((id): id is string => typeof id === "string")
    : [];

  // Per-Container, per-child display setting (default hidden, preserving
  // today's appearance for every existing Container): each child's own
  // title independently renders above its content here when enabled for
  // THIS Container. This is the single, shared Container-child renderer
  // reused by every layout (Freeform, Wall, Row/Column, Drawing, Map,
  // Chrono), so the setting lives on the Container's own metadata rather
  // than duplicated per layout -- and never on the child's own metadata,
  // since the same child moved to a different Container must not carry this
  // Container-specific preference with it.
  const visibleChildTitleIds = getEffectiveVisibleChildTitleIds(containerMetadata, childPadlets);
  const renderChildTitle = (child: Padlet) => {
    const title = resolveVisibleChildTitle(visibleChildTitleIds, child);
    if (!title) return null;
    return (
      <div data-child-title-header="true" className="px-1.5 pt-1.5 pb-1 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-800 truncate block">{title}</span>
      </div>
    );
  };

  // Total comments across children: comment-type posts store metadata.comments,
  // post comments added via editors store metadata.detachedComments
  const totalChildComments = childPadlets.reduce((sum, child) => {
    const meta = (child.metadata ?? {}) as Record<string, unknown>;
    const comments = Array.isArray(meta.comments) ? meta.comments.length : 0;
    const detached = Array.isArray(meta.detachedComments) ? meta.detachedComments.length : 0;
    return sum + comments + detached;
  }, 0);

  const dropEnabled = Boolean(onDropExistingPadlet || onDropDraftIntoContainer);
  const ignoredKinds = new Set([...DEFAULT_IGNORE_KINDS, ...ignoreDragKinds]);
  const showExpandToggle = !disableInternalScroll && childPadlets.length > 0 && (forceExpandToggle || hasExpandableOverflow);

  useEffect(() => {
    if (disableInternalScroll) {
      setHasExpandableOverflow(false);
      onExpandAvailabilityChange?.(false);
      return;
    }

    const el = contentMeasureRef.current;
    if (!el) {
      setHasExpandableOverflow(false);
      onExpandAvailabilityChange?.(false);
      return;
    }

    const updateOverflowState = () => {
      const nextHasOverflow = el.scrollHeight > COLLAPSED_SCROLL_MAX_HEIGHT + 1;
      setHasExpandableOverflow((prev) => (prev === nextHasOverflow ? prev : nextHasOverflow));
      onExpandAvailabilityChange?.(nextHasOverflow);
    };

    updateOverflowState();

    const resizeObserver = new ResizeObserver(() => updateOverflowState());
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [childPadlets, disableInternalScroll, onExpandAvailabilityChange]);

  useEffect(() => {
    if (!isHorizontal || !onRequiredWidthChange) return;

    const reportRequiredWidth = () => {
      const root = containerMeasureRef.current;
      const content = contentMeasureRef.current;
      if (!root || !content) return;
      const currentWidth = Number(padlet.width) || 0;
      if (currentWidth < lastReportedWidthRef.current - 1) {
        lastReportedWidthRef.current = 0;
      }
      // `scrollWidth` on an overflowing box only accounts for the box's
      // leading-edge padding; browsers do not extend it to include the
      // trailing-edge padding of the side that overflows. That makes the raw
      // measurement short by exactly `root`'s own right padding, but ONLY
      // while `root` is actually overflowing -- once width has grown enough
      // to fit, scrollWidth already reports the padding correctly, so adding
      // it unconditionally would regrow the container by that amount forever.
      const isRootOverflowing = root.scrollWidth > root.clientWidth + 1;
      const rootRightPadding = isRootOverflowing ? (parseFloat(getComputedStyle(root).paddingRight) || 0) : 0;
      const requiredWidth = Math.ceil(Math.max(root.scrollWidth, content.scrollWidth) + rootRightPadding);
      if (requiredWidth <= lastReportedWidthRef.current + 1) return;
      lastReportedWidthRef.current = requiredWidth;
      onRequiredWidthChange(requiredWidth);
    };

    reportRequiredWidth();
    const resizeObserver = new ResizeObserver(reportRequiredWidth);
    if (containerMeasureRef.current) resizeObserver.observe(containerMeasureRef.current);
    if (contentMeasureRef.current) resizeObserver.observe(contentMeasureRef.current);
    return () => resizeObserver.disconnect();
  }, [childPadlets, isExpanded, isHorizontal, onRequiredWidthChange, padlet.width]);

  // PATCH POST-RESIZE-B3.1.2: a manual-resize handle needs the CURRENT true
  // intrinsic child-row requirement as its shrink floor -- a signal that can
  // both rise AND fall. The `onRequiredWidthChange` effect above is frozen
  // exactly as auto-grow needs it (ratcheted, never decreasing), and its
  // measurement (`root`/`content` scrollWidth) is unusable for this purpose
  // regardless: `content`'s own style sets `minWidth: "100%"` for horizontal
  // orientation (so the row visually fills a manually-widened Container),
  // which means `content.scrollWidth` reports the Container's OWN current
  // width, not the children's true requirement, the moment the row isn't
  // overflowing. Summing each child wrapper's own rendered width instead
  // sidesteps that entirely: every horizontal child is pinned via
  // `flex: 0 0 ${width}px`, so its own `offsetWidth` reflects its true
  // requirement no matter how wide the row around it has been stretched.
  useEffect(() => {
    if (!isHorizontal || !onIntrinsicRequiredWidthChange) return;

    if (childPadlets.length === 0) {
      if (lastReportedIntrinsicWidthRef.current !== 0) {
        lastReportedIntrinsicWidthRef.current = 0;
        onIntrinsicRequiredWidthChange(0);
      }
      return;
    }

    const reportIntrinsicWidth = () => {
      const root = containerMeasureRef.current;
      const content = contentMeasureRef.current;
      if (!root || !content) return;
      const children = Array.from(content.children) as HTMLElement[];
      if (children.length === 0) return;
      const gap = parseFloat(getComputedStyle(content).columnGap) || 8;
      const childrenWidth = children.reduce((sum, el) => sum + el.offsetWidth, 0) + gap * (children.length - 1);
      const rootStyle = getComputedStyle(root);
      const rootPaddingLeft = parseFloat(rootStyle.paddingLeft) || 0;
      const rootPaddingRight = parseFloat(rootStyle.paddingRight) || 0;
      const intrinsicWidth = Math.ceil(childrenWidth + rootPaddingLeft + rootPaddingRight);
      if (intrinsicWidth === lastReportedIntrinsicWidthRef.current) return;
      lastReportedIntrinsicWidthRef.current = intrinsicWidth;
      onIntrinsicRequiredWidthChange(intrinsicWidth);
    };

    reportIntrinsicWidth();
    // Deliberately observes each CHILD element only -- never `root`/`content`
    // themselves, which resize on every manual-resize preview frame (that's
    // exactly the feedback loop this signal must not participate in).
    const resizeObserver = new ResizeObserver(reportIntrinsicWidth);
    const content = contentMeasureRef.current;
    if (content) {
      Array.from(content.children).forEach((child) => resizeObserver.observe(child));
    }
    return () => resizeObserver.disconnect();
  }, [childPadlets, isHorizontal, onIntrinsicRequiredWidthChange]);


  return (
    <div
      ref={containerMeasureRef}
      className={isContentOnly ? `w-full space-y-2 ${className || ""}` : `w-full space-y-2 p-1.5 ${className || ""}`}
      style={isContentOnly ? undefined : { backgroundColor }}
    >
      <div>
        {showHeader && !isContentOnly && (
          <div className="flex items-center justify-center relative mb-2">
            <h3 className="text-sm font-bold text-center" style={{ color: isContentOnly ? undefined : textColor }}>{padlet.title || "Container"}</h3>
            {showExpandToggle && !isControlled && (
              <button
                type="button"
                onClick={() => setLocalIsExpanded((prev) => !prev)}
                className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-gray-500 transition-colors hover:bg-black/10 hover:text-gray-700"
                title={isExpanded ? "Collapse container" : "Expand container"}
                aria-label={isExpanded ? "Collapse container" : "Expand container"}
              >
                {isExpanded ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 14 5-5 5 5" /><path d="m7 20 5-5 5 5" /></svg>
                )}
              </button>
            )}
            {onEditContainer && !isControlled && (
              <button
                onClick={() => onEditContainer(padlet)}
                className="absolute right-0 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="Edit Container"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
              </button>
            )}
          </div>
        )}
        <div
          className="space-y-2 text-left"
          onDragEnter={(e) => {
            if (!dropEnabled) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragOver={(e) => {
            if (!dropEnabled) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            if (!dropEnabled) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            if (!dropEnabled) return;
            const kind = e.dataTransfer.getData("application/collabboard-drag-kind");
            if (ignoredKinds.has(kind)) return;

            e.preventDefault();
            e.stopPropagation();

            // 1. Check for library items (Personal Library)
            const libraryPayload = e.dataTransfer.getData("application/collabboard-library");
            if (libraryPayload) {
              try {
                const libData = JSON.parse(libraryPayload);
                const fileUrl = libData.file_url || libData.metadata?.file_url || libData.metadata?.imageUrl;
                const cleanMetadata = sanitizeLibraryMetadata(libData.metadata);
                // Normalize library item to draft format
                const draftPayload = {
                  type: libData.type || 'text',
                  title: libData.title || 'Untitled',
                  content: libData.content || '',
                  metadata: {
                    ...cleanMetadata,
                    imageUrl: libData.metadata?.imageUrl || fileUrl,
                    file_url: fileUrl,
                  },
                  width: libData.width || 300,
                  height: libData.height || 200,
                  file_url: fileUrl,
                };
                onDropDraftIntoContainer?.(padlet.id, draftPayload);
                return;
              } catch {
                // ignore
              }
            }

            // 2. Check for external clipart (SVG)
            const svgPayload = e.dataTransfer.getData("application/collabboard-svg");
            if (svgPayload) {
              try {
                const svgData = JSON.parse(svgPayload);
                const draftPayload = {
                  type: 'card',
                  title: svgData.title || 'Clipart',
                  content: '',
                  metadata: {
                    svgUrl: svgData.svgUrl,
                    iconBgColor: '#f8f9fa',
                    source: svgData.source || 'library',
                  },
                  width: 200,
                  height: 200,
                };
                onDropDraftIntoContainer?.(padlet.id, draftPayload);
                return;
              } catch {
                // ignore
              }
            }

            // 3. Fallback: existing application/json handling
            const draftPayload = e.dataTransfer.getData("application/json");
            if (draftPayload) {
              try {
                const data = JSON.parse(draftPayload);
                onDropDraftIntoContainer?.(padlet.id, data);
                return;
              } catch {
                return;
              }
            }

            const droppedId = e.dataTransfer.getData("text/padlet-id");
            if (droppedId && droppedId !== padlet.id) {
              if (!childIds.includes(droppedId)) {
                onDropExistingPadlet?.(padlet.id, droppedId);
              }
            }
          }}
        >
          {childPadlets.length === 0 ? (
            emptyStateText ? <p className="text-[9px] text-center py-4" style={{ color: mutedTextColor }}>{emptyStateText}</p> : null
          ) : (() => {
            const orderedChildren = onUpdateChildComments
              ? [
                  ...childPadlets.filter((child) => isCommentPost(child)),
                  ...childPadlets.filter((child) => !isCommentPost(child)),
                ]
              : childPadlets;

            // PATCH 9E.1: when scrolling is active, the child-content lane
            // must keep the SAME width it has when nothing overflows -- the
            // scrollbar must not eat into it. `overflow-y-auto` alone shrinks
            // the content box by the scrollbar's rendered width the moment a
            // scrollbar actually paints, and it does so INTRA-branch too
            // (short content within this same "scroll enabled" state renders
            // no real scrollbar at all). `scrollbarGutter: 'stable'` makes
            // that reservation constant across both sub-states; `scrollbarLane`
            // (measured by useScrollbarLane, PATCH 9E.1 -- replaces PATCH 9E's
            // guessed 6px constant, which real-Chrome measurement proved did
            // not match the browser's actual reservation) is the viewport's
            // OWN real reservation in pixels, so `calc(100% + Npx)` width +
            // `-Npx` margin pushes EXACTLY that reservation into an outside
            // lane instead of taking it out of the child cards' width.
            // `pr-0.5` is left untouched on the VERTICAL branch so the
            // un-widened, no-scroll case (the width baseline everything else
            // must match) is unchanged. The HORIZONTAL lane has no matching
            // `pl-0.5` on its leading edge, so carrying it here would reserve
            // an un-mirrored 2px on the trailing edge only -- PATCH O1E drops
            // it for horizontal so the trailing gutter matches the leading
            // one exactly, per the Container's own body padding.
            return (
              <div
                ref={contentMeasureRef}
                className={isHorizontal
                  ? `${shouldEnableInternalScroll ? "max-h-[300px] overflow-y-auto overflow-x-hidden scrollbar-ultrathin" : ""} flex flex-row flex-nowrap items-start gap-2`
                  : shouldEnableInternalScroll ? "max-h-[300px] overflow-y-auto overflow-x-hidden pr-0.5 space-y-2 scrollbar-ultrathin" : "space-y-2 pr-0.5"}
                style={
                  isHorizontal
                    ? { width: "max-content", minWidth: "100%" }
                    : shouldEnableInternalScroll
                      ? { scrollbarGutter: "stable", width: `calc(100% + ${scrollbarLane}px)`, marginRight: `-${scrollbarLane}px` }
                      : undefined
                }
              >
                {orderedChildren.map((child) => {
                  const isCommentType = isCommentPost(child);

                  if (isCommentType && onUpdateChildComments) {
                    return (
                      <div
                        key={child.id}
                        className="w-full max-w-full overflow-hidden pointer-events-auto"
                        style={isHorizontal ? { flex: `0 0 ${Math.max(Number(child.width) || 180, 1)}px`, width: Math.max(Number(child.width) || 180, 1) } : undefined}
                      >
                        {renderChildTitle(child)}
                        <EmbeddedCommentList
                          comments={(child.metadata as any)?.comments || []}
                          badgeColor={(child.metadata as any)?.badgeColor}
                          disableScroll={disableInternalScroll}
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
                            onUpdateChildComments(child.id, [...existingComments, newComment], { field: 'comments' });
                          })}
                          onEditComment={guardCommentMutation(accessMode, (commentId, newText) => {
                            const existingComments = (child.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                              c.id === commentId ? { ...c, text: newText } : c
                            );
                            onUpdateChildComments(child.id, updated, { field: 'comments' });
                          })}
                          onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                            const existingComments = (child.metadata as any)?.comments || [];
                            const filtered = existingComments.filter((c: any) => c.id !== commentId);
                            onUpdateChildComments(child.id, filtered, { field: 'comments' });
                          })}
                          onToggleStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                            const existingComments = (child.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                              c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                            );
                            onUpdateChildComments(child.id, updated, { field: 'comments' });
                          })}
                          onColorChange={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                            const existingComments = (child.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                              c.id === commentId ? { ...c, textColor, backgroundColor } : c
                            );
                            onUpdateChildComments(child.id, updated, { field: 'comments' });
                          })}
                          accessMode={accessMode}
                        />
                      </div>
                    );
                  }

                  const childCardChrome = resolveChildCardChrome(child);
                  const isImageChild = child.type === 'image' || child.file_url || (child.metadata as any)?.imageUrl || (child.metadata as any)?.fileUrl;
                  const isCardChild = child.type === 'card' && !!(child.metadata as any)?.svgUrl;
                  const isDocThumbnail = (child.metadata as any)?.importKind === 'document';
                  const isImport = (child.metadata as any)?.source === 'import';
                  const childDetachedComments: any[] = Array.isArray((child.metadata as any)?.detachedComments)
                    ? (child.metadata as any).detachedComments
                    : [];
                  const showChildCommentToggle = !!onUpdateChildComments;
                  const childCommentsOpen = openCommentsChildId === child.id;
                  return (
                    <div
                      key={child.id}
                      className={`relative border border-gray-200 overflow-hidden shadow-sm ${isImport ? 'pointer-events-auto' : ''}`}
                      style={{
                        backgroundColor: childCardChrome.backgroundColor,
                        ...(isHorizontal
                          ? {
                              flex: `0 0 ${Math.max(Number(child.width) || 180, 1)}px`,
                              width: Math.max(Number(child.width) || 180, 1),
                            }
                          : {}),
                      }}
                    >
                      {childCardChrome.topStripColor && (
                        <div className="h-1.5 w-full" style={{ backgroundColor: childCardChrome.topStripColor }} />
                      )}
                      {renderChildTitle(child)}
                      <div className={isImageChild && !isDocThumbnail ? "p-0" : isCardChild ? "p-0" : isDocThumbnail ? "p-1 bg-gray-50" : "p-1.5"}>
                        {isCardChild ? (
                          // Same CardPreview component standalone Clipart cards and
                          // the editor use, instead of the older, separate
                          // ClipartCardContent (via PostCardContent) this used to
                          // render through -- that legacy path never grew reactions
                          // or caption support, so a card lost both the moment it
                          // was dropped into a container. Read-only here (no
                          // titleEditor/captionEditor/reaction handlers): this is a
                          // preview, not the live editor.
                          <CardPreview
                            padlet={child}
                            isSelected={false}
                            reactions={Array.isArray((child.metadata as any)?.reactions) ? (child.metadata as any).reactions : []}
                          />
                        ) : (
                          <PostCardContent
                            padlet={child}
                            allPadlets={allPadlets}
                            onView={() => onViewDrawing?.(child)}
                            onScan={onScanChild}
                            canvasContext={canvasContext}
                            currentUserId={currentUserId}
                            currentUserName={currentUserName}
                            currentUserAvatar={currentUserAvatar}
                            onUpdateChildComments={onUpdateChildComments}
                            onOpenDocument={onOpenDocument ? () => onOpenDocument(child) : undefined}
                            accessMode={accessMode}
                          />
                        )}
                      </div>
                      {showChildCommentToggle && (
                        <div
                          className="pointer-events-auto px-1.5 pb-1.5"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenCommentsChildId(childCommentsOpen ? null : child.id);
                              }}
                              className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors ${canvasContext === "drawing" ? "!text-[10px] !px-1.5 !py-0.5 !bg-[#f3f4f6] !text-[#4b5563] hover:!bg-[#e5e7eb] !shadow-none" : ""}`}
                              title={childCommentsOpen
                                ? 'Hide comments'
                                : childDetachedComments.length > 0
                                  ? `${childDetachedComments.length} comment${childDetachedComments.length === 1 ? '' : 's'}`
                                  : 'Add a comment'}
                            >
                              <MessageCircle className="w-3 h-3" />
                              {childDetachedComments.length > 0 ? childDetachedComments.length : ''}
                            </button>
                          </div>
                          {childCommentsOpen && (
                            <EmbeddedCommentList
                              comments={childDetachedComments}
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
                                onUpdateChildComments(child.id, [...childDetachedComments, newComment], { field: 'detachedComments' });
                              })}
                              onEditComment={guardCommentMutation(accessMode, (commentId, newText) => {
                                const updated = childDetachedComments.map((c: any) =>
                                  c.id === commentId ? { ...c, text: newText } : c
                                );
                                onUpdateChildComments(child.id, updated, { field: 'detachedComments' });
                              })}
                              onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                                const filtered = childDetachedComments.filter((c: any) => c.id !== commentId);
                                onUpdateChildComments(child.id, filtered, { field: 'detachedComments' });
                              })}
                              onToggleStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                                const updated = childDetachedComments.map((c: any) =>
                                  c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                                );
                                onUpdateChildComments(child.id, updated, { field: 'detachedComments' });
                              })}
                              onColorChange={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                                const updated = childDetachedComments.map((c: any) =>
                                  c.id === commentId ? { ...c, textColor, backgroundColor } : c
                                );
                                onUpdateChildComments(child.id, updated, { field: 'detachedComments' });
                              })}
                              showComposer={true}
                              accessMode={accessMode}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {/* Item counter at bottom left - matching wall canvas style */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: badgeBg, color: textColor }}
          >
            {childPadlets.length} {childPadlets.length === 1 ? "item" : "items"}
          </span>
          {totalChildComments > 0 && (
            <span
              className="ml-auto flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: badgeBg, color: textColor }}
              title={`${totalChildComments} comment${totalChildComments === 1 ? "" : "s"} in this container`}
            >
              <MessageCircle className="w-2.5 h-2.5" />
              {totalChildComments}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

