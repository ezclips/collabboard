"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from "react";

import PostCardContent from "./PostCardContent";
import EmbeddedCommentList from "./EmbeddedCommentList";
import type { Padlet } from "@/types/collabboard";

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
  // Comment handling
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[]) => void;
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
};

export default function RowColumnContainerCard({
  padlet,
  allPadlets,
  onDropExistingPadlet,
  onDropDraftIntoContainer,
  ignoreDragKinds = [],
  onViewDrawing,
  className,
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
}: RowColumnContainerCardProps) {
  const COLLAPSED_SCROLL_MAX_HEIGHT = 300;
  const [localIsExpanded, setLocalIsExpanded] = useState(false);
  const [hasExpandableOverflow, setHasExpandableOverflow] = useState(false);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledIsExpanded !== undefined;
  const isExpanded = isControlled ? controlledIsExpanded : localIsExpanded;
  const backgroundColor = typeof (padlet.metadata as any)?.cardColor === 'string' && (padlet.metadata as any)?.cardColor
    ? (padlet.metadata as any).cardColor
    : '#ffffff';
  const textColor = getContrastTextColor(backgroundColor);
  const mutedTextColor = textColor === '#f8fafc' ? 'rgba(248,250,252,0.82)' : 'rgba(15,23,42,0.68)';
  const badgeBg = textColor === '#f8fafc' ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)';
  const containerMetadata = (padlet.metadata ?? {}) as Record<string, unknown>;
  const childIds = Array.isArray(containerMetadata.childPadletIds)
    ? containerMetadata.childPadletIds.filter((id): id is string => typeof id === "string")
    : [];
  const linkedChildren = allPadlets.filter((p) => {
    const metadata = (p.metadata ?? {}) as Record<string, unknown>;
    return metadata.parentId === padlet.id;
  });
  const childPadlets = [
    ...childIds
      .map((id: string) => allPadlets.find((p) => p.id === id))
      .filter((p): p is Padlet => p !== undefined),
    ...linkedChildren,
  ].filter((child, index, arr) => arr.findIndex((p) => p.id === child.id) === index);

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



  return (
    <div
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
            const shouldEnableInternalScroll = !disableInternalScroll && !isExpanded;

            return (
              <div
                ref={contentMeasureRef}
                className={shouldEnableInternalScroll ? "max-h-[300px] overflow-y-auto pr-0.5 space-y-2 scrollbar-ultrathin" : "space-y-2 pr-0.5"}
              >
                {orderedChildren.map((child) => {
                  const isCommentType = isCommentPost(child);

                  if (isCommentType && onUpdateChildComments) {
                    return (
                      <div key={child.id} className="w-full max-w-full overflow-hidden pointer-events-auto">
                        <EmbeddedCommentList
                          comments={(child.metadata as any)?.comments || []}
                          badgeColor={(child.metadata as any)?.badgeColor}
                          disableScroll={disableInternalScroll}
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
                          onToggleStrikethrough={(commentId) => {
                            const existingComments = (child.metadata as any)?.comments || [];
                            const updated = existingComments.map((c: any) =>
                              c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                            );
                            onUpdateChildComments(child.id, updated);
                          }}
                        />
                      </div>
                    );
                  }

                  const childTopStrip = (child.metadata as any)?.topStrip;
                  const isImageChild = child.type === 'image' || child.file_url || (child.metadata as any)?.imageUrl || (child.metadata as any)?.fileUrl;
                  const isCardChild = child.type === 'card' && !!(child.metadata as any)?.svgUrl;
                  const isDocThumbnail = (child.metadata as any)?.importKind === 'document';
                  const isImport = (child.metadata as any)?.source === 'import';
                  return (
                    <div
                      key={child.id}
                      className={`relative border border-gray-200 overflow-hidden shadow-sm ${isImport ? 'pointer-events-auto' : ''}`}
                      style={{ backgroundColor: (child.metadata as any)?.cardColor || "#ffffff" }}
                    >
                      {childTopStrip && childTopStrip !== "transparent" && (
                        <div className="h-1.5 w-full" style={{ backgroundColor: childTopStrip }} />
                      )}
                      <div className={isImageChild && !isDocThumbnail ? "p-0" : isCardChild ? "p-0" : isDocThumbnail ? "p-1 bg-gray-50" : "p-1.5"}>
                        <PostCardContent
                          padlet={child}
                          allPadlets={allPadlets}
                          onView={() => onViewDrawing?.(child)}
                          onScan={onScanChild}
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
        </div>
      </div>
    </div>
  );
}

