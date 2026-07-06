"use client";

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Edit2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus } from 'lucide-react';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';
import CardShell from '@/components/collabboard/shells/CardShell';
import { ColorPickerContent } from '@/components/collabboard/ColorPicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ColumnPostContextMenu } from '@/components/collabboard/menus/ColumnPostContextMenu';
import type { Padlet, ChronoMode } from '@/types/collabboard';

interface TimelineCanvasProps {
  padlets: Padlet[];
  canvasId: string;
  chronoMode: ChronoMode;
  backgroundStyle?: React.CSSProperties;
  isEditable?: boolean;
  onOpenContainer: (container: Padlet) => void;
  onDeleteContainer?: (containerId: string) => void;
  onCreateEmptyContainer?: () => void;
  // Drop handlers
  onDropExistingPadlet?: (containerId: string, droppedId: string) => void;
  onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void;
  // Drop on timeline line - creates container and adds item to it
  onDropLibraryCreateContainer?: (position: number, draftPayload: any) => void;
  // Comment handling
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
  onUpdateContainerMetadata?: (containerId: string, metadataUpdates: any) => void;
  onDuplicateContainer?: (containerId: string) => void;
  onRenameContainer?: (containerId: string, title: string) => void;
  onAddContainerBefore?: (containerId: string) => void;
  onAddContainerAfter?: (containerId: string) => void;
  onInsertContainerAt?: (position: number) => void;
  // All padlets for RowColumnContainerCard
  allPadlets?: Padlet[];
  onOpenTarget?: (padlet: Padlet) => void;
}

export default function ChronoTimelineCanvas({
  padlets,
  canvasId,
  chronoMode,
  backgroundStyle,
  isEditable = false,
  onOpenContainer,
  onDeleteContainer,
  onCreateEmptyContainer,
  onDropExistingPadlet,
  onDropDraftIntoContainer,
  onDropLibraryCreateContainer,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
  onUpdateContainerMetadata,
  onDuplicateContainer,
  onRenameContainer,
  onAddContainerBefore,
  onAddContainerAfter,
  onInsertContainerAt,
  allPadlets,
  onOpenTarget,
}: TimelineCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const prevUserSelectRef = useRef<string>('');
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [dateMenuPosition, setDateMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeDateContainerId, setActiveDateContainerId] = useState<string | null>(null);
  const [showDateColorPicker, setShowDateColorPicker] = useState(false);
  const dateMenuRef = useRef<HTMLDivElement>(null);
  const [dateEditOpen, setDateEditOpen] = useState(false);
  const [dateEditValue, setDateEditValue] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [expandedContainers, setExpandedContainers] = useState<Record<string, boolean>>({});
  const [expandableContainers, setExpandableContainers] = useState<Record<string, boolean>>({});
  const [renameContainerId, setRenameContainerId] = useState<string | null>(null);

  const DATE_COLOR_PRESETS = [
    '#3b82f6',
    '#06b6d4',
    '#10b981',
    '#84cc16',
    '#eab308',
    '#f97316',
    '#ef4444',
    '#ec4899',
    '#8b5cf6',
    '#6b7280',
  ];

  // Filter to container-type padlets only
  const containerPadlets = useMemo(() => {
    return padlets
      .filter((p) => {
        const meta = p.metadata as any;
        const isContainer = p.type === 'container' || meta?.kind === 'container' || meta?.isContainer === true;
        const isChild = !!meta?.parentId;
        return isContainer && !isChild;
      })
      .sort((a, b) => {
        const posA = (a.metadata as any)?.position_in_timeline ?? 0;
        const posB = (b.metadata as any)?.position_in_timeline ?? 0;
        if (posA !== posB) return posA - posB;
        return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
      });
  }, [padlets]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0 });
  }, [canvasId, chronoMode]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const isOverflowing = maxScrollLeft > 2;
    setHasHorizontalOverflow(isOverflowing);
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [updateScrollState, chronoMode, containerPadlets.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || chronoMode !== 'horizontal') return;

    const handleScroll = () => updateScrollState();
    el.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [chronoMode, updateScrollState]);

  useEffect(() => {
    if (chronoMode !== 'horizontal') return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !scrollRef.current) return;
      event.preventDefault();
      const delta = event.clientX - dragStartXRef.current;
      scrollRef.current.scrollLeft = dragStartScrollLeftRef.current - delta;
    };

    const stopDragging = () => {
      isDraggingRef.current = false;
      if (prevUserSelectRef.current !== '') {
        document.body.style.userSelect = prevUserSelectRef.current;
        prevUserSelectRef.current = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('mouseleave', stopDragging);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('mouseleave', stopDragging);
    };
  }, [chronoMode]);

  useEffect(() => {
    if (!dateMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dateMenuRef.current && !dateMenuRef.current.contains(event.target as Node)) {
        setDateMenuOpen(false);
        setShowDateColorPicker(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDateMenuOpen(false);
        setShowDateColorPicker(false);
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [dateMenuOpen]);

  const shouldIgnoreDragStart = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('[data-no-drag="true"]')) return true;
    if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return true;
    return false;
  };

  const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (chronoMode !== 'horizontal') return;
    if (event.button !== 0) return;
    if (shouldIgnoreDragStart(event.target)) return;
    if (!scrollRef.current) return;
    event.preventDefault();
    if (prevUserSelectRef.current === '') {
      prevUserSelectRef.current = document.body.style.userSelect;
    }
    document.body.style.userSelect = 'none';
    isDraggingRef.current = true;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  const handleOpenDateMenu = (event: React.MouseEvent<HTMLDivElement>, containerId: string) => {
    if (!isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveDateContainerId(containerId);
    setDateMenuPosition({ x: event.clientX, y: event.clientY });
    setDateMenuOpen(true);
    setShowDateColorPicker(false);
  };

  const handleOpenDateEditor = () => {
    if (!activeDateContainerId) return;
    const container = containerPadlets.find((c) => c.id === activeDateContainerId);
    if (!container) return;
    const currentLabel = (container.metadata as any)?.timelineLabel || new Date(container.created_at || '').toLocaleDateString();
    setDateEditValue(currentLabel);
    setDateMenuOpen(false);
    setShowDateColorPicker(false);
    setDateEditOpen(true);
  };

  const handleApplyDateLabel = () => {
    if (!activeDateContainerId) return;
    const trimmed = dateEditValue.trim();
    onUpdateContainerMetadata?.(activeDateContainerId, { timelineLabel: trimmed || null });
    setDateEditOpen(false);
  };

  const handleApplyDateLabelToAll = () => {
    const trimmed = dateEditValue.trim();
    containerPadlets.forEach((c) => {
      onUpdateContainerMetadata?.(c.id, { timelineLabel: trimmed || null });
    });
    setDateEditOpen(false);
  };

  const handleOpenRename = (container: Padlet) => {
    setRenameContainerId(container.id);
    setRenameValue(container.title || '');
    setRenameOpen(true);
  };

  const handleApplyRename = () => {
    if (!renameContainerId) return;
    onRenameContainer?.(renameContainerId, renameValue.trim());
    setRenameOpen(false);
  };

  const handleResetDateLabel = () => {
    if (!activeDateContainerId) return;
    onUpdateContainerMetadata?.(activeDateContainerId, { timelineLabel: null });
    setDateMenuOpen(false);
    setShowDateColorPicker(false);
  };

  const handleSetDateColor = (color: string) => {
    if (!activeDateContainerId) return;
    onUpdateContainerMetadata?.(activeDateContainerId, { timelineBadgeColor: color });
    setDateMenuOpen(false);
    setShowDateColorPicker(false);
  };

  const handleApplyDateColorToAll = () => {
    if (!activeDateContainerId) return;
    const container = containerPadlets.find((c) => c.id === activeDateContainerId);
    const color = (container?.metadata as any)?.timelineBadgeColor;
    if (!color) return;
    containerPadlets.forEach((c) => {
      onUpdateContainerMetadata?.(c.id, { timelineBadgeColor: color });
    });
    setDateMenuOpen(false);
    setShowDateColorPicker(false);
  };

  const handleResetAllDateColors = () => {
    containerPadlets.forEach((c) => {
      onUpdateContainerMetadata?.(c.id, { timelineBadgeColor: null });
    });
    setDateMenuOpen(false);
    setShowDateColorPicker(false);
  };

  // Handle drop on timeline line (plus points) - creates container with dropped item
  const handleLineDrop = useCallback((e: React.DragEvent, position: number) => {
    e.preventDefault();
    e.stopPropagation();

    let draftPayload: any = null;

    // 1. Check for library items (Personal Library)
    const libraryPayload = e.dataTransfer.getData("application/collabboard-library");
    if (libraryPayload) {
      try {
        const libData = JSON.parse(libraryPayload);
        const fileUrl = libData.file_url || libData.metadata?.file_url || libData.metadata?.imageUrl;
        draftPayload = {
          type: libData.type || 'text',
          title: libData.title || 'Untitled',
          content: libData.content || '',
          metadata: {
            ...(libData.metadata || {}),
            imageUrl: libData.metadata?.imageUrl || fileUrl,
            file_url: fileUrl,
          },
          width: libData.width || 300,
          height: libData.height || 200,
          file_url: fileUrl,
        };
      } catch (err) {
        console.error('Failed to parse library payload:', err);
      }
    }

    // 2. Check for external clipart (SVG)
    if (!draftPayload) {
      const svgPayload = e.dataTransfer.getData("application/collabboard-svg");
      if (svgPayload) {
        try {
          const svgData = JSON.parse(svgPayload);
          draftPayload = {
            type: 'image',
            title: svgData.title || 'Clipart',
            content: '',
            metadata: {
              imageUrl: svgData.svgUrl,
              previewUrl: svgData.svgUrl,
              source: svgData.source || 'library',
            },
            width: 200,
            height: 200,
          };
        } catch (err) {
          console.error('Failed to parse SVG payload:', err);
        }
      }
    }

    // 3. Fallback: existing application/json handling
    if (!draftPayload) {
      const jsonPayload = e.dataTransfer.getData("application/json");
      if (jsonPayload) {
        try {
          draftPayload = JSON.parse(jsonPayload);
        } catch (err) {
          // ignore
        }
      }
    }

    // If we have a valid payload, create container with item
    if (draftPayload && onDropLibraryCreateContainer) {
      onDropLibraryCreateContainer(position, draftPayload);
    }
  }, [onDropLibraryCreateContainer]);

  const scrollByContainer = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const containers = Array.from(el.querySelectorAll<HTMLElement>('[data-container-id]'));
    if (containers.length === 0) return;

    const viewportLeft = el.scrollLeft;
    const containerRect = el.getBoundingClientRect();
    const positions = containers.map((node) => {
      const rect = node.getBoundingClientRect();
      const left = rect.left - containerRect.left + el.scrollLeft;
      const right = rect.right - containerRect.left + el.scrollLeft;
      return { left, right };
    });

    if (direction === 'right') {
      const next = positions.find((pos) => pos.left > viewportLeft + 4);
      const targetLeft = next ? next.left : el.scrollWidth - el.clientWidth;
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
      return;
    }

    for (let i = positions.length - 1; i >= 0; i -= 1) {
      if (positions[i].left < viewportLeft - 4) {
        el.scrollTo({ left: positions[i].left, behavior: 'smooth' });
        return;
      }
    }
    el.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const scrollToEdge = (edge: 'start' | 'end') => {
    const el = scrollRef.current;
    if (!el) return;
    const targetLeft = edge === 'start' ? 0 : el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
  };

  // Empty state
  if (containerPadlets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={backgroundStyle}>
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium mb-2">Timeline is empty</p>
          <p className="text-sm mb-4">Create a container to start building your timeline.</p>
          {isEditable && onCreateEmptyContainer && (
            <button
              type="button"
              onClick={onCreateEmptyContainer}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus size={16} />
              Create first container
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderTimelineItem = (container: Padlet, index: number, mode: ChronoMode) => {
    const isLast = index === containerPadlets.length - 1;
    const cardColor = (container.metadata as any)?.cardColor || "#fff";
    const badgeLabel = (container.metadata as any)?.timelineLabel || new Date(container.created_at || '').toLocaleDateString();
    const badgeColor = (container.metadata as any)?.timelineBadgeColor || '#3b82f6';

    const childIds = container.metadata?.childPadletIds || [];
    const openTargets = childIds.map((id: string) => (allPadlets || padlets).find(p => p.id === id)).filter((p): p is Padlet => p !== undefined);

    // Card content with RowColumnContainerCard and Edit button
    const cardContent = (
      <ColumnPostContextMenu
        padlet={container}
        onSelect={() => { }}
        restrictToMenuTrigger
        disabled={!isEditable}
        openTargets={isEditable ? openTargets : undefined}
        onOpenTarget={isEditable ? onOpenTarget : undefined}
        getOpenTargetLabel={(target) => target.type || 'post'}
        onDuplicate={isEditable ? (() => onDuplicateContainer?.(container.id)) : undefined}
        onDelete={isEditable ? (() => onDeleteContainer?.(container.id)) : undefined}
        onRename={isEditable ? (() => handleOpenRename(container)) : undefined}
        onEdit={isEditable ? (() => onOpenContainer(container)) : undefined}
        onAddBefore={isEditable ? (() => onInsertContainerAt?.(index)) : undefined}
        onAddAfter={isEditable ? (() => onInsertContainerAt?.(index + 1)) : undefined}
        onChangeColor={isEditable ? ((color) => onUpdateContainerMetadata?.(container.id, { cardColor: color })) : undefined}
      >
        <div
          data-container-id={container.id}
          data-post-id={container.id}
          className="min-w-[280px] w-full max-w-sm select-none"
          onDragOver={(e) => {
            if (!isEditable) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            if (!isEditable) return;
            e.preventDefault();
            e.stopPropagation();

            // 1. Check for library items (Personal Library)
            const libraryPayload = e.dataTransfer.getData("application/collabboard-library");
            if (libraryPayload) {
              try {
                const libData = JSON.parse(libraryPayload);
                const fileUrl = libData.file_url || libData.metadata?.file_url || libData.metadata?.imageUrl;
                // Normalize library item to draft format
                const draftPayload = {
                  type: libData.type || 'text',
                  title: libData.title || 'Untitled',
                  content: libData.content || '',
                  metadata: {
                    ...(libData.metadata || {}),
                    imageUrl: libData.metadata?.imageUrl || fileUrl,
                    file_url: fileUrl,
                  },
                  width: libData.width || 300,
                  height: libData.height || 200,
                  file_url: fileUrl,
                };
                onDropDraftIntoContainer?.(container.id, draftPayload);
                return;
              } catch (err) {
                console.error('Failed to parse library payload:', err);
              }
            }

            // 2. Check for external clipart (SVG)
            const svgPayload = e.dataTransfer.getData("application/collabboard-svg");
            if (svgPayload) {
              try {
                const svgData = JSON.parse(svgPayload);
                // Convert SVG clipart to image-type draft
                const draftPayload = {
                  type: 'image',
                  title: svgData.title || 'Clipart',
                  content: '',
                  metadata: {
                    imageUrl: svgData.svgUrl,
                    previewUrl: svgData.svgUrl,
                    source: svgData.source || 'library',
                  },
                  width: 200,
                  height: 200,
                };
                onDropDraftIntoContainer?.(container.id, draftPayload);
                return;
              } catch (err) {
                console.error('Failed to parse SVG payload:', err);
              }
            }

            // 3. Fallback: existing application/json handling
            const payload = e.dataTransfer.getData("application/json");
            if (payload) {
              try {
                const data = JSON.parse(payload);
                onDropDraftIntoContainer?.(container.id, data);
              } catch (err) {
                // ignore
              }
            }
          }}
        >
          <CardShell
            padletId={container.id}
            isContainer
            title={container.title || undefined}
            cardColor={cardColor}
            topStripColor={(container.metadata as any)?.topStrip && (container.metadata as any).topStrip !== 'transparent' ? (container.metadata as any).topStrip : null}
            onEdit={isEditable ? () => onOpenContainer(container) : undefined}
            onExpandToggle={expandableContainers[container.id] ? () => setExpandedContainers(prev => ({ ...prev, [container.id]: !prev[container.id] })) : undefined}
            isExpanded={expandedContainers[container.id] ?? false}
          >
            <RowColumnContainerCard
              padlet={container}
              allPadlets={allPadlets || padlets}
              onDropExistingPadlet={onDropExistingPadlet}
              onDropDraftIntoContainer={onDropDraftIntoContainer}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatar={currentUserAvatar}
              onUpdateChildComments={onUpdateChildComments}
              isExpanded={expandedContainers[container.id] ?? false}
              onExpandAvailabilityChange={(available) => setExpandableContainers(prev => prev[container.id] === available ? prev : { ...prev, [container.id]: available })}
              canvasContext="timeline"
              isContentOnly
            />
          </CardShell>
        </div>
      </ColumnPostContextMenu>
    );

    const dateBadge = (
      <div
        className="inline-block px-3 py-1 mb-3 text-xs font-medium text-white rounded whitespace-nowrap cursor-context-menu select-none"
        style={{ backgroundColor: badgeColor }}
        onContextMenu={(event) => handleOpenDateMenu(event, container.id)}
      >
        {badgeLabel}
      </div>
    );

    if (mode === 'vertical') {
      return (
        <div key={container.id} className="relative pl-16 pb-8 w-full max-w-xl">
          {/* Date badge above card */}
          <div className="mb-3">{dateBadge}</div>
          {/* Card wrapper with centered dot */}
          <div className="relative">
            {/* Dot - vertically centered on the card, centered ON the line */}
            <div className="absolute left-[-41px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow z-10" />
            {/* Card */}
            {cardContent}
          </div>
        </div>
      );
    }

    if (mode === 'horizontal') {
      return (
        <div key={container.id} className="relative flex flex-col items-center min-w-[320px] px-4 pt-12">
          {/* Dot on line */}
          <div className="absolute top-[22px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow z-10" />
          {/* Date */}
          <div className="mt-2 mb-2">
            {dateBadge}
          </div>
          {/* Card */}
          {cardContent}
        </div>
      );
    }

    if (mode === 'horizontal-all') {
      return (
        <div key={container.id} className="relative flex flex-col items-center w-[300px] mb-8">
          <div className="flex flex-col items-center w-full">
            {dateBadge}
            {cardContent}
          </div>
        </div>
      );
    }

    if (mode === 'alternating') {
      const isLeft = index % 2 === 0;
      return (
        <div key={container.id} className="relative w-full pb-8">
          <div className="flex">
            {/* Left half - cards appear here when isLeft=true */}
            <div className="w-1/2 flex justify-end pr-16">
              {isLeft && (
                <div className="flex flex-col items-end">
                  <div className="mb-2">{dateBadge}</div>
                  <div className="text-left">{cardContent}</div>
                </div>
              )}
            </div>
            {/* Right half - cards appear here when isLeft=false */}
            <div className="w-1/2 flex justify-start pl-16">
              {!isLeft && (
                <div className="flex flex-col items-start">
                  <div className="mb-2">{dateBadge}</div>
                  <div className="text-left">{cardContent}</div>
                </div>
              )}
            </div>
          </div>
          {/* Dot - positioned off center line, towards the card (35px offset matches vertical timeline spacing) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow z-10"
            style={{ left: isLeft ? 'calc(50% - 35px)' : 'calc(50% + 35px)', transform: 'translateX(-50%) translateY(-50%)' }}
          />
        </div>
      );
    }

    return null;
  };

  const renderTimelineContent = () => {
    if (chronoMode === 'horizontal') {
      const showInsertControls = isEditable && Boolean(onInsertContainerAt || onDropLibraryCreateContainer);
      const renderPlusPoint = (position: number) => (
        <div
          key={`plus-${position}`}
          className="relative flex flex-col items-center min-w-[48px] px-1 pt-12 group/dropzone"
          onDragOver={(e) => {
            if (!showInsertControls) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            e.currentTarget.classList.add("scale-110");
          }}
          onDragLeave={(e) => {
            if (!showInsertControls) return;
            e.currentTarget.classList.remove("scale-110");
          }}
          onDrop={(e) => {
            if (!showInsertControls) return;
            e.currentTarget.classList.remove("scale-110");
            handleLineDrop(e, position);
          }}
        >
          {showInsertControls && (
            <button
              type="button"
              data-no-drag="true"
              className="absolute top-[18px] w-7 h-7 rounded-full bg-gray-200/80 text-gray-500 hover:bg-blue-500 hover:text-white hover:scale-110 transition-all duration-150 flex items-center justify-center shadow-sm z-10 group-[.scale-110]/dropzone:bg-blue-500 group-[.scale-110]/dropzone:text-white group-[.scale-110]/dropzone:scale-125"
              onClick={() => onInsertContainerAt?.(position)}
              aria-label="Add container"
              title="Add container or drop library item"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      );

      return (
        <div className="relative flex flex-row items-start min-h-full min-w-max p-10 pt-20">
          {/* Drag strip (10px above/below line) */}
          <div
            className="absolute left-4 right-4 top-[74px] h-5 cursor-grab active:cursor-grabbing z-10 select-none"
            onMouseDown={handleDragStart}
          />
          {/* Horizontal Line */}
          <div className="absolute left-4 right-4 top-[84px] h-0.5 bg-gray-300" />
          {renderPlusPoint(0)}
          {containerPadlets.map((c, i) => (
            <React.Fragment key={c.id}>
              {renderTimelineItem(c, i, 'horizontal')}
              {renderPlusPoint(i + 1)}
            </React.Fragment>
          ))}
        </div>
      );
    }

    if (chronoMode === 'horizontal-all') {
      return (
        <div className="flex flex-row flex-wrap justify-center gap-6 p-8">
          {containerPadlets.map((c, i) => renderTimelineItem(c, i, 'horizontal-all'))}
        </div>
      );
    }

    if (chronoMode === 'alternating') {
      const showInsertControls = isEditable && Boolean(onInsertContainerAt || onDropLibraryCreateContainer);
      const renderAlternatingPlus = (position: number) => (
        <div
          key={`plus-alternating-${position}`}
          className="relative w-full flex justify-center h-8 group/dropzone"
          onDragOver={(e) => {
            if (!showInsertControls) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            e.currentTarget.classList.add("scale-y-150");
          }}
          onDragLeave={(e) => {
            if (!showInsertControls) return;
            e.currentTarget.classList.remove("scale-y-150");
          }}
          onDrop={(e) => {
            if (!showInsertControls) return;
            e.currentTarget.classList.remove("scale-y-150");
            handleLineDrop(e, position);
          }}
        >
          {showInsertControls && (
            <button
              type="button"
              data-no-drag="true"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-200/80 text-gray-500 hover:bg-blue-500 hover:text-white hover:scale-110 transition-all duration-150 flex items-center justify-center shadow-sm z-10 group-[.scale-y-150]/dropzone:bg-blue-500 group-[.scale-y-150]/dropzone:text-white group-[.scale-y-150]/dropzone:scale-125"
              onClick={() => onInsertContainerAt?.(position)}
              aria-label="Add container"
              title="Add container or drop library item"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      );

      return (
        <div className="relative flex flex-col items-center w-full max-w-4xl mx-auto p-6">
          {/* Center Line */}
          <div className="absolute top-6 bottom-6 left-1/2 w-0.5 bg-gray-300 -translate-x-1/2" />
          {renderAlternatingPlus(0)}
          {containerPadlets.map((c, i) => (
            <React.Fragment key={c.id}>
              {renderTimelineItem(c, i, 'alternating')}
              {renderAlternatingPlus(i + 1)}
            </React.Fragment>
          ))}
        </div>
      );
    }

    // Vertical (default) - Plus button for adding containers
    const showInsertControls = isEditable && Boolean(onInsertContainerAt);
    const renderVerticalPlus = (position: number) => (
      <div
        key={`plus-vertical-${position}`}
        className="relative pl-16 h-8 w-full max-w-xl pointer-events-none"
      >
        {showInsertControls && (
          <button
            type="button"
            data-no-drag="true"
            className="absolute left-[15px] top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-200/80 text-gray-500 hover:bg-blue-500 hover:text-white hover:scale-110 cursor-pointer flex items-center justify-center shadow-sm z-10 transition-all duration-150 pointer-events-auto"
            onClick={() => onInsertContainerAt?.(position)}
            aria-label="Add container"
            title="Add container"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    );

    return (
      <div className="relative flex flex-col items-start p-6 max-w-2xl mx-auto lg:mx-0">
        {/* Continuous vertical line */}
        <div className="absolute left-[29px] top-6 bottom-6 w-0.5 bg-gray-300" />
        {renderVerticalPlus(0)}
        {containerPadlets.map((c, i) => (
          <React.Fragment key={c.id}>
            {renderTimelineItem(c, i, 'vertical')}
            {renderVerticalPlus(i + 1)}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full h-full min-h-0" style={backgroundStyle}>
      {/* Scroll container */}
      <div className="relative flex-1 min-h-0">
        {isEditable && dateMenuOpen && dateMenuPosition && activeDateContainerId && (
          <div
            ref={dateMenuRef}
            className="fixed z-[9999] min-w-[220px] bg-white rounded-md overflow-visible p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: dateMenuPosition.x, top: dateMenuPosition.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 select-none outline-none hover:bg-slate-100 cursor-pointer"
              onClick={handleOpenDateEditor}
            >
              Edit date label
            </button>
            <button
              className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 select-none outline-none hover:bg-slate-100 cursor-pointer"
              onClick={handleResetDateLabel}
            >
              Reset to created date
            </button>

            <div className="h-[1px] bg-gray-100 m-1" />

            <div className="flex gap-1 px-2 py-1.5">
              {DATE_COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleSetDateColor(color)}
                  className="w-5 h-5 rounded border transition-all hover:scale-110 border-gray-300 hover:border-gray-400"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            <button
              className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 select-none outline-none hover:bg-slate-100 cursor-pointer"
              onClick={() => setShowDateColorPicker((open) => !open)}
            >
              Choose Custom Color...
            </button>

            {showDateColorPicker && (
              <div
                className="absolute left-full top-0 ml-2 bg-white rounded-lg shadow-2xl border border-gray-200 p-3 animate-in fade-in slide-in-from-left-2 duration-200"
                style={{ width: '256px', zIndex: 10000 }}
              >
                <ColorPickerContent
                  color={(containerPadlets.find((c) => c.id === activeDateContainerId)?.metadata as any)?.timelineBadgeColor || '#3b82f6'}
                  onChange={(c) => {
                    if (c) handleSetDateColor(c);
                  }}
                  hasOpacity={true}
                  presets={DATE_COLOR_PRESETS}
                />
              </div>
            )}

            <div className="h-[1px] bg-gray-100 m-1" />

            <button
              className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 select-none outline-none hover:bg-slate-100 cursor-pointer"
              onClick={handleApplyDateColorToAll}
            >
              Apply color to all dates
            </button>
            <button
              className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 select-none outline-none hover:bg-slate-100 cursor-pointer"
              onClick={handleResetAllDateColors}
            >
              Reset all date colors
            </button>
          </div>
        )}
        {chronoMode === 'horizontal' && hasHorizontalOverflow && (
          <>
            {canScrollLeft && (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
                <button
                  type="button"
                  className="bg-gray-200 hover:bg-gray-300 text-black rounded-full p-2 shadow-lg"
                  style={{ opacity: 0.85 }}
                  onClick={() => scrollToEdge('start')}
                  aria-label="Scroll to start"
                >
                  <ChevronsLeft size={18} />
                </button>
                <button
                  type="button"
                  className="bg-gray-200 hover:bg-gray-300 text-black rounded-full p-2 shadow-lg"
                  style={{ opacity: 0.85 }}
                  onClick={() => scrollByContainer('left')}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            )}
            {canScrollRight && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
                <button
                  type="button"
                  className="bg-gray-200 hover:bg-gray-300 text-black rounded-full p-2 shadow-lg"
                  style={{ opacity: 0.85 }}
                  onClick={() => scrollByContainer('right')}
                  aria-label="Scroll right"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  className="bg-gray-200 hover:bg-gray-300 text-black rounded-full p-2 shadow-lg"
                  style={{ opacity: 0.85 }}
                  onClick={() => scrollToEdge('end')}
                  aria-label="Scroll to end"
                >
                  <ChevronsRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
        <div
          ref={scrollRef}
          className={`h-full w-full ${chronoMode === 'horizontal' ? 'overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing' : 'overflow-y-auto overflow-x-hidden'}`}
        >
          {renderTimelineContent()}
        </div>
      </div>
      <Dialog open={isEditable && dateEditOpen} onOpenChange={setDateEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit date label</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              value={dateEditValue}
              onChange={(e) => setDateEditValue(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
              placeholder="Enter date label"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-gray-200 text-black hover:bg-gray-300"
                onClick={() => setDateEditOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-gray-200 text-black hover:bg-gray-300"
                onClick={handleApplyDateLabel}
              >
                Apply
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-gray-200 text-black hover:bg-gray-300"
                onClick={handleApplyDateLabelToAll}
              >
                Apply text to all dates
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditable && renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename container</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
              placeholder="Enter container name"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-gray-200 text-black hover:bg-gray-300"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-gray-200 text-black hover:bg-gray-300"
                onClick={handleApplyRename}
              >
                Apply
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
