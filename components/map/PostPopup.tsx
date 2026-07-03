"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import type { Padlet } from '@/types/collabboard';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';
import PostCardContent from '@/components/collabboard/PostCardContent';
import { ColumnPostContextMenu } from '@/components/collabboard/menus/ColumnPostContextMenu';
import { getPadletMapLocation } from '@/lib/map/geojson';

type PostPopupProps = {
  post: Padlet;
  allPadlets: Padlet[];
  canEdit?: boolean;
  onClose: () => void;
  contextMenuOpen?: boolean;
  onContextMenuOpenChange?: (open: boolean) => void;
  onEditContainer?: (post: Padlet) => void;
  onEditPost?: (post: Padlet) => void;
  onDeleteContainer?: (post: Padlet) => void;
  onChangeContainerColor?: (post: Padlet, color: string) => void;
  onEditLocation?: (post: Padlet) => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: unknown[]) => void;
  onRefreshChildren?: () => void;
};

export default function PostPopup({
  post,
  allPadlets,
  canEdit = false,
  onClose,
  contextMenuOpen,
  onContextMenuOpenChange,
  onEditContainer,
  onEditPost,
  onDeleteContainer,
  onChangeContainerColor,
  onEditLocation,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
  onRefreshChildren,
}: PostPopupProps) {

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    // Stop only the events Mapbox uses to start drag/zoom interactions.
    // Do NOT stop click/keydown/contextmenu - React needs those for button
    // onClick, Enter-to-submit, and the right-click context menu.
    // map.keyboard.disable() in MapCanvas handles keyboard interception.
    // eventCameFromPopup in MapCanvas handles click-to-close prevention.
    const events = [
      'mousedown', 'pointerdown',
      'touchstart', 'touchmove',
      'wheel',
    ] as const;
    events.forEach((evt) => el.addEventListener(evt, stop));
    return () => {
      events.forEach((evt) => el.removeEventListener(evt, stop));
    };
  }, []);

  const containerMetadata = (post.metadata ?? {}) as Record<string, unknown>;
  const containerColor =
    typeof containerMetadata.cardColor === 'string' && containerMetadata.cardColor.trim()
      ? containerMetadata.cardColor
      : '#ffffff';
  const topStripColor =
    typeof containerMetadata.topStrip === 'string' && containerMetadata.topStrip !== 'transparent'
      ? containerMetadata.topStrip
      : null;
  const childIds = Array.isArray(containerMetadata.childPadletIds)
    ? containerMetadata.childPadletIds.filter((id): id is string => typeof id === 'string')
    : [];
  const linkedChildren = allPadlets.filter((p) => {
    const metadata = (p.metadata ?? {}) as Record<string, unknown>;
    return metadata.parentId === post.id;
  });
  const childPadlets = [
    ...childIds
      .map((id) => allPadlets.find((p) => p.id === id))
      .filter((p): p is Padlet => p !== undefined),
    ...linkedChildren,
  ].filter((child, index, arr) => arr.findIndex((p) => p.id === child.id) === index);
  const isCommentTarget = (target: Padlet) =>
    String(target.type ?? '').trim().toLowerCase() === 'comment' ||
    (!target.type && Array.isArray((target.metadata as Record<string, unknown>)?.comments));
  const orderedOpenTargets = onUpdateChildComments
    ? [
        ...childPadlets.filter((child) => isCommentTarget(child)),
        ...childPadlets.filter((child) => !isCommentTarget(child)),
      ]
    : childPadlets;
  const location = getPadletMapLocation(post);
  const hasLocation = !!location;

  const popupContent = (
    <div
      ref={wrapperRef}
      data-map-popup-root="true"
      className="group/popup relative w-[360px] rounded-xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur"
    >
      <div className="mb-2 flex items-center gap-2 min-w-0">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-none text-slate-800">
          {post.title || 'Untitled post'}
        </h3>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {canEdit && post.type === 'container' && onEditContainer ? (
            <button
              type="button"
              title="Edit container"
              data-post-menu-trigger="true"
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 opacity-0 transition-all hover:bg-black/10 hover:text-gray-700 group-hover/popup:opacity-100"
              onClick={() => onEditContainer(post)}
              aria-label="Edit container"
            >
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
          {post.type === 'container' && canExpand ? (
            <button
              type="button"
              title={isExpanded ? 'Collapse container' : 'Expand container'}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-black/10 hover:text-gray-700"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? 'Collapse container' : 'Expand container'}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : null}
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="Close location card"
            title="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {post.type === 'container' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200" style={{ backgroundColor: containerColor }}>
          {topStripColor ? <div className="h-1.5 w-full" style={{ backgroundColor: topStripColor }} /> : null}
          <div className="p-2">
          <RowColumnContainerCard
            padlet={post}
            allPadlets={allPadlets}
            emptyStateText=""
            showHeader={false}
            isExpanded={isExpanded}
            onExpandAvailabilityChange={setCanExpand}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserAvatar={currentUserAvatar}
            onUpdateChildComments={onUpdateChildComments}
            onScanChild={onRefreshChildren}
          />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mt-2">
            <PostCardContent padlet={post} allPadlets={allPadlets} />
          </div>
        </div>
      )}

      <div
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-slate-200 bg-white/95"
      />
    </div>
  );

  return (
    <ColumnPostContextMenu
      padlet={post}
      onSelect={() => {}}
      onOpenChange={onContextMenuOpenChange}
      restrictToMenuTrigger
      onEdit={canEdit && onEditContainer ? () => onEditContainer(post) : undefined}
      openTargets={orderedOpenTargets}
      onOpenTarget={canEdit ? onEditPost : undefined}
      onDelete={canEdit && onDeleteContainer ? () => onDeleteContainer(post) : undefined}
      deleteLabel="Delete map pin"
      onChangeColor={canEdit && onChangeContainerColor ? (color) => onChangeContainerColor(post, color) : undefined}
      onEditPosition={canEdit && hasLocation && onEditLocation ? () => onEditLocation(post) : undefined}
      editPositionLabel="Edit Location"
      onOpenGoogleMaps={
        hasLocation
          ? () => {
              if (!location) return;
              const url = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          : undefined
      }
      onOpenOsm={
        hasLocation
          ? () => {
              if (!location) return;
              const url = `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=14/${location.lat}/${location.lng}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          : undefined
      }
    >
      {popupContent}
    </ColumnPostContextMenu>
  );
}
