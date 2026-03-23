"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragEndEvent, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Trash2, Search, X } from 'lucide-react';
import type { BoardSection, Padlet } from '@/types/collabboard';
import { getPadletMapLocation } from '@/lib/map/geojson';

type SortMode = 'manual' | 'automatic';

type MapSidebarSection = {
  id: string;
  title: string;
  sortOrder: number;
  isVirtual?: boolean;
};

type MapSidebarProps = {
  boardTitle?: string;
  sections: BoardSection[];
  posts: Padlet[];
  selectedPostId: string | null;
  collapsedSectionIds: Set<string>;
  sortMode: SortMode;
  canManageSections: boolean;
  canReorderPosts: boolean;
  onSelectPost: (postId: string) => void;
  onToggleSection: (sectionId: string) => void;
  onSetSortMode: (mode: SortMode) => void;
  onAddSection: () => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onReorderSections: (sectionIdsInOrder: string[]) => void;
  onMovePost: (postId: string, toSectionId: string | null, toIndex: number) => void;
  onClose?: () => void;
};

type SortableSectionProps = {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
};

function SortableSection({ id, disabled, children }: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${id}`,
    data: { type: 'section', sectionId: id },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      data-section-id={id}
      className="rounded-md"
    >
      <div className="flex items-center gap-1" {...attributes} {...listeners}>
        {children}
      </div>
    </div>
  );
}

type SortablePostRowProps = {
  post: Padlet;
  sectionId: string;
  isSelected: boolean;
  canDrag: boolean;
  onSelect: (id: string) => void;
  registerRef: (id: string, el: HTMLButtonElement | null) => void;
};

function SortablePostRow({ post, sectionId, isSelected, canDrag, onSelect, registerRef }: SortablePostRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `post:${post.id}`,
    data: { type: 'post', postId: post.id, sectionId },
    disabled: !canDrag,
  });

  const anyPost = post as unknown as { location_label?: string };
  const metadata = (post.metadata ?? {}) as Record<string, unknown>;
  const mapLocation = (metadata.mapLocation ?? {}) as { label?: string };
  const locationLabel = anyPost.location_label || mapLocation.label || '';
  const markerColor = typeof metadata.cardColor === 'string' ? metadata.cardColor : '#334155';

  return (
    <button
      ref={(el) => {
        setNodeRef(el);
        registerRef(post.id, el);
      }}
      type="button"
      onClick={() => onSelect(post.id)}
      className={`group w-full rounded-md border px-2 py-1.5 text-left transition ${
        isSelected ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-slate-50'
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="pt-0.5 text-slate-400" {...attributes} {...listeners}>
          {canDrag ? <GripVertical size={14} /> : <span className="inline-block w-[14px]" />}
        </div>
        <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: markerColor }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800">{post.title || 'Untitled pin'}</div>
          {locationLabel ? <div className="truncate text-xs text-slate-500">{locationLabel}</div> : null}
        </div>
      </div>
    </button>
  );
}

export default function MapSidebar({
  boardTitle = 'Pins',
  sections,
  posts,
  selectedPostId,
  collapsedSectionIds,
  sortMode,
  canManageSections,
  canReorderPosts,
  onSelectPost,
  onToggleSection,
  onSetSortMode,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onReorderSections,
  onMovePost,
  onClose,
}: MapSidebarProps) {
  const getMetadata = (post: Padlet) => (post.metadata ?? {}) as Record<string, unknown>;
  const [query, setQuery] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sectionList = useMemo<MapSidebarSection[]>(() => {
    const base = [...sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: String(s.id), title: s.title, sortOrder: s.position }));
    return [...base, { id: '__unplaced__', title: 'Unplaced', sortOrder: Number.MAX_SAFE_INTEGER, isVirtual: true }];
  }, [sections]);

  const locatedPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const hasCoords = getPadletMapLocation(p) !== null;
      if (!hasCoords) return false;
      const metadata = getMetadata(p);
      const mapLocation = (metadata.mapLocation ?? {}) as { label?: string };
      if (!q) return true;
      return [p.title, (p as unknown as { location_label?: string }).location_label, mapLocation.label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [posts, query]);

  const postsBySection = useMemo(() => {
    const grouped: Record<string, Padlet[]> = {};
    for (const section of sectionList) grouped[section.id] = [];

    for (const post of locatedPosts) {
      const metadata = getMetadata(post);
      const secIdRaw = metadata.sectionId;
      const secIdCandidate = secIdRaw ? String(secIdRaw) : '__unplaced__';
      const secId = grouped[secIdCandidate] ? secIdCandidate : '__unplaced__';
      grouped[secId].push(post);
    }

    for (const secId of Object.keys(grouped)) {
      grouped[secId] = grouped[secId].sort((a, b) => {
        if (sortMode === 'automatic') {
          return (a.title || '').localeCompare(b.title || '');
        }
        const ap = Number(getMetadata(a).sectionPosition ?? 0);
        const bp = Number(getMetadata(b).sectionPosition ?? 0);
        return ap - bp;
      });
    }

    return grouped;
  }, [locatedPosts, sectionList, sortMode]);

  useEffect(() => {
    if (!selectedPostId) return;
    const target = rowRefs.current[selectedPostId];
    if (target) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedPostId]);

  const sectionSortableIds = useMemo(
    () => sectionList.filter((s) => !s.isVirtual).map((s) => `section:${s.id}`),
    [sectionList]
  );

  const postSortableIdsBySection = useMemo(() => {
    const res: Record<string, string[]> = {};
    for (const sec of sectionList) {
      res[sec.id] = (postsBySection[sec.id] || []).map((p) => `post:${p.id}`);
    }
    return res;
  }, [sectionList, postsBySection]);

  const commitSectionRename = () => {
    if (!editingSectionId) return;
    const next = editingValue.trim();
    if (next) onRenameSection(editingSectionId, next);
    setEditingSectionId(null);
    setEditingValue('');
  };

  const beginSectionEdit = (sectionId: string, title: string) => {
    if (!canManageSections || sectionId === '__unplaced__') return;
    setEditingSectionId(sectionId);
    setEditingValue(title);
    requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type as 'section' | 'post' | undefined;
    const overType = over.data.current?.type as 'section' | 'post' | undefined;

    if (activeType === 'section' && overType === 'section' && canManageSections) {
      const activeId = String(active.data.current?.sectionId);
      const overId = String(over.data.current?.sectionId);
      if (!activeId || !overId || activeId === overId) return;
      const sectionIds = sectionList.filter((s) => !s.isVirtual).map((s) => s.id);
      const oldIndex = sectionIds.indexOf(activeId);
      const newIndex = sectionIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(sectionIds, oldIndex, newIndex);
      onReorderSections(next);
      return;
    }

    if (activeType !== 'post' || !canReorderPosts) return;

    const activePostId = String(active.data.current?.postId);
    const fromSectionId = String(active.data.current?.sectionId || '__unplaced__');

    let toSectionId = fromSectionId;
    let toIndex = 0;

    if (overType === 'post') {
      const overPostId = String(over.data.current?.postId);
      const overSection = String(over.data.current?.sectionId || '__unplaced__');
      toSectionId = overSection;
      const siblings = postsBySection[overSection] || [];
      toIndex = Math.max(0, siblings.findIndex((p) => p.id === overPostId));
    } else if (overType === 'section') {
      toSectionId = String(over.data.current?.sectionId || '__unplaced__');
      const siblings = postsBySection[toSectionId] || [];
      toIndex = siblings.length;
    }

    if (sortMode === 'automatic' && toSectionId === fromSectionId) return;
    if (!activePostId) return;

    onMovePost(activePostId, toSectionId === '__unplaced__' ? null : toSectionId, toIndex);
  };

  return (
    <div className="absolute left-3 top-24 bottom-3 z-20 w-[360px] rounded-2xl border border-slate-300 bg-white/95 shadow-lg backdrop-blur-sm">
      <div className="sticky top-0 z-10 rounded-t-2xl border-b border-slate-200 bg-white/95 px-3 py-2">
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{boardTitle}</div>
          <button
            type="button"
            className="w-[74px] shrink-0 rounded-md border border-slate-300 px-2 py-1 text-center text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => onSetSortMode(sortMode === 'manual' ? 'automatic' : 'manual')}
          >
            {sortMode === 'manual' ? 'Manual' : 'Auto'}
          </button>
          {onClose ? (
            <button
              type="button"
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              onClick={onClose}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="mb-2 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1">
            <Search size={14} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter pins"
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>
          {canManageSections ? (
            <button
              type="button"
              onClick={onAddSection}
              className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Add section
            </button>
          ) : null}
        </div>
      </div>

      <div className="h-[calc(100%-86px)] overflow-y-auto px-2 py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sectionSortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {sectionList.map((section) => {
                const postsInSection = postsBySection[section.id] || [];
                const collapsed = collapsedSectionIds.has(section.id);
                const sectionHeader = (
                  <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 hover:bg-slate-50">
                    {canManageSections && !section.isVirtual ? <GripVertical size={14} className="text-slate-400" /> : <span className="inline-block w-[14px]" />}
                    <button
                      type="button"
                      className="text-slate-500"
                      onClick={() => onToggleSection(section.id)}
                      aria-label={collapsed ? 'Expand section' : 'Collapse section'}
                    >
                      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {editingSectionId === section.id ? (
                      <input
                        ref={editInputRef}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={commitSectionRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitSectionRename();
                          if (e.key === 'Escape') {
                            setEditingSectionId(null);
                            setEditingValue('');
                          }
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-700"
                        onClick={() => beginSectionEdit(section.id, section.title)}
                      >
                        {section.title}
                      </button>
                    )}

                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{postsInSection.length}</span>
                    {canManageSections && !section.isVirtual ? (
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40"
                        disabled={postsInSection.length > 0}
                        onClick={() => onDeleteSection(section.id)}
                        title={postsInSection.length > 0 ? 'Section must be empty' : 'Delete section'}
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                );

                return (
                  <div key={section.id} className="rounded-md border border-slate-200 bg-white">
                    {section.isVirtual ? (
                      <div data-section-id={section.id}>{sectionHeader}</div>
                    ) : (
                      <SortableSection id={section.id} disabled={!canManageSections}>
                        {sectionHeader}
                      </SortableSection>
                    )}

                    {!collapsed ? (
                      <div className="px-1 pb-1">
                        <SortableContext items={postSortableIdsBySection[section.id] || []} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1">
                            {postsInSection.length === 0 ? (
                              <div className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-[11px] text-slate-400">
                                Empty section
                              </div>
                            ) : (
                              postsInSection.map((post) => (
                                <SortablePostRow
                                  key={post.id}
                                  post={post}
                                  sectionId={section.id}
                                  isSelected={selectedPostId === post.id}
                                  canDrag={canReorderPosts}
                                  onSelect={onSelectPost}
                                  registerRef={(id, el) => {
                                    rowRefs.current[id] = el;
                                  }}
                                />
                              ))
                            )}
                          </div>
                        </SortableContext>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
