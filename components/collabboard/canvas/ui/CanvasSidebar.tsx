"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import KnowledgePdfUploader, {
  type KnowledgePdfProcessingStatus,
  type KnowledgePdfUploadResult,
  type KnowledgePdfUploaderHandle,
} from '@/components/collabboard/KnowledgePdfUploader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  computeToolbarMenuSideOffset,
  TOOLBAR_MENU_COLLISION_PADDING_PX,
  TOOLBAR_MENU_GAP_PX,
} from './toolbarMenuPlacement';

export interface SidebarToolItem {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  type: string;
  label: string;
  bg: string;
  color: string;
  disabled?: boolean;
  hint?: string;
}

export interface SidebarToolGroup {
  id: string;
  label: string;
  tools: SidebarToolItem[];
  /** Lower number = higher priority. Priority 1 groups are never collapsed. */
  priority: number;
  /** Groups marked alwaysVisible are kept visible by legacy fallback unless the More terminal case is required. */
  alwaysVisible?: boolean;
}

interface CanvasSidebarProps {
  groups: SidebarToolGroup[];
  isLineMode: boolean;
  isGraphConnectMode: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onBeforeToolClick?: (type: string) => void;
  handleToolClick: (type: string) => void;
  onBack: () => void;
  /**
   * PDF-C1. The sidebar's only remaining Knowledge job is owning the hidden
   * file input behind Add PDF. It neither loads, lists nor reads documents:
   * the library launcher is gone because the board now holds the PDFs, and the
   * reader lives at canvas shell level. These two are pure plumbing for the
   * upload the shell turns into a canvas placement.
   */
  onKnowledgePdfUploaded?: (document: KnowledgePdfUploadResult) => void;
  onKnowledgePdfSettled?: (documentId: string, status: KnowledgePdfProcessingStatus) => void;
}

// Retained for the old model's documentation and source-level regression checks.
const OVERHEAD_H = 105; // py-6 (48) + back button (18) + divider (1) + surrounding gaps (~38)
const GROUP_H = (toolCount: number) => 20 + toolCount * 44; // label row + tools with internal gaps

const CORE_GROUP_PRIORITIES = new Set([1, 2]);


type OverflowState = {
  signature: string;
  overflowIds: string[];
};

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export default function CanvasSidebar({
  groups,
  isLineMode,
  isGraphConnectMode,
  isCollapsed = false,
  onToggleCollapse,
  onBeforeToolClick,
  handleToolClick,
  onBack,
  onKnowledgePdfUploaded,
  onKnowledgePdfSettled,
}: CanvasSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moreMeasureRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const knowledgePdfUploaderRef = useRef<KnowledgePdfUploaderHandle>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());
  const naturalHeightsRef = useRef(new Map<string, Map<string, number>>());
  const [overflowState, setOverflowState] = useState<OverflowState | null>(null);
  const [menuSideOffset, setMenuSideOffset] = useState(TOOLBAR_MENU_GAP_PX);

  // P6J-F7-B1: a Note asking for its source no longer touches this component.
  // The request goes straight to the shell-level reader, so opening a citation
  // never pops the library open on the way -- and a collapsed toolbar, which
  // unmounts this whole sidebar, can no longer take the reader down with it.

  // The tool an overflow item selected, dispatched only once the dropdown has
  // finished closing (see onCloseAutoFocus below).
  const pendingToolRef = useRef<string | null>(null);

  const groupSignature = useMemo(
    () => `${isCollapsed ? 'collapsed' : 'expanded'}:${groups.map((group) => `${group.id}:${group.tools.length}`).join('|')}`,
    [groups, isCollapsed],
  );

  const overflowIds = overflowState?.signature === groupSignature ? overflowState.overflowIds : [];
  const overflowIdSet = useMemo(() => new Set(overflowIds), [overflowIds]);
  const measuringNaturalLayout = overflowState?.signature !== groupSignature;
  const visibleGroups = measuringNaturalLayout ? groups : groups.filter((group) => !overflowIdSet.has(group.id));
  const overflowGroups = measuringNaturalLayout ? [] : groups.filter((group) => overflowIdSet.has(group.id));

  const setGroupRef = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) {
      groupRefs.current.set(id, node);
    } else {
      groupRefs.current.delete(id);
    }
  }, []);

  const dispatchTool = useCallback((type: string, disabled?: boolean) => {
    if (disabled) return;
    onBeforeToolClick?.(type);
    if (type === 'knowledge-pdf') {
      knowledgePdfUploaderRef.current?.openPicker();
      return;
    }
    handleToolClick(type);
  }, [handleToolClick, onBeforeToolClick]);

  /**
   * Recomputes the toolbar exclusion offset from LIVE rects. Deliberately not
   * derived from a stored viewport width or a breakpoint: the only inputs are
   * the two elements' current positions, so narrow->wide and wide->narrow both
   * resolve to the correct value with no cached state to go stale.
   */
  const measureMenuSideOffset = useCallback(() => {
    const toolbar = containerRef.current;
    const trigger = moreTriggerRef.current;
    if (!toolbar || !trigger) return;
    const next = computeToolbarMenuSideOffset(
      toolbar.getBoundingClientRect().right,
      trigger.getBoundingClientRect().right,
    );
    setMenuSideOffset((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, []);

  const hasOverflowMenu = overflowGroups.length > 0;

  // Kept current for as long as the More trigger exists -- including while the
  // menu is open -- so a resize mid-interaction repositions correctly instead
  // of holding the placement it was opened with. No polling.
  useLayoutEffect(() => {
    if (!hasOverflowMenu) return;
    measureMenuSideOffset();
    const toolbar = containerRef.current;
    if (!toolbar || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureMenuSideOffset);
    ro.observe(toolbar);
    window.addEventListener('resize', measureMenuSideOffset);
    window.addEventListener('orientationchange', measureMenuSideOffset);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureMenuSideOffset);
      window.removeEventListener('orientationchange', measureMenuSideOffset);
    };
  }, [hasOverflowMenu, measureMenuSideOffset]);

  useLayoutEffect(() => {
    if (isCollapsed) {
      setOverflowState((current) =>
        current?.signature === groupSignature && current.overflowIds.length === 0
          ? current
          : { signature: groupSignature, overflowIds: [] },
      );
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const check = () => {
      const cached = naturalHeightsRef.current.get(groupSignature);
      const naturalHeights = new Map<string, number>(cached);
      let hasAllNaturalHeights = true;

      for (const group of groups) {
        if (!naturalHeights.has(group.id)) {
          const node = groupRefs.current.get(group.id);
          if (node) {
            naturalHeights.set(group.id, node.getBoundingClientRect().height);
          } else {
            hasAllNaturalHeights = false;
          }
        }
      }

      if (!hasAllNaturalHeights || naturalHeights.size < groups.length) return;
      naturalHeightsRef.current.set(groupSignature, naturalHeights);

      const styles = window.getComputedStyle(el);
      const gap = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0;
      const paddingTop = Number.parseFloat(styles.paddingTop || '0') || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom || '0') || 0;
      const fixedHeights = [
        backRef.current?.getBoundingClientRect().height ?? 0,
        dividerRef.current?.getBoundingClientRect().height ?? 0,
        toggleRef.current?.getBoundingClientRect().height ?? 0,
      ];
      const fixedChildCount = fixedHeights.filter((height) => height > 0).length;
      const fixedHeight = fixedHeights.reduce((sum, height) => sum + height, 0);
      const moreHeight = moreMeasureRef.current?.getBoundingClientRect().height ?? 36;

      const requiredHeight = (visibleIds: Set<string>, hasOverflow: boolean) => {
        const groupHeight = groups.reduce((sum, group) => (
          visibleIds.has(group.id) ? sum + (naturalHeights.get(group.id) ?? 0) : sum
        ), 0);
        const visibleGroupCount = groups.filter((group) => visibleIds.has(group.id)).length;
        const childCount = fixedChildCount + visibleGroupCount + (hasOverflow ? 1 : 0);
        return paddingTop + paddingBottom + fixedHeight + groupHeight + (hasOverflow ? moreHeight : 0) + Math.max(0, childCount - 1) * gap;
      };

      const allVisible = new Set(groups.map((group) => group.id));
      let overflowByPriority: string[] = [];

      if (requiredHeight(allVisible, false) > el.clientHeight) {
        const nextVisible = new Set(allVisible);
        const candidates = [...groups]
          .filter((group) => !CORE_GROUP_PRIORITIES.has(group.priority))
          .sort((a, b) => b.priority - a.priority);

        for (const group of candidates) {
          if (requiredHeight(nextVisible, true) <= el.clientHeight) break;
          nextVisible.delete(group.id);
          overflowByPriority.push(group.id);
        }
      }

      const nextOverflowIds = groups
        .filter((group) => overflowByPriority.includes(group.id))
        .map((group) => group.id);

      setOverflowState((current) => {
        if (current?.signature === groupSignature && sameIds(current.overflowIds, nextOverflowIds)) {
          return current;
        }
        return { signature: groupSignature, overflowIds: nextOverflowIds };
      });
    };

    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [groups, groupSignature, isCollapsed]);

  return (
    <div
      ref={containerRef}
      data-toolbar-sidebar="true"
      className={`${isCollapsed ? 'w-12' : 'w-14'} h-full bg-white border-r flex flex-col items-center py-6 gap-3 shadow-sm z-20 relative overflow-visible transition-[width] duration-150`}
    >
      <KnowledgePdfUploader
        ref={knowledgePdfUploaderRef}
        onDocumentUploaded={onKnowledgePdfUploaded}
        onDocumentSettled={onKnowledgePdfSettled}
      />
      <button
        ref={moreMeasureRef}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg"
      >
        <MoreVertical size={18} strokeWidth={1.5} />
      </button>

      {/* Back button */}
      <button
        ref={backRef}
        type="button"
        className="relative cursor-pointer hover:bg-gray-100 rounded p-0.5"
        onClick={onBack}
        title="Back to Dashboard"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
          <path fill="#5F6672" fillRule="evenodd" d="m6.646 4.646.708.708-2.147 2.145L13 7.5v1H5.207l2.147 2.146-.708.708L3.293 8z" />
        </svg>
      </button>

      <div ref={dividerRef} className="w-6 h-px bg-gray-200" />

      {/* PDF-C1 removed the Knowledge library launcher that stood here. PDFs
          are canvas objects now, so the board itself is the library; Add PDF
          (tool group) remains the one entry point. KnowledgeDocumentsList and
          every Knowledge API, reader and provenance feature are untouched. */}

      {/* Tool groups */}
      {visibleGroups.map((group) => (
        <div key={group.id} ref={setGroupRef(group.id)} data-toolbar-group={group.id} className="flex flex-col items-center w-full gap-1">
          {!isCollapsed ? (
            <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider leading-none select-none px-1">
              {group.label}
            </span>
          ) : null}
          {group.tools.map((tool) => {
            const IconComponent = tool.icon;
            const isLineActive = tool.type === 'line' && isLineMode;
            const isGraphLineActive = tool.type === 'graph-line' && isGraphConnectMode;
            const isDisabled = !!tool.disabled;

            return (
              <div
                key={tool.type}
                className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 ${
                  isLineActive
                    ? 'bg-blue-100 ring-2 ring-blue-400'
                    : isGraphLineActive
                      ? 'bg-indigo-100 ring-2 ring-indigo-400'
                      : tool.bg
                } ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105'}`}
                onClick={() => dispatchTool(tool.type, isDisabled)}
              >
                <div
                  className={`group relative flex items-center justify-center transition-transform duration-150 ${
                    isLineActive ? 'text-blue-600' : isGraphLineActive ? 'text-indigo-700' : tool.color
                  }`}
                >
                  <IconComponent size={18} strokeWidth={1.5} />
                  <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-[100] pointer-events-none">
                    {isDisabled && tool.hint ? tool.hint : tool.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {overflowGroups.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={moreTriggerRef}
              type="button"
              data-toolbar-more-trigger="true"
              className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
              aria-label="More toolbar tools"
            >
              <MoreVertical size={18} strokeWidth={1.5} />
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-[100] pointer-events-none">
                More
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={menuSideOffset}
            collisionPadding={TOOLBAR_MENU_COLLISION_PADDING_PX}
            // bg-background, not the shadcn bg-popover default: this project's
            // Tailwind v4 theme only registers --background/--foreground, so
            // `bg-popover` compiles to nothing at all and the panel rendered
            // with a measured backgroundColor of rgba(0,0,0,0) -- the canvas
            // and the bottom-left minimap showed straight through it. The
            // border/text colours are set explicitly for the same reason.
            // z-[3001] is the existing convention here: one above the
            // toolbar's own z-[3000] wrapper, and far below the editor/modal
            // layers (3100/4000/4100) which must still outrank a toolbar menu.
            className="z-[3001] w-56 border-gray-200 bg-background text-gray-900 shadow-lg"
            data-toolbar-overflow-menu="true"
            onCloseAutoFocus={(event) => {
              const pending = pendingToolRef.current;
              pendingToolRef.current = null;
              if (!pending) return;
              // Radix returns focus to the trigger as it closes. A non-modal
              // dialog opened synchronously from onSelect (Canvas settings)
              // saw that focus restore as an interact-outside and dismissed
              // itself after ~66ms -- the "it tries to open then goes away"
              // defect. Suppressing the refocus and running the action here,
              // once the menu has finished closing, makes every overflow item
              // behave exactly like its normal toolbar button.
              event.preventDefault();
              dispatchTool(pending);
            }}
          >
            {overflowGroups.map((group, index) => (
              <React.Fragment key={group.id}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-gray-500">
                  {group.label}
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {group.tools.map((tool) => {
                    const IconComponent = tool.icon;
                    const isDisabled = !!tool.disabled;
                    return (
                      <DropdownMenuItem
                        key={tool.type}
                        disabled={isDisabled}
                        // Queued rather than dispatched here; see the
                        // onCloseAutoFocus handler above. Every tool that can
                        // reach this menu opens a React surface or sets board
                        // state, so deferring is safe for all of them. A tool
                        // that must run inside the browser's user activation --
                        // today only Add PDF, which ends in a native file-input
                        // click -- is pinned to an always-visible group in the
                        // registry instead, and never appears here.
                        onSelect={() => {
                          if (isDisabled) return;
                          pendingToolRef.current = tool.type;
                        }}
                        className="cursor-pointer focus:bg-gray-100 data-[highlighted]:bg-gray-100"
                      >
                        <IconComponent size={16} strokeWidth={1.5} className={tool.color} />
                        <span>{tool.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {onToggleCollapse ? (
        <button
          ref={toggleRef}
          type="button"
          className="group relative mt-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}
        >
          <span className="text-sm leading-none" aria-hidden="true">{isCollapsed ? '>' : '<'}</span>
          <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-[100] pointer-events-none">
            {isCollapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
      ) : null}
    </div>
  );
}
